// @ts-nocheck — executado com o Node (type stripping), fora do build do Next.
// Rodar: npm run test:qr
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { handleQr, activationUrl } from '../lib/qr-resolve.ts';
import { extractToken } from '../lib/qr.ts';

const OLD = 'https://nfcflow.antigo.workers.dev'; // domínio impresso nas placas (permanente)
const NEW = 'https://app.meudominio.com.br';        // futuro domínio do aplicativo

function run({ plaque, error = null, throwResolve = false, token = 'ABCD1234', urls, fallback = null, scans }) {
  return handleQr({
    token,
    urls: urls ?? { appUrl: '', qrBaseUrl: '', requestOrigin: OLD },
    resolve: async () => { if (throwResolve) throw new Error('db down'); return { data: plaque, error }; },
    logScan: async (p) => { scans?.push(p.plaque_id); },
    fallbackDestination: async () => fallback,
  });
}
const ativa = (dest) => ({ plaque_id: 'p1', status: 'ATIVA', destination_url: dest });

test('QR antigo + placa ATIVA com destino -> redireciona ao destino e registra scan', async () => {
  const scans = [];
  const r = await run({ plaque: ativa('https://instagram.com/loja'), scans });
  assert.equal(r.kind, 'redirect');
  assert.equal(r.location, 'https://instagram.com/loja');
  assert.deepEqual(scans, ['p1']);
});

test('placa ATIVA com final_url usa final_url', async () => {
  const r = await run({ plaque: { plaque_id: 'p1', status: 'ATIVA', final_url: 'https://a.com', destination_url: 'https://b.com' } });
  assert.equal(r.location, 'https://a.com');
});

test('QR antigo + placa DISPONIVEL -> ativação, preservando o token (domínio da requisição se APP_URL vazio)', async () => {
  const r = await run({ plaque: { plaque_id: 'p2', status: 'DISPONIVEL' } });
  assert.equal(r.kind, 'redirect');
  assert.equal(r.location, `${OLD}/painel/plaquinhas/ativar?token=ABCD1234`);
});

test('token em minúsculas é normalizado', async () => {
  const r = await run({ token: 'abcd1234', plaque: { plaque_id: 'p2', status: 'DISPONIVEL' } });
  assert.match(r.location, /token=ABCD1234$/);
});

test('MUDANÇA DE DOMÍNIO: scan chega pelo domínio antigo, ativação vai para o domínio NOVO do app', async () => {
  const urls = { appUrl: NEW + '/', qrBaseUrl: OLD, requestOrigin: OLD };
  const r = await run({ plaque: { plaque_id: 'p2', status: 'DISPONIVEL' }, urls });
  assert.equal(r.location, `${NEW}/painel/plaquinhas/ativar?token=ABCD1234`);
  // placa ativa continua indo ao destino do cliente, independente do domínio do app
  const a = await run({ plaque: ativa('https://wa.me/5511999999999'), urls });
  assert.equal(a.location, 'https://wa.me/5511999999999');
});

test('placa ATIVA sem destino -> página de recuperação (não é o erro genérico "Ops!")', async () => {
  const urls = { appUrl: NEW, qrBaseUrl: OLD, requestOrigin: OLD };
  const r = await run({ plaque: ativa(null), urls });
  assert.equal(r.kind, 'page');
  assert.equal(r.page, 'no_destination');
  assert.equal(r.status, 200);
  assert.ok(r.html.includes(`${NEW}/login`));
  assert.ok(!r.html.includes('Ops!'));
  assert.ok(!r.html.includes('Destino indisponível'));
});

test('placa ATIVA sem destino mas ainda registra o scan', async () => {
  const scans = [];
  await run({ plaque: ativa(null), scans });
  assert.deepEqual(scans, ['p1']);
});

test('placa ATIVA com destino inválido (javascript:, data:, ftp:) -> recuperação', async () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com', 'não é url']) {
    const r = await run({ plaque: ativa(bad) });
    assert.equal(r.kind, 'page', bad);
    assert.equal(r.page, 'no_destination', bad);
  }
});

test('fallback legado de destino (perfil) continua funcionando', async () => {
  const r = await run({ plaque: ativa(null), fallback: 'https://perfil.com/x' });
  assert.equal(r.location, 'https://perfil.com/x');
});

test('token inexistente -> página "QR Code não encontrado" (404)', async () => {
  const r = await run({ plaque: null });
  assert.equal(r.kind, 'page');
  assert.equal(r.page, 'not_found');
  assert.equal(r.status, 404);
  assert.ok(r.html.includes('QR Code não encontrado'));
});

test('token com formato inválido -> não encontrado, sem consultar o banco', async () => {
  let called = false;
  const r = await handleQr({
    token: '../../etc', urls: { requestOrigin: OLD },
    resolve: async () => { called = true; return { data: null, error: null }; },
    logScan: async () => {}, fallbackDestination: async () => null,
  });
  assert.equal(r.page, 'not_found');
  assert.equal(called, false);
});

test('erro/queda do banco -> 503 "indisponível", NUNCA "não encontrado"', async () => {
  const e1 = await run({ plaque: null, error: { message: 'timeout' } });
  assert.equal(e1.page, 'unavailable'); assert.equal(e1.status, 503);
  const e2 = await run({ plaque: null, throwResolve: true });
  assert.equal(e2.page, 'unavailable'); assert.equal(e2.status, 503);
});

test('placa INATIVA -> 410 sem redirect', async () => {
  const r = await run({ plaque: { plaque_id: 'p3', status: 'INATIVA', destination_url: 'https://x.com' } });
  assert.equal(r.kind, 'page'); assert.equal(r.status, 410);
});

test('SEM LOOPS: destino apontando para /q/ dos nossos domínios é recusado', async () => {
  const urls = { appUrl: NEW, qrBaseUrl: OLD, requestOrigin: OLD };
  for (const loop of [`${OLD}/q/ABCD1234`, `${NEW}/q/OUTRO999`, `${OLD}/q/ABCD1234/`, `${OLD}/Q/ABCD1234`]) {
    const r = await run({ plaque: ativa(loop), urls });
    assert.equal(r.kind, 'page', loop);
    assert.equal(r.page, 'no_destination', loop);
  }
  // /q/ em site de terceiros não é loop nosso
  const ok = await run({ plaque: ativa('https://outro-site.com/q/abc'), urls });
  assert.equal(ok.kind, 'redirect');
});

test('SEM LOOPS: nenhuma saída que não seja o destino aponta para /q/', async () => {
  const urls = { appUrl: NEW, qrBaseUrl: OLD, requestOrigin: OLD };
  const cases = [{ plaque: { plaque_id: 'p', status: 'DISPONIVEL' } }, { plaque: ativa(null) }, { plaque: null }, { plaque: { plaque_id: 'p', status: 'INATIVA' } }];
  for (const c of cases) {
    const r = await run({ ...c, urls });
    if (r.kind === 'redirect') assert.ok(!/\/q\//i.test(new URL(r.location).pathname));
  }
  assert.ok(!/\/q\//.test(activationUrl('ABCD1234', urls)));
});

test('scan de QR impresso no domínio antigo continua sendo reconhecido após troca de domínio', () => {
  assert.equal(extractToken(`${OLD}/q/abcd1234`), 'ABCD1234');
  assert.equal(extractToken(`${NEW}/q/ABCD1234?x=1`), 'ABCD1234');
  assert.equal(extractToken('ABCD1234'), 'ABCD1234');
});

test('rota antiga preservada: app/q/[token]/route.ts existe, exporta GET e delega a handleQr', () => {
  const p = new URL('../app/q/[token]/route.ts', import.meta.url);
  assert.ok(existsSync(p));
  const src = readFileSync(p, 'utf8');
  assert.match(src, /export async function GET/);
  assert.match(src, /resolve_qr/);
  assert.match(src, /handleQr/);
});

test('sem domínios fixos no código da rota e da lógica de QR', () => {
  for (const f of ['../app/q/[token]/route.ts', '../lib/qr-resolve.ts', '../lib/app-url.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    const urls = (src.match(/https?:\/\/[a-z0-9.-]+/gi) || []).filter((u) => !/w3\.org/.test(u));
    assert.deepEqual(urls, [], f);
  }
});

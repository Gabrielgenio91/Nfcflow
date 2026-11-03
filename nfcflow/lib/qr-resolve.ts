/**
 * Lógica de decisão da rota permanente /q/:token (sem dependências externas, para poder ser testada).
 *
 * Princípios:
 *  - o token é a única chave: o que está impresso na plaquinha (…/q/TOKEN) nunca muda;
 *  - quem decide o destino é o banco (resolve_qr) — este módulo só interpreta o resultado;
 *  - o fluxo de ATIVAÇÃO vai para o domínio ATUAL do aplicativo (NEXT_PUBLIC_APP_URL), e não para o
 *    domínio pelo qual o QR chegou (que pode ser o domínio antigo, mantido só para os QRs impressos);
 *  - nunca redireciona para outra rota /q/ (evita loops).
 */

export const TOKEN_RE = /^[A-Z0-9]{4,32}$/;

export interface QrPlaque {
  plaque_id: string;
  status: string;
  destination_url?: string | null;
  final_url?: string | null;
}

export interface QrUrls {
  /** NEXT_PUBLIC_APP_URL (domínio do aplicativo). Vazio => usa a origem da requisição. */
  appUrl?: string;
  /** NEXT_PUBLIC_QR_BASE_URL (domínio permanente dos QRs). Usado só para detectar loops. */
  qrBaseUrl?: string;
  /** Origem pela qual a requisição chegou (domínio antigo ou atual). */
  requestOrigin: string;
}

export interface QrDeps {
  token: string;
  urls: QrUrls;
  /** Chama resolve_qr. Deve retornar { data, error }; data=null => token inexistente. */
  resolve: (token: string) => Promise<{ data: QrPlaque | null; error: unknown }>;
  /** Registra a leitura. Falhas aqui NUNCA podem impedir o redirect. */
  logScan: (plaque: QrPlaque) => Promise<void>;
  /** Fallback legado de destino (perfil). Pode retornar null. */
  fallbackDestination: (plaque: QrPlaque) => Promise<string | null>;
}

export type QrPageKind = 'not_found' | 'inactive' | 'unavailable' | 'no_destination';

export type QrOutcome =
  | { kind: 'redirect'; location: string; status: 302 }
  | { kind: 'page'; page: QrPageKind; status: number; html: string };

export function stripSlash(u: string | undefined | null): string {
  return (u || '').trim().replace(/\/+$/, '');
}

function hostOf(u: string): string {
  try { return new URL(u).host.toLowerCase(); } catch { return ''; }
}

/** http/https apenas. */
export function isSafeUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch { return false; }
}

/**
 * Destino válido = http(s) e que NÃO aponta para uma rota /q/… de um domínio nosso
 * (domínio do app, domínio dos QRs ou o domínio pelo qual a requisição chegou). Isso impede
 * que um cliente cadastre o próprio QR como destino e crie um loop.
 */
export function isValidDestination(url: string | null | undefined, urls: QrUrls): boolean {
  const raw = (url || '').trim();
  if (!raw || !isSafeUrl(raw)) return false;
  const parsed = new URL(raw);
  if (/^\/q(\/|$)/i.test(parsed.pathname)) {
    const own = new Set([hostOf(urls.requestOrigin), hostOf(stripSlash(urls.appUrl)), hostOf(stripSlash(urls.qrBaseUrl))].filter(Boolean));
    if (own.has(parsed.host.toLowerCase())) return false;
  }
  return true;
}

export function activationUrl(token: string, urls: QrUrls): string {
  const base = stripSlash(urls.appUrl) || stripSlash(urls.requestOrigin);
  return `${base}/painel/plaquinhas/ativar?token=${encodeURIComponent(token)}`;
}

export async function handleQr(deps: QrDeps): Promise<QrOutcome> {
  const token = (deps.token || '').trim().toUpperCase();
  const { urls } = deps;
  const appBase = stripSlash(urls.appUrl) || stripSlash(urls.requestOrigin);

  if (!TOKEN_RE.test(token)) return page('not_found', 404, appBase);

  let res: { data: QrPlaque | null; error: unknown };
  try {
    res = await deps.resolve(token);
  } catch (e) {
    console.error('resolve_qr exception:', e instanceof Error ? e.message : e);
    return page('unavailable', 503, appBase);
  }
  // Erro de banco NÃO é "não encontrado": o token pode existir.
  if (res.error) {
    console.error('resolve_qr error:', res.error);
    return page('unavailable', 503, appBase);
  }
  const plaque = res.data;
  if (!plaque) return page('not_found', 404, appBase);

  if (plaque.status === 'INATIVA') return page('inactive', 410, appBase);

  // Disponível (ainda não ativada): vai para a tela de ativação do domínio ATUAL do app, com o token.
  if (plaque.status !== 'ATIVA') {
    return { kind: 'redirect', location: activationUrl(token, urls), status: 302 };
  }

  // ATIVA: registra a leitura (nunca bloqueia) e resolve o destino.
  try { await deps.logScan(plaque); } catch (e) {
    console.error('qr_scans exception:', e instanceof Error ? e.message : e);
  }

  let dest: string | null = plaque.final_url || plaque.destination_url || null;
  if (!dest) {
    try { dest = await deps.fallbackDestination(plaque); } catch { dest = null; }
  }

  if (dest && isValidDestination(dest, urls)) {
    return { kind: 'redirect', location: dest.trim(), status: 302 };
  }
  // Ativa, mas sem destino utilizável: página de recuperação (não é "erro genérico").
  return page('no_destination', 200, appBase);
}

// ---------------------------------------------------------------------------
// Páginas HTML (mesmo visual escuro/roxo já usado pela rota)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const COPY: Record<QrPageKind, { icon: string; title: string; text: string }> = {
  not_found: {
    icon: '🔍',
    title: 'QR Code não encontrado',
    text: 'Não encontramos nenhuma plaquinha com este código. Confira se o QR Code está íntegro ou fale com quem lhe entregou a plaquinha.',
  },
  inactive: {
    icon: '⏸️',
    title: 'Plaquinha desativada',
    text: 'Esta plaquinha foi desativada pelo responsável e não está redirecionando no momento.',
  },
  unavailable: {
    icon: '⏳',
    title: 'Serviço temporariamente indisponível',
    text: 'Não conseguimos consultar esta plaquinha agora. Tente novamente em alguns instantes.',
  },
  no_destination: {
    icon: '🔗',
    title: 'Esta plaquinha ainda não tem um destino',
    text: 'A plaquinha está ativa, mas o link de destino não foi configurado (ou não é válido). Se você é o responsável, entre no painel e defina o destino. Quem escaneou pode tentar novamente mais tarde.',
  },
};

function page(kind: QrPageKind, status: number, appBase: string): QrOutcome {
  const c = COPY[kind];
  const action = kind === 'no_destination' && appBase
    ? `<a class="btn" href="${esc(appBase)}/login">Sou o responsável — configurar destino</a>`
    : '';
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>NFCFLOW</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#06040e;color:#e4e4e7;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:2rem}.card{max-width:420px;text-align:center}.icon{width:64px;height:64px;margin:0 auto 1.5rem;border-radius:16px;background:linear-gradient(135deg,#8B5CF6,#3B82F6);display:flex;align-items:center;justify-content:center;font-size:28px}h1{font-size:1.25rem;margin-bottom:.6rem;font-weight:600}p{font-size:.95rem;color:#a1a1aa;line-height:1.55}.btn{display:inline-block;margin-top:1.5rem;padding:.8rem 1.25rem;border-radius:12px;background:linear-gradient(180deg,#8657ff,#6d3df0);color:#fff;text-decoration:none;font-weight:600;font-size:.95rem}</style></head><body><div class="card"><div class="icon">${c.icon}</div><h1>${esc(c.title)}</h1><p>${esc(c.text)}</p>${action}</div></body></html>`;
  return { kind: 'page', page: kind, status, html };
}

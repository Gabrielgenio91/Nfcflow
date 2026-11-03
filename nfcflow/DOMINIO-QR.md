# NFCFLOW — Trocar o domínio do app sem quebrar os QR Codes impressos

## Como funciona hoje (diagnóstico)

- O QR impresso aponta para `https://<DOMÍNIO-IMPRESSO>/q/<TOKEN>`. O token (8 caracteres A-Z/0-9) é permanente.
- `/q/:token` é uma rota do **mesmo Worker** (`nfcflow`, OpenNext) — `app/q/[token]/route.ts`. Ela chama a função
  do Supabase `resolve_qr(token)` e decide:

| Situação da placa | Resultado |
|---|---|
| `ATIVA` com destino válido | redireciona (302) ao destino cadastrado e registra o scan |
| `DISPONIVEL` (não ativada) | redireciona à tela de ativação **do domínio atual do app** (`NEXT_PUBLIC_APP_URL`), com `?token=` |
| `ATIVA` sem destino válido | página "Esta plaquinha ainda não tem um destino", com botão para o responsável entrar no painel |
| token inexistente / formato inválido | página "QR Code não encontrado" (404) |
| `INATIVA` | página "Plaquinha desativada" (410) |
| erro do banco | página "temporariamente indisponível" (503) — nunca diz "não encontrado" |

- Nunca redireciona para outra rota `/q/…` (destino que aponte para um `/q/` dos nossos domínios é recusado → sem loop).
- Segurança (já existia, não foi alterada): conhecer o token **não** dá controle. Ativar/alterar destino exige login e passa
  pelas funções `activate_plaque`, `update_plaque_destination`, `set_plaque_status` (SECURITY DEFINER, validam o dono via
  `get_reseller_id_for_user()`; `anon` não tem EXECUTE). `resolve_qr` só devolve status/destino e é chamada no servidor.
- **Nenhuma alteração de SQL/migração foi necessária** e nenhum dado foi tocado.

## Variáveis de ambiente

| Variável | Para quê | Hoje | Depois de comprar o domínio |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | domínio do **aplicativo** (painel, ativação, webhook de pagamento, e-mail de recuperar senha, link de indicação) | domínio atual | **novo domínio** (`https://app.seudominio.com.br`) |
| `NEXT_PUBLIC_QR_BASE_URL` *(nova, opcional)* | domínio **permanente dos QR Codes** (mostrado/gerado no painel) | vazio (usa `NEXT_PUBLIC_APP_URL`) | **domínio antigo impresso nas placas** |

Antes de trocar `NEXT_PUBLIC_APP_URL`, defina `NEXT_PUBLIC_QR_BASE_URL` com o domínio **atualmente impresso**.
`NEXT_PUBLIC_*` são embutidas no build: defina como *Build variable* (se usa Workers Builds) **e** como variável do Worker,
e faça novo deploy. Obs.: em Admin → Gerar Plaquinhas, a "URL base" salva no banco (`qr_base_url`) tem prioridade sobre
a variável nos **novos lotes** — confira que ela continua com o domínio que você quer imprimir.

## Passo a passo (você precisa fazer — não tenho acesso ao seu Cloudflare/Supabase)

0. **Antes de tudo, descubra qual domínio está impresso** (escaneie uma placa) e onde ele está configurado:
   Cloudflare → Workers & Pages → `nfcflow` → Settings → **Domains & Routes**. Pode ser `*.workers.dev` ou um Custom Domain.
   *Isto não foi verificado por mim.*
1. **Não remova nem renomeie** o domínio antigo nem o Worker `nfcflow`. Se for `workers.dev`, mantenha-o habilitado
   (o endereço depende do nome do Worker e da conta). Se for domínio próprio, mantenha o registro/DNS e a renovação.
2. Compre o domínio novo e **adicione-o ao mesmo Worker** (Domains & Routes → Add → Custom Domain). Não substitua o antigo:
   os dois devem aparecer listados.
3. Em Variables (Worker + Build): `NEXT_PUBLIC_QR_BASE_URL` = domínio antigo; `NEXT_PUBLIC_APP_URL` = domínio novo. Redeploy.
4. Supabase → Authentication → URL Configuration: *Site URL* = domínio novo; **mantenha** o antigo em *Redirect URLs*.
5. Mercado Pago: o webhook usa `NEXT_PUBLIC_APP_URL` nos pedidos novos; confira a URL de notificação no painel do MP.
6. Os usuários terão de fazer login de novo no domínio novo (sessão/cookies são por domínio).
7. Teste (veja abaixo) com uma placa **antiga** pelos dois domínios antes de divulgar.

## Checklist de verificação pós-troca
- `https://<domínio-antigo>/q/<token ativo>` → abre o destino do cliente.
- `https://<domínio-novo>/q/<mesmo token>` → mesmo resultado.
- Placa disponível → cai em `https://<domínio-novo>/painel/plaquinhas/ativar?token=…` (pede login se necessário).
- Token inexistente → página "QR Code não encontrado".
- Nenhum destes causa redirecionamento em cadeia.

## Limitação conhecida (não alterada de propósito)
Se o revendedor não estiver logado, o login o leva para `/painel` e o token da URL se perde (o middleware/login não guardam
"voltar para"). Basta escanear de novo após entrar. Mudar isso mexeria na autenticação, que ficou fora do escopo.

## Testes automáticos
`npm run test:qr` (Node ≥ 22.6) — cobre QR ativo, disponível, ativo sem destino, token inexistente, queda do banco,
inativo, troca de domínio, rota antiga e ausência de loops.

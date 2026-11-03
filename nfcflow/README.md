# NFCFLOW

Gestão e venda de plaquinhas com QR Code dinâmico: revendedores, clientes, loja, estoque, pedidos, pagamentos (PIX), envio (Correios) e link de avaliação do Google.

Stack: Next.js 13 (App Router) · TypeScript · Tailwind · Supabase (Auth + Postgres + RLS).

---

## 1. Como iniciar o projeto

```bash
npm install          # instala dependências (inclui jsqr, leitor de QR)
cp .env.example .env # preencha as variáveis (veja a seção 3)
npm run dev
```

Abra http://localhost:3000. Antes de `npm run build`, rode `npm run typecheck`.

## 2. Como configurar o Supabase

1. Crie o projeto em https://supabase.com.
2. Em **Project Settings → API**, copie a URL, a `anon key` e a `service_role key` para o `.env`.
3. Em **Authentication → URL Configuration**, informe a URL pública do site (`NEXT_PUBLIC_APP_URL`) e adicione-a em *Redirect URLs*.
4. Rode as migrations (seção 7).

## 3. Variáveis de ambiente

Todas estão em `.env.example` **sem valores**. Segredos ficam **somente no servidor** — nunca use o prefixo `NEXT_PUBLIC_` em segredos.

| Variável | Onde é usada | Secreta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador e servidor | não (a anon key é pública, protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | route handlers (`lib/supabase/admin.ts`) | **sim** |
| `NEXT_PUBLIC_APP_URL` | QR Codes, webhook, e-mails de recuperação | não |
| `OWNER_EMAIL` / `NEXT_PUBLIC_OWNER_EMAIL` | regra de proprietário | não |
| `PAYMENT_PROVIDER` | gateway ativo (padrão `MERCADO_PAGO`) | não |
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | `services/mercadoPagoService.ts` | **sim** |
| `MERCADO_PAGO_PUBLIC_KEY` | reservada para cartão (futuro) | não |
| `CORREIOS_API_TOKEN`, `CORREIOS_API_URL`, `CORREIOS_ORIGIN_ZIP` | `services/correiosService.ts` | token **sim** |
| `GOOGLE_PLACES_API_KEY` | `services/googlePlacesService.ts` | **sim** |
| `CRON_SECRET` | `/api/cron/release-reservations` | **sim** |

---

## CONFIGURAÇÃO DAS INTEGRAÇÕES

Nenhuma credencial está no código. Cada integração só passa a funcionar quando você preenche as variáveis abaixo (no `.env` local e no painel da hospedagem). Em **Admin → Configurações** você vê `CONFIGURADO` / `NÃO CONFIGURADO` de cada uma — nunca os valores.

### Mercado Pago (PIX)
1. Crie uma aplicação em https://www.mercadopago.com.br/developers e copie o **Access Token** → `MERCADO_PAGO_ACCESS_TOKEN`.
2. Em **Webhooks** da aplicação, cadastre a URL `https://SEU-DOMINIO/api/webhooks/mercado-pago` com o evento **Pagamentos**.
3. Copie a **assinatura secreta** do webhook → `MERCADO_PAGO_WEBHOOK_SECRET`. Sem ela o webhook rejeita todas as notificações.
4. Teste primeiro com credenciais de teste.

Regras de segurança implementadas: o pedido **só vira PAGO pelo backend** (webhook assinado + consulta à API oficial do Mercado Pago); o retorno do navegador nunca confirma pagamento; o webhook é idempotente (`webhook_events` + função `apply_payment_update`); valor pago menor que o total não aprova o pedido.

> Outro gateway pode ser adicionado implementando `PaymentGateway` (`services/paymentTypes.ts`), registrando em `services/paymentService.ts` e criando `/api/webhooks/{slug}`.

### Correios
Preencha `CORREIOS_API_TOKEN`, `CORREIOS_API_URL`, `CORREIOS_ORIGIN_ZIP` (CEP de origem) e `CORREIOS_SERVICE_CODES` (códigos do seu contrato). Peso e dimensões padrão por unidade/pacote: `CORREIOS_UNIT_WEIGHT_GRAMS`, `CORREIOS_PACKAGE_*_CM`.
Os caminhos de endpoint em `services/correiosService.ts` seguem a API pública dos Correios; **confirme com a documentação do seu contrato antes de produção**.
Sem configuração, o sistema opera em **modo preparado**: o checkout mostra um aviso, usa o frete provisório `SHIPPING_FALLBACK_AMOUNT` e o admin informa o código de rastreio manualmente.

### Google (link de avaliação)
Ative a **Places API (New)** no Google Cloud, crie uma chave e coloque em `GOOGLE_PLACES_API_KEY` (restrinja a chave à Places API e ao IP do servidor). Sem a chave, a tela mostra "Integração Google ainda não configurada." e o resto do sistema segue normal.

---

## 7. Migrations

Em `supabase/migrations/` (ordem cronológica). Opção rápida: cole `supabase/ALL_MIGRATIONS.sql` no **SQL Editor** do Supabase e execute **uma vez**. Com a CLI: `supabase db push`.

| Arquivo | Conteúdo |
|---|---|
| 001–004 | perfis, revendedores, clientes, produtos, estoque, plaquinhas, QR |
| 005 | regra de OWNER automático |
| 006 | pedidos, pagamentos, envio, endereços, suporte, reserva de estoque, ativação de plaquinhas, RLS |
| 007 | catálogo da loja e visão de estoque |
| 008 | cadastro: telefone e criação automática do revendedor |
| 009 | revendedor edita o próprio cadastro |
| 010 | código de indicação, configurações (WhatsApp, frete grátis), lote de plaquinhas |

As migrations só adicionam; nada é apagado.

## 8. Como criar o administrador

O e-mail em `OWNER_EMAIL` (`gtdadosfreeoficial@gmail.com`) vira **owner/admin automaticamente** ao se cadastrar em `/register` (trigger no banco). Se a conta já existia, a migration 005 a promove. Para outro admin: no SQL Editor, `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"admin"}' where email = '...'; update public.profiles set role='admin' where email = '...';` (a pessoa deve sair e entrar novamente).

## 9. Como criar um revendedor

O revendedor se cadastra em `/register`; o registro em `resellers` é criado por trigger. O admin pode bloquear/ativar em **Admin → Revendedores**. Um revendedor bloqueado não consegue comprar.

## 10. Deploy (Cloudflare Workers, Netlify, Vercel ou Node)

1. Rode `npm install` e `npm run typecheck && npm run build` localmente; **commite o `package-lock.json` atualizado**.
2. Cadastre todas as variáveis do `.env.example` no painel da hospedagem (`NEXT_PUBLIC_APP_URL` com o domínio final, https).
3. Cadastre a URL do webhook no Mercado Pago.
4. Agende `GET https://SEU-DOMINIO/api/cron/release-reservations` a cada ~5 min com `Authorization: Bearer $CRON_SECRET` (libera reservas de pedidos não pagos; o sistema também libera oportunisticamente a cada novo pedido).
5. A câmera do leitor de QR exige **HTTPS**.

## Fluxos

**Compra:** Loja → quantidade (preço por faixa, vindo do banco) → carrinho → endereço → frete (Correios) → PIX → pedido `AGUARDANDO_PAGAMENTO` (estoque **reservado**) → webhook confirma → `PAGO` (estoque baixado) → admin: `EM_PREPARACAO` → `ENVIADO` (com código de rastreio; plaquinhas atribuídas ao revendedor) → `EM_TRANSITO` → `ENTREGUE`.

**Plaquinha:** Plaquinhas → Ativar → escanear QR → validação (existe? é minha? disponível?) → estabelecimento + destino → ativa → destino editável a qualquer momento (o QR físico não muda).

## Código de indicação, suporte e promoções (Admin)

- **Código de Indicação** (Admin → Código de Indicação): um código global e aleatório libera o cadastro de novos revendedores. O link de convite `https://SEU-DOMINIO/cadastro?codigo=CODIGO` já abre o cadastro com o código preenchido. **Redefinir** gera outro código e invalida o anterior na hora; contas existentes não são afetadas. A regra é imposta por trigger no banco (`auth.users`), não só no navegador. Contas criadas manualmente no painel do Supabase precisam ter `signup_code` no metadata do usuário (ou usar o link de convite).
- **WhatsApp do suporte** (Admin → Suporte): o número editável é usado na landing, login, cadastro e painel do revendedor. Nenhum número está no código.
- **Frete grátis** (Admin → Promoções): ativa/desativa e define a quantidade mínima. A regra fica em `app_settings` e é validada no servidor em `/api/shipping/quote` e `/api/orders`.

## Gerar Plaquinhas (Admin)

Admin → Gerar Plaquinhas: envie a arte (PNG/JPG/WebP) com um QR qualquer → o sistema detecta o QR (ou você ajusta a caixa manualmente) → escolha Sem logo / Google / Instagram / WhatsApp → produto e quantidade → o servidor cria os tokens únicos e permanentes → imagens em resolução original (ZIP de PNGs) e PDF para gráfica (uma página por plaquinha, tamanho físico pelo DPI informado). O QR sempre aponta para `NEXT_PUBLIC_APP_URL/q/[token]`; a logo é apenas visual.

## Cloudflare Workers

O projeto usa o adaptador oficial **OpenNext para Cloudflare** (`@opennextjs/cloudflare`) com `nodejs_compat`. O código segue portátil: `npm run build` / `npm start` continuam funcionando em Node, e nada da lógica usa APIs exclusivas da Cloudflare. Requer **Next 14.2+** (o adaptador não suporta Next 13) — por isso o `package.json` agora usa `next ^14.2.0`.

Arquivos: `wrangler.jsonc`, `open-next.config.ts`, `public/_headers`, `.dev.vars.example`.

```bash
npm install                  # regenera o package-lock.json (commite-o)
npm run typecheck && npm run build
npm run preview              # roda no runtime do Workers localmente (usa .dev.vars)
npm run deploy               # build + deploy (requer `npx wrangler login`)
```

**Variáveis**
- `NEXT_PUBLIC_*` são embutidas no **build**: defina-as no ambiente de build (no Workers Builds: Settings → Build → Variables) e também no `.env` local. Alterou? Faça novo build.
- Segredos (service role, Mercado Pago, Correios, Google, CRON_SECRET, QR_IP_HASH_SALT): `npx wrangler secret put NOME` ou painel do Worker → Variables and Secrets. Nunca no código.
- Webhook do Mercado Pago: `https://SEU-DOMINIO/api/webhooks/mercado-pago`.

**Observações**
- Não use `export const runtime = 'edge'`: o adaptador roda tudo no runtime Node do Workers (os `runtime = 'nodejs'` existentes são compatíveis).
- Tamanho do Worker: o plano gratuito limita o bundle (~3 MiB compactado); se o deploy reclamar, use o plano pago (10 MiB).
- Liberação de reservas: agende uma chamada a `/api/cron/release-reservations` (Bearer `CRON_SECRET`) por um agendador externo ou por Cron Trigger com um worker de entrada próprio. Sem isso, as reservas expiradas também são liberadas a cada novo pedido e a cada consulta de status.
- Domínio dos QRs: em Admin → Gerar Plaquinhas, a **URL base** pode ser trocada para novos lotes (salve como padrão). Os QRs antigos continuam funcionando enquanto o domínio antigo apontar para este sistema, pois `/q/[token]` resolve só pelo token.

## Ajustes finais (migration 012)

Rode `supabase/migrations/20261006100000_012_local_sales_store_settings.sql` no SQL Editor (incremental, não apaga nada).

- **Venda Local** (Admin → Venda Local): Nova Venda Local → escanear o QR da plaquinha → validar (precisa estar DISPONÍVEL no **estoque central**; plaquinhas de revendedor são ativadas no painel dele) → nome, telefone (opcional) e destino → ativar. A baixa do estoque central é atômica e nunca fica negativa; cada plaquinha só pode ser vendida uma vez. Depois dá para editar nome, telefone e destino; o QR (`/q/TOKEN`) nunca muda.
- **Painel de vendas** (Admin → Dashboard): filtro Todos | Varejo (Local) | Atacado (Lojinha). Atacado = pedidos pagos; Varejo = vendas locais.
- **Promoção de frete grátis** (Admin → Promoções): `store_settings.promo_active / promo_min_qty / promo_text`. Banner com botão "Chamar no suporte" (WhatsApp de Admin → Suporte) no painel do revendedor e na loja. O frete zero é decidido no servidor (`/api/shipping/quote` e `/api/orders`).
- **Gerador de plaquinhas**: tokens só são criados no banco (únicos e permanentes). Se o banco falhar, nada é gerado. URL base configurável por lote; modelos de posicionamento salvos.
- **Estoque**: alerta visual no Admin quando o disponível de um produto é ≤ 20 (`lib/inventory.ts`).

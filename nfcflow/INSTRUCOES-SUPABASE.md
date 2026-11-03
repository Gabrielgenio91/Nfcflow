# O que criar/rodar no Supabase para tudo funcionar

Tudo abaixo é feito no painel do Supabase. Nada apaga dados existentes (os SQLs são incrementais e podem ser rodados mais de uma vez).

## 1) Rodar os 2 SQLs (nesta ordem) — SQL Editor → New query → colar → Run

1. `supabase/migrations/20261006200000_013_owner_sale_scans_courses.sql`
   (valor da venda `sale_value`, data `sold_at`, contador `scan_count`, dono da placa, cursos)
   **Obrigatório para a ativação de placa, "placas ativas", faturamento e scans.**
2. `supabase/migrations/20261006300000_014_orders_storage_review_links.sql`
   (coluna `total_amount`, cancelamento automático de pedido vencido, bucket `products` de fotos, tabela `review_links`)

> Se você ainda não rodou a `20261006100000_012_local_sales_store_settings.sql` (venda local do admin), rode antes da 013.
> Se aparecer erro na 013 ou 014, copie a mensagem e me envie; não rode só parte do arquivo.

## 2) Variáveis de ambiente (Cloudflare → Workers → nfcflow → Settings → Variables and Secrets)

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | login e leitura (já devem existir) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave **service_role** (Project Settings → API). Gerador de plaquinhas, pedidos e Pix usam |
| `GOOGLE_PLACES_API_KEY` | **busca real da empresa** no gerador de link de avaliação. Ative a *Places API (New)* no Google Cloud |
| `NEXT_PUBLIC_WHATSAPP_LINK` (opcional) | só usada se o ADMIN não tiver configurado o WhatsApp em Suporte |

Depois de alterar variáveis, faça um novo deploy.

## 3) Conferir (1 minuto)

- **Storage:** Storage → deve existir o bucket **products** marcado como *Public*. (O SQL 014 cria; se não aparecer, crie manualmente: nome `products`, Public ligado.)
- **Admin:** a conta do dono precisa ter o papel admin (`raw_app_meta_data.role = 'admin'`). Isso é o que libera o admin a ver **todos** os pedidos, pagamentos e itens (a policy `orders_select` já usa `is_admin()`; não é preciso criar policy por e-mail).
- **Cancelamento automático de pedidos não pagos:** Database → Extensions → habilite **pg_cron** e rode o SQL 014 de novo (ele agenda `release_expired_orders()` a cada 5 minutos). Sem o pg_cron, o pedido vencido só vira "PEDIDO CANCELADO" quando alguém abre/atualiza um pedido, ou se você chamar `/api/cron/release-reservations` por um agendador externo.

## 4) Observações importantes sobre o que foi pedido

- A tabela de placas no seu banco chama-se **`plaques`** (não `plates`) e já existe. A ativação agora grava nela pela função `activate_plaque` (define `reseller_id` do revendedor logado, `status = ATIVA`, `sale_value`, `sold_at` e o destino em `qr_destinations`). Não foi criada tabela nova.
- O campo da foto do produto chama-se **`photo_url`** (já usado pela loja, pela função `get_store_catalog` e pela venda local). O upload salva a URL pública do bucket `products` nesse mesmo campo, por isso a foto aparece na loja sem mais nenhuma mudança. Não foi criada a coluna `image_url`.
- Placas que foram "ativadas" **antes** da 013 não têm `sale_value`, então não entram no faturamento. Para incluir uma, edite em Table Editor → `plaques` (coluna `sale_value` e `sold_at`).
- Pedidos: `total_amount` agora é sempre igual a `total` (coluna gerada). Status exibidos: AGUARDANDO PAGAMENTO, PAGAMENTO CONFIRMADO (pedido pago) e PEDIDO CANCELADO.
- **Segurança (recomendado):** a rota `app/api/admin/plaques/generate/route.ts` do projeto enviado não verifica se quem chama é admin. Qualquer pessoa com a URL poderia gerar plaquinhas. Na versão anterior ela usava `requireAdmin()`. Recomendo voltar essa verificação.

## 5) Testes rápidos depois de rodar tudo

1. Revendedor: Plaquinhas → Ativar → digite o código → preencha estabelecimento, link e **Valor vendido** → Ativar. Deve aparecer em **Minhas plaquinhas** (filtro "Ativas") com campo para editar o link, e a dashboard deve mostrar +1 em Ativas e o valor em Faturamento.
2. Revendedor: dashboard → Gerador de link de avaliação → Nome, Cidade, Estado → Buscar empresa → "É esta empresa" → copiar/salvar.
3. Admin: Produtos → Novo produto → Upload de foto → salvar → abrir a loja do revendedor e ver a foto.
4. Pedido: criar pedido sem pagar → Admin → Pedidos mostra "AGUARDANDO PAGAMENTO"; pagar → "PAGAMENTO CONFIRMADO" nos dois painéis; deixar vencer → "PEDIDO CANCELADO".


---

## 6) Ajustes mais recentes (migration 015)

Rode no SQL Editor, **depois** da 012, 013 e 014: `supabase/migrations/20261008100000_015_orders_shipping_stock_scans.sql`
(incremental; não apaga dados nem cria tabelas novas). Ela:

- permite **PAGO → ENVIADO**: após a confirmação do pagamento o admin informa o código de rastreio e marca como Enviado
  (marcar como pago continua impossível manualmente: só o webhook/consulta oficial do Mercado Pago faz isso);
- acrescenta `sold_online` e `sold_local` à view `inventory_overview` (unidades vendidas na loja virtual / no balcão);
- reconcilia `plaques.scan_count` com o log real `qr_scans` e garante o trigger que soma +1 a cada leitura do QR.

### Mercado Pago — o que depende de configuração externa
1. `MERCADO_PAGO_ACCESS_TOKEN` (credenciais de **produção** para receber de verdade).
2. `MERCADO_PAGO_WEBHOOK_SECRET`: no painel do Mercado Pago → Suas integrações → Webhooks, cadastre
   `https://SEU-DOMINIO/api/webhooks/mercado-pago`, marque o evento **Pagamentos** e copie a "assinatura secreta".
   Sem o segredo o webhook responde 503 e o pedido só é confirmado pela consulta oficial (botão "Verificar pagamento" /
   tela do pedido), nunca por ação do navegador.
3. `NEXT_PUBLIC_APP_URL` com o domínio público (usado na URL de notificação).
4. Redeploy depois de alterar variáveis.

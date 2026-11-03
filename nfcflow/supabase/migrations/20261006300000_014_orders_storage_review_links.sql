/*
# 014 — Pedidos sincronizados, upload de foto de produto e links de avaliação salvos

Incremental e idempotente (pode rodar mais de uma vez). Rode DEPOIS da 013.

1. orders.total_amount: coluna gerada = total (qualquer código que leia total_amount passa a enxergar o mesmo valor
   de total; não existe segundo valor para ficar fora de sincronia).
2. Cancelamento automático de pedido não pago/expirado (release_expired_orders a cada 5 min) via pg_cron,
   somente se a extensão pg_cron estiver habilitada no projeto.
3. Storage: bucket público "products" (leitura pública; escrita só ADMIN) para as fotos dos produtos da loja.
4. review_links: links de avaliação do Google gerados/confirmados pelo revendedor (RLS: cada um vê só os seus).
*/

-- 1) total_amount sempre igual a total
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) GENERATED ALWAYS AS (total) STORED;

-- 2) expira pedidos AGUARDANDO_PAGAMENTO vencidos → CANCELADO (reserva devolvida, pagamento EXPIRADO)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('release-expired-orders', '*/5 * * * *', 'SELECT public.release_expired_orders();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron não configurado: %', SQLERRM;
END $$;

-- 3) Storage: bucket de fotos dos produtos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('products', 'products', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "products_public_read" ON storage.objects;
CREATE POLICY "products_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'products');
DROP POLICY IF EXISTS "products_admin_insert" ON storage.objects;
CREATE POLICY "products_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'products' AND public.is_admin());
DROP POLICY IF EXISTS "products_admin_update" ON storage.objects;
CREATE POLICY "products_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin()) WITH CHECK (bucket_id = 'products' AND public.is_admin());
DROP POLICY IF EXISTS "products_admin_delete" ON storage.objects;
CREATE POLICY "products_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin());

-- 4) Links de avaliação salvos
CREATE TABLE IF NOT EXISTS public.review_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  place_id text NOT NULL,
  name text NOT NULL,
  address text,
  review_link text NOT NULL CHECK (review_link ~* '^https://search\.google\.com/local/writereview\?placeid='),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, place_id)
);
ALTER TABLE public.review_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review_links_own" ON public.review_links;
CREATE POLICY "review_links_own" ON public.review_links FOR ALL TO authenticated
  USING (public.is_admin() OR reseller_id = public.get_reseller_id_for_user())
  WITH CHECK (reseller_id = public.get_reseller_id_for_user());
CREATE INDEX IF NOT EXISTS idx_review_links_reseller ON public.review_links(reseller_id, created_at DESC);
REVOKE ALL ON public.review_links FROM anon;

NOTIFY pgrst, 'reload schema';

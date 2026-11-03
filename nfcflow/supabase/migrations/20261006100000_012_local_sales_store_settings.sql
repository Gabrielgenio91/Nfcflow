/*
# 012 — Vendas locais, promoção na store_settings e alertas de estoque

Incremental (NÃO apaga nada). Rode no SQL Editor depois do full_setup.

## O que faz
- store_settings (linha única): promo_active, promo_min_qty, promo_text. Passa a ser a ÚNICA fonte da
  promoção de frete grátis (copia o que já estava em app_settings, se houver). O servidor valida a regra.
- local_sales: vendas locais (varejo) registradas pelo ADMIN, com 1 venda por plaquinha (impede baixa dupla).
- admin_lookup_plaque_for_local_sale / admin_register_local_sale / admin_update_local_sale:
  validam a plaquinha pelo token, baixam o estoque central de forma atômica (nunca negativo),
  ativam a plaquinha e gravam o destino. O QR continua /q/TOKEN; só o destino muda.
*/

-- ---------------------------------------------------------------
-- store_settings (promoção de frete grátis)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS promo_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_min_qty int DEFAULT 250,
  ADD COLUMN IF NOT EXISTS promo_text text DEFAULT 'FRETE GRÁTIS para todo Brasil acima de 250 plaquinhas! Chamar no suporte';

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_settings_admin_all" ON public.store_settings;
CREATE POLICY "store_settings_admin_all" ON public.store_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- linha única; se a promoção já estava ligada em app_settings, preserva o valor
INSERT INTO public.store_settings (promo_active, promo_min_qty)
SELECT (v.en = 'true'),
       CASE WHEN v.en = 'true' THEN COALESCE(NULLIF(v.mq, '')::int, 250) ELSE 250 END
FROM (SELECT (SELECT value FROM public.app_settings WHERE key = 'free_shipping_enabled') AS en,
             (SELECT value FROM public.app_settings WHERE key = 'free_shipping_min_quantity') AS mq) v
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings);

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'support_whatsapp',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'support_whatsapp'), ''),
    'qr_base_url',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'qr_base_url'), ''),
    'promo_active',
      COALESCE((SELECT promo_active FROM public.store_settings LIMIT 1), false),
    'promo_min_qty',
      COALESCE((SELECT promo_min_qty FROM public.store_settings LIMIT 1), 250),
    'promo_text',
      COALESCE((SELECT promo_text FROM public.store_settings LIMIT 1), '')
  );
$$;
REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_promo(p_active boolean, p_min_qty integer, p_text text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_min_qty IS NULL OR p_min_qty < 1 OR p_min_qty > 100000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF length(COALESCE(p_text, '')) > 300 THEN RAISE EXCEPTION 'TEXT_TOO_LONG'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.store_settings) THEN
    INSERT INTO public.store_settings (promo_active, promo_min_qty, promo_text)
    VALUES (p_active, p_min_qty, NULLIF(btrim(COALESCE(p_text, '')), ''));
  ELSE
    UPDATE public.store_settings
      SET promo_active = p_active,
          promo_min_qty = p_min_qty,
          promo_text = COALESCE(NULLIF(btrim(COALESCE(p_text, '')), ''), promo_text),
          updated_at = now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_promo(boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_promo(boolean, integer, text) TO authenticated;

-- a função antiga gravava em app_settings; agora existe uma única fonte (store_settings)
DROP FUNCTION IF EXISTS public.admin_set_free_shipping(boolean, integer);

-- ---------------------------------------------------------------
-- local_sales (varejo / venda local)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.local_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaque_id uuid NOT NULL UNIQUE REFERENCES public.plaques(id),   -- 1 venda por plaquinha
  product_id uuid REFERENCES public.products(id),
  sold_by uuid REFERENCES auth.users(id),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) >= 2),
  customer_phone text,
  amount numeric(10,2) NOT NULL DEFAULT 80 CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.local_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "local_sales_admin_all" ON public.local_sales;
CREATE POLICY "local_sales_admin_all" ON public.local_sales FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS "local_sales_updated_at" ON public.local_sales;
CREATE TRIGGER "local_sales_updated_at" BEFORE UPDATE ON public.local_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_local_sales_created_at ON public.local_sales(created_at DESC);

-- Resultado: NOT_FOUND | IN_RESELLER_STOCK | AVAILABLE | ACTIVE | INACTIVE
CREATE OR REPLACE FUNCTION public.admin_lookup_plaque_for_local_sale(p_token text)
RETURNS TABLE(result text, plaque_id uuid, product_name text, product_photo_url text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.plaques%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO p FROM public.plaques WHERE public_token = upper(btrim(p_token));
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::text, NULL::text; RETURN;
  END IF;
  RETURN QUERY
    SELECT CASE
             WHEN p.status = 'ATIVA' THEN 'ACTIVE'
             WHEN p.status = 'INATIVA' THEN 'INACTIVE'
             WHEN p.reseller_id IS NOT NULL THEN 'IN_RESELLER_STOCK'
             ELSE 'AVAILABLE'
           END,
           p.id, pr.name, pr.photo_url, p.status
    FROM public.products pr WHERE pr.id = p.product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_register_local_sale(
  p_plaque_id uuid, p_customer_name text, p_phone text, p_destination_url text, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.plaques%ROWTYPE;
  v_url text := btrim(COALESCE(p_destination_url, ''));
  v_qty integer;
  v_reserved integer;
  v_sale uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_url !~* '^https?://[^[:space:]]+$' OR length(v_url) > 2048 THEN RAISE EXCEPTION 'INVALID_URL'; END IF;
  IF length(btrim(COALESCE(p_customer_name, ''))) < 2 THEN RAISE EXCEPTION 'CUSTOMER_REQUIRED'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO p FROM public.plaques WHERE id = p_plaque_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAQUE_NOT_FOUND'; END IF;
  IF p.status <> 'DISPONIVEL' THEN RAISE EXCEPTION 'ALREADY_ACTIVATED'; END IF;
  IF p.reseller_id IS NOT NULL THEN RAISE EXCEPTION 'IN_RESELLER_STOCK'; END IF;

  -- baixa do estoque central (atômica; nunca negativa)
  SELECT quantity, reserved_quantity INTO v_qty, v_reserved
    FROM public.inventory WHERE product_id = p.product_id FOR UPDATE;
  IF v_qty IS NULL OR v_qty - v_reserved < 1 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
  UPDATE public.inventory SET quantity = quantity - 1 WHERE product_id = p.product_id;
  INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, user_id, notes)
  VALUES (p.product_id, -1, 'SAIDA', 'ESTOQUE CENTRAL', 'VENDA LOCAL', auth.uid(), 'venda local | plaquinha ' || p.public_token);

  UPDATE public.plaques SET status = 'ATIVA', activated_at = now() WHERE id = p.id;
  UPDATE public.qr_destinations SET active = false WHERE plaque_id = p.id AND active;
  INSERT INTO public.qr_destinations (plaque_id, destination_url, active) VALUES (p.id, v_url, true);

  INSERT INTO public.local_sales (plaque_id, product_id, sold_by, customer_name, customer_phone, amount)
  VALUES (p.id, p.product_id, auth.uid(), btrim(p_customer_name), NULLIF(btrim(COALESCE(p_phone, '')), ''), p_amount)
  RETURNING id INTO v_sale;

  RETURN jsonb_build_object('sale_id', v_sale, 'plaque_id', p.id, 'token', p.public_token);
END;
$$;

-- Edita depois: nome, telefone e destino (o QR/token NÃO muda)
CREATE OR REPLACE FUNCTION public.admin_update_local_sale(
  p_sale_id uuid, p_customer_name text, p_phone text, p_destination_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plaque uuid;
  v_url text := btrim(COALESCE(p_destination_url, ''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_url !~* '^https?://[^[:space:]]+$' OR length(v_url) > 2048 THEN RAISE EXCEPTION 'INVALID_URL'; END IF;
  IF length(btrim(COALESCE(p_customer_name, ''))) < 2 THEN RAISE EXCEPTION 'CUSTOMER_REQUIRED'; END IF;
  SELECT plaque_id INTO v_plaque FROM public.local_sales WHERE id = p_sale_id FOR UPDATE;
  IF v_plaque IS NULL THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;

  UPDATE public.local_sales
    SET customer_name = btrim(p_customer_name), customer_phone = NULLIF(btrim(COALESCE(p_phone, '')), '')
    WHERE id = p_sale_id;

  IF NOT EXISTS (SELECT 1 FROM public.qr_destinations WHERE plaque_id = v_plaque AND active AND destination_url = v_url) THEN
    UPDATE public.qr_destinations SET active = false WHERE plaque_id = v_plaque AND active;
    INSERT INTO public.qr_destinations (plaque_id, destination_url, active) VALUES (v_plaque, v_url, true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lookup_plaque_for_local_sale(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_register_local_sale(uuid, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_local_sale(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lookup_plaque_for_local_sale(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_local_sale(uuid, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_local_sale(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

/*
# 016 — Correções: produtos/estoque (esgotado), venda local sem validação de estoque, "Recebi minha encomenda"

Incremental e idempotente (NÃO apaga dados, NÃO cria tabelas). Rode no SQL Editor DEPOIS da 015.
NÃO altera admin_update_order_status nem a regra das 1000 placas.

1. products: colunas min_order_qty, max_order_qty (limites da loja) e sold_out (botão Esgotado/Disponível).
2. get_store_catalog: passa a devolver min_order_qty, max_order_qty e sold_out; produto esgotado => available = 0.
3. create_order: igual à anterior + bloqueia produto marcado como esgotado (PRODUCT_SOLD_OUT).
4. admin_register_local_sale: SEM validação de estoque. Ativa mesmo com estoque zero (só baixa 1 un. se houver disponível).
5. activate_plaque (revendedor): mesma lógica da 013, sem nenhuma validação de estoque (reafirmada aqui).
6. reseller_confirm_delivery: botão "RECEBI MINHA ENCOMENDA" do revendedor -> pedido ENTREGUE (visível no Admin).
7. Pedidos com status legado APROVADO passam a PAGO (mesmo significado; permite seguir o fluxo normal no Admin).
*/

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_order_qty integer,
  ADD COLUMN IF NOT EXISTS max_order_qty integer,
  ADD COLUMN IF NOT EXISTS sold_out boolean NOT NULL DEFAULT false;

-- 2) Catálogo da loja
DROP FUNCTION IF EXISTS public.get_store_catalog();
CREATE FUNCTION public.get_store_catalog()
RETURNS TABLE(
  product_id uuid, name text, description text, photo_url text, product_type text,
  width numeric, height numeric, unit text, available integer, tiers jsonb,
  min_order_qty integer, max_order_qty integer, sold_out boolean
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    p.id, p.name, p.description, p.photo_url, p.product_type, p.width, p.height, p.unit,
    CASE WHEN COALESCE(p.sold_out, false) THEN 0
         ELSE GREATEST(COALESCE(i.quantity - i.reserved_quantity, 0), 0)::integer END,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'min_quantity', t.min_quantity, 'max_quantity', t.max_quantity, 'unit_price', t.unit_price
        ) ORDER BY t.min_quantity)
       FROM public.product_price_tiers t WHERE t.product_id = p.id),
      '[]'::jsonb),
    p.min_order_qty, p.max_order_qty, COALESCE(p.sold_out, false)
  FROM public.products p
  LEFT JOIN public.inventory i ON i.product_id = p.id
  WHERE p.status = 'ATIVO'
    AND public.get_reseller_id_for_user() IS NOT NULL
  ORDER BY p.name;
$$;
REVOKE ALL ON FUNCTION public.get_store_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_catalog() TO authenticated;

-- 3) create_order (mesma assinatura; + bloqueio de produto esgotado)
CREATE OR REPLACE FUNCTION public.create_order(
  p_reseller_id uuid,
  p_items jsonb,            -- [{"product_id": "...", "quantity": 10}]
  p_shipping_amount numeric,
  p_shipping_service text,
  p_shipping_days integer,
  p_shipping_is_estimate boolean,
  p_address jsonb,
  p_expires_minutes integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_unit numeric(10,2);
  v_avail integer;
  v_name text;
  v_pstatus text;
  v_soldout boolean;
  r record;
BEGIN
  PERFORM public.release_expired_orders();

  SELECT status INTO v_status FROM public.resellers WHERE id = p_reseller_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'RESELLER_NOT_FOUND'; END IF;
  IF v_status <> 'ATIVO' THEN RAISE EXCEPTION 'RESELLER_BLOCKED'; END IF;
  IF p_shipping_amount IS NULL OR p_shipping_amount < 0 THEN RAISE EXCEPTION 'INVALID_SHIPPING'; END IF;

  CREATE TEMP TABLE _items ON COMMIT DROP AS
    SELECT (e->>'product_id')::uuid AS product_id, SUM((e->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) e
    GROUP BY 1;
  IF NOT EXISTS (SELECT 1 FROM _items) THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
  IF EXISTS (SELECT 1 FROM _items WHERE quantity IS NULL OR quantity <= 0) THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;

  INSERT INTO public.orders (
    reseller_id, subtotal, shipping_amount, total, payment_method,
    shipping_service, shipping_days, shipping_is_estimate,
    ship_recipient_name, ship_phone, ship_zip_code, ship_state, ship_city,
    ship_neighborhood, ship_street, ship_number, ship_complement,
    reservation_expires_at
  ) VALUES (
    p_reseller_id, 0, p_shipping_amount, p_shipping_amount, 'PIX',
    p_shipping_service, p_shipping_days, COALESCE(p_shipping_is_estimate, false),
    p_address->>'recipient_name', p_address->>'phone', p_address->>'zip_code', p_address->>'state', p_address->>'city',
    p_address->>'neighborhood', p_address->>'street', p_address->>'number', NULLIF(p_address->>'complement',''),
    now() + make_interval(mins => GREATEST(COALESCE(p_expires_minutes, 35), 5))
  ) RETURNING id INTO v_order_id;

  -- ordem fixa evita deadlock entre compradores simultâneos
  FOR r IN SELECT product_id, quantity FROM _items ORDER BY product_id LOOP
    SELECT name, status, COALESCE(sold_out, false) INTO v_name, v_pstatus, v_soldout FROM public.products WHERE id = r.product_id;
    IF v_name IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
    IF v_pstatus <> 'ATIVO' THEN RAISE EXCEPTION 'PRODUCT_INACTIVE:%', v_name; END IF;
    IF v_soldout THEN RAISE EXCEPTION 'PRODUCT_SOLD_OUT:%', v_name; END IF;

    -- trava a linha do estoque: duas compras da última unidade não passam juntas
    SELECT quantity - reserved_quantity INTO v_avail
      FROM public.inventory WHERE product_id = r.product_id FOR UPDATE;
    IF v_avail IS NULL OR v_avail < r.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_name;
    END IF;

    SELECT unit_price INTO v_unit FROM public.product_price_tiers
      WHERE product_id = r.product_id AND min_quantity <= r.quantity
        AND (max_quantity IS NULL OR max_quantity >= r.quantity)
      ORDER BY min_quantity DESC LIMIT 1;
    IF v_unit IS NULL THEN RAISE EXCEPTION 'PRICE_NOT_FOUND:%', v_name; END IF;

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
    VALUES (v_order_id, r.product_id, v_name, r.quantity, v_unit, v_unit * r.quantity);
    v_subtotal := v_subtotal + v_unit * r.quantity;

    UPDATE public.inventory SET reserved_quantity = reserved_quantity + r.quantity WHERE product_id = r.product_id;
    INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, notes)
    VALUES (r.product_id, r.quantity, 'RESERVA', 'ESTOQUE CENTRAL', 'PEDIDO', 'pedido ' || v_order_id);
  END LOOP;

  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal + p_shipping_amount WHERE id = v_order_id;
  INSERT INTO public.order_status_history (order_id, from_status, to_status, note)
  VALUES (v_order_id, NULL, 'AGUARDANDO_PAGAMENTO', 'Pedido criado');
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(uuid, jsonb, numeric, text, integer, boolean, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, jsonb, numeric, text, integer, boolean, jsonb, integer) TO service_role;

-- 4) Venda Local do admin: SEM validação de estoque
CREATE OR REPLACE FUNCTION public.admin_register_local_sale(
  p_plaque_id uuid, p_customer_name text, p_phone text, p_destination_url text, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.plaques%ROWTYPE;
  v_url text := btrim(COALESCE(p_destination_url, ''));
  v_qty integer;
  v_reserved integer;
  v_dec integer := 0;
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

  -- Estoque NÃO bloqueia a ativação. Baixa 1 unidade apenas se houver disponível (nunca fica negativo).
  SELECT quantity, reserved_quantity INTO v_qty, v_reserved
    FROM public.inventory WHERE product_id = p.product_id FOR UPDATE;
  IF v_qty IS NOT NULL AND v_qty - v_reserved >= 1 THEN
    UPDATE public.inventory SET quantity = quantity - 1 WHERE product_id = p.product_id;
    v_dec := -1;
  END IF;
  INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, user_id, notes)
  VALUES (p.product_id, v_dec, 'SAIDA', 'ESTOQUE CENTRAL', 'VENDA LOCAL', auth.uid(), 'venda local | plaquinha ' || p.public_token);

  UPDATE public.plaques SET status = 'ATIVA', activated_at = now() WHERE id = p.id;
  UPDATE public.qr_destinations SET active = false WHERE plaque_id = p.id AND active;
  INSERT INTO public.qr_destinations (plaque_id, destination_url, active) VALUES (p.id, v_url, true);

  INSERT INTO public.local_sales (plaque_id, product_id, sold_by, customer_name, customer_phone, amount)
  VALUES (p.id, p.product_id, auth.uid(), btrim(p_customer_name), NULLIF(btrim(COALESCE(p_phone, '')), ''), p_amount)
  RETURNING id INTO v_sale;

  RETURN jsonb_build_object('sale_id', v_sale, 'plaque_id', p.id, 'token', p.public_token);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_register_local_sale(uuid, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_local_sale(uuid, text, text, text, numeric) TO authenticated;

-- 5) Ativação do revendedor: sem validação de estoque (lógica da 013 mantida)
CREATE OR REPLACE FUNCTION public.activate_plaque(
  p_plaque_id uuid,
  p_customer_id uuid,
  p_new_establishment text,
  p_new_phone text,
  p_destination_url text,
  p_sale_value numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid := public.get_reseller_id_for_user();
  p public.plaques%ROWTYPE;
  v_customer uuid := p_customer_id;
  v_url text := btrim(COALESCE(p_destination_url, ''));
  v_claimed boolean := false;
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_url !~* '^https?://[^[:space:]]+$' OR length(v_url) > 2048 THEN RAISE EXCEPTION 'INVALID_URL'; END IF;
  IF p_sale_value IS NULL OR p_sale_value < 0 OR p_sale_value > 100000 THEN RAISE EXCEPTION 'INVALID_SALE_VALUE'; END IF;

  SELECT * INTO p FROM public.plaques WHERE id = p_plaque_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p.reseller_id IS NOT NULL AND p.reseller_id <> v_rid THEN RAISE EXCEPTION 'PLAQUE_TAKEN'; END IF;
  IF p.status <> 'DISPONIVEL' THEN RAISE EXCEPTION 'ALREADY_ACTIVATED'; END IF;
  v_claimed := (p.reseller_id IS NULL);

  IF v_customer IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer AND reseller_id = v_rid) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  ELSE
    IF length(btrim(COALESCE(p_new_establishment,''))) < 2 THEN RAISE EXCEPTION 'ESTABLISHMENT_REQUIRED'; END IF;
    INSERT INTO public.customers (reseller_id, establishment_name, phone)
    VALUES (v_rid, btrim(p_new_establishment), NULLIF(btrim(COALESCE(p_new_phone,'')), ''))
    RETURNING id INTO v_customer;
  END IF;

  UPDATE public.plaques
     SET reseller_id = v_rid,
         status = 'ATIVA',
         customer_id = v_customer,
         activated_at = now(),
         sold_at = now(),
         sale_value = round(p_sale_value, 2)
   WHERE id = p.id;
  UPDATE public.qr_destinations SET active = false WHERE plaque_id = p.id AND active;
  INSERT INTO public.qr_destinations (plaque_id, destination_url, active) VALUES (p.id, v_url, true);

  -- Sem validação de estoque: funciona com estoque zero. O contador nunca fica negativo.
  IF NOT v_claimed THEN
    UPDATE public.reseller_inventory SET quantity = GREATEST(quantity - 1, 0)
      WHERE reseller_id = v_rid AND product_id = p.product_id;
  END IF;
  INSERT INTO public.inventory_movements (product_id, reseller_id, quantity, movement_type, origin, destination, user_id, notes)
  VALUES (p.product_id, v_rid, CASE WHEN v_claimed THEN 0 ELSE -1 END, 'ATIVACAO', 'REVENDEDOR', 'CLIENTE', auth.uid(),
          CASE WHEN v_claimed THEN 'plaquinha ' || p.public_token || ' (assumida no primeiro scan)' ELSE 'plaquinha ' || p.public_token END);
  RETURN p.id;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plaque(uuid, uuid, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plaque(uuid, uuid, text, text, text, numeric) TO authenticated;

-- 6) "RECEBI MINHA ENCOMENDA": o próprio revendedor marca o pedido enviado como ENTREGUE
CREATE OR REPLACE FUNCTION public.reseller_confirm_delivery(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid := public.get_reseller_id_for_user();
  o public.orders%ROWTYPE;
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.reseller_id <> v_rid THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status = 'ENTREGUE' THEN RETURN jsonb_build_object('status', 'ENTREGUE'); END IF;
  IF o.status NOT IN ('ENVIADO', 'EM_TRANSITO') THEN RAISE EXCEPTION 'INVALID_TRANSITION:% -> ENTREGUE', o.status; END IF;

  UPDATE public.shipments SET status = 'ENTREGUE', delivered_at = now() WHERE order_id = o.id;
  UPDATE public.orders SET status = 'ENTREGUE' WHERE id = o.id;
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (o.id, o.status, 'ENTREGUE', auth.uid(), 'Recebimento confirmado pelo revendedor');
  RETURN jsonb_build_object('status', 'ENTREGUE');
END;
$$;
REVOKE ALL ON FUNCTION public.reseller_confirm_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reseller_confirm_delivery(uuid) TO authenticated;

-- 7) Status legado APROVADO == PAGO (só atualiza se a regra de status do banco permitir)
DO $$
BEGIN
  UPDATE public.orders SET status = 'PAGO' WHERE status = 'APROVADO';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Status legado não normalizado: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

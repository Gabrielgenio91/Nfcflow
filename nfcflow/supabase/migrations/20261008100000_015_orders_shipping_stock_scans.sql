/*
# 015 — Envio direto após pagamento, estoque "vendido na loja virtual" e scans reconciliados

Incremental e idempotente (NÃO apaga dados, NÃO cria tabelas novas). Rode no SQL Editor DEPOIS da 012, 013 e 014.

## O que faz
1. admin_update_order_status: além do fluxo anterior, permite PAGO -> ENVIADO (admin informa o código de
   rastreio e marca como Enviado logo após a confirmação do pagamento). Continua IMPOSSÍVEL marcar um pedido
   como pago manualmente: só apply_payment_update (chamada pelo webhook/consulta oficial do Mercado Pago) faz isso.
2. inventory_overview: ganha 2 colunas no FINAL (as antigas continuam iguais):
   - sold_online: unidades vendidas na loja virtual (pedidos pagos: PAGO, EM_PREPARACAO, ENVIADO, EM_TRANSITO, ENTREGUE;
     pedido cancelado não conta).
   - sold_local: unidades vendidas no balcão (local_sales).
3. Scans: garante o trigger que soma +1 em plaques.scan_count a cada linha de qr_scans e reconcilia o contador
   com o log real (scan_count = nº de linhas em qr_scans da plaquinha).
*/

DO $$
BEGIN
  IF to_regclass('public.local_sales') IS NULL THEN
    RAISE EXCEPTION 'Rode antes a migration 012 (tabela local_sales não existe).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plaques' AND column_name = 'scan_count') THEN
    RAISE EXCEPTION 'Rode antes a migration 013 (coluna plaques.scan_count não existe).';
  END IF;
END $$;

-- 1) PAGO -> ENVIADO permitido (mantém todas as transições anteriores)
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id uuid, p_new_status text, p_tracking_code text, p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_ok boolean;
  v_short integer := 0;
  v_code text := NULLIF(btrim(COALESCE(p_tracking_code, '')), '');
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  IF p_new_status = 'CANCELADO' THEN
    PERFORM public.cancel_order(p_order_id, p_actor, 'Cancelado pelo administrador');
    RETURN jsonb_build_object('status', 'CANCELADO');
  END IF;

  v_ok := (o.status, p_new_status) IN (
    ('PAGO','EM_PREPARACAO'), ('PAGO','ENVIADO'), ('EM_PREPARACAO','ENVIADO'),
    ('ENVIADO','EM_TRANSITO'), ('EM_TRANSITO','ENTREGUE')
  );
  IF NOT v_ok THEN RAISE EXCEPTION 'INVALID_TRANSITION:% -> %', o.status, p_new_status; END IF;

  IF p_new_status = 'ENVIADO' THEN
    IF v_code IS NULL THEN RAISE EXCEPTION 'TRACKING_REQUIRED'; END IF;
    IF v_code !~ '^[A-Za-z0-9]{8,20}$' THEN RAISE EXCEPTION 'TRACKING_INVALID'; END IF;
    UPDATE public.orders SET tracking_code = upper(v_code) WHERE id = o.id;
    INSERT INTO public.shipments (order_id, carrier, tracking_code, status, shipped_at)
    VALUES (o.id, 'CORREIOS', upper(v_code), 'ENVIADO', now())
    ON CONFLICT (order_id) DO UPDATE SET tracking_code = EXCLUDED.tracking_code, status = 'ENVIADO', shipped_at = now();
    v_short := public._assign_plaques_to_order(o.id, p_actor);
  ELSIF p_new_status = 'EM_TRANSITO' THEN
    UPDATE public.shipments SET status = 'EM_TRANSITO' WHERE order_id = o.id;
  ELSIF p_new_status = 'ENTREGUE' THEN
    UPDATE public.shipments SET status = 'ENTREGUE', delivered_at = now() WHERE order_id = o.id;
  END IF;

  UPDATE public.orders SET status = p_new_status WHERE id = o.id;
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (o.id, o.status, p_new_status, p_actor,
          CASE WHEN p_new_status = 'ENVIADO' THEN 'Código de rastreio: ' || upper(v_code) ELSE NULL END);

  RETURN jsonb_build_object('status', p_new_status, 'plaques_missing', v_short);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text, text, uuid) TO service_role;

-- 2) Estoque: vendido na loja virtual x vendido no balcão (colunas novas no FINAL da view)
CREATE OR REPLACE VIEW public.inventory_overview WITH (security_invoker = true) AS
  SELECT p.id AS product_id, p.name, p.status,
         COALESCE(i.quantity, 0) AS quantity,
         COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
         GREATEST(COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0), 0) AS available_quantity,
         COALESCE((
           SELECT SUM(oi.quantity)::integer
           FROM public.order_items oi
           JOIN public.orders o ON o.id = oi.order_id
           WHERE oi.product_id = p.id
             AND o.status IN ('PAGO','EM_PREPARACAO','ENVIADO','EM_TRANSITO','ENTREGUE')
         ), 0) AS sold_online,
         COALESCE((
           SELECT COUNT(*)::integer FROM public.local_sales ls WHERE ls.product_id = p.id
         ), 0) AS sold_local
  FROM public.products p
  LEFT JOIN public.inventory i ON i.product_id = p.id;

-- 3) Scans: trigger garantido + contador reconciliado com o log real
CREATE OR REPLACE FUNCTION public._bump_plaque_scan_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.plaques SET scan_count = scan_count + 1 WHERE id = NEW.plaque_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "qr_scans_bump_count" ON public.qr_scans;
CREATE TRIGGER "qr_scans_bump_count" AFTER INSERT ON public.qr_scans
  FOR EACH ROW EXECUTE FUNCTION public._bump_plaque_scan_count();

UPDATE public.plaques p
   SET scan_count = COALESCE(s.n, 0)
  FROM (
    SELECT pl.id, (SELECT count(*)::int FROM public.qr_scans q WHERE q.plaque_id = pl.id) AS n
    FROM public.plaques pl
  ) s
 WHERE s.id = p.id AND p.scan_count IS DISTINCT FROM COALESCE(s.n, 0);

NOTIFY pgrst, 'reload schema';

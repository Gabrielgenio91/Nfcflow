/*
# 013 — Dono da plaquinha, valor da venda, scans por plaquinha e cursos

Incremental (NÃO apaga nada; seguro para rodar mais de uma vez). Rode no SQL Editor.

## O que faz
1. plaques: sale_value (valor vendido), sold_at (data da venda), scan_count (nº de scans) — só se não existirem.
2. Scans: trigger em qr_scans soma +1 em plaques.scan_count a cada scan registrado pela rota /q/[token]
   (a tabela qr_scans continua sendo o log detalhado; nada duplicado). Backfill dos scans já existentes.
3. Dono da plaquinha (primeiro revendedor que ativar):
   - lookup_plaque_for_activation: plaquinha sem dono ou do próprio usuário = AVAILABLE; de outra conta = NOT_YOURS.
   - activate_plaque (agora com valor vendido): em UMA transação trava a linha, recusa se já tem outro dono
     (PLAQUE_TAKEN), atribui reseller_id ao usuário logado se estiver sem dono, ativa e grava sale_value + sold_at.
   Vale para código digitado e QR escaneado (as duas telas chamam as mesmas funções; a regra está no banco).
4. courses: cursos cadastrados pelo ADMIN (título, descrição, URL do YouTube, ordem); revendedor só lê.
*/

-- 1) Campos novos em plaques
ALTER TABLE public.plaques ADD COLUMN IF NOT EXISTS sale_value numeric(10,2);
ALTER TABLE public.plaques ADD COLUMN IF NOT EXISTS sold_at timestamptz;
ALTER TABLE public.plaques ADD COLUMN IF NOT EXISTS scan_count integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plaques_sale_value_check') THEN
    ALTER TABLE public.plaques ADD CONSTRAINT plaques_sale_value_check CHECK (sale_value IS NULL OR (sale_value >= 0 AND sale_value <= 100000));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_plaques_reseller_sold_at ON public.plaques(reseller_id, sold_at);

-- 2) scan_count acompanha qr_scans
UPDATE public.plaques p
   SET scan_count = s.n
  FROM (SELECT plaque_id, count(*)::int AS n FROM public.qr_scans GROUP BY plaque_id) s
 WHERE s.plaque_id = p.id AND p.scan_count = 0;

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

-- 3) Dono da plaquinha + valor da venda
-- Resultado: NOT_FOUND | NOT_YOURS (já tem outro dono) | AVAILABLE | ACTIVE | INACTIVE
CREATE OR REPLACE FUNCTION public.lookup_plaque_for_activation(p_token text)
RETURNS TABLE(result text, plaque_id uuid, product_name text, product_photo_url text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid := public.get_reseller_id_for_user();
  p public.plaques%ROWTYPE;
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO p FROM public.plaques WHERE public_token = upper(btrim(p_token));
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::text, NULL::text; RETURN;
  END IF;
  IF p.reseller_id IS NOT NULL AND p.reseller_id <> v_rid THEN
    RETURN QUERY SELECT 'NOT_YOURS'::text, NULL::uuid, NULL::text, NULL::text, NULL::text; RETURN;
  END IF;
  IF p.reseller_id IS NULL AND p.status <> 'DISPONIVEL' THEN
    -- sem dono mas já ativada/inativa (ex.: venda local do proprietário): não pode ser assumida
    RETURN QUERY SELECT 'NOT_YOURS'::text, NULL::uuid, NULL::text, NULL::text, NULL::text; RETURN;
  END IF;
  RETURN QUERY
    SELECT CASE p.status WHEN 'DISPONIVEL' THEN 'AVAILABLE' WHEN 'ATIVA' THEN 'ACTIVE' ELSE 'INACTIVE' END,
           p.id, pr.name, pr.photo_url, p.status
    FROM public.products pr WHERE pr.id = p.product_id;
END;
$$;

-- a versão antiga (sem valor vendido) deixa de existir: não há caminho de ativação sem sale_value
DROP FUNCTION IF EXISTS public.activate_plaque(uuid, uuid, text, text, text);

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

  -- trava a linha: dois revendedores ativando a mesma plaquinha ao mesmo tempo → só o primeiro vence
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

  -- estoque do revendedor só baixa quando a plaquinha já era dele (comprada); assumida pelo scan não estava no estoque dele
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

REVOKE ALL ON FUNCTION public.lookup_plaque_for_activation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_plaque(uuid, uuid, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_plaque_for_activation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_plaque(uuid, uuid, text, text, text, numeric) TO authenticated;

-- 4) Cursos
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) >= 2),
  description text,
  youtube_url text NOT NULL CHECK (youtube_url ~* '^https?://'),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courses_select" ON public.courses;
CREATE POLICY "courses_select" ON public.courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "courses_admin_write" ON public.courses;
CREATE POLICY "courses_admin_write" ON public.courses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS "courses_updated_at" ON public.courses;
CREATE TRIGGER "courses_updated_at" BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_courses_position ON public.courses(position, created_at);
REVOKE ALL ON public.courses FROM anon;

NOTIFY pgrst, 'reload schema';

/*
# Core Tables: Profiles, Resellers, Customers

## Overview
This migration creates the foundational authentication and user-management schema for the plaque SaaS platform. It establishes three core tables, helper functions for authorization, and Row Level Security policies that enforce strict data isolation between resellers.

## 1. Helper Functions
- `is_admin()` — SECURITY DEFINER function that checks if the current authenticated user has role 'admin' in their JWT raw_app_meta_data.
- `get_reseller_id_for_user()` — SECURITY DEFINER function that returns the reseller id associated with the current auth.uid(), or NULL if none.
- `update_updated_at_column()` — trigger function that sets updated_at = now() before any UPDATE.
- `handle_new_user()` — creates a profiles row when a new auth.users row is inserted.

## 2. New Tables
### profiles
- id (uuid, PK, references auth.users ON DELETE CASCADE)
- full_name (text, not null)
- phone (text, nullable)
- role (text, not null, default 'reseller') — 'admin' or 'reseller'
- is_active (boolean, not null, default true)
- created_at, updated_at (timestamptz)

### resellers
- id (uuid, PK)
- user_id (uuid, not null, unique, references auth.users ON DELETE CASCADE)
- full_name (text, not null)
- email (text, not null)
- phone, document, address (text, nullable)
- status (text, not null, default 'ATIVO') — 'ATIVO' or 'BLOQUEADO'
- created_at, updated_at (timestamptz)

### customers
- id (uuid, PK)
- reseller_id (uuid, not null, references resellers ON DELETE CASCADE)
- establishment_name (text, not null)
- phone, email, address, notes (text, nullable)
- created_at, updated_at (timestamptz)

## 3. Security (RLS)
- profiles: admins see all; users see own only. Insert/update: admin or self. Delete: admin only.
- resellers: admins see all; resellers see own row. Insert/update/delete: admin only.
- customers: admins see all; resellers see own customers (scoped via get_reseller_id_for_user()). CRUD scoped to owning reseller or admin.

## 4. Indexes
- resellers(user_id), resellers(status), customers(reseller_id), profiles(role)
*/

-- ============================================
-- IS_ADMIN helper (does not reference resellers)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'reseller' CHECK (role IN ('admin', 'reseller')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR auth.uid() = id)
  WITH CHECK (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "profiles_updated_at" ON public.profiles;
CREATE TRIGGER "profiles_updated_at"
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================
-- HANDLE NEW USER TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(NEW.raw_app_meta_data ->> 'role', 'reseller')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RESELLERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  document text,
  address text,
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'BLOQUEADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resellers_select" ON public.resellers;
CREATE POLICY "resellers_select"
  ON public.resellers FOR SELECT
  TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "resellers_insert" ON public.resellers;
CREATE POLICY "resellers_insert"
  ON public.resellers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "resellers_update" ON public.resellers;
CREATE POLICY "resellers_update"
  ON public.resellers FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "resellers_delete" ON public.resellers;
CREATE POLICY "resellers_delete"
  ON public.resellers FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "resellers_updated_at" ON public.resellers;
CREATE TRIGGER "resellers_updated_at"
  BEFORE UPDATE ON public.resellers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_resellers_user_id ON public.resellers(user_id);
CREATE INDEX IF NOT EXISTS idx_resellers_status ON public.resellers(status);

-- ============================================
-- GET_RESELLER_ID_FOR_USER helper (references resellers, so after table creation)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_reseller_id_for_user()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.resellers WHERE user_id = auth.uid();
$$;

-- ============================================
-- CUSTOMERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  establishment_name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select" ON public.customers;
CREATE POLICY "customers_select"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP POLICY IF EXISTS "customers_insert" ON public.customers;
CREATE POLICY "customers_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP POLICY IF EXISTS "customers_update" ON public.customers;
CREATE POLICY "customers_update"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  )
  WITH CHECK (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP POLICY IF EXISTS "customers_delete" ON public.customers;
CREATE POLICY "customers_delete"
  ON public.customers FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP TRIGGER IF EXISTS "customers_updated_at" ON public.customers;
CREATE TRIGGER "customers_updated_at"
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_customers_reseller_id ON public.customers(reseller_id);
/*
# Products, Inventory, Plaques, QR Codes

## Overview
This migration creates the product catalog, pricing tiers, central and reseller inventory with movement tracking, physical plaques with dynamic QR codes, QR destinations, and QR scan logging. All tables have RLS with strict isolation between resellers.

## 1. New Tables

### products
- id (uuid, PK)
- name (text, not null)
- description (text, nullable)
- photo_url (text, nullable) — URL to product image
- product_type (text, not null) — e.g. 'instagram', 'google', 'outro' (extensible)
- width (numeric, nullable) — width dimension
- height (numeric, nullable) — height dimension
- unit (text, nullable) — unit of measurement, e.g. 'cm'
- status (text, not null, default 'ATIVO') — 'ATIVO' or 'INATIVO'
- created_by (uuid, references auth.users) — audit
- created_at, updated_at (timestamptz)

### product_price_tiers
- id (uuid, PK)
- product_id (uuid, FK to products ON DELETE CASCADE)
- min_quantity (integer, not null)
- max_quantity (integer, nullable — null means unlimited)
- unit_price (numeric(10,2), not null)
- created_at, updated_at (timestamptz)

### inventory (central stock)
- id (uuid, PK)
- product_id (uuid, FK to products ON DELETE CASCADE)
- quantity (integer, not null, default 0)
- updated_at (timestamptz)

### inventory_movements (audit trail for stock changes)
- id (uuid, PK)
- product_id (uuid, FK to products)
- reseller_id (uuid, nullable, FK to resellers) — destination reseller for transfers
- quantity (integer, not null) — positive for entrada, negative for saida
- movement_type (text, not null) — 'ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'ATIVACAO'
- origin (text, nullable) — source description
- destination (text, nullable) — destination description
- user_id (uuid, references auth.users) — responsible user
- notes (text, nullable)
- created_at (timestamptz)

### reseller_inventory
- id (uuid, PK)
- reseller_id (uuid, FK to resellers ON DELETE CASCADE)
- product_id (uuid, FK to products ON DELETE CASCADE)
- quantity (integer, not null, default 0)
- updated_at (timestamptz)
- UNIQUE(reseller_id, product_id)

### plaques
- id (uuid, PK)
- product_id (uuid, FK to products)
- reseller_id (uuid, nullable, FK to resellers) — null until assigned/transferred
- customer_id (uuid, nullable, FK to customers) — set when activated
- status (text, not null, default 'DISPONIVEL') — 'DISPONIVEL', 'ATIVA', 'INATIVA'
- public_token (text, not null, unique) — short random token for QR URL
- created_at (timestamptz)
- activated_at (timestamptz, nullable)
- updated_at (timestamptz)

### qr_destinations
- id (uuid, PK)
- plaque_id (uuid, FK to plaques ON DELETE CASCADE)
- destination_url (text, not null)
- active (boolean, not null, default true)
- created_at, updated_at (timestamptz)
- Only one active destination per plaque (enforced by partial unique index)

### qr_scans
- id (uuid, PK)
- plaque_id (uuid, FK to plaques)
- user_agent (text, nullable)
- referer (text, nullable)
- ip_hash (text, nullable) — hashed IP for rate limiting / dedup, not raw IP
- scanned_at (timestamptz, default now())

## 2. Helper Functions
- `generate_plaque_token()` — generates a random 8-character alphanumeric token
- `get_active_destination(p_plaque_id uuid)` — returns the active destination URL for a plaque

## 3. Security (RLS)

### products
- SELECT: all authenticated users (both admin and reseller need to see product catalog)
- INSERT/UPDATE/DELETE: admin only

### product_price_tiers
- SELECT: all authenticated users
- INSERT/UPDATE/DELETE: admin only

### inventory (central)
- SELECT/INSERT/UPDATE/DELETE: admin only

### inventory_movements
- SELECT: admin sees all; reseller sees movements for their own reseller_id
- INSERT: admin only
- No update/delete (audit log is immutable)

### reseller_inventory
- SELECT: admin sees all; reseller sees only their own
- INSERT/UPDATE: admin only (transfers will be done via admin or edge function in Part 2)
- DELETE: admin only

### plaques
- SELECT: admin sees all; reseller sees only plaques assigned to them
- INSERT/UPDATE: admin only
- DELETE: admin only

### qr_destinations
- SELECT: admin sees all; reseller sees destinations for plaques assigned to them
- INSERT: admin or owning reseller (for activation flow)
- UPDATE: admin or owning reseller (for changing destination)
- DELETE: admin only

### qr_scans
- SELECT: admin sees all; reseller sees scans for plaques assigned to them
- INSERT: public (anon, authenticated) — anyone scanning a QR must be able to log the scan
- No update/delete

## 4. Indexes
- products(status), product_price_tiers(product_id), inventory(product_id)
- inventory_movements(product_id), inventory_movements(reseller_id)
- reseller_inventory(reseller_id), reseller_inventory(product_id)
- plaques(reseller_id), plaques(status), plaques(public_token), plaques(customer_id)
- qr_destinations(plaque_id), qr_scans(plaque_id)
*/

-- ============================================
-- GENERATE PLAQUE TOKEN
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_plaque_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
  exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.plaques WHERE public_token = result) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN result;
END;
$$;

-- ============================================
-- PRODUCTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  photo_url text,
  product_type text NOT NULL DEFAULT 'outro',
  width numeric,
  height numeric,
  unit text,
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "products_updated_at" ON public.products;
CREATE TRIGGER "products_updated_at"
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

-- ============================================
-- PRODUCT PRICE TIERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL DEFAULT 1,
  max_quantity integer,
  unit_price numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_tiers_select" ON public.product_price_tiers;
CREATE POLICY "price_tiers_select"
  ON public.product_price_tiers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "price_tiers_insert" ON public.product_price_tiers;
CREATE POLICY "price_tiers_insert"
  ON public.product_price_tiers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "price_tiers_update" ON public.product_price_tiers;
CREATE POLICY "price_tiers_update"
  ON public.product_price_tiers FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "price_tiers_delete" ON public.product_price_tiers;
CREATE POLICY "price_tiers_delete"
  ON public.product_price_tiers FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "price_tiers_updated_at" ON public.product_price_tiers;
CREATE TRIGGER "price_tiers_updated_at"
  BEFORE UPDATE ON public.product_price_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_price_tiers_product_id ON public.product_price_tiers(product_id);

-- ============================================
-- INVENTORY (CENTRAL) TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_select" ON public.inventory;
CREATE POLICY "inventory_select"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "inventory_insert" ON public.inventory;
CREATE POLICY "inventory_insert"
  ON public.inventory FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "inventory_update" ON public.inventory;
CREATE POLICY "inventory_update"
  ON public.inventory FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "inventory_delete" ON public.inventory;
CREATE POLICY "inventory_delete"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "inventory_updated_at" ON public.inventory;
CREATE TRIGGER "inventory_updated_at"
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);

-- ============================================
-- INVENTORY MOVEMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  quantity integer NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'ATIVACAO')),
  origin text,
  destination text,
  user_id uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movements_select" ON public.inventory_movements;
CREATE POLICY "movements_select"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP POLICY IF EXISTS "movements_insert" ON public.inventory_movements;
CREATE POLICY "movements_insert"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_movements_product_id ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_reseller_id ON public.inventory_movements(reseller_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON public.inventory_movements(created_at);

-- ============================================
-- RESELLER INVENTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.reseller_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, product_id)
);

ALTER TABLE public.reseller_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reseller_inventory_select" ON public.reseller_inventory;
CREATE POLICY "reseller_inventory_select"
  ON public.reseller_inventory FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP POLICY IF EXISTS "reseller_inventory_insert" ON public.reseller_inventory;
CREATE POLICY "reseller_inventory_insert"
  ON public.reseller_inventory FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "reseller_inventory_update" ON public.reseller_inventory;
CREATE POLICY "reseller_inventory_update"
  ON public.reseller_inventory FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "reseller_inventory_delete" ON public.reseller_inventory;
CREATE POLICY "reseller_inventory_delete"
  ON public.reseller_inventory FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "reseller_inventory_updated_at" ON public.reseller_inventory;
CREATE TRIGGER "reseller_inventory_updated_at"
  BEFORE UPDATE ON public.reseller_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_reseller_inventory_reseller_id ON public.reseller_inventory(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_inventory_product_id ON public.reseller_inventory(product_id);

-- ============================================
-- PLAQUES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.plaques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DISPONIVEL' CHECK (status IN ('DISPONIVEL', 'ATIVA', 'INATIVA')),
  public_token text NOT NULL UNIQUE DEFAULT public.generate_plaque_token(),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plaques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plaques_select" ON public.plaques;
CREATE POLICY "plaques_select"
  ON public.plaques FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR reseller_id = public.get_reseller_id_for_user()
  );

DROP POLICY IF EXISTS "plaques_insert" ON public.plaques;
CREATE POLICY "plaques_insert"
  ON public.plaques FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "plaques_update" ON public.plaques;
CREATE POLICY "plaques_update"
  ON public.plaques FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "plaques_delete" ON public.plaques;
CREATE POLICY "plaques_delete"
  ON public.plaques FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "plaques_updated_at" ON public.plaques;
CREATE TRIGGER "plaques_updated_at"
  BEFORE UPDATE ON public.plaques
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_plaques_reseller_id ON public.plaques(reseller_id);
CREATE INDEX IF NOT EXISTS idx_plaques_status ON public.plaques(status);
CREATE INDEX IF NOT EXISTS idx_plaques_public_token ON public.plaques(public_token);
CREATE INDEX IF NOT EXISTS idx_plaques_customer_id ON public.plaques(customer_id);

-- ============================================
-- QR DESTINATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.qr_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaque_id uuid NOT NULL REFERENCES public.plaques(id) ON DELETE CASCADE,
  destination_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_destinations_select" ON public.qr_destinations;
CREATE POLICY "qr_destinations_select"
  ON public.qr_destinations FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.plaques p
      WHERE p.id = qr_destinations.plaque_id
      AND p.reseller_id = public.get_reseller_id_for_user()
    )
  );

DROP POLICY IF EXISTS "qr_destinations_insert" ON public.qr_destinations;
CREATE POLICY "qr_destinations_insert"
  ON public.qr_destinations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.plaques p
      WHERE p.id = qr_destinations.plaque_id
      AND p.reseller_id = public.get_reseller_id_for_user()
    )
  );

DROP POLICY IF EXISTS "qr_destinations_update" ON public.qr_destinations;
CREATE POLICY "qr_destinations_update"
  ON public.qr_destinations FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.plaques p
      WHERE p.id = qr_destinations.plaque_id
      AND p.reseller_id = public.get_reseller_id_for_user()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.plaques p
      WHERE p.id = qr_destinations.plaque_id
      AND p.reseller_id = public.get_reseller_id_for_user()
    )
  );

DROP POLICY IF EXISTS "qr_destinations_delete" ON public.qr_destinations;
CREATE POLICY "qr_destinations_delete"
  ON public.qr_destinations FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS "qr_destinations_updated_at" ON public.qr_destinations;
CREATE TRIGGER "qr_destinations_updated_at"
  BEFORE UPDATE ON public.qr_destinations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Only one active destination per plaque
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_destinations_active_per_plaque
  ON public.qr_destinations(plaque_id) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_qr_destinations_plaque_id ON public.qr_destinations(plaque_id);

-- ============================================
-- GET ACTIVE DESTINATION helper
-- ============================================

CREATE OR REPLACE FUNCTION public.get_active_destination(p_plaque_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT destination_url FROM public.qr_destinations
  WHERE plaque_id = p_plaque_id AND active = true
  LIMIT 1;
$$;

-- ============================================
-- QR SCANS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.qr_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaque_id uuid NOT NULL REFERENCES public.plaques(id) ON DELETE CASCADE,
  user_agent text,
  referer text,
  ip_hash text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

-- Public can insert scans (anyone scanning a QR code)
DROP POLICY IF EXISTS "qr_scans_insert" ON public.qr_scans;
CREATE POLICY "qr_scans_insert"
  ON public.qr_scans FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Admin sees all scans; reseller sees scans for their plaques
DROP POLICY IF EXISTS "qr_scans_select" ON public.qr_scans;
CREATE POLICY "qr_scans_select"
  ON public.qr_scans FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.plaques p
      WHERE p.id = qr_scans.plaque_id
      AND p.reseller_id = public.get_reseller_id_for_user()
    )
  );

CREATE INDEX IF NOT EXISTS idx_qr_scans_plaque_id ON public.qr_scans(plaque_id);
CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at ON public.qr_scans(scanned_at);
/*
# Public Plaque Destination Function

## Overview
Creates a SECURITY DEFINER function that allows the public (anon key) to look up a plaque's active destination by its public token. This is needed because the /q/[token] route runs without authentication, but plaques RLS only allows authenticated users.

## 1. New Function
- `get_public_plaque_destination(p_token text)` — returns plaque_id, destination_url, and status for a given public token. Only returns data if the plaque exists and has an active QR destination.

## 2. Security
- SECURITY DEFINER — runs with the function owner's privileges, bypassing RLS
- SET search_path = public — prevents search_path injection
- Only returns the minimal data needed: plaque_id, destination_url, status
- Does not expose reseller_id, customer_id, or any internal data
*/

CREATE OR REPLACE FUNCTION public.get_public_plaque_destination(p_token text)
RETURNS TABLE(plaque_id uuid, destination_url text, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS plaque_id,
    d.destination_url AS destination_url,
    p.status AS status
  FROM public.plaques p
  JOIN public.qr_destinations d ON d.plaque_id = p.id AND d.active = true
  WHERE p.public_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_plaque_destination(text) TO anon, authenticated;
-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Update is_admin() to also recognize 'proprietario' role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT COALESCE(
  (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'proprietario'),
  false
);
$$;
/*
# Regra de OWNER (NFCFLOW)

Quando gtdadosfreeoficial@gmail.com se cadastrar, vira OWNER/admin automaticamente:
- trigger BEFORE INSERT em auth.users grava role=admin e is_owner=true em raw_app_meta_data
  (é isso que is_admin(), o middleware e as policies RLS leem);
- handle_new_user() passa a gravar também o e-mail no profile e garante role admin para o owner;
- backfill: se o owner já existe, é promovido agora.
*/

CREATE OR REPLACE FUNCTION public.assign_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'gtdadosfreeoficial@gmail.com' THEN
    NEW.raw_app_meta_data :=
      COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'admin', 'is_owner', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "on_auth_user_assign_owner" ON auth.users;
CREATE TRIGGER "on_auth_user_assign_owner"
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_owner_role();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    CASE
      WHEN lower(NEW.email) = 'gtdadosfreeoficial@gmail.com' THEN 'admin'
      ELSE COALESCE(NEW.raw_app_meta_data ->> 'role', 'reseller')
    END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = CASE
          WHEN lower(EXCLUDED.email) = 'gtdadosfreeoficial@gmail.com' THEN 'admin'
          ELSE public.profiles.role
        END;
  RETURN NEW;
END;
$$;

-- Backfill: se o owner já estiver cadastrado, promove agora
UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin', 'is_owner', true)
WHERE lower(email) = 'gtdadosfreeoficial@gmail.com';

UPDATE public.profiles
SET role = 'admin', is_active = true
WHERE id IN (SELECT id FROM auth.users WHERE lower(email) = 'gtdadosfreeoficial@gmail.com');
/*
# Parte 2 — Loja, pedidos, pagamentos, envio, endereços, suporte, ativação de plaquinhas

Somente ADIÇÕES (nenhuma tabela/dado existente é apagado).

## Novas tabelas
addresses, orders, order_items, order_status_history, payments, webhook_events,
shipments, support_tickets, support_messages

## Alterações em tabelas existentes (não destrutivas)
- inventory.reserved_quantity (estoque reservado por pedidos aguardando pagamento)
- inventory_movements: novos tipos RESERVA e LIBERACAO
- qr_destinations: CHECK de URL http(s) (NOT VALID => não valida linhas antigas)

## Segurança
- RLS em todas as tabelas novas.
- Funções que mexem em dinheiro/estoque (create_order, apply_payment_update, cancel_order,
  admin_update_order_status, release_expired_orders) só podem ser executadas pelo service_role
  (backend). O navegador nunca as chama.
- Funções do revendedor (ativar plaquinha, alterar destino) são SECURITY DEFINER e validam
  que a plaquinha pertence ao revendedor logado.
*/

-- =====================================================
-- ALTERAÇÕES EM TABELAS EXISTENTES
-- =====================================================
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_quantity_non_negative') THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_quantity_non_negative CHECK (quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reserved_valid') THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_reserved_valid CHECK (reserved_quantity >= 0) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE c record;
BEGIN
  -- remove qualquer CHECK antigo que restrinja movement_type (o nome pode variar)
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.inventory_movements'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%movement_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.inventory_movements DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('ENTRADA','SAIDA','TRANSFERENCIA','AJUSTE','ATIVACAO','RESERVA','LIBERACAO'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qr_destinations_url_http') THEN
    ALTER TABLE public.qr_destinations
      ADD CONSTRAINT qr_destinations_url_http
      CHECK (destination_url ~* '^https?://[^[:space:]]+$' AND length(destination_url) <= 2048) NOT VALID;
  END IF;
END $$;

-- =====================================================
-- ADDRESSES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  zip_code text NOT NULL,
  state text NOT NULL,
  city text NOT NULL,
  neighborhood text NOT NULL,
  street text NOT NULL,
  number text NOT NULL,
  complement text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addresses_select" ON public.addresses;
CREATE POLICY "addresses_select" ON public.addresses FOR SELECT TO authenticated
  USING (public.is_admin() OR reseller_id = public.get_reseller_id_for_user());
DROP POLICY IF EXISTS "addresses_insert" ON public.addresses;
CREATE POLICY "addresses_insert" ON public.addresses FOR INSERT TO authenticated
  WITH CHECK (reseller_id = public.get_reseller_id_for_user());
DROP POLICY IF EXISTS "addresses_update" ON public.addresses;
CREATE POLICY "addresses_update" ON public.addresses FOR UPDATE TO authenticated
  USING (reseller_id = public.get_reseller_id_for_user())
  WITH CHECK (reseller_id = public.get_reseller_id_for_user());
DROP POLICY IF EXISTS "addresses_delete" ON public.addresses;
CREATE POLICY "addresses_delete" ON public.addresses FOR DELETE TO authenticated
  USING (reseller_id = public.get_reseller_id_for_user());

DROP TRIGGER IF EXISTS "addresses_updated_at" ON public.addresses;
CREATE TRIGGER "addresses_updated_at" BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_addresses_reseller_id ON public.addresses(reseller_id);

-- =====================================================
-- ORDERS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id),
  status text NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO' CHECK (status IN (
    'AGUARDANDO_PAGAMENTO','PAGO','EM_PREPARACAO','ENVIADO','EM_TRANSITO','ENTREGUE','CANCELADO'
  )),
  subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  shipping_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total numeric(10,2) NOT NULL CHECK (total >= 0),
  payment_method text NOT NULL DEFAULT 'PIX',
  shipping_carrier text NOT NULL DEFAULT 'CORREIOS',
  shipping_service text,
  shipping_days integer,
  shipping_is_estimate boolean NOT NULL DEFAULT false,
  -- snapshot do endereço no momento da compra
  ship_recipient_name text NOT NULL,
  ship_phone text NOT NULL,
  ship_zip_code text NOT NULL,
  ship_state text NOT NULL,
  ship_city text NOT NULL,
  ship_neighborhood text NOT NULL,
  ship_street text NOT NULL,
  ship_number text NOT NULL,
  ship_complement text,
  tracking_code text,
  stock_reserved boolean NOT NULL DEFAULT true,
  reservation_expires_at timestamptz,
  plaques_assigned boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (public.is_admin() OR reseller_id = public.get_reseller_id_for_user());
-- INSERT/UPDATE/DELETE: somente backend (service_role ignora RLS). Nenhuma policy para authenticated.

DROP TRIGGER IF EXISTS "orders_updated_at" ON public.orders;
CREATE TRIGGER "orders_updated_at" BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_orders_reseller_id ON public.orders(reseller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_reservation ON public.orders(reservation_expires_at)
  WHERE status = 'AGUARDANDO_PAGAMENTO';

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(10,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.reseller_id = public.get_reseller_id_for_user()
    )
  );
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_history_select" ON public.order_status_history;
CREATE POLICY "order_history_select" ON public.order_status_history FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id AND o.reseller_id = public.get_reseller_id_for_user()
    )
  );
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON public.order_status_history(order_id);

-- =====================================================
-- PAYMENTS / WEBHOOK EVENTS / SHIPMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  provider text NOT NULL DEFAULT 'MERCADO_PAGO',
  provider_payment_id text NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN (
    'PENDENTE','APROVADO','RECUSADO','CANCELADO','EXPIRADO','REEMBOLSADO'
  )),
  payment_method text NOT NULL DEFAULT 'PIX',
  raw_status text,
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_ticket_url text,
  expires_at timestamptz,
  needs_review boolean NOT NULL DEFAULT false,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id AND o.reseller_id = public.get_reseller_id_for_user()
    )
  );
DROP TRIGGER IF EXISTS "payments_updated_at" ON public.payments;
CREATE TRIGGER "payments_updated_at" BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);

-- Idempotência do webhook (chave única por evento)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY; -- sem policies: só service_role

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier text NOT NULL DEFAULT 'CORREIOS',
  tracking_code text,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','ENVIADO','EM_TRANSITO','ENTREGUE')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipments_select" ON public.shipments;
CREATE POLICY "shipments_select" ON public.shipments FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipments.order_id AND o.reseller_id = public.get_reseller_id_for_user()
    )
  );
DROP TRIGGER IF EXISTS "shipments_updated_at" ON public.shipments;
CREATE TRIGGER "shipments_updated_at" BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SUPORTE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 3 AND 150),
  status text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','EM_ATENDIMENTO','RESOLVIDO','FECHADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tickets_select" ON public.support_tickets;
CREATE POLICY "tickets_select" ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_admin() OR reseller_id = public.get_reseller_id_for_user());
DROP POLICY IF EXISTS "tickets_insert" ON public.support_tickets;
CREATE POLICY "tickets_insert" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (reseller_id = public.get_reseller_id_for_user() AND status = 'ABERTO');
DROP POLICY IF EXISTS "tickets_update" ON public.support_tickets;
CREATE POLICY "tickets_update" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS "tickets_updated_at" ON public.support_tickets;
CREATE TRIGGER "tickets_updated_at" BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_tickets_reseller_id ON public.support_tickets(reseller_id);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_role text NOT NULL CHECK (author_role IN ('reseller','admin')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_msgs_select" ON public.support_messages;
CREATE POLICY "ticket_msgs_select" ON public.support_messages FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id AND t.reseller_id = public.get_reseller_id_for_user()
    )
  );
DROP POLICY IF EXISTS "ticket_msgs_insert" ON public.support_messages;
CREATE POLICY "ticket_msgs_insert" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      (author_role = 'admin' AND public.is_admin())
      OR (author_role = 'reseller' AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = support_messages.ticket_id
          AND t.reseller_id = public.get_reseller_id_for_user()
          AND t.status <> 'FECHADO'
      ))
    )
  );
CREATE INDEX IF NOT EXISTS idx_ticket_msgs_ticket_id ON public.support_messages(ticket_id);

-- =====================================================
-- FUNÇÕES INTERNAS DE ESTOQUE (service_role)
-- =====================================================

-- Libera a reserva de um pedido (não mexe no estoque físico)
CREATE OR REPLACE FUNCTION public._release_reservation(p_order_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reserved boolean;
  r record;
BEGIN
  SELECT stock_reserved INTO v_reserved FROM public.orders WHERE id = p_order_id;
  IF NOT COALESCE(v_reserved, false) THEN RETURN; END IF;

  FOR r IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id LOOP
    UPDATE public.inventory
      SET reserved_quantity = GREATEST(reserved_quantity - r.quantity, 0)
      WHERE product_id = r.product_id;
    INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, notes)
    VALUES (r.product_id, -r.quantity, 'LIBERACAO', 'RESERVA', 'ESTOQUE CENTRAL', p_note || ' | pedido ' || p_order_id);
  END LOOP;

  UPDATE public.orders SET stock_reserved = false WHERE id = p_order_id;
END;
$$;

-- Expira pedidos não pagos e devolve a reserva
CREATE OR REPLACE FUNCTION public.release_expired_orders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.orders
    WHERE status = 'AGUARDANDO_PAGAMENTO' AND reservation_expires_at IS NOT NULL AND reservation_expires_at < now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public._release_reservation(r.id, 'Reserva expirada');
    UPDATE public.orders SET status = 'CANCELADO' WHERE id = r.id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, note)
    VALUES (r.id, 'AGUARDANDO_PAGAMENTO', 'CANCELADO', 'Pagamento não confirmado no prazo; reserva liberada');
    UPDATE public.payments SET status = 'EXPIRADO' WHERE order_id = r.id AND status = 'PENDENTE';
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Cria o pedido, calcula preços NO BANCO (faixas), valida e reserva estoque de forma atômica
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
    SELECT name, status INTO v_name, v_pstatus FROM public.products WHERE id = r.product_id;
    IF v_name IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
    IF v_pstatus <> 'ATIVO' THEN RAISE EXCEPTION 'PRODUCT_INACTIVE:%', v_name; END IF;

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

-- Aplica atualização de pagamento vinda do provedor (IDEMPOTENTE)
CREATE OR REPLACE FUNCTION public.apply_payment_update(
  p_provider text,
  p_provider_payment_id text,
  p_order_id uuid,
  p_status text,        -- APROVADO | RECUSADO | CANCELADO | EXPIRADO | REEMBOLSADO | PENDENTE
  p_raw_status text,
  p_amount numeric,
  p_method text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  r record;
  v_avail integer;
  v_pay_id uuid;
  v_prev text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  SELECT id, status INTO v_pay_id, v_prev FROM public.payments
    WHERE provider = p_provider AND provider_payment_id = p_provider_payment_id FOR UPDATE;
  IF v_pay_id IS NULL THEN
    INSERT INTO public.payments (order_id, provider, provider_payment_id, amount, status, payment_method, raw_status)
    VALUES (p_order_id, p_provider, p_provider_payment_id, p_amount, 'PENDENTE', COALESCE(p_method,'PIX'), p_raw_status)
    RETURNING id INTO v_pay_id;
    v_prev := 'PENDENTE';
  END IF;

  -- pagamento já aprovado: repetição do webhook não faz nada
  IF v_prev = 'APROVADO' AND p_status = 'APROVADO' THEN
    RETURN 'ALREADY_PROCESSED';
  END IF;

  IF p_status = 'APROVADO' THEN
    IF p_amount < o.total THEN
      UPDATE public.payments SET raw_status = p_raw_status, needs_review = true,
        review_note = 'Valor pago (' || p_amount || ') menor que o total do pedido (' || o.total || ')'
        WHERE id = v_pay_id;
      RETURN 'AMOUNT_MISMATCH';
    END IF;

    IF o.status = 'AGUARDANDO_PAGAMENTO' THEN
      -- confirma a saída: baixa estoque físico e consome a reserva
      IF o.stock_reserved THEN
        FOR r IN SELECT product_id, quantity FROM public.order_items WHERE order_id = o.id ORDER BY product_id LOOP
          UPDATE public.inventory
            SET quantity = quantity - r.quantity,
                reserved_quantity = GREATEST(reserved_quantity - r.quantity, 0)
            WHERE product_id = r.product_id;
          INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, notes)
          VALUES (r.product_id, -r.quantity, 'SAIDA', 'ESTOQUE CENTRAL', 'PEDIDO', 'pagamento confirmado | pedido ' || o.id);
        END LOOP;
      END IF;
      UPDATE public.orders SET status = 'PAGO', paid_at = now(), stock_reserved = false WHERE id = o.id;
      INSERT INTO public.order_status_history (order_id, from_status, to_status, note)
      VALUES (o.id, 'AGUARDANDO_PAGAMENTO', 'PAGO', 'Pagamento confirmado pelo provedor');
      UPDATE public.payments SET status = 'APROVADO', raw_status = p_raw_status, amount = p_amount WHERE id = v_pay_id;
      RETURN 'PAID';

    ELSIF o.status = 'CANCELADO' THEN
      -- pagamento aprovado depois do cancelamento/expiração: tenta recuperar o estoque
      IF NOT EXISTS (
        SELECT 1 FROM public.order_items i
        LEFT JOIN public.inventory inv ON inv.product_id = i.product_id
        WHERE i.order_id = o.id AND COALESCE(inv.quantity - inv.reserved_quantity, 0) < i.quantity
      ) THEN
        FOR r IN SELECT product_id, quantity FROM public.order_items WHERE order_id = o.id ORDER BY product_id LOOP
          UPDATE public.inventory SET quantity = quantity - r.quantity WHERE product_id = r.product_id;
          INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, notes)
          VALUES (r.product_id, -r.quantity, 'SAIDA', 'ESTOQUE CENTRAL', 'PEDIDO', 'pagamento tardio confirmado | pedido ' || o.id);
        END LOOP;
        UPDATE public.orders SET status = 'PAGO', paid_at = now(), stock_reserved = false WHERE id = o.id;
        INSERT INTO public.order_status_history (order_id, from_status, to_status, note)
        VALUES (o.id, 'CANCELADO', 'PAGO', 'Pagamento tardio confirmado; estoque ainda disponível');
        UPDATE public.payments SET status = 'APROVADO', raw_status = p_raw_status, amount = p_amount WHERE id = v_pay_id;
        RETURN 'PAID_LATE';
      ELSE
        UPDATE public.payments SET status = 'APROVADO', raw_status = p_raw_status, amount = p_amount,
          needs_review = true, review_note = 'Pago após cancelamento e sem estoque: reembolsar ou repor manualmente'
          WHERE id = v_pay_id;
        RETURN 'PAID_AFTER_CANCEL_NO_STOCK';
      END IF;
    ELSE
      -- já avançado (PAGO, EM_PREPARACAO, ...): só registra
      UPDATE public.payments SET status = 'APROVADO', raw_status = p_raw_status WHERE id = v_pay_id;
      RETURN 'ALREADY_PROCESSED';
    END IF;

  ELSIF p_status IN ('RECUSADO','CANCELADO','EXPIRADO') THEN
    UPDATE public.payments SET status = p_status, raw_status = p_raw_status WHERE id = v_pay_id;
    IF o.status = 'AGUARDANDO_PAGAMENTO' THEN
      PERFORM public._release_reservation(o.id, 'Pagamento ' || lower(p_status));
      UPDATE public.orders SET status = 'CANCELADO' WHERE id = o.id;
      INSERT INTO public.order_status_history (order_id, from_status, to_status, note)
      VALUES (o.id, 'AGUARDANDO_PAGAMENTO', 'CANCELADO', 'Pagamento ' || lower(p_status) || ' (' || COALESCE(p_raw_status,'') || ')');
    END IF;
    RETURN 'PAYMENT_' || p_status;

  ELSIF p_status = 'REEMBOLSADO' THEN
    UPDATE public.payments SET status = 'REEMBOLSADO', raw_status = p_raw_status,
      needs_review = true, review_note = 'Pagamento reembolsado/contestado: revisar pedido e estoque'
      WHERE id = v_pay_id;
    RETURN 'REFUNDED';
  ELSE
    UPDATE public.payments SET raw_status = p_raw_status WHERE id = v_pay_id;
    RETURN 'PENDING';
  END IF;
END;
$$;

-- Cancelamento (reseller: só pendente; admin: até EM_PREPARACAO)
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_actor uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  r record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status = 'CANCELADO' THEN RETURN; END IF;

  IF o.status = 'AGUARDANDO_PAGAMENTO' THEN
    PERFORM public._release_reservation(o.id, COALESCE(p_note, 'Pedido cancelado'));
    UPDATE public.payments SET status = 'CANCELADO' WHERE order_id = o.id AND status = 'PENDENTE';
  ELSIF o.status IN ('PAGO','EM_PREPARACAO') THEN
    -- estoque já saiu: devolve ao estoque central
    FOR r IN SELECT product_id, quantity FROM public.order_items WHERE order_id = o.id ORDER BY product_id LOOP
      UPDATE public.inventory SET quantity = quantity + r.quantity WHERE product_id = r.product_id;
      INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, user_id, notes)
      VALUES (r.product_id, r.quantity, 'ENTRADA', 'PEDIDO CANCELADO', 'ESTOQUE CENTRAL', p_actor, 'devolução | pedido ' || o.id);
    END LOOP;
    UPDATE public.payments SET needs_review = true, review_note = 'Pedido pago foi cancelado: reembolsar o cliente'
      WHERE order_id = o.id AND status = 'APROVADO';
  ELSE
    RAISE EXCEPTION 'CANNOT_CANCEL_STATUS:%', o.status;
  END IF;

  UPDATE public.orders SET status = 'CANCELADO', stock_reserved = false WHERE id = o.id;
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (o.id, o.status, 'CANCELADO', p_actor, p_note);
END;
$$;

-- Atribui plaquinhas físicas (QRs) ao revendedor quando o pedido é enviado
CREATE OR REPLACE FUNCTION public._assign_plaques_to_order(p_order_id uuid, p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  r record;
  v_ids uuid[];
  v_got integer;
  v_short integer := 0;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.plaques_assigned THEN RETURN 0; END IF;

  FOR r IN SELECT product_id, quantity FROM public.order_items WHERE order_id = o.id ORDER BY product_id LOOP
    SELECT array_agg(id) INTO v_ids FROM (
      SELECT id FROM public.plaques
      WHERE product_id = r.product_id AND reseller_id IS NULL AND status = 'DISPONIVEL'
      ORDER BY created_at LIMIT r.quantity FOR UPDATE SKIP LOCKED
    ) s;
    v_got := COALESCE(array_length(v_ids, 1), 0);
    IF v_got > 0 THEN
      UPDATE public.plaques SET reseller_id = o.reseller_id WHERE id = ANY(v_ids);
      INSERT INTO public.reseller_inventory (reseller_id, product_id, quantity)
      VALUES (o.reseller_id, r.product_id, v_got)
      ON CONFLICT (reseller_id, product_id) DO UPDATE
        SET quantity = public.reseller_inventory.quantity + EXCLUDED.quantity;
      INSERT INTO public.inventory_movements (product_id, reseller_id, quantity, movement_type, origin, destination, user_id, notes)
      VALUES (r.product_id, o.reseller_id, v_got, 'TRANSFERENCIA', 'PEDIDO', 'REVENDEDOR', p_actor, 'plaquinhas do pedido ' || o.id);
    END IF;
    v_short := v_short + (r.quantity - v_got);
  END LOOP;

  UPDATE public.orders SET plaques_assigned = true WHERE id = o.id;
  RETURN v_short; -- plaquinhas que faltaram (precisam ser criadas/atribuídas manualmente)
END;
$$;

-- Fluxo do admin: PAGO → EM_PREPARACAO → ENVIADO → EM_TRANSITO → ENTREGUE
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
    ('PAGO','EM_PREPARACAO'), ('EM_PREPARACAO','ENVIADO'),
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

-- Admin pode corrigir/informar o código de rastreio depois de enviado
CREATE OR REPLACE FUNCTION public.admin_set_tracking_code(p_order_id uuid, p_tracking_code text, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text := upper(btrim(COALESCE(p_tracking_code, '')));
BEGIN
  IF v_code !~ '^[A-Z0-9]{8,20}$' THEN RAISE EXCEPTION 'TRACKING_INVALID'; END IF;
  UPDATE public.orders SET tracking_code = v_code WHERE id = p_order_id;
  INSERT INTO public.shipments (order_id, carrier, tracking_code, status)
  VALUES (p_order_id, 'CORREIOS', v_code, 'PENDENTE')
  ON CONFLICT (order_id) DO UPDATE SET tracking_code = EXCLUDED.tracking_code;
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  SELECT id, status, status, p_actor, 'Código de rastreio atualizado: ' || v_code FROM public.orders WHERE id = p_order_id;
END;
$$;

-- Somente o backend (service_role) executa as funções financeiras/estoque
REVOKE ALL ON FUNCTION public._release_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order(uuid, jsonb, numeric, text, integer, boolean, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payment_update(text, text, uuid, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assign_plaques_to_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_tracking_code(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._release_reservation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, jsonb, numeric, text, integer, boolean, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_update(text, text, uuid, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._assign_plaques_to_order(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_tracking_code(uuid, text, uuid) TO service_role;

-- =====================================================
-- ADMIN: ESTOQUE (entrada/ajuste/transferência) — atômico, nunca negativo
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(
  p_product_id uuid, p_type text, p_quantity integer, p_notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty integer;
  v_reserved integer;
  v_new integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_type NOT IN ('ENTRADA','AJUSTE','SAIDA') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF p_quantity IS NULL OR p_quantity < 0 OR (p_type <> 'AJUSTE' AND p_quantity = 0) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  INSERT INTO public.inventory (product_id, quantity) VALUES (p_product_id, 0) ON CONFLICT (product_id) DO NOTHING;
  SELECT quantity, reserved_quantity INTO v_qty, v_reserved FROM public.inventory WHERE product_id = p_product_id FOR UPDATE;

  v_new := CASE p_type WHEN 'ENTRADA' THEN v_qty + p_quantity WHEN 'SAIDA' THEN v_qty - p_quantity ELSE p_quantity END;
  IF v_new < 0 THEN RAISE EXCEPTION 'NEGATIVE_STOCK'; END IF;
  IF v_new < v_reserved THEN RAISE EXCEPTION 'BELOW_RESERVED'; END IF;

  UPDATE public.inventory SET quantity = v_new WHERE product_id = p_product_id;
  INSERT INTO public.inventory_movements (product_id, quantity, movement_type, origin, destination, user_id, notes)
  VALUES (p_product_id, v_new - v_qty, p_type, NULL, 'ESTOQUE CENTRAL', auth.uid(), NULLIF(btrim(COALESCE(p_notes,'')), ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_transfer_stock(
  p_product_id uuid, p_reseller_id uuid, p_quantity integer, p_notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty integer;
  v_reserved integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resellers WHERE id = p_reseller_id) THEN RAISE EXCEPTION 'RESELLER_NOT_FOUND'; END IF;

  SELECT quantity, reserved_quantity INTO v_qty, v_reserved FROM public.inventory WHERE product_id = p_product_id FOR UPDATE;
  IF v_qty IS NULL OR v_qty - v_reserved < p_quantity THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;

  UPDATE public.inventory SET quantity = quantity - p_quantity WHERE product_id = p_product_id;
  INSERT INTO public.reseller_inventory (reseller_id, product_id, quantity) VALUES (p_reseller_id, p_product_id, p_quantity)
    ON CONFLICT (reseller_id, product_id) DO UPDATE SET quantity = public.reseller_inventory.quantity + EXCLUDED.quantity;
  INSERT INTO public.inventory_movements (product_id, reseller_id, quantity, movement_type, origin, destination, user_id, notes)
  VALUES (p_product_id, p_reseller_id, p_quantity, 'TRANSFERENCIA', 'ESTOQUE CENTRAL', 'REVENDEDOR', auth.uid(), NULLIF(btrim(COALESCE(p_notes,'')), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_inventory(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_transfer_stock(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_inventory(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_stock(uuid, uuid, integer, text) TO authenticated;

-- =====================================================
-- REVENDEDOR: ATIVAÇÃO E DESTINO DE PLAQUINHAS (SECURITY DEFINER, valida dono)
-- =====================================================

-- Resultado: NOT_FOUND | NOT_YOURS | AVAILABLE | ACTIVE | INACTIVE  (não vaza quem é o dono)
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
  IF p.reseller_id IS DISTINCT FROM v_rid THEN
    RETURN QUERY SELECT 'NOT_YOURS'::text, NULL::uuid, NULL::text, NULL::text, NULL::text; RETURN;
  END IF;
  RETURN QUERY
    SELECT CASE p.status WHEN 'DISPONIVEL' THEN 'AVAILABLE' WHEN 'ATIVA' THEN 'ACTIVE' ELSE 'INACTIVE' END,
           p.id, pr.name, pr.photo_url, p.status
    FROM public.products pr WHERE pr.id = p.product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_plaque(
  p_plaque_id uuid,
  p_customer_id uuid,
  p_new_establishment text,
  p_new_phone text,
  p_destination_url text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid := public.get_reseller_id_for_user();
  p public.plaques%ROWTYPE;
  v_customer uuid := p_customer_id;
  v_url text := btrim(COALESCE(p_destination_url, ''));
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_url !~* '^https?://[^[:space:]]+$' OR length(v_url) > 2048 THEN RAISE EXCEPTION 'INVALID_URL'; END IF;

  SELECT * INTO p FROM public.plaques WHERE id = p_plaque_id FOR UPDATE;
  IF NOT FOUND OR p.reseller_id IS DISTINCT FROM v_rid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p.status <> 'DISPONIVEL' THEN RAISE EXCEPTION 'ALREADY_ACTIVATED'; END IF;

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

  UPDATE public.plaques SET status = 'ATIVA', customer_id = v_customer, activated_at = now() WHERE id = p.id;
  UPDATE public.qr_destinations SET active = false WHERE plaque_id = p.id AND active;
  INSERT INTO public.qr_destinations (plaque_id, destination_url, active) VALUES (p.id, v_url, true);

  UPDATE public.reseller_inventory SET quantity = GREATEST(quantity - 1, 0)
    WHERE reseller_id = v_rid AND product_id = p.product_id;
  INSERT INTO public.inventory_movements (product_id, reseller_id, quantity, movement_type, origin, destination, user_id, notes)
  VALUES (p.product_id, v_rid, -1, 'ATIVACAO', 'REVENDEDOR', 'CLIENTE', auth.uid(), 'plaquinha ' || p.public_token);
  RETURN p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_plaque_destination(p_plaque_id uuid, p_destination_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid := public.get_reseller_id_for_user();
  v_url text := btrim(COALESCE(p_destination_url, ''));
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_url !~* '^https?://[^[:space:]]+$' OR length(v_url) > 2048 THEN RAISE EXCEPTION 'INVALID_URL'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plaques WHERE id = p_plaque_id AND reseller_id = v_rid AND status <> 'DISPONIVEL') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.qr_destinations SET active = false WHERE plaque_id = p_plaque_id AND active;
  INSERT INTO public.qr_destinations (plaque_id, destination_url, active) VALUES (p_plaque_id, v_url, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_plaque_status(p_plaque_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rid uuid := public.get_reseller_id_for_user();
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_status NOT IN ('ATIVA','INATIVA') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF p_status = 'ATIVA' AND NOT EXISTS (
    SELECT 1 FROM public.qr_destinations WHERE plaque_id = p_plaque_id AND active
  ) THEN RAISE EXCEPTION 'DESTINATION_REQUIRED'; END IF;
  UPDATE public.plaques SET status = p_status
    WHERE id = p_plaque_id AND reseller_id = v_rid AND status <> 'DISPONIVEL';
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_plaque_for_activation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_plaque(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_plaque_destination(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_plaque_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_plaque_for_activation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_plaque(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_plaque_destination(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_plaque_status(uuid, text) TO authenticated;

-- =====================================================
-- QR PÚBLICO: resolve token sem expor dados internos
-- =====================================================
CREATE OR REPLACE FUNCTION public.resolve_qr(p_token text)
RETURNS TABLE(plaque_id uuid, status text, destination_url text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.status, d.destination_url
  FROM public.plaques p
  LEFT JOIN public.qr_destinations d ON d.plaque_id = p.id AND d.active = true
  WHERE p.public_token = upper(btrim(p_token))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_qr(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_qr(text) TO anon, authenticated;

-- Perfil: o próprio usuário NÃO pode mudar seu role/is_active (corrige escalonamento via update direto)
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() AND auth.uid() IS NOT NULL THEN
    NEW.role := OLD.role;
    NEW.is_active := OLD.is_active;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "profiles_protect_privileged" ON public.profiles;
CREATE TRIGGER "profiles_protect_privileged" BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- Cadastro: revendedor é criado automaticamente (o app não precisa mais inserir em resellers)
CREATE OR REPLACE FUNCTION public.create_reseller_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data ->> 'role', 'reseller') = 'reseller'
     AND lower(COALESCE(NEW.email, '')) <> 'gtdadosfreeoficial@gmail.com' THEN
    INSERT INTO public.resellers (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), COALESCE(NEW.email, ''))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "on_auth_user_create_reseller" ON auth.users;
CREATE TRIGGER "on_auth_user_create_reseller" AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_reseller_for_new_user();
/*
# Catálogo da loja para o revendedor

O revendedor NÃO pode ler a tabela inventory (RLS: só admin). Esta função expõe apenas o necessário
para a loja: produtos ATIVOS, disponibilidade (estoque - reservas) e faixas de preço.
*/
CREATE OR REPLACE FUNCTION public.get_store_catalog()
RETURNS TABLE(
  product_id uuid, name text, description text, photo_url text, product_type text,
  width numeric, height numeric, unit text, available integer, tiers jsonb
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    p.id, p.name, p.description, p.photo_url, p.product_type, p.width, p.height, p.unit,
    GREATEST(COALESCE(i.quantity - i.reserved_quantity, 0), 0)::integer,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'min_quantity', t.min_quantity, 'max_quantity', t.max_quantity, 'unit_price', t.unit_price
        ) ORDER BY t.min_quantity)
       FROM public.product_price_tiers t WHERE t.product_id = p.id),
      '[]'::jsonb)
  FROM public.products p
  LEFT JOIN public.inventory i ON i.product_id = p.id
  WHERE p.status = 'ATIVO'
    AND public.get_reseller_id_for_user() IS NOT NULL
  ORDER BY p.name;
$$;
REVOKE ALL ON FUNCTION public.get_store_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_catalog() TO authenticated;

-- Admin: lista de plaquinhas por pedido e visão de estoque (central, reservado, disponível)
CREATE OR REPLACE VIEW public.inventory_overview WITH (security_invoker = true) AS
  SELECT p.id AS product_id, p.name, p.status,
         COALESCE(i.quantity, 0) AS quantity,
         COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
         GREATEST(COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0), 0) AS available_quantity
  FROM public.products p
  LEFT JOIN public.inventory i ON i.product_id = p.id;
/*
# Cadastro: telefone vem dos metadados do signUp
O app não precisa mais inserir manualmente em resellers/profiles (que exigia permissões que o
revendedor não tem). Os triggers criam profile e reseller já com o telefone informado.
*/
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), ''),
    CASE
      WHEN lower(NEW.email) = 'gtdadosfreeoficial@gmail.com' THEN 'admin'
      ELSE COALESCE(NEW.raw_app_meta_data ->> 'role', 'reseller')
    END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = CASE
          WHEN lower(EXCLUDED.email) = 'gtdadosfreeoficial@gmail.com' THEN 'admin'
          ELSE public.profiles.role
        END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_reseller_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data ->> 'role', 'reseller') = 'reseller'
     AND lower(COALESCE(NEW.email, '')) <> 'gtdadosfreeoficial@gmail.com' THEN
    INSERT INTO public.resellers (user_id, full_name, email, phone)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
      COALESCE(NEW.email, ''),
      NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), '')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
/*
# Revendedor edita o próprio cadastro (campos permitidos)

A tabela resellers só permite UPDATE para admin (RLS). Esta função deixa o revendedor alterar
apenas nome, telefone, documento e endereço da PRÓPRIA linha — nunca status ou user_id.
*/
CREATE OR REPLACE FUNCTION public.update_my_reseller_profile(
  p_full_name text, p_phone text, p_document text, p_address text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rid uuid := public.get_reseller_id_for_user();
BEGIN
  IF v_rid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(btrim(COALESCE(p_full_name, ''))) < 2 THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  UPDATE public.resellers SET
    full_name = btrim(p_full_name),
    phone = NULLIF(btrim(COALESCE(p_phone, '')), ''),
    document = NULLIF(btrim(COALESCE(p_document, '')), ''),
    address = NULLIF(btrim(COALESCE(p_address, '')), '')
  WHERE id = v_rid;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_reseller_profile(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_reseller_profile(text, text, text, text) TO authenticated;
/*
# Finalização — código de indicação, configurações editáveis e lote de plaquinhas

Somente ADIÇÕES.

## Novas tabelas
- app_settings: configurações globais (WhatsApp do suporte, frete grátis por quantidade)
- signup_codes: código de indicação GLOBAL (um único ativo por vez)

## Regras
- Cadastro de revendedor só é aceito com o código ATIVO. A checagem é feita no banco por um trigger
  em auth.users (BEFORE INSERT), então não dá para burlar pelo navegador.
- Redefinir o código desativa o anterior imediatamente e cria um novo (aleatório, gen_random_uuid()).
- Usuários já cadastrados não são afetados (trigger só em INSERT).
- O e-mail do OWNER e usuários criados com app_metadata.role admin ficam isentos.
- Leitura de configurações públicas (WhatsApp, promoção) por get_public_settings().
*/

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_admin_select" ON public.app_settings;
CREATE POLICY "app_settings_admin_select" ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_admin());
-- escrita: somente pelas funções admin_* abaixo (SECURITY DEFINER)

INSERT INTO public.app_settings (key, value) VALUES
  ('support_whatsapp', ''),
  ('free_shipping_enabled', 'false'),
  ('free_shipping_min_quantity', '50')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.signup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  deactivated_at timestamptz
);
-- no máximo UM código ativo
CREATE UNIQUE INDEX IF NOT EXISTS signup_codes_one_active ON public.signup_codes ((true)) WHERE active;
ALTER TABLE public.signup_codes ENABLE ROW LEVEL SECURITY; -- sem policies: só funções

CREATE OR REPLACE FUNCTION public._new_signup_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

INSERT INTO public.signup_codes (code)
SELECT public._new_signup_code()
WHERE NOT EXISTS (SELECT 1 FROM public.signup_codes WHERE active);

CREATE OR REPLACE FUNCTION public.validate_signup_code(p_code text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.signup_codes
    WHERE active AND code = upper(btrim(COALESCE(p_code, '')))
  );
$$;
REVOKE ALL ON FUNCTION public.validate_signup_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_signup_code(text) TO anon, authenticated, service_role;

-- Barra o cadastro sem código válido (valida no banco, não só no navegador)
CREATE OR REPLACE FUNCTION public.enforce_signup_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(COALESCE(NEW.email, '')) = 'gtdadosfreeoficial@gmail.com' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.raw_app_meta_data ->> 'role', '') IN ('admin', 'proprietario') THEN RETURN NEW; END IF;
  IF NOT public.validate_signup_code(NEW.raw_user_meta_data ->> 'signup_code') THEN
    RAISE EXCEPTION 'INVALID_SIGNUP_CODE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "a_enforce_signup_code" ON auth.users;
CREATE TRIGGER "a_enforce_signup_code" BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signup_code();

CREATE OR REPLACE FUNCTION public.admin_get_signup_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT code INTO v_code FROM public.signup_codes WHERE active;
  IF v_code IS NULL THEN
    v_code := public._new_signup_code();
    INSERT INTO public.signup_codes (code, created_by) VALUES (v_code, auth.uid());
  END IF;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_signup_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('signup_code_reset'));
  UPDATE public.signup_codes SET active = false, deactivated_at = now() WHERE active;
  LOOP
    v_code := public._new_signup_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.signup_codes WHERE code = v_code);
  END LOOP;
  INSERT INTO public.signup_codes (code, created_by) VALUES (v_code, auth.uid());
  RETURN v_code;
END;
$$;

-- Configurações públicas (WhatsApp do suporte e promoção de frete grátis)
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'support_whatsapp',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'support_whatsapp'), ''),
    'free_shipping_enabled',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'free_shipping_enabled'), 'false') = 'true',
    'free_shipping_min_quantity',
      COALESCE(NULLIF((SELECT value FROM public.app_settings WHERE key = 'free_shipping_min_quantity'), '')::integer, 50)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_support_whatsapp(p_phone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_digits text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_digits <> '' THEN
    IF length(v_digits) IN (10, 11) THEN v_digits := '55' || v_digits; END IF; -- DDD + número => Brasil
    IF length(v_digits) < 12 OR length(v_digits) > 15 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;
  END IF;
  INSERT INTO public.app_settings (key, value, updated_by) VALUES ('support_whatsapp', v_digits, auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  RETURN v_digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_free_shipping(p_enabled boolean, p_min_quantity integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_min_quantity IS NULL OR p_min_quantity < 1 OR p_min_quantity > 100000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  INSERT INTO public.app_settings (key, value, updated_by) VALUES
    ('free_shipping_enabled', CASE WHEN p_enabled THEN 'true' ELSE 'false' END, auth.uid()),
    ('free_shipping_min_quantity', p_min_quantity::text, auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_signup_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_signup_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_support_whatsapp(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_free_shipping(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_signup_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_signup_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_support_whatsapp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_free_shipping(boolean, integer) TO authenticated;

-- Geração em lote de plaquinhas (tokens únicos e permanentes) — somente backend
CREATE OR REPLACE FUNCTION public.create_plaques_batch(p_product_id uuid, p_quantity integer, p_actor uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tokens text[] := '{}';
  v_tok text;
  i integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 500 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.plaques (product_id) VALUES (p_product_id) RETURNING public_token INTO v_tok;
    v_tokens := v_tokens || v_tok;
  END LOOP;
  RETURN v_tokens;
END;
$$;
REVOKE ALL ON FUNCTION public.create_plaques_batch(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_plaques_batch(uuid, integer, uuid) TO service_role;
/*
# URL base configurável do QR e modelos de posicionamento

- qr_base_url (app_settings): URL base usada nos NOVOS lotes de plaquinhas. QRs já impressos continuam
  funcionando enquanto o domínio antigo apontar para o sistema (o /q/[token] resolve pelo token).
- plaque_templates: modelos de posição do QR (em proporções da arte, independentes da resolução).
Somente adições.
*/

INSERT INTO public.app_settings (key, value) VALUES ('qr_base_url', '') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'support_whatsapp',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'support_whatsapp'), ''),
    'free_shipping_enabled',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'free_shipping_enabled'), 'false') = 'true',
    'free_shipping_min_quantity',
      COALESCE(NULLIF((SELECT value FROM public.app_settings WHERE key = 'free_shipping_min_quantity'), '')::integer, 50),
    'qr_base_url',
      COALESCE((SELECT value FROM public.app_settings WHERE key = 'qr_base_url'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_qr_base_url(p_url text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := regexp_replace(btrim(COALESCE(p_url, '')), '/+$', '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v <> '' AND v !~* '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$' THEN RAISE EXCEPTION 'INVALID_URL'; END IF;
  INSERT INTO public.app_settings (key, value, updated_by) VALUES ('qr_base_url', v, auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_qr_base_url(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_qr_base_url(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.plaque_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  x_ratio numeric(9,8) NOT NULL CHECK (x_ratio >= 0 AND x_ratio <= 1),
  y_ratio numeric(9,8) NOT NULL CHECK (y_ratio >= 0 AND y_ratio <= 1),
  size_ratio numeric(9,8) NOT NULL CHECK (size_ratio > 0 AND size_ratio <= 1),
  img_width integer,
  img_height integer,
  style text NOT NULL DEFAULT 'none' CHECK (style IN ('none', 'google', 'instagram', 'whatsapp')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plaque_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plaque_templates_admin_all" ON public.plaque_templates;
CREATE POLICY "plaque_templates_admin_all" ON public.plaque_templates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

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

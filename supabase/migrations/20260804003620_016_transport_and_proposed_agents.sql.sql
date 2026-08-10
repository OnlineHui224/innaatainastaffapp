/*
# Create transport reference tables and proposed_agents table

## Purpose
1. Create transport_routes, transport_vehicle_types, transport_reference_rates
   for the structured Ground Transportation system.
2. Create proposed_agents for the manual agent entry workflow (non-admin staff
   propose agents that go to admin review).

## New Tables

### transport_routes
- id (uuid PK)
- route_code (text unique) — e.g. R01, R02
- route_name (text) — display name
- origin (text)
- destination (text)
- is_bidirectional (boolean default true)
- city_scope (text) — 'Makkah', 'Madinah', 'InterCity', 'General'
- status (text default 'active')
- effective_season (text default 'Umrah 1448')
- currency (text default 'SAR')
- created_at, updated_at (timestamptz)

### transport_vehicle_types
- id (uuid PK)
- vehicle_code (text unique)
- vehicle_name (text)
- status (text default 'active')

### transport_reference_rates
- id (uuid PK)
- route_id (uuid FK → transport_routes)
- vehicle_type_id (uuid FK → transport_vehicle_types)
- price (numeric(10,2))
- currency (text default 'SAR')
- effective_season (text default 'Umrah 1448')
- status (text default 'active')
- source (text default 'COMPANY_TRANSPORT_PRICE_SHEET')
- created_at, updated_at (timestamptz)
- UNIQUE(route_id, vehicle_type_id, effective_season)

### proposed_agents
- id (uuid PK)
- organisation_name (text not null)
- contact_person (text)
- phone_number (text)
- email (text)
- internal_note (text)
- status (text default 'pending') — pending, approved, rejected
- entered_by (uuid) — staff who entered it
- entered_by_name (text)
- approved_by (uuid) — admin who approved
- approved_by_name (text)
- source (text default 'OPS_PRO_MANUAL_AGENT')
- related_batch (text) — processing batch reference
- created_sub_agent_id (uuid) — the sub_agents row created after approval
- created_at, updated_at (timestamptz)

## Seed Data
- 5 vehicle types: Costar, Hiace, Staria, GMC, Ford
- 6 routes with 5 rates each (30 total rates)

## Security
- RLS on all tables
- SELECT: authenticated (all staff can search)
- INSERT/UPDATE/DELETE: is_admin_or_higher() for transport tables
- proposed_agents: INSERT for authenticated, UPDATE for is_admin_or_higher()
*/

-- ============================================================
-- transport_vehicle_types
-- ============================================================
CREATE TABLE IF NOT EXISTS transport_vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code text UNIQUE NOT NULL,
  vehicle_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transport_vehicle_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_vehicle_types" ON transport_vehicle_types;
CREATE POLICY "select_vehicle_types" ON transport_vehicle_types FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_vehicle_types" ON transport_vehicle_types;
CREATE POLICY "insert_vehicle_types" ON transport_vehicle_types FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "update_vehicle_types" ON transport_vehicle_types;
CREATE POLICY "update_vehicle_types" ON transport_vehicle_types FOR UPDATE
  TO authenticated USING (is_admin_or_higher()) WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "delete_vehicle_types" ON transport_vehicle_types;
CREATE POLICY "delete_vehicle_types" ON transport_vehicle_types FOR DELETE
  TO authenticated USING (is_admin_or_higher());

-- ============================================================
-- transport_routes
-- ============================================================
CREATE TABLE IF NOT EXISTS transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code text UNIQUE NOT NULL,
  route_name text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  is_bidirectional boolean NOT NULL DEFAULT true,
  city_scope text NOT NULL DEFAULT 'General',
  status text NOT NULL DEFAULT 'active',
  effective_season text NOT NULL DEFAULT 'Umrah 1448',
  currency text NOT NULL DEFAULT 'SAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_routes" ON transport_routes;
CREATE POLICY "select_routes" ON transport_routes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_routes" ON transport_routes;
CREATE POLICY "insert_routes" ON transport_routes FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "update_routes" ON transport_routes;
CREATE POLICY "update_routes" ON transport_routes FOR UPDATE
  TO authenticated USING (is_admin_or_higher()) WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "delete_routes" ON transport_routes;
CREATE POLICY "delete_routes" ON transport_routes FOR DELETE
  TO authenticated USING (is_admin_or_higher());

-- ============================================================
-- transport_reference_rates
-- ============================================================
CREATE TABLE IF NOT EXISTS transport_reference_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  vehicle_type_id uuid NOT NULL REFERENCES transport_vehicle_types(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  effective_season text NOT NULL DEFAULT 'Umrah 1448',
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'COMPANY_TRANSPORT_PRICE_SHEET',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(route_id, vehicle_type_id, effective_season)
);

ALTER TABLE transport_reference_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rates" ON transport_reference_rates;
CREATE POLICY "select_rates" ON transport_reference_rates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_rates" ON transport_reference_rates;
CREATE POLICY "insert_rates" ON transport_reference_rates FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "update_rates" ON transport_reference_rates;
CREATE POLICY "update_rates" ON transport_reference_rates FOR UPDATE
  TO authenticated USING (is_admin_or_higher()) WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "delete_rates" ON transport_reference_rates;
CREATE POLICY "delete_rates" ON transport_reference_rates FOR DELETE
  TO authenticated USING (is_admin_or_higher());

-- ============================================================
-- proposed_agents
-- ============================================================
CREATE TABLE IF NOT EXISTS proposed_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_name text NOT NULL,
  contact_person text,
  phone_number text,
  email text,
  internal_note text,
  status text NOT NULL DEFAULT 'pending',
  entered_by uuid,
  entered_by_name text,
  approved_by uuid,
  approved_by_name text,
  source text NOT NULL DEFAULT 'OPS_PRO_MANUAL_AGENT',
  related_batch text,
  created_sub_agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proposed_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_proposed_agents" ON proposed_agents;
CREATE POLICY "select_proposed_agents" ON proposed_agents FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_proposed_agents" ON proposed_agents;
CREATE POLICY "insert_proposed_agents" ON proposed_agents FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_proposed_agents" ON proposed_agents;
CREATE POLICY "update_proposed_agents" ON proposed_agents FOR UPDATE
  TO authenticated USING (is_admin_or_higher()) WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "delete_proposed_agents" ON proposed_agents;
CREATE POLICY "delete_proposed_agents" ON proposed_agents FOR DELETE
  TO authenticated USING (is_admin_or_higher());

-- ============================================================
-- Seed vehicle types
-- ============================================================
INSERT INTO transport_vehicle_types (vehicle_code, vehicle_name) VALUES
  ('COSTAR', 'Costar'),
  ('HIACE', 'Hiace'),
  ('STARIA', 'Staria'),
  ('GMC', 'GMC'),
  ('FORD', 'Ford')
ON CONFLICT (vehicle_code) DO NOTHING;

-- ============================================================
-- Seed routes
-- ============================================================
INSERT INTO transport_routes (route_code, route_name, origin, destination, is_bidirectional, city_scope) VALUES
  ('R01', 'Jeddah Airport ↔ Makkah Hotel', 'Jeddah Airport', 'Makkah Hotel', true, 'InterCity'),
  ('R02', 'Madinah Airport ↔ Madinah Hotel', 'Madinah Airport', 'Madinah Hotel', true, 'Madinah'),
  ('R03', 'Makkah ↔ Madinah', 'Makkah', 'Madinah', true, 'InterCity'),
  ('R04', 'Jeddah Airport ↔ Madinah Hotel', 'Jeddah Airport', 'Madinah Hotel', true, 'InterCity'),
  ('R05', 'Train Station ↔ Hotel', 'Train Station', 'Hotel', true, 'General'),
  ('R06', 'Makkah or Madinah Tour', 'Makkah', 'Tour Site', true, 'General')
ON CONFLICT (route_code) DO NOTHING;

-- ============================================================
-- Seed reference rates
-- ============================================================
-- Helper: get route and vehicle IDs via subqueries
INSERT INTO transport_reference_rates (route_id, vehicle_type_id, price, currency, effective_season, source)
SELECT r.id, v.id, p.price, 'SAR', 'Umrah 1448', 'COMPANY_TRANSPORT_PRICE_SHEET'
FROM (VALUES
  ('R01', 'COSTAR', 500.00),
  ('R01', 'HIACE',  400.00),
  ('R01', 'STARIA', 325.00),
  ('R01', 'GMC',    400.00),
  ('R01', 'FORD',   250.00),
  ('R02', 'COSTAR', 450.00),
  ('R02', 'HIACE',  300.00),
  ('R02', 'STARIA', 250.00),
  ('R02', 'GMC',    300.00),
  ('R02', 'FORD',   180.00),
  ('R03', 'COSTAR', 950.00),
  ('R03', 'HIACE',  700.00),
  ('R03', 'STARIA', 650.00),
  ('R03', 'GMC',    950.00),
  ('R03', 'FORD',   550.00),
  ('R04', 'COSTAR', 950.00),
  ('R04', 'HIACE',  700.00),
  ('R04', 'STARIA', 650.00),
  ('R04', 'GMC',    950.00),
  ('R04', 'FORD',   550.00),
  ('R05', 'COSTAR', 375.00),
  ('R05', 'HIACE',  225.00),
  ('R05', 'STARIA', 175.00),
  ('R05', 'GMC',    225.00),
  ('R05', 'FORD',   150.00),
  ('R06', 'COSTAR', 500.00),
  ('R06', 'HIACE',  350.00),
  ('R06', 'STARIA', 250.00),
  ('R06', 'GMC',    350.00),
  ('R06', 'FORD',   250.00)
) AS p(route_code, vehicle_code, price)
JOIN transport_routes r ON r.route_code = p.route_code
JOIN transport_vehicle_types v ON v.vehicle_code = p.vehicle_code
ON CONFLICT (route_id, vehicle_type_id, effective_season) DO NOTHING;

-- ============================================================
-- Add source columns to hotel_references for manual entries
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hotel_references' AND column_name = 'source') THEN
    ALTER TABLE hotel_references ADD COLUMN source text DEFAULT 'REFERENCE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hotel_references' AND column_name = 'entered_by') THEN
    ALTER TABLE hotel_references ADD COLUMN entered_by uuid;
  END IF;
END $$;

-- Allow authenticated to INSERT hotel references (for manual entry / admin import)
DROP POLICY IF EXISTS "insert_hotel_refs" ON hotel_references;
CREATE POLICY "insert_hotel_refs" ON hotel_references FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_hotel_refs" ON hotel_references;
CREATE POLICY "update_hotel_refs" ON hotel_references FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

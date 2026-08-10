/*
# Create hotel reference table for Visa & Contract Logger

## Purpose
The Visa & Contract Logger module needs searchable hotel selectors for
Makkah and Madinah hotels. This table stores the hotel reference data
that staff search when assigning hotels to visa cases.

## New Tables
- `hotel_references`
  - id (uuid, primary key)
  - city (text, not null) — 'Makkah' or 'Madinah'
  - name_en (text, not null) — English hotel name
  - name_ar (text) — Arabic hotel name (nullable)
  - classification (text) — star rating or class
  - licence_number (text) — hotel licence number
  - district (text) — hotel district/area
  - is_active (boolean, default true)
  - created_at (timestamptz, default now())

## Indexes
- idx_hotel_refs_city on city (for filtering by Makkah/Madinah)
- idx_hotel_refs_name_en on name_en (for text search)

## Security
- RLS enabled
- SELECT: authenticated only (all staff can search hotels)
- No INSERT/UPDATE/DELETE via API (hotels are managed via admin tools)

## Sample Data
- 5 Makkah hotels and 5 Madinah hotels seeded for initial use
*/

CREATE TABLE IF NOT EXISTS hotel_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL CHECK (city IN ('Makkah', 'Madinah')),
  name_en text NOT NULL,
  name_ar text,
  classification text,
  licence_number text,
  district text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hotel_references ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_hotel_refs_city ON hotel_references(city);
CREATE INDEX IF NOT EXISTS idx_hotel_refs_name_en ON hotel_references(name_en);

DROP POLICY IF EXISTS "select_hotel_refs" ON hotel_references;
CREATE POLICY "select_hotel_refs" ON hotel_references FOR SELECT
  TO authenticated USING (true);

-- Seed sample Makkah hotels
INSERT INTO hotel_references (city, name_en, name_ar, classification, licence_number, district) VALUES
  ('Makkah', 'Hilton Suites Makkah', 'هيلتون سويتس مكة', '5 Star', 'MK-001', 'Aziziyah'),
  ('Makkah', 'Swissôtel Al Maqam', 'سويس أوتيل المقام', '5 Star', 'MK-002', 'Abraj Al Bait'),
  ('Makkah', 'Makkah Hotel', 'فندق مكة', '5 Star', 'MK-003', 'Abraj Al Bait'),
  ('Makkah', 'Concorde Makkah', 'كونكورد مكة', '4 Star', 'MK-004', 'Aziziyah'),
  ('Makkah', 'Al Eiman Royal', 'الإيمان رويال', '4 Star', 'MK-005', 'Al Misfalah')
ON CONFLICT DO NOTHING;

-- Seed sample Madinah hotels
INSERT INTO hotel_references (city, name_en, name_ar, classification, licence_number, district) VALUES
  ('Madinah', 'The Oberoi Madinah', 'ذا أوبروي المدينة', '5 Star', 'MD-001', 'Central Area'),
  ('Madinah', 'Dar Al Taqwa Hotel', 'دار التقوى', '5 Star', 'MD-002', 'Central Area'),
  ('Madinah', 'Anwar Al Madinah Mövenpick', 'أنوار المدينة موفنبيك', '5 Star', 'MD-003', 'Central Area'),
  ('Madinah', 'Al Eiman Taibah', 'الإيمان طيبة', '4 Star', 'MD-004', 'Central Area'),
  ('Madinah', 'Madinah Hilton', 'هيلتون المدينة', '5 Star', 'MD-005', 'Central Area')
ON CONFLICT DO NOTHING;

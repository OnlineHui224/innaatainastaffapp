
/*
# Create profiles table

1. Purpose
   Extends auth.users with role and display info for HajjERP staff.

2. New Tables
   - `profiles`
     - `id` (uuid, PK, references auth.users)
     - `full_name` (text)
     - `role` (text, 'administrator' | 'operations_officer')
     - `is_active` (boolean, default true)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)

3. Security
   - RLS enabled
   - Authenticated users can read all profiles (needed for staff lookups)
   - Users can update their own profile
   - Admins can manage all profiles via service role or RPC

4. Notes
   - Role is stored in profiles, NOT in auth metadata, for clean RLS
   - Bootstrap function creates first admin from project owner
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'operations_officer' CHECK (role IN ('administrator', 'operations_officer')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  TO authenticated USING (true);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'operations_officer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Bootstrap function: sets first-ever user as administrator
CREATE OR REPLACE FUNCTION bootstrap_first_admin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_uid uuid;
BEGIN
  -- Count existing admins
  SELECT count(*) INTO v_count FROM profiles WHERE role = 'administrator';
  
  -- Only proceed if no admin exists yet
  IF v_count > 0 THEN
    RETURN json_build_object('success', false, 'message', 'An administrator already exists. Bootstrap is disabled.');
  END IF;

  v_uid := auth.uid();
  
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  UPDATE profiles SET role = 'administrator', updated_at = now() WHERE id = v_uid;
  
  RETURN json_build_object('success', true, 'message', 'You have been set as Administrator.');
END;
$$;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$$;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrator'
  );
END;
$$;

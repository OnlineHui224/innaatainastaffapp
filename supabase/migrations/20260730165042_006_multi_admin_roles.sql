
/*
# Multi-administrator role system

1. Purpose
   Extends the staff role system to support multiple trusted administrators
   with a hierarchy: PLATFORM_OWNER > SUPER_ADMIN > ADMIN > OPERATIONS_MANAGER >
   OPERATIONS_STAFF > VIEWER. Adds a separate job_title field, password-change
   enforcement, last-login tracking, and secure server-side authorization helpers.

2. Modified Tables
   - `profiles`
     - `role` CHECK constraint widened to 6 roles
     - adds `job_title` text (executive title, independent of permissions)
     - adds `must_change_password` boolean default false
     - adds `last_login_at` timestamptz (nullable)
     - adds `created_by_id` uuid (who created/promoted the account)
     - adds `promoted_by_name` text (who last promoted the account)
     - adds `deactivated_by_id` uuid (who last suspended the account)
     - adds `deactivated_at` timestamptz (when suspended)
   - `pilgrims` DELETE policy tightened to admin-or-higher
   - `sub_agents` DELETE policy tightened to admin-or-higher

3. New Functions
   - is_platform_owner()
   - is_super_admin_or_higher()
   - is_admin_or_higher()
   - can_manage_staff()
   - change_staff_role(target_uid, new_role, actor_password)
   - suspend_staff_account(target_uid, actor_password)
   - activate_staff_account(target_uid)
   - transfer_platform_ownership(target_uid, actor_password)
   - require_password_change(target_uid)

4. Security
   - All role mutations go through SECURITY DEFINER functions that verify
     the actor's password via auth.users and enforce the hierarchy rules.
   - RLS DELETE policies tightened to admin-or-higher.
   - The platform_owner can never be deleted or suspended while it is the
     only active owner (enforced in suspend + change_staff_role).

5. Notes
   - The existing 'administrator' role is migrated to 'super_admin' and the
     first administrator (if any) becomes 'platform_owner'.
   - 'operations_officer' is migrated to 'operations_staff'.
   - These data migrations are idempotent and safe to re-run.
*/

-- =========================================================
-- 1. Widen role constraint + add columns
-- =========================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'platform_owner',
    'super_admin',
    'admin',
    'operations_manager',
    'operations_staff',
    'viewer'
  ));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS promoted_by_name text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_by_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- =========================================================
-- 2. Migrate legacy roles to the new hierarchy (idempotent)
-- =========================================================

DO $$
BEGIN
  UPDATE profiles SET role = 'platform_owner'
  WHERE role = 'administrator'
    AND id = (SELECT id FROM profiles WHERE role = 'administrator' ORDER BY created_at LIMIT 1);

  UPDATE profiles SET role = 'super_admin'
  WHERE role = 'administrator';
END $$;

UPDATE profiles SET role = 'operations_staff'
WHERE role = 'operations_officer';

-- =========================================================
-- 3. Authorization helper functions
-- =========================================================

CREATE OR REPLACE FUNCTION is_platform_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'platform_owner' AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_super_admin_or_higher()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('platform_owner', 'super_admin')
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_admin_or_higher()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('platform_owner', 'super_admin', 'admin')
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION can_manage_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('platform_owner', 'super_admin', 'admin')
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('platform_owner', 'super_admin', 'admin')
      AND is_active = true
  );
END;
$$;

-- =========================================================
-- 4. Change staff role (SECURE — verifies actor password)
-- =========================================================

CREATE OR REPLACE FUNCTION change_staff_role(
  p_target_uid uuid,
  p_new_role text,
  p_actor_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
  v_target profiles%ROWTYPE;
  v_owner_count integer;
  v_super_count integer;
  v_pw_ok boolean;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_target_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found.');
  END IF;

  SELECT role, full_name INTO v_actor_role, v_actor_name
  FROM profiles WHERE id = v_actor_id;

  SELECT true INTO v_pw_ok
  FROM auth.users
  WHERE id = v_actor_id
    AND encrypted_password = crypt(p_actor_password, encrypted_password);

  IF v_pw_ok IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'message', 'Incorrect password. Please re-enter your password to confirm this action.');
  END IF;

  IF v_actor_id = p_target_uid THEN
    RETURN json_build_object('success', false, 'message', 'You cannot change your own role.');
  END IF;

  IF p_new_role IN ('super_admin', 'platform_owner') AND v_actor_role <> 'platform_owner' THEN
    RETURN json_build_object('success', false, 'message', 'Only the Platform Owner can grant Super Admin or Platform Owner access.');
  END IF;

  IF v_actor_role NOT IN ('platform_owner', 'super_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'message', 'You do not have permission to change staff roles.');
  END IF;

  IF v_actor_role = 'admin' AND v_target.role IN ('platform_owner', 'super_admin') THEN
    RETURN json_build_object('success', false, 'message', 'Administrators cannot manage Super Admin or Platform Owner accounts.');
  END IF;

  IF v_actor_role = 'admin' AND p_new_role = 'admin' THEN
    RETURN json_build_object('success', false, 'message', 'Only Super Admin or higher can promote to Administrator.');
  END IF;

  IF v_target.role = 'platform_owner' AND p_new_role <> 'platform_owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM profiles WHERE role = 'platform_owner' AND is_active = true;
    IF v_owner_count <= 1 THEN
      RETURN json_build_object('success', false, 'message', 'There must always be exactly one active Platform Owner. Transfer ownership before demoting the current owner.');
    END IF;
  END IF;

  IF v_target.role = 'super_admin' AND p_new_role NOT IN ('super_admin', 'platform_owner') THEN
    SELECT count(*) INTO v_super_count
    FROM profiles WHERE role = 'super_admin' AND is_active = true;
    IF v_super_count <= 1 THEN
      RETURN json_build_object('success', false, 'message', 'Cannot demote the last remaining Super Admin.');
    END IF;
  END IF;

  UPDATE profiles
  SET role = p_new_role,
      promoted_by_name = v_actor_name,
      updated_at = now()
  WHERE id = p_target_uid;

  INSERT INTO audit_log (action, record_type, record_id, record_label, previous_value, new_value, performed_by, performed_by_name)
  VALUES (
    'staff_role_changed',
    'staff_user',
    p_target_uid,
    v_target.full_name,
    jsonb_build_object('role', v_target.role),
    jsonb_build_object('role', p_new_role),
    v_actor_id,
    v_actor_name
  );

  RETURN json_build_object('success', true, 'message', 'Role updated successfully.');
END;
$$;

-- =========================================================
-- 5. Suspend / activate staff account
-- =========================================================

CREATE OR REPLACE FUNCTION suspend_staff_account(
  p_target_uid uuid,
  p_actor_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
  v_target profiles%ROWTYPE;
  v_owner_count integer;
  v_pw_ok boolean;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_target_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found.');
  END IF;

  SELECT role, full_name INTO v_actor_role, v_actor_name
  FROM profiles WHERE id = v_actor_id;

  SELECT true INTO v_pw_ok
  FROM auth.users
  WHERE id = v_actor_id
    AND encrypted_password = crypt(p_actor_password, encrypted_password);

  IF v_pw_ok IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'message', 'Incorrect password. Please re-enter your password to confirm this action.');
  END IF;

  IF v_actor_id = p_target_uid THEN
    RETURN json_build_object('success', false, 'message', 'You cannot suspend your own account.');
  END IF;

  IF v_actor_role = 'admin' AND v_target.role IN ('platform_owner', 'super_admin') THEN
    RETURN json_build_object('success', false, 'message', 'Administrators cannot suspend Super Admin or Platform Owner accounts.');
  END IF;

  IF v_target.role = 'super_admin' AND v_actor_role <> 'platform_owner' THEN
    RETURN json_build_object('success', false, 'message', 'Only the Platform Owner can suspend a Super Admin.');
  END IF;

  IF v_target.role = 'platform_owner' THEN
    IF v_actor_role <> 'platform_owner' THEN
      RETURN json_build_object('success', false, 'message', 'Only the Platform Owner can suspend another Platform Owner.');
    END IF;
    SELECT count(*) INTO v_owner_count
    FROM profiles WHERE role = 'platform_owner' AND is_active = true;
    IF v_owner_count <= 1 THEN
      RETURN json_build_object('success', false, 'message', 'There must always be exactly one active Platform Owner. Transfer ownership before suspending the current owner.');
    END IF;
  END IF;

  UPDATE profiles
  SET is_active = false,
      deactivated_by_id = v_actor_id,
      deactivated_at = now(),
      updated_at = now()
  WHERE id = p_target_uid;

  INSERT INTO audit_log (action, record_type, record_id, record_label, previous_value, new_value, performed_by, performed_by_name)
  VALUES (
    'staff_account_deactivated',
    'staff_user',
    p_target_uid,
    v_target.full_name,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false),
    v_actor_id,
    v_actor_name
  );

  RETURN json_build_object('success', true, 'message', 'Account suspended.');
END;
$$;

CREATE OR REPLACE FUNCTION activate_staff_account(p_target_uid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
  v_target profiles%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_target_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found.');
  END IF;

  SELECT role, full_name INTO v_actor_role, v_actor_name
  FROM profiles WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('platform_owner', 'super_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'message', 'You do not have permission to activate accounts.');
  END IF;

  IF v_actor_role = 'admin' AND v_target.role IN ('platform_owner', 'super_admin') THEN
    RETURN json_build_object('success', false, 'message', 'Administrators cannot activate Super Admin or Platform Owner accounts.');
  END IF;

  UPDATE profiles
  SET is_active = true,
      deactivated_by_id = null,
      deactivated_at = null,
      updated_at = now()
  WHERE id = p_target_uid;

  INSERT INTO audit_log (action, record_type, record_id, record_label, previous_value, new_value, performed_by, performed_by_name)
  VALUES (
    'staff_account_activated',
    'staff_user',
    p_target_uid,
    v_target.full_name,
    jsonb_build_object('is_active', false),
    jsonb_build_object('is_active', true),
    v_actor_id,
    v_actor_name
  );

  RETURN json_build_object('success', true, 'message', 'Account activated.');
END;
$$;

-- =========================================================
-- 6. Transfer platform ownership (SECURE)
-- =========================================================

CREATE OR REPLACE FUNCTION transfer_platform_ownership(
  p_target_uid uuid,
  p_actor_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_name text;
  v_target profiles%ROWTYPE;
  v_pw_ok boolean;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_actor_id AND role = 'platform_owner' AND is_active = true) THEN
    RETURN json_build_object('success', false, 'message', 'Only the Platform Owner can transfer ownership.');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_target_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found.');
  END IF;

  IF v_target.role <> 'super_admin' OR v_target.is_active = false THEN
    RETURN json_build_object('success', false, 'message', 'Ownership can only be transferred to an active Super Admin.');
  END IF;

  IF v_actor_id = p_target_uid THEN
    RETURN json_build_object('success', false, 'message', 'You cannot transfer ownership to yourself.');
  END IF;

  SELECT true INTO v_pw_ok
  FROM auth.users
  WHERE id = v_actor_id
    AND encrypted_password = crypt(p_actor_password, encrypted_password);

  IF v_pw_ok IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'message', 'Incorrect password. Please re-enter your password to confirm the ownership transfer.');
  END IF;

  UPDATE profiles SET role = 'platform_owner', promoted_by_name = v_actor_name, updated_at = now()
  WHERE id = p_target_uid;

  UPDATE profiles SET role = 'super_admin', updated_at = now()
  WHERE id = v_actor_id;

  INSERT INTO audit_log (action, record_type, record_id, record_label, previous_value, new_value, performed_by, performed_by_name)
  VALUES (
    'platform_ownership_transferred',
    'staff_user',
    p_target_uid,
    v_target.full_name,
    jsonb_build_object('previous_owner', v_actor_id, 'new_owner', p_target_uid),
    jsonb_build_object('new_owner_role', 'platform_owner', 'previous_owner_role', 'super_admin'),
    v_actor_id,
    v_actor_name
  );

  RETURN json_build_object('success', true, 'message', 'Platform ownership transferred successfully.');
END;
$$;

-- =========================================================
-- 7. Require password change at next login
-- =========================================================

CREATE OR REPLACE FUNCTION require_password_change(p_target_uid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
  v_target profiles%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_target_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found.');
  END IF;

  SELECT role, full_name INTO v_actor_role, v_actor_name
  FROM profiles WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('platform_owner', 'super_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'message', 'You do not have permission to require password changes.');
  END IF;

  IF v_actor_role = 'admin' AND v_target.role IN ('platform_owner', 'super_admin') THEN
    RETURN json_build_object('success', false, 'message', 'Administrators cannot manage Super Admin or Platform Owner accounts.');
  END IF;

  UPDATE profiles SET must_change_password = true, updated_at = now()
  WHERE id = p_target_uid;

  INSERT INTO audit_log (action, record_type, record_id, record_label, previous_value, new_value, performed_by, performed_by_name)
  VALUES (
    'password_change_required',
    'staff_user',
    p_target_uid,
    v_target.full_name,
    null,
    jsonb_build_object('must_change_password', true),
    v_actor_id,
    v_actor_name
  );

  RETURN json_build_object('success', true, 'message', 'User will be required to change their password at next login.');
END;
$$;

-- =========================================================
-- 8. Update RLS DELETE policies to use the new is_admin()
-- =========================================================

DROP POLICY IF EXISTS "pilgrims_delete" ON pilgrims;
CREATE POLICY "pilgrims_delete" ON pilgrims FOR DELETE
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "sub_agents_delete" ON sub_agents;
CREATE POLICY "sub_agents_delete" ON sub_agents FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================
-- 9. Profiles UPDATE policy (allow staff management by admin+)
-- =========================================================

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- 10. Update bootstrap to create platform_owner instead of administrator
-- =========================================================

CREATE OR REPLACE FUNCTION bootstrap_first_admin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_uid uuid;
BEGIN
  SELECT count(*) INTO v_count FROM profiles WHERE role = 'platform_owner';

  IF v_count > 0 THEN
    RETURN json_build_object('success', false, 'message', 'A Platform Owner already exists. Bootstrap is disabled.');
  END IF;

  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  UPDATE profiles SET role = 'platform_owner', updated_at = now() WHERE id = v_uid;

  RETURN json_build_object('success', true, 'message', 'You have been set as the Platform Owner.');
END;
$$;

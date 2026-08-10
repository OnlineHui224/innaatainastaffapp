/*
# Security Hardening: RLS, Policy Fixes, and Function Execute Grants

## Purpose
Fix three categories of security findings:
1. `pilgrims_backup_pre_correction` has RLS disabled and is fully exposed via the API
   (contains passport_number — sensitive data).
2. Multiple tables have RLS policies with `USING (true)` / `WITH CHECK (true)` that
   bypass authorization for INSERT, UPDATE, and DELETE.
3. All 13 SECURITY DEFINER functions are executable by the `anon` role, meaning
   unauthenticated users can call privileged functions via the REST API.

## Changes

### 1. pilgrims_backup_pre_correction (safety backup table)
- Enable RLS.
- Revoke ALL privileges from anon and authenticated.
- This is an internal backup table — no API access is needed. RLS is enabled
  as defense-in-depth; with no grants, no client can reach it.

### 2. Always-true policy fixes

Tables and their corrected policies:

**audit_log** (INSERT currently WITH CHECK (true)):
- INSERT: require authenticated (any signed-in staff can write audit entries
  since the app always writes the performed_by from the session).

**import_batches** (INSERT/UPDATE currently always true):
- INSERT: require authenticated.
- UPDATE: require authenticated (import batches are updated during import flow).

**import_review_queue** (INSERT/UPDATE/DELETE currently always true):
- INSERT: require authenticated.
- UPDATE: require authenticated (approving/rejecting review rows).
- DELETE: require is_admin() (only admins can permanently remove review rows).

**pilgrims** (INSERT/UPDATE currently always true):
- INSERT: require authenticated.
- UPDATE: require authenticated (staff update pilgrim records during operations).

**profiles** (UPDATE/DELETE currently always true):
- UPDATE: require auth.uid() = id (users can only update their own profile)
  OR is_admin_or_higher() (admins can update any profile).
- DELETE: require is_admin_or_higher() (only admins can delete profiles).

**sub_agents** (INSERT/UPDATE currently always true):
- INSERT: require authenticated.
- UPDATE: require authenticated.

### 3. SECURITY DEFINER function execute grants
- Revoke EXECUTE from PUBLIC, anon, and authenticated on ALL 13 functions.
- Grant EXECUTE only to authenticated for functions called via RPC from the
  frontend (change_staff_role, suspend_staff_account, activate_staff_account,
  transfer_platform_ownership, require_password_change, bootstrap_first_admin,
  mark_password_reset).
- Grant EXECUTE only to authenticated for helper functions used inside RLS
  policies (is_admin, is_admin_or_higher, is_platform_owner,
  is_super_admin_or_higher, can_manage_staff, get_current_user_role,
  handle_new_user).
- The `anon` role never gets EXECUTE on any SECURITY DEFINER function.

## Security Impact
- Unauthenticated users can no longer call any privileged function.
- The backup table with passport numbers is no longer accessible via the API.
- All write operations now require authentication, and sensitive operations
  (deleting profiles, deleting review queue rows) require admin role.
*/

-- ============================================================
-- 1. Fix pilgrims_backup_pre_correction: enable RLS, revoke access
-- ============================================================
ALTER TABLE pilgrims_backup_pre_correction ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pilgrims_backup_pre_correction FROM anon;
REVOKE ALL ON pilgrims_backup_pre_correction FROM authenticated;

-- ============================================================
-- 2. Fix always-true policies
-- ============================================================

-- audit_log: fix INSERT
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (true);
-- (audit entries are written by the app with performed_by from session; any
--  authenticated staff member can create audit log entries)

-- import_batches: fix INSERT and UPDATE
DROP POLICY IF EXISTS "insert_import_batches" ON import_batches;
CREATE POLICY "insert_import_batches" ON import_batches FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_import_batches" ON import_batches;
CREATE POLICY "update_import_batches" ON import_batches FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- import_review_queue: fix INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "insert_review_queue" ON import_review_queue;
CREATE POLICY "insert_review_queue" ON import_review_queue FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_review_queue" ON import_review_queue;
CREATE POLICY "update_review_queue" ON import_review_queue FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_review_queue" ON import_review_queue;
CREATE POLICY "delete_review_queue" ON import_review_queue FOR DELETE
  TO authenticated USING (is_admin());

-- pilgrims: fix INSERT and UPDATE
DROP POLICY IF EXISTS "pilgrims_insert" ON pilgrims;
CREATE POLICY "pilgrims_insert" ON pilgrims FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pilgrims_update" ON pilgrims;
CREATE POLICY "pilgrims_update" ON pilgrims FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- profiles: fix UPDATE and DELETE
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin_or_higher())
  WITH CHECK (auth.uid() = id OR is_admin_or_higher());

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  TO authenticated USING (is_admin_or_higher());

-- sub_agents: fix INSERT and UPDATE
DROP POLICY IF EXISTS "sub_agents_insert" ON sub_agents;
CREATE POLICY "sub_agents_insert" ON sub_agents FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sub_agents_update" ON sub_agents;
CREATE POLICY "sub_agents_update" ON sub_agents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Fix SECURITY DEFINER function execute grants
-- ============================================================
-- Revoke EXECUTE from PUBLIC (which anon and authenticated inherit from)
-- and from anon explicitly, then grant only to authenticated.

REVOKE EXECUTE ON FUNCTION activate_staff_account(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION activate_staff_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION activate_staff_account(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION bootstrap_first_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bootstrap_first_admin() FROM anon;
GRANT EXECUTE ON FUNCTION bootstrap_first_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION can_manage_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_manage_staff() FROM anon;
GRANT EXECUTE ON FUNCTION can_manage_staff() TO authenticated;

REVOKE EXECUTE ON FUNCTION change_staff_role(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION change_staff_role(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION change_staff_role(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_current_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_current_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon;
-- handle_new_user is a trigger function; it runs as SECURITY DEFINER during
-- signup. Grant to authenticated so it can also be called via RPC if needed.
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_admin_or_higher() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_admin_or_higher() FROM anon;
GRANT EXECUTE ON FUNCTION is_admin_or_higher() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_platform_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_platform_owner() FROM anon;
GRANT EXECUTE ON FUNCTION is_platform_owner() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_super_admin_or_higher() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_super_admin_or_higher() FROM anon;
GRANT EXECUTE ON FUNCTION is_super_admin_or_higher() TO authenticated;

REVOKE EXECUTE ON FUNCTION mark_password_reset(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_password_reset(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION mark_password_reset(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION require_password_change(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION require_password_change(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION require_password_change(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION suspend_staff_account(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION suspend_staff_account(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION suspend_staff_account(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION transfer_platform_ownership(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION transfer_platform_ownership(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION transfer_platform_ownership(uuid, text) TO authenticated;

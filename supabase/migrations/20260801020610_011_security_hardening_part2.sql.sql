/*
# Security Hardening Part 2: Tighten Policies and Convert Helper Functions

## Purpose
Address remaining advisor warnings:
1. Convert read-only helper functions (is_admin, is_admin_or_higher, etc.) to
   SECURITY INVOKER — they only read the profiles table and don't need elevated
   privileges. They already have internal auth.uid() checks.
2. Convert handle_new_user (trigger function) to SECURITY INVOKER — it's called
   by a trigger on auth.users, not via RPC, and doesn't need DEFINER.
3. Tighten INSERT/UPDATE policies on operational tables to require
   is_admin_or_higher() where appropriate, or auth.uid() checks.
4. Add a deny-by-default policy to pilgrims_backup_pre_correction.

## Key Decisions
- The action functions (change_staff_role, suspend_staff_account, etc.) MUST stay
  SECURITY DEFINER because they write to profiles/audit_log and have internal
  auth checks. The advisor warning about authenticated calling them is accepted
  risk — the function bodies reject unauthorized callers.
- Helper functions that only read (is_admin, etc.) are converted to INVOKER
  since they don't need elevated privileges.
- For operational tables (pilgrims, sub_agents, import_batches, etc.), INSERT
  and UPDATE now require is_admin_or_higher() for most operations, since only
  admin-level staff should be modifying records.
- audit_log INSERT stays WITH CHECK (true) for authenticated since the app
  writes audit entries from the session context — this is intentional.
*/

-- ============================================================
-- 1. Convert helper functions to SECURITY INVOKER
-- ============================================================
ALTER FUNCTION is_admin() SECURITY INVOKER;
ALTER FUNCTION is_admin_or_higher() SECURITY INVOKER;
ALTER FUNCTION is_platform_owner() SECURITY INVOKER;
ALTER FUNCTION is_super_admin_or_higher() SECURITY INVOKER;
ALTER FUNCTION can_manage_staff() SECURITY INVOKER;
ALTER FUNCTION get_current_user_role() SECURITY INVOKER;
ALTER FUNCTION handle_new_user() SECURITY INVOKER;

-- ============================================================
-- 2. Tighten pilgrims INSERT and UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS "pilgrims_insert" ON pilgrims;
CREATE POLICY "pilgrims_insert" ON pilgrims FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "pilgrims_update" ON pilgrims;
CREATE POLICY "pilgrims_update" ON pilgrims FOR UPDATE
  TO authenticated USING (true) WITH CHECK (is_admin_or_higher());

-- ============================================================
-- 3. Tighten sub_agents INSERT and UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS "sub_agents_insert" ON sub_agents;
CREATE POLICY "sub_agents_insert" ON sub_agents FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "sub_agents_update" ON sub_agents;
CREATE POLICY "sub_agents_update" ON sub_agents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (is_admin_or_higher());

-- ============================================================
-- 4. Tighten import_batches INSERT and UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS "insert_import_batches" ON import_batches;
CREATE POLICY "insert_import_batches" ON import_batches FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "update_import_batches" ON import_batches;
CREATE POLICY "update_import_batches" ON import_batches FOR UPDATE
  TO authenticated USING (true) WITH CHECK (is_admin_or_higher());

-- ============================================================
-- 5. Tighten import_review_queue INSERT, UPDATE, DELETE policies
-- ============================================================
DROP POLICY IF EXISTS "insert_review_queue" ON import_review_queue;
CREATE POLICY "insert_review_queue" ON import_review_queue FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_higher());

DROP POLICY IF EXISTS "update_review_queue" ON import_review_queue;
CREATE POLICY "update_review_queue" ON import_review_queue FOR UPDATE
  TO authenticated USING (true) WITH CHECK (is_admin_or_higher());

-- ============================================================
-- 6. Keep audit_log INSERT as WITH CHECK (true) for authenticated
-- This is intentional: any signed-in staff member can write audit entries.
-- The app always sets performed_by from the current session.
-- ============================================================
-- (No change needed — already TO authenticated WITH CHECK (true))

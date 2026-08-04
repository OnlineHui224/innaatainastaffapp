/*
# Security Hardening Part 3: Tighten UPDATE USING clauses

## Purpose
The UPDATE policies on pilgrims, sub_agents, import_batches, and
import_review_queue have USING (true) which the advisor flags as
"always true." While the WITH CHECK (is_admin_or_higher()) already
prevents non-admins from successfully updating, the USING clause
should also be restricted to make the intent explicit and satisfy
the linter.

## Changes
- pilgrims UPDATE: USING (is_admin_or_higher()) instead of USING (true)
- sub_agents UPDATE: USING (is_admin_or_higher()) instead of USING (true)
- import_batches UPDATE: USING (is_admin_or_higher()) instead of USING (true)
- import_review_queue UPDATE: USING (is_admin_or_higher()) instead of USING (true)

## Note on SECURITY DEFINER functions
The 7 remaining SECURITY DEFINER function warnings (activate_staff_account,
bootstrap_first_admin, change_staff_role, mark_password_reset,
require_password_change, suspend_staff_account, transfer_platform_ownership)
are accepted risk: these functions MUST run as DEFINER to write to the
profiles table (which has RLS). Each function body contains auth.uid()
and role checks that reject unauthorized callers before any write occurs.
Converting them to INVOKER would break them because the caller would be
subject to RLS on profiles.

## Note on audit_log INSERT
The WITH CHECK (true) on audit_log INSERT is intentional: any authenticated
staff member can write audit entries. The app always sets performed_by from
the current session user. Restricting this would break audit logging for
non-admin staff who perform legitimate actions.
*/

-- pilgrims UPDATE: tighten USING
DROP POLICY IF EXISTS "pilgrims_update" ON pilgrims;
CREATE POLICY "pilgrims_update" ON pilgrims FOR UPDATE
  TO authenticated
  USING (is_admin_or_higher())
  WITH CHECK (is_admin_or_higher());

-- sub_agents UPDATE: tighten USING
DROP POLICY IF EXISTS "sub_agents_update" ON sub_agents;
CREATE POLICY "sub_agents_update" ON sub_agents FOR UPDATE
  TO authenticated
  USING (is_admin_or_higher())
  WITH CHECK (is_admin_or_higher());

-- import_batches UPDATE: tighten USING
DROP POLICY IF EXISTS "update_import_batches" ON import_batches;
CREATE POLICY "update_import_batches" ON import_batches FOR UPDATE
  TO authenticated
  USING (is_admin_or_higher())
  WITH CHECK (is_admin_or_higher());

-- import_review_queue UPDATE: tighten USING
DROP POLICY IF EXISTS "update_review_queue" ON import_review_queue;
CREATE POLICY "update_review_queue" ON import_review_queue FOR UPDATE
  TO authenticated
  USING (is_admin_or_higher())
  WITH CHECK (is_admin_or_higher());

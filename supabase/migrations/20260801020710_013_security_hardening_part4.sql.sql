/*
# Security Hardening Part 4: Convert Action Functions to SECURITY INVOKER

## Purpose
Convert the remaining 7 SECURITY DEFINER functions to SECURITY INVOKER.
These functions write to profiles and audit_log. With INVOKER, the caller's
own RLS policies enforce authorization instead of relying solely on the
function body's internal checks.

## Why This Is Safe
- profiles UPDATE policy: USING (auth.uid() = id OR is_admin_or_higher())
  WITH CHECK (auth.uid() = id OR is_admin_or_higher())
  → Admins can update any profile. Users can update their own.
- profiles INSERT policy: WITH CHECK (auth.uid() = id)
  → Users can only insert their own profile.
- audit_log INSERT policy: WITH CHECK (true) TO authenticated
  → Any authenticated staff can write audit entries.

Each function already checks the caller's role internally (platform_owner,
super_admin, admin) before performing writes. With INVOKER, even if the
internal check were bypassed, the RLS policy would still block unauthorized
writes. This is defense-in-depth.

## Functions Converted
1. activate_staff_account — UPDATE profiles + INSERT audit_log
2. bootstrap_first_admin — INSERT profiles (auth.uid() = id satisfies INSERT policy)
3. change_staff_role — UPDATE profiles
4. mark_password_reset — UPDATE profiles + INSERT audit_log
5. require_password_change — UPDATE profiles
6. suspend_staff_account — UPDATE profiles + INSERT audit_log
7. transfer_platform_ownership — UPDATE profiles (two rows)
*/

ALTER FUNCTION activate_staff_account(uuid) SECURITY INVOKER;
ALTER FUNCTION bootstrap_first_admin() SECURITY INVOKER;
ALTER FUNCTION change_staff_role(uuid, text, text) SECURITY INVOKER;
ALTER FUNCTION mark_password_reset(uuid, uuid, text) SECURITY INVOKER;
ALTER FUNCTION require_password_change(uuid) SECURITY INVOKER;
ALTER FUNCTION suspend_staff_account(uuid, text) SECURITY INVOKER;
ALTER FUNCTION transfer_platform_ownership(uuid, text) SECURITY INVOKER;

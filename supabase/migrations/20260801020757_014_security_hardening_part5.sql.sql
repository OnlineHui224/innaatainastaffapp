/*
# Security Hardening Part 5: Revoke EXECUTE from anon on action functions

## Purpose
Even though the functions are now SECURITY INVOKER (so RLS applies),
the `anon` role still inherits EXECUTE from PUBLIC. Revoke EXECUTE
from anon on the 7 action functions that should only be callable by
authenticated users. The helper functions (is_admin, etc.) can stay
callable by anon since they return false/null for unauthenticated
callers and are used in RLS policy evaluation.

## Functions with anon EXECUTE revoked
- activate_staff_account
- bootstrap_first_admin
- change_staff_role
- mark_password_reset
- require_password_change
- suspend_staff_account
- transfer_platform_ownership
*/

REVOKE EXECUTE ON FUNCTION activate_staff_account(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION bootstrap_first_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION change_staff_role(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION mark_password_reset(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION require_password_change(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION suspend_staff_account(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION transfer_platform_ownership(uuid, text) FROM anon;

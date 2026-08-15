# Outstanding security fixes for the database

These changes could **not** be applied during the security audit, because the audit
session had no reachable database (every schema tool refused with *"This project has
no database, and this session is not allowed to create one"*). Everything below is
established from the migration sources in `supabase/migrations/`.

Run each block against the project database, in order, in a normal migration.

---

## 1. Staff cannot promote or reactivate themselves (findings F2, F3, F4)

`profiles_update_own` is a row-level rule, so the "you may edit your own row" branch
also lets a user rewrite `role`, `is_active` and `must_change_password` on that row;
and the `is_admin_or_higher()` branch lets an `admin` set anyone to `platform_owner`,
bypassing every guard inside `change_staff_role()`.

```sql
-- Column-level privileges are what actually stop a column being written.
REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (full_name, job_title, email, last_login_at, updated_at)
  ON public.profiles TO authenticated;

-- must_change_password is cleared by the user after a forced password change,
-- so it stays writable by its owner only; role and is_active never are.
GRANT UPDATE (must_change_password) ON public.profiles TO authenticated;

-- Keep the row rule as the ownership check; the column grants above decide
-- WHICH columns that rule may touch.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin_or_higher())
  WITH CHECK (auth.uid() = id OR is_admin_or_higher());
```

`role`, `is_active`, `deactivated_at`, `deactivated_by_id`, `created_by_id` and
`promoted_by_name` are then writable only through the existing SECURITY DEFINER
functions (`change_staff_role`, `suspend_staff_account`, `activate_staff_account`,
`transfer_platform_ownership`, `require_password_change`), which already verify the
actor's password and rank.

## 2. Suspension takes effect on every table (finding F3)

Nothing in the database reads `profiles.is_active`, so suspending an account removes
nothing but the staff page.

```sql
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;
```

Then add `AND is_active_staff()` (or `USING (is_active_staff())`) to the SELECT,
INSERT, UPDATE and DELETE policies of `pilgrims`, `sub_agents`, `import_batches`,
`import_review_queue`, `hotel_references`, the `transport_*` tables,
`flight_itineraries` and `audit_log`. Also fold it into `is_admin()`,
`is_admin_or_higher()`, `is_super_admin_or_higher()` and `can_manage_staff()` so a
suspended administrator loses privilege as well.

## 3. A self-registered account is inert (finding F5)

The trigger currently hands every new auth user `operations_staff`, which reads every
pilgrim record. The application creates all its accounts through the `admin-api`
function, which sets `is_active = true` explicitly, so a safer default breaks nothing.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, is_active)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'viewer',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
```

## 4. Platform ownership cannot be claimed (finding F6)

`bootstrap_first_admin()` is executable by every authenticated user and promotes the
caller whenever no owner row exists, with no atomic claim.

```sql
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_claimed integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated.');
  END IF;

  -- Single atomic claim: the UPDATE only matches when there is still no owner
  -- AND the caller is the earliest-created profile in the workspace.
  UPDATE profiles p
     SET role = 'platform_owner', updated_at = now()
   WHERE p.id = v_uid
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'platform_owner')
     AND p.created_at = (SELECT min(created_at) FROM profiles);

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed = 0 THEN
    RETURN json_build_object('success', false, 'message',
      'Bootstrap is not available for this account.');
  END IF;

  RETURN json_build_object('success', true, 'message',
    'You have been set as the Platform Owner.');
END;
$$;
```

## 5. Activity history cannot be forged (finding F7)

```sql
ALTER TABLE public.audit_log
  ALTER COLUMN performed_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());
```

## 6. Activity history is administrator-only (finding F8)

```sql
DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT
  TO authenticated
  USING (is_admin_or_higher());
```

## 7. Flight itineraries cannot be tampered with (finding F9)

```sql
DROP POLICY IF EXISTS "insert_flight_itineraries" ON public.flight_itineraries;
CREATE POLICY "insert_flight_itineraries" ON public.flight_itineraries FOR INSERT
  TO authenticated WITH CHECK (generated_by = auth.uid() OR is_admin_or_higher());

DROP POLICY IF EXISTS "update_flight_itineraries" ON public.flight_itineraries;
CREATE POLICY "update_flight_itineraries" ON public.flight_itineraries FOR UPDATE
  TO authenticated
  USING (generated_by = auth.uid() OR is_admin_or_higher())
  WITH CHECK (generated_by = auth.uid() OR is_admin_or_higher());

DROP POLICY IF EXISTS "delete_flight_itineraries" ON public.flight_itineraries;
CREATE POLICY "delete_flight_itineraries" ON public.flight_itineraries FOR DELETE
  TO authenticated USING (is_admin_or_higher());
```

---

## Settings outside the database

- **Public sign-ups (finding F13).** Turn off open registration in the hosted auth
  settings for this project. The application has no sign-up screen; every account is
  meant to be created by an administrator.
- **Document storage (finding F14).** Check whether the `documents` storage bucket is
  public. Generated itineraries contain full passenger names and travel detail. If it
  is public, make it private and serve files through short-lived signed URLs.

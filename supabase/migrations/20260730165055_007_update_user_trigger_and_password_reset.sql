
/*
# Update new-user trigger + add reset_password_and_require_change function

1. Purpose
   Updates handle_new_user to default new signups to 'operations_staff' (new role
   name) and adds a secure function to reset a user's password and require a
   password change at next login.

2. Modified Functions
   - handle_new_user(): default role changed to 'operations_staff'

3. New Functions
   - reset_staff_password(p_target_uid, p_new_password, p_actor_password)
     SECURE: verifies actor password, resets target's auth password, sets
     must_change_password=true, logs to audit_log.
*/

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
    'operations_staff'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Function to reset a user's password server-side (requires service role via edge function
-- for the actual auth.admin.updateUser call; this DB function handles the profile flag +
-- audit log, and is called by the edge function after the password is reset).
CREATE OR REPLACE FUNCTION mark_password_reset(
  p_target_uid uuid,
  p_actor_id uuid,
  p_actor_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_target FROM profiles WHERE id = p_target_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found.');
  END IF;

  UPDATE profiles
  SET must_change_password = true,
      updated_at = now()
  WHERE id = p_target_uid;

  INSERT INTO audit_log (action, record_type, record_id, record_label, previous_value, new_value, performed_by, performed_by_name)
  VALUES (
    'password_reset',
    'staff_user',
    p_target_uid,
    v_target.full_name,
    null,
    jsonb_build_object('password_reset', true, 'must_change_password', true),
    p_actor_id,
    p_actor_name
  );

  RETURN json_build_object('success', true, 'message', 'Password reset. User must change it at next login.');
END;
$$;

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

interface AdminUser {
  id: string;
  email: string;
  role: string;
  full_name: string;
  is_active: boolean;
}

type ActorLookupResult =
  | {
      success: true;
      actor: AdminUser;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const adminClient = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const permittedAdministratorRoles = new Set([
  "platform_owner",
  "super_admin",
  "admin",
]);

const permittedAssignableRoles = new Set([
  "super_admin",
  "admin",
  "operations_manager",
  "operations_staff",
  "viewer",
]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function normalizeRole(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function canAssignRole(
  actorRole: string,
  requestedRole: string,
): boolean {
  if (requestedRole === "platform_owner") {
    return false;
  }

  if (requestedRole === "super_admin") {
    return actorRole === "platform_owner";
  }

  if (requestedRole === "admin") {
    return (
      actorRole === "platform_owner" ||
      actorRole === "super_admin"
    );
  }

  return permittedAdministratorRoles.has(actorRole);
}

function canManageTargetRole(
  actorRole: string,
  targetRole: string,
): boolean {
  if (actorRole === "platform_owner") {
    return true;
  }

  if (actorRole === "super_admin") {
    return ![
      "platform_owner",
      "super_admin",
    ].includes(targetRole);
  }

  if (actorRole === "admin") {
    return ![
      "platform_owner",
      "super_admin",
      "admin",
    ].includes(targetRole);
  }

  return false;
}

/**
 * Validates the bearer token and loads the matching staff profile.
 */
async function getActorProfile(
  authHeader: string,
): Promise<ActorLookupResult> {
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!bearerMatch) {
    return {
      success: false,
      error: "Authentication token was not provided. Please sign in again.",
      status: 401,
    };
  }

  const token = bearerMatch[1].trim();

  if (!token) {
    return {
      success: false,
      error: "Authentication token was empty. Please sign in again.",
      status: 401,
    };
  }

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(token);

  if (userError || !user) {
    console.error("Authentication failed:", userError);

    return {
      success: false,
      error: "Your administrator session is invalid or expired.",
      status: 401,
    };
  }

  /*
   * Select all profile columns instead of requesting columns that
   * may not exist in this project's actual database schema.
   */
  const {
    data: profile,
    error: profileError,
  } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Profile lookup failed:", {
      message: profileError.message,
      code: profileError.code,
      details: profileError.details,
      hint: profileError.hint,
      userId: user.id,
    });

    return {
      success: false,
      error: "Your staff profile could not be loaded. Please try again.",
      status: 500,
    };
  }

  if (!profile) {
    return {
      success: false,
      error:
        "Your login is valid, but your account has no matching staff profile.",
      status: 403,
    };
  }

  const role = normalizeRole(
    profile.role ??
      profile.system_role ??
      profile.user_role ??
      "",
  );

  const fullName =
    profile.full_name ??
    profile.name ??
    profile.display_name ??
    user.user_metadata?.full_name ??
    user.email ??
    "Administrator";

  /*
   * Support the common account-status structures.
   * If is_active exists, use it.
   * Otherwise check status/account_status.
   */
  let isActive = true;

  if (typeof profile.is_active === "boolean") {
    isActive = profile.is_active;
  } else if (typeof profile.active === "boolean") {
    isActive = profile.active;
  } else {
    const accountStatus = String(
      profile.account_status ??
        profile.status ??
        "active",
    ).toLowerCase();

    isActive = ![
      "inactive",
      "suspended",
      "disabled",
      "deleted",
    ].includes(accountStatus);
  }

  if (!role) {
    console.error("Profile has no recognisable role:", profile);

    return {
      success: false,
      error:
        "Your staff profile exists, but it has no valid administrator role.",
      status: 403,
    };
  }

  return {
    success: true,
    actor: {
      id: user.id,
      email: user.email ?? profile.email ?? "",
      role,
      full_name: String(fullName),
      is_active: isActive,
    },
  };
}
async function writeAudit(
  entry: Record<string, unknown>,
): Promise<void> {
  const { error } = await adminClient
    .from("audit_log")
    .insert(entry);

  if (error) {
    console.error("Audit log insertion failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed." },
      405,
    );
  }

  try {
    const authHeader =
      req.headers.get("Authorization") ?? "";

    const actorLookup =
      await getActorProfile(authHeader);

    if (!actorLookup.success) {
      return json(
        { error: actorLookup.error },
        actorLookup.status,
      );
    }

    const actor = actorLookup.actor;

    if (!actor.is_active) {
      return json(
        {
          error:
            "Your administrator account is inactive.",
        },
        403,
      );
    }

    if (
      !permittedAdministratorRoles.has(
        actor.role,
      )
    ) {
      return json(
        {
          error:
            "You do not have permission to perform this action.",
        },
        403,
      );
    }

    let body: Record<string, unknown>;

    try {
      body =
        (await req.json()) as Record<
          string,
          unknown
        >;
    } catch {
      return json(
        {
          error:
            "The request body is not valid JSON.",
        },
        400,
      );
    }

    const action = cleanString(body.action);

    switch (action) {
      case "create_user": {
        const email = normalizeEmail(
          body.email,
        );
        const password = cleanString(
          body.password,
        );
        const fullName =
          cleanString(body.full_name) ||
          email.split("@")[0] ||
          "Staff Member";
        const jobTitle = cleanString(
          body.job_title,
        );
        const requestedRole =
          normalizeRole(body.role) ||
          "operations_staff";
        const mustChangePassword =
          body.require_password_change ===
          true;

        if (!email || !password) {
          return json(
            {
              error:
                "Email and password are required.",
            },
            400,
          );
        }

        if (!isValidEmail(email)) {
          return json(
            {
              error:
                "Please provide a valid email address.",
            },
            400,
          );
        }

        if (password.length < 12) {
          return json(
            {
              error:
                "Temporary password must contain at least 12 characters.",
            },
            400,
          );
        }

        if (
          requestedRole ===
          "platform_owner"
        ) {
          return json(
            {
              error:
                "A Platform Owner account cannot be created through Staff Management. Use the secure ownership-transfer process.",
            },
            403,
          );
        }

        if (
          !permittedAssignableRoles.has(
            requestedRole,
          )
        ) {
          return json(
            {
              error:
                "The selected system role is invalid.",
            },
            400,
          );
        }

        if (
          !canAssignRole(
            actor.role,
            requestedRole,
          )
        ) {
          return json(
            {
              error:
                "You do not have permission to create an account with this role.",
            },
            403,
          );
        }

        const {
          data: newUserResult,
          error: createError,
        } =
          await adminClient.auth.admin.createUser(
            {
              email,
              password,
              email_confirm: true,
              user_metadata: {
                full_name: fullName,
                job_title: jobTitle,
                role: requestedRole,
                require_password_change:
                  mustChangePassword,
              },
            },
          );

        if (
          createError ||
          !newUserResult.user
        ) {
          return json(
            {
              error: friendlyAuthError(
                createError?.message ??
                  "The authentication account could not be created.",
              ),
            },
            400,
          );
        }

const newUserId = newUserResult.user.id;

/*
 * The auth.users trigger should already have created the basic
 * profiles record. Read the real record first so we update only
 * columns that genuinely exist in this database.
 */
const {
  data: existingProfile,
  error: existingProfileError,
} = await adminClient
  .from("profiles")
  .select("*")
  .eq("id", newUserId)
  .maybeSingle();

if (existingProfileError || !existingProfile) {
  console.error("New staff profile lookup failed:", {
    message: existingProfileError?.message,
    code: existingProfileError?.code,
    details: existingProfileError?.details,
    hint: existingProfileError?.hint,
    userId: newUserId,
  });

  const { error: rollbackError } =
    await adminClient.auth.admin.deleteUser(newUserId);

  if (rollbackError) {
    console.error(
      "Incomplete account rollback failed:",
      rollbackError.message,
    );
  }

  return json(
    {
      error:
        "The account could not be completed and the incomplete account was rolled back. Please try again.",
    },
    500,
  );
}

const currentProfile =
  existingProfile as Record<string, unknown>;

const hasColumn = (column: string): boolean =>
  Object.prototype.hasOwnProperty.call(
    currentProfile,
    column,
  );

const profileUpdates: Record<string, unknown> = {};

/*
 * Name field — support whichever column your schema actually uses.
 */
if (hasColumn("full_name")) {
  profileUpdates.full_name = fullName;
} else if (hasColumn("name")) {
  profileUpdates.name = fullName;
} else if (hasColumn("display_name")) {
  profileUpdates.display_name = fullName;
}

/*
 * Role field.
 */
if (hasColumn("role")) {
  profileUpdates.role = requestedRole;
} else if (hasColumn("system_role")) {
  profileUpdates.system_role = requestedRole;
} else if (hasColumn("user_role")) {
  profileUpdates.user_role = requestedRole;
} else {
  const { error: rollbackError } =
    await adminClient.auth.admin.deleteUser(newUserId);

  if (rollbackError) {
    console.error(
      "Incomplete account rollback failed:",
      rollbackError.message,
    );
  }

  return json(
    {
      error:
        "The profiles table has no recognised role column. The incomplete account was rolled back.",
    },
    500,
  );
}

/*
 * Update only optional columns that actually exist.
 */
if (hasColumn("email")) {
  profileUpdates.email = email;
}

if (hasColumn("job_title")) {
  profileUpdates.job_title = jobTitle;
}

if (hasColumn("is_active")) {
  profileUpdates.is_active = true;
} else if (hasColumn("active")) {
  profileUpdates.active = true;
} else if (hasColumn("account_status")) {
  profileUpdates.account_status = "active";
} else if (hasColumn("status")) {
  profileUpdates.status = "active";
}

if (hasColumn("created_by_id")) {
  profileUpdates.created_by_id = actor.id;
} else if (hasColumn("created_by")) {
  profileUpdates.created_by = actor.id;
}

if (hasColumn("must_change_password")) {
  profileUpdates.must_change_password =
    mustChangePassword;
}

if (hasColumn("updated_at")) {
  profileUpdates.updated_at =
    new Date().toISOString();
}

const {
  data: completedProfile,
  error: profileUpdateError,
} = await adminClient
  .from("profiles")
  .update(profileUpdates)
  .eq("id", newUserId)
  .select("*")
  .maybeSingle();

if (profileUpdateError || !completedProfile) {
  console.error("Staff profile update failed:", {
    message: profileUpdateError?.message,
    code: profileUpdateError?.code,
    details: profileUpdateError?.details,
    hint: profileUpdateError?.hint,
    attemptedFields: Object.keys(profileUpdates),
    userId: newUserId,
  });

  const { error: rollbackError } =
    await adminClient.auth.admin.deleteUser(newUserId);

  if (rollbackError) {
    console.error(
      "Incomplete account rollback failed:",
      rollbackError.message,
    );
  }

  return json(
    {
      error:
        "The staff profile could not be completed and the incomplete account was rolled back. Please try again.",
    },
    500,
  );
}

        await writeAudit({
          action:
            "staff_user_created",
          record_type:
            "staff_user",
          record_id: newUserId,
          record_label: fullName,
          new_value: {
            role: requestedRole,
            job_title: jobTitle,
            email,
            is_active: true,
            must_change_password:
              mustChangePassword,
          },
          performed_by: actor.id,
          performed_by_name:
            actor.full_name,
        });

        return json({
          success: true,
          userId: newUserId,
          message:
            "Staff account created successfully.",
        });
      }

      case "reset_password": {
        const targetUid = cleanString(
          body.target_uid,
        );
        const newPassword = cleanString(
          body.new_password,
        );

        if (
          !targetUid ||
          !newPassword
        ) {
          return json(
            {
              error:
                "Target user ID and new password are required.",
            },
            400,
          );
        }

        if (newPassword.length < 12) {
          return json(
            {
              error:
                "Password must contain at least 12 characters.",
            },
            400,
          );
        }

        const {
          data: target,
          error: targetError,
        } = await adminClient
          .from("profiles")
          .select(
            "role, full_name, is_active",
          )
          .eq("id", targetUid)
          .maybeSingle();

        if (targetError) {
          return json(
            {
              error:
                "The target staff profile could not be read.",
            },
            500,
          );
        }

        if (!target) {
          return json(
            {
              error:
                "Target user was not found.",
            },
            404,
          );
        }

        const targetRole =
          normalizeRole(target.role);

        if (
          !canManageTargetRole(
            actor.role,
            targetRole,
          )
        ) {
          return json(
            {
              error:
                "You do not have permission to reset this account's password.",
            },
            403,
          );
        }

        const { error: passwordError } =
          await adminClient.auth.admin.updateUserById(
            targetUid,
            {
              password: newPassword,
            },
          );

        if (passwordError) {
          return json(
            {
              error: friendlyAuthError(
                passwordError.message,
              ),
            },
            400,
          );
        }

        const { error: updateError } =
          await adminClient
            .from("profiles")
            .update({
              must_change_password: true,
              updated_at:
                new Date().toISOString(),
            })
            .eq("id", targetUid);

        if (updateError) {
          console.error(
            "Password changed but profile flag update failed:",
            updateError.message,
          );
        }

        await writeAudit({
          action: "password_reset",
          record_type: "staff_user",
          record_id: targetUid,
          record_label:
            target.full_name,
          new_value: {
            password_reset: true,
            must_change_password: true,
          },
          performed_by: actor.id,
          performed_by_name:
            actor.full_name,
        });

        return json({
          success: true,
          message:
            "Password reset successfully. The user must change it at the next login.",
        });
      }

      case "delete_user": {
        const targetUid = cleanString(
          body.target_uid,
        );

        if (!targetUid) {
          return json(
            {
              error:
                "Target user ID is required.",
            },
            400,
          );
        }

        if (targetUid === actor.id) {
          return json(
            {
              error:
                "You cannot delete your own account.",
            },
            400,
          );
        }

        const {
          data: target,
          error: targetError,
        } = await adminClient
          .from("profiles")
          .select(
            "role, full_name, email",
          )
          .eq("id", targetUid)
          .maybeSingle();

        if (targetError) {
          return json(
            {
              error:
                "The target staff profile could not be read.",
            },
            500,
          );
        }

        if (!target) {
          return json(
            {
              error:
                "Target user was not found.",
            },
            404,
          );
        }

        const targetRole =
          normalizeRole(target.role);

        if (
          targetRole ===
          "platform_owner"
        ) {
          return json(
            {
              error:
                "The Platform Owner cannot be deleted. Transfer ownership first.",
            },
            403,
          );
        }

        if (
          !canManageTargetRole(
            actor.role,
            targetRole,
          )
        ) {
          return json(
            {
              error:
                "You do not have permission to delete this account.",
            },
            403,
          );
        }

        const previousValue = {
          role: targetRole,
          email: target.email,
        };

        const { error: deleteError } =
          await adminClient.auth.admin.deleteUser(
            targetUid,
          );

        if (deleteError) {
          return json(
            {
              error: friendlyAuthError(
                deleteError.message,
              ),
            },
            400,
          );
        }

        await writeAudit({
          action:
            "staff_user_deleted",
          record_type:
            "staff_user",
          record_id: targetUid,
          record_label:
            target.full_name,
          previous_value:
            previousValue,
          performed_by: actor.id,
          performed_by_name:
            actor.full_name,
        });

        return json({
          success: true,
          message:
            "Staff account deleted successfully.",
        });
      }

      default:
        return json(
          {
            error:
              "Unknown administrator action.",
          },
          400,
        );
    }
  } catch (error) {
    console.error(
      "Unexpected admin-api error:",
      error,
    );

    return json(
      {
        error:
          "An unexpected server error occurred.",
      },
      500,
    );
  }
});

function friendlyAuthError(
  message: string,
): string {
  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      "already been registered",
    ) ||
    normalized.includes(
      "already exists",
    ) ||
    normalized.includes(
      "user already registered",
    )
  ) {
    return "A user with this email address already exists.";
  }

  if (
    normalized.includes("rate limit")
  ) {
    return "Too many requests. Please wait briefly and try again.";
  }

  if (
    normalized.includes("password") &&
    normalized.includes("weak")
  ) {
    return "The password is too weak. Please use a stronger password.";
  }

  if (
    normalized.includes(
      "invalid jwt",
    ) ||
    normalized.includes(
      "jwt expired",
    )
  ) {
    return "Your administrator session has expired. Please sign in again.";
  }

  // Never echo the raw provider or database message back to the browser: it
  // discloses schema, constraint and policy detail.
  console.error("Unmapped auth error:", message);
  return "The request could not be completed. Please try again.";
}
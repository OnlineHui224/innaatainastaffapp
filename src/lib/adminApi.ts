import { supabase } from './supabase';
import { friendlyError } from './validation';

type AdminApiResult = {
  success: boolean;
  error?: string;
  data?: unknown;
};

type RpcResult = {
  success: boolean;
  message: string;
};

/**
 * Gets and validates the current Supabase access token.
 *
 * This distinguishes a missing browser session from an error returned
 * by the admin-api Edge Function.
 */
async function getValidAccessToken(): Promise<
  { accessToken: string } | { error: string }
> {
  const {
    data: { session: currentSession },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Unable to read Supabase session:', sessionError);

    return {
      error: 'Unable to read your administrator session. Please sign in again.',
    };
  }

  let session = currentSession;

  /*
   * If the locally stored session is missing or has no access token,
   * try refreshing once.
   */
  if (!session?.access_token) {
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError || !refreshedSession?.access_token) {
      console.error('Unable to refresh Supabase session:', refreshError);

      return {
        error: 'Your administrator session has expired. Please sign in again.',
      };
    }

    session = refreshedSession;
  }

  /*
   * Validate the user with Supabase Auth before calling the Edge Function.
   */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(session.access_token);

  if (!userError && user) {
    return {
      accessToken: session.access_token,
    };
  }

  /*
   * The token may have expired between reading and validation.
   * Refresh and validate one final time.
   */
  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (refreshError || !refreshedSession?.access_token) {
    console.error('Session validation failed:', userError, refreshError);

    return {
      error: 'Your administrator session has expired. Please sign in again.',
    };
  }

  const {
    data: { user: refreshedUser },
    error: refreshedUserError,
  } = await supabase.auth.getUser(refreshedSession.access_token);

  if (refreshedUserError || !refreshedUser) {
    console.error(
      'Refreshed session validation failed:',
      refreshedUserError,
    );

    return {
      error: 'Your administrator session is invalid. Please sign in again.',
    };
  }

  return {
    accessToken: refreshedSession.access_token,
  };
}

/**
 * Extracts a useful message returned by a Supabase Edge Function.
 */
async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const defaultMessage = 'The server could not complete the request.';

  if (!error || typeof error !== 'object') {
    return defaultMessage;
  }

  const functionError = error as {
    message?: string;
    context?: Response;
  };

  if (functionError.context) {
    try {
      const responseBody = (await functionError.context.json()) as {
        error?: string;
        message?: string;
      };

      if (responseBody.error) {
        return responseBody.error;
      }

      if (responseBody.message) {
        return responseBody.message;
      }
    } catch {
      // The response may not contain JSON. Fall back to error.message.
    }
  }

  return functionError.message || defaultMessage;
}

/**
 * Calls the protected admin-api Edge Function.
 */
async function callAdminApi(
  body: Record<string, unknown>,
): Promise<AdminApiResult> {
  const authentication = await getValidAccessToken();

  if ('error' in authentication) {
    return {
      success: false,
      error: authentication.error,
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-api', {
      body,
      headers: {
        Authorization: `Bearer ${authentication.accessToken}`,
      },
    });

    if (error) {
      const errorMessage = await getFunctionErrorMessage(error);

      console.error('admin-api Edge Function error:', errorMessage);

      const authenticationFailure =
        /not authenticated|invalid jwt|jwt expired|unauthorized|session/i.test(
          errorMessage,
        );

      return {
        success: false,
        error: authenticationFailure
          ? 'The server rejected your administrator session. Please sign out, sign in again, and retry.'
          : errorMessage,
      };
    }

    /*
     * Some functions return HTTP 200 but include success: false in the body.
     */
    if (
      data &&
      typeof data === 'object' &&
      'success' in data &&
      (data as { success?: boolean }).success === false
    ) {
      const response = data as {
        success: boolean;
        error?: string;
        message?: string;
      };

      return {
        success: false,
        error:
          response.error ||
          response.message ||
          'The server rejected the request.',
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Unable to reach admin-api:', error);

    return {
      success: false,
      error: 'Unable to reach the server. Please try again.',
    };
  }
}

export async function adminCreateUser(params: {
  email: string;
  password: string;
  full_name: string;
  job_title?: string;
  role?: string;
  require_password_change?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const result = await callAdminApi({
    action: 'create_user',
    ...params,
  });

  return {
    success: result.success,
    error: result.error,
  };
}

export async function adminResetPassword(params: {
  target_uid: string;
  new_password: string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await callAdminApi({
    action: 'reset_password',
    ...params,
  });

  return {
    success: result.success,
    error: result.error,
  };
}

export async function adminDeleteUser(params: {
  target_uid: string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await callAdminApi({
    action: 'delete_user',
    ...params,
  });

  return {
    success: result.success,
    error: result.error,
  };
}

/**
 * Calls the change_staff_role RPC.
 * The actor's password is verified server-side.
 */
export async function changeStaffRole(params: {
  target_uid: string;
  new_role: string;
  actor_password: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('change_staff_role', {
    p_target_uid: params.target_uid,
    p_new_role: params.new_role,
    p_actor_password: params.actor_password,
  });

  if (error) {
    console.error('Staff management request failed:', error);
    return {
      success: false,
      error: friendlyError(error),
    };
  }

  const result = data as RpcResult;

  return {
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

export async function suspendStaffAccount(params: {
  target_uid: string;
  actor_password: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('suspend_staff_account', {
    p_target_uid: params.target_uid,
    p_actor_password: params.actor_password,
  });

  if (error) {
    console.error('Staff management request failed:', error);
    return {
      success: false,
      error: friendlyError(error),
    };
  }

  const result = data as RpcResult;

  return {
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

export async function activateStaffAccount(params: {
  target_uid: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('activate_staff_account', {
    p_target_uid: params.target_uid,
  });

  if (error) {
    console.error('Staff management request failed:', error);
    return {
      success: false,
      error: friendlyError(error),
    };
  }

  const result = data as RpcResult;

  return {
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

export async function transferPlatformOwnership(params: {
  target_uid: string;
  actor_password: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc(
    'transfer_platform_ownership',
    {
      p_target_uid: params.target_uid,
      p_actor_password: params.actor_password,
    },
  );

  if (error) {
    console.error('Staff management request failed:', error);
    return {
      success: false,
      error: friendlyError(error),
    };
  }

  const result = data as RpcResult;

  return {
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

export async function requirePasswordChange(params: {
  target_uid: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc(
    'require_password_change',
    {
      p_target_uid: params.target_uid,
    },
  );

  if (error) {
    console.error('Staff management request failed:', error);
    return {
      success: false,
      error: friendlyError(error),
    };
  }

  const result = data as RpcResult;

  return {
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}
/**
 * PERSONAL GEMINI ACCESS — UI STATE MODEL
 * =======================================
 *
 * Supporting infrastructure for the AI-assisted steps inside Flight Document Ops
 * and the Visa & Contract Logger. It is NOT a navigation module.
 *
 * SCOPE OF THIS PHASE — USER EXPERIENCE STATES ONLY.
 *
 * The technical implementation has not been approved, so nothing here performs
 * or describes a real integration. Specifically, this module and every screen
 * built on it:
 *
 *   - makes no OAuth request and holds no token,
 *   - calls no Google or Gemini endpoint,
 *   - creates no Google project,
 *   - stores no credential, anywhere, in any form,
 *   - fetches no real quota figure,
 *   - never falls back to a company or administrator account.
 *
 * The intended future model, which these states are shaped to support: each
 * staff member authorises their own Google identity, and their document
 * processing draws on their own allowance. One member's usage never consumes
 * another's, and never the administrator's. There is no shared company key, no
 * screen where anyone pastes an API key, and no second login — HajjERP/Supabase
 * remains the application's only sign-in.
 */

export type GeminiConnectionState =
  /** Never set up on this account. */
  | 'not_configured'
  /** Staff have begun authorising and the pre-authorisation screen is showing. */
  | 'connecting'
  /** Working through the post-authorisation availability checks. */
  | 'checking'
  /** More than one eligible workspace was found and staff must choose one. */
  | 'selecting_workspace'
  /** Ready to use. */
  | 'connected'
  /** Previously connected; the authorisation has lapsed and must be renewed. */
  | 'reconnect_required'
  /** Authorisation began but was never finished. */
  | 'setup_incomplete'
  /** The staff member's own allowance is exhausted or unavailable. */
  | 'limit_reached'
  /** Gemini itself is temporarily unavailable — distinct from a personal limit. */
  | 'provider_unavailable';

export const GEMINI_STATE_LABELS: Record<GeminiConnectionState, string> = {
  not_configured: 'Not configured',
  connecting: 'Connecting',
  checking: 'Checking access',
  selecting_workspace: 'Workspace selection required',
  connected: 'Connected',
  reconnect_required: 'Reconnect required',
  setup_incomplete: 'Setup incomplete',
  limit_reached: 'Personal limit reached',
  provider_unavailable: 'Service unavailable',
};

/** The states an administrator may see in the staff directory. */
export type GeminiAdminStatus =
  | 'connected'
  | 'not_configured'
  | 'reconnect_required'
  | 'setup_incomplete';

export const GEMINI_ADMIN_STATUS_LABELS: Record<GeminiAdminStatus, string> = {
  connected: 'Connected',
  not_configured: 'Not configured',
  reconnect_required: 'Reconnect required',
  setup_incomplete: 'Setup incomplete',
};

/**
 * Collapses the full connection state to the four an administrator is shown.
 *
 * Transient states (connecting, checking, choosing a workspace) read as an
 * unfinished setup rather than leaking a staff member's moment-to-moment
 * progress into an administrative table. A personal limit or a provider outage
 * is a usage condition, not a configuration one, so both keep reporting the
 * connection as established.
 */
export function toAdminStatus(state: GeminiConnectionState): GeminiAdminStatus {
  switch (state) {
    case 'connected':
    case 'limit_reached':
    case 'provider_unavailable':
      return 'connected';
    case 'reconnect_required':
      return 'reconnect_required';
    case 'connecting':
    case 'checking':
    case 'selecting_workspace':
    case 'setup_incomplete':
      return 'setup_incomplete';
    case 'not_configured':
    default:
      return 'not_configured';
  }
}

/**
 * What an authorised administrator may see about a staff member's connection.
 *
 * Every field here is non-sensitive by construction. API keys, access tokens,
 * refresh tokens, client secrets and passwords are absent from this type and
 * must never be added to it — an administrator has no reason to see any of them,
 * and no HajjERP screen displays them.
 */
export interface StaffGeminiStatus {
  staffId: string;
  staffName: string;
  staffEmail: string;
  status: GeminiAdminStatus;
  /** The Google account the staff member authorised, for identification only. */
  googleAccount: string | null;
  /** Human-readable workspace/project name. Never an internal credential. */
  workspaceName: string | null;
  lastVerifiedAt: string | null;
}

/** An eligible workspace a staff member may pick during setup. */
export interface GeminiWorkspace {
  id: string;
  name: string;
  /** Short display identifier. Not a secret and not a credential. */
  reference: string;
  ready: boolean;
}

/** The named checks shown while access is being established. No percentage. */
export type GeminiCheckStage = 'account' | 'availability' | 'workspace' | 'preparing' | 'almost';

export const GEMINI_CHECK_STAGES: GeminiCheckStage[] = [
  'account',
  'availability',
  'workspace',
  'preparing',
  'almost',
];

export const GEMINI_CHECK_STAGE_LABELS: Record<GeminiCheckStage, string> = {
  account: 'Google account connected',
  availability: 'Checking Gemini availability',
  workspace: 'Checking available workspace',
  preparing: 'Preparing access',
  almost: 'Almost ready',
};

/** True when AI-assisted extraction can be offered. */
export function canExtract(state: GeminiConnectionState): boolean {
  return state === 'connected';
}

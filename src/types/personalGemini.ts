/**
 * PERSONAL GEMINI ACCESS — UI STATE MODEL
 * =======================================
 *
 * Supporting infrastructure for the AI-assisted steps inside Flight Document Ops
 * and the Visa & Contract Logger. It is NOT a navigation module — it lives in
 * the staff member's own account.
 *
 * SCOPE OF THIS PHASE — USER EXPERIENCE STATES ONLY.
 *
 * The Google authorization architecture is not yet technically proven, so the
 * copy here is written as intent, never as a promise. Specifically, this module
 * and every screen built on it:
 *
 *   - performs no OAuth and holds no token,
 *   - calls no Google or Gemini endpoint,
 *   - discovers or creates no Google Cloud project,
 *   - enables no API and fetches no quota,
 *   - stores no credential, anywhere, in any form,
 *   - never falls back to a company or administrator account.
 *
 * The intended model these states are shaped to support: each staff member
 * authorises their own Google identity, and their document processing draws on
 * their own allowance. There is no shared company key, no screen where anyone
 * pastes an API key, and no second login — HajjERP/Supabase remains the
 * application's only sign-in.
 */

/** Every state the personal connection can present. */
export type GeminiState =
  /** Never set up on this account. */
  | 'not_configured'
  /** The HajjERP pre-authorisation screen, before Google is involved. */
  | 'connect_google'
  /** Working through the post-authorisation availability checks. */
  | 'checking'
  /** More than one eligible workspace was found; staff must choose. */
  | 'workspace'
  /** Connected, but nothing on the account is ready to use Gemini. */
  | 'no_workspace'
  /** Authorisation was started and abandoned. */
  | 'cancelled'
  /** Ready to use. */
  | 'connected'
  /** Previously connected; the authorisation must be renewed. */
  | 'reconnect'
  /** The staff member's own allowance cannot serve another request right now. */
  | 'limit'
  /** Gemini itself is down — deliberately distinct from a personal limit. */
  | 'provider';

export interface StatusTone {
  label: string;
  /** Tailwind classes for the status pill and the module banner. */
  chip: string;
  dot: string;
}

export const GEMINI_STATUS: Record<GeminiState, StatusTone> = {
  connected: { label: 'Connected', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-700' },
  reconnect: { label: 'Reconnect required', chip: 'border-amber-400 bg-amber-50 text-amber-800', dot: 'bg-amber-700' },
  limit: { label: 'Personal usage unavailable', chip: 'border-amber-400 bg-amber-50 text-amber-800', dot: 'bg-amber-700' },
  provider: { label: 'Service temporarily unavailable', chip: 'border-slate-300 bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  no_workspace: { label: 'Setup incomplete', chip: 'border-amber-400 bg-amber-50 text-amber-800', dot: 'bg-amber-700' },
  checking: { label: 'Checking access', chip: 'border-brand-300 bg-brand-50 text-brand-800', dot: 'bg-brand-700' },
  connect_google: { label: 'Setting up', chip: 'border-brand-300 bg-brand-50 text-brand-800', dot: 'bg-brand-700' },
  workspace: { label: 'Finishing setup', chip: 'border-brand-300 bg-brand-50 text-brand-800', dot: 'bg-brand-700' },
  cancelled: { label: 'Setup required', chip: 'border-slate-300 bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  not_configured: { label: 'Not configured', chip: 'border-slate-300 bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
};

/** Short label shown on the compact banner inside a module. */
export const BANNER_LABEL: Record<GeminiState, string> = {
  not_configured: 'Setup required',
  connect_google: 'Setup in progress',
  checking: 'Checking access',
  workspace: 'Finish setup',
  no_workspace: 'Setup incomplete',
  cancelled: 'Setup required',
  connected: 'Connected',
  reconnect: 'Reconnect required',
  limit: 'Personal usage unavailable',
  provider: 'Service temporarily unavailable',
};

/** The banner's inline action, where one helps. */
export const BANNER_ACTION: Partial<Record<GeminiState, string>> = {
  not_configured: 'Set up',
  cancelled: 'Set up',
  reconnect: 'Reconnect',
  no_workspace: 'Review setup',
  limit: 'Check connection',
  provider: 'Try again',
};

/**
 * The AI action a module offers in each state.
 *
 * The workflow is never taken away — only the AI-assisted step changes. In every
 * non-connected state the label explains what to do instead, and the note says
 * plainly what is preserved.
 */
export interface ModuleCta {
  label: string;
  note: string;
  /** True only when extraction can actually run. */
  ready: boolean;
}

export const FLIGHT_CTA: Record<GeminiState, ModuleCta> = {
  connected: { label: 'Extract Travel Information', note: 'Upload and extraction work as normal.', ready: true },
  not_configured: { label: 'Set up personal Gemini access to extract', note: 'You can still upload and manage documents. The extract action takes you to setup first.', ready: false },
  connect_google: { label: 'Set up personal Gemini access to extract', note: 'You can still upload and manage documents. The extract action takes you to setup first.', ready: false },
  checking: { label: 'Checking your access…', note: 'Extraction becomes available as soon as the check finishes.', ready: false },
  workspace: { label: 'Finish choosing your workspace', note: 'Extraction becomes available once a workspace is selected.', ready: false },
  no_workspace: { label: 'Finish Gemini setup to extract', note: 'Uploads are kept. Extraction needs your personal access finished first.', ready: false },
  cancelled: { label: 'Set up personal Gemini access to extract', note: 'Nothing was lost. Your selected documents are still here.', ready: false },
  reconnect: { label: 'Reconnect to extract', note: 'The workflow is retained. The AI action resumes after you reconnect.', ready: false },
  limit: { label: 'Try extraction again later', note: 'Anything already extracted and reviewed stays on screen and can still be corrected.', ready: false },
  provider: { label: 'Try again', note: 'Your uploads and reviewed data are preserved while the provider is down.', ready: false },
};

export const VISA_CTA: Record<GeminiState, ModuleCta> = {
  connected: { label: 'Extract Visa Identity', note: 'Identity extraction available for the uploaded visa document.', ready: true },
  not_configured: { label: 'Set up personal Gemini access to extract', note: 'Operational details, hotels and dates are unaffected. Identity extraction needs setup first.', ready: false },
  connect_google: { label: 'Set up personal Gemini access to extract', note: 'Operational details, hotels and dates are unaffected. Identity extraction needs setup first.', ready: false },
  checking: { label: 'Checking your access…', note: 'The rest of the form stays editable while the check runs.', ready: false },
  workspace: { label: 'Finish choosing your workspace', note: 'The rest of the form stays editable while you finish choosing.', ready: false },
  no_workspace: { label: 'Finish Gemini setup to extract', note: 'The record can still be completed and saved with staff-entered information.', ready: false },
  cancelled: { label: 'Set up personal Gemini access to extract', note: 'Nothing was lost. The form keeps everything you have entered.', ready: false },
  reconnect: { label: 'Reconnect to extract', note: 'Staff-entered fields stay editable; only AI extraction pauses.', ready: false },
  limit: { label: 'Try extraction again later', note: 'Already-extracted identity values stay visible and can still be reviewed and corrected.', ready: false },
  provider: { label: 'Try again', note: 'The record can still be completed and saved; retry extraction when the provider returns.', ready: false },
};

/** The record line shown on the account panel once a connection exists. */
export const RECORD_STATUS: Partial<Record<GeminiState, string>> = {
  connected: 'Connected',
  reconnect: 'Reconnect required',
  limit: 'Connected — usage unavailable',
  provider: 'Connected — provider unavailable',
};

/** States in which the account record (Google account, workspace, last verified) is shown. */
export function showsAccountRecord(state: GeminiState): boolean {
  return state === 'connected' || state === 'reconnect' || state === 'limit' || state === 'provider';
}

/** True only when AI-assisted extraction can actually run. */
export function canExtract(state: GeminiState): boolean {
  return state === 'connected';
}

/** The named checks shown while access is established. No percentage. */
export const CHECK_STAGES = [
  'Google account connected',
  'Checking Gemini availability',
  'Checking available AI workspace',
  'Preparing personal access',
  'Verifying connection',
] as const;

/** An eligible workspace a staff member may pick during setup. */
export interface GeminiWorkspace {
  id: string;
  name: string;
  /** Short display identifier. Not a secret and not a credential. */
  ident: string;
  status: string;
  /** False when additional Google-side setup would be needed first. */
  ok: boolean;
  recommended: boolean;
  note: string;
}

// ── Administrator readiness ──

export type ReadinessStatus =
  | 'CONNECTED'
  | 'NOT CONFIGURED'
  | 'RECONNECT REQUIRED'
  | 'SETUP INCOMPLETE'
  | 'PERSONAL ACCESS UNAVAILABLE';

/**
 * What an authorised administrator may see about a staff member's connection.
 *
 * Every field here is non-sensitive by construction. API keys, access tokens,
 * refresh tokens, client secrets and passwords are absent from this type and
 * must never be added to it. There is deliberately no field, and no action,
 * that would let an administrator use another person's access.
 */
export interface StaffReadiness {
  name: string;
  email: string;
  status: ReadinessStatus;
  /** Identifies the authorised account. Never a credential. */
  googleAccount: string;
  workspace: string;
  lastVerified: string;
}

export function readinessTone(status: ReadinessStatus): string {
  if (status === 'CONNECTED') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'NOT CONFIGURED') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-amber-400 bg-amber-50 text-amber-800';
}

export function readinessDot(status: ReadinessStatus): string {
  if (status === 'CONNECTED') return 'bg-emerald-700';
  if (status === 'NOT CONFIGURED') return 'bg-slate-500';
  return 'bg-amber-700';
}

/**
 * PERSONAL GEMINI ACCESS — DEMONSTRATION FIXTURES
 * ===============================================
 *
 * Local, deterministic data so every connection state can be reviewed while the
 * Google authorization architecture is unproven and unbuilt.
 *
 * SAFETY CONTRACT — every one of these holds:
 *
 *   - No credential of any kind: no API key, access token, refresh token or
 *     client secret appears in this file, and none may ever be added to it.
 *   - No Supabase read or write.
 *   - No Google or Gemini call.
 *   - No OAuth, no project discovery, no project creation, no quota fetch.
 *   - No network request of any kind.
 *   - Nothing here is ever persisted.
 *
 * The staff names and Google addresses below are invented for demonstration.
 * When the real integration is built and approved, these are replaced by data
 * from that integration and this file is deleted.
 */

import type { GeminiWorkspace, StaffReadiness } from '@/types/personalGemini';

/** The signed-in staff member's demonstration connection record. */
export const DEMO_ACCOUNT = {
  googleAccount: 'kamal.a@gmail.com',
  workspace: 'Inna Ataina Operations',
  lastVerified: '16 Aug 2026, 09:42',
};

/**
 * Eligible workspaces offered at the choose-a-workspace step.
 *
 * One is deliberately not ready, so the interface can show that some accounts
 * need further Google-side setup before they can be used — rather than implying
 * every workspace will simply work.
 */
export const DEMO_WORKSPACES: GeminiWorkspace[] = [
  {
    id: 'ops',
    name: 'Inna Ataina Operations',
    ident: 'inna-ops-2026',
    status: 'Gemini ready',
    ok: true,
    recommended: true,
    note: 'Already set up for AI-assisted document processing.',
  },
  {
    id: 'personal',
    name: 'Kamal Adewale (personal)',
    ident: 'kamal-workspace',
    status: 'Gemini ready',
    ok: true,
    recommended: false,
    note: 'Your own Google workspace. Usage counts against your personal allowance.',
  },
  {
    id: 'legacy',
    name: 'Ataina Legacy Reporting',
    ident: 'ataina-legacy-01',
    status: 'Setup required',
    ok: false,
    recommended: false,
    note: 'Additional Google-side setup would be needed before this can be used.',
  },
];

/**
 * Administrator readiness rows.
 *
 * Readiness only. There is no credential here, and no row carries anything an
 * administrator could use to act as the staff member.
 */
export const DEMO_STAFF_READINESS: StaffReadiness[] = [
  { name: 'Kamal Adewale', email: 'kamal.adewale@innaataina.com', status: 'CONNECTED', googleAccount: 'kamal.a@gmail.com', workspace: 'Inna Ataina Operations', lastVerified: '16 Aug 2026, 09:42' },
  { name: 'Zainab Musa', email: 'zainab.musa@innaataina.com', status: 'CONNECTED', googleAccount: 'z.musa@gmail.com', workspace: 'Inna Ataina Operations', lastVerified: '16 Aug 2026, 08:15' },
  { name: 'Ibrahim Sule', email: 'ibrahim.sule@innaataina.com', status: 'RECONNECT REQUIRED', googleAccount: 'i.sule@gmail.com', workspace: 'Inna Ataina Operations', lastVerified: '11 Aug 2026, 17:03' },
  { name: 'Fatima Bello', email: 'fatima.bello@innaataina.com', status: 'SETUP INCOMPLETE', googleAccount: 'f.bello@gmail.com', workspace: 'No eligible workspace', lastVerified: '14 Aug 2026, 12:20' },
  { name: 'Yusuf Danjuma', email: 'yusuf.danjuma@innaataina.com', status: 'PERSONAL ACCESS UNAVAILABLE', googleAccount: 'y.danjuma@gmail.com', workspace: 'Inna Ataina Operations', lastVerified: '16 Aug 2026, 09:05' },
  { name: 'Aisha Lawal', email: 'aisha.lawal@innaataina.com', status: 'NOT CONFIGURED', googleAccount: 'Not connected', workspace: '—', lastVerified: 'Never' },
];

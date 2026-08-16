import { Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { RoleBadge } from '@/components/ui/Badge';
import { DataGrid, DataRow, Panel } from '@/components/ui/Panel';
import { PersonalGeminiPanel } from '@/components/gemini/PersonalGeminiPanel';
import { usePersonalGemini } from '@/context/personalGeminiStore';
import { GEMINI_STATUS, type GeminiState } from '@/types/personalGemini';
import { cn } from '@/lib/utils';

/** The states the preview switcher can jump to, in the approved order. */
const PREVIEW_STATES: Array<[GeminiState, string]> = [
  ['not_configured', 'Setup required'],
  ['connect_google', 'Connect Google'],
  ['checking', 'Checking'],
  ['workspace', 'Choose workspace'],
  ['no_workspace', 'No eligible workspace'],
  ['connected', 'Connected'],
  ['reconnect', 'Reconnect required'],
  ['limit', 'Usage unavailable'],
  ['provider', 'Provider outage'],
  ['cancelled', 'Auth cancelled'],
];

/**
 * My Account.
 *
 * Personal Gemini Access lives here, in the staff member's own account —
 * deliberately not as an Operations sidebar module, because it is supporting
 * infrastructure rather than a business capability.
 *
 * HajjERP/Supabase remains the only sign-in. Nothing on this page authenticates
 * anything, and no second login is introduced.
 */
export default function MyAccountPage() {
  const { profile } = useAuth();
  const { state, go, runCheck } = usePersonalGemini();

  return (
    <>
      <PageHeader
        eyebrow="Account & access"
        title="My Account"
        subtitle="Your HajjERP profile and the personal authorizations attached to it."
      />

      <div className="flex flex-col gap-5">
        <Panel title="Signed in to HajjERP as">
          <DataGrid columns={3}>
            <DataRow label="Staff member">{profile?.full_name || 'Staff member'}</DataRow>
            <DataRow label="Email">{profile?.email || '—'}</DataRow>
            <DataRow label="System role">
              {profile ? <RoleBadge role={profile.role} /> : '—'}
            </DataRow>
          </DataGrid>
          <p className="mt-3.5 border-t border-slate-200 pt-2.5 text-xs text-slate-600">
            Your sign-in is managed by HajjERP. Personal Gemini Access below is a separate,
            additional authorization and never replaces it.
          </p>
        </Panel>

        <section>
          <h2 className="font-display text-base font-extrabold text-navy-900">
            Personal Gemini Access
          </h2>
          <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-slate-600">
            Your own Google authorization for AI-assisted document processing in Flight Document Ops
            and Visa &amp; Contract Logger. It is separate from your HajjERP sign-in, and it is not
            shared with other staff.
          </p>

          <p className="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-l-[3px] border-slate-300 border-l-brand-600 bg-white px-3.5 py-2.5">
            <Info className="h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden="true" />
            <span className="min-w-0 text-xs text-slate-700">
              Design phase: the Google authorization architecture is not yet technically proven, so
              the setup copy below is written as intent, never as a promise. No connection is made
              and no credential is stored.
            </span>
          </p>

          {/* Development-only state switcher, so every approved state can be
              reviewed without a backend. It changes local UI state only. */}
          <div
            role="group"
            aria-label="Preview a connection state"
            className="mb-4 mt-4 flex flex-wrap items-center gap-2"
          >
            <span className="mr-0.5 text-2xs font-bold uppercase tracking-[0.1em] text-slate-500">
              Preview state
            </span>
            {PREVIEW_STATES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={state === value}
                onClick={() => (value === 'checking' ? runCheck() : go(value))}
                className={cn(
                  'min-h-[44px] rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors sm:min-h-[32px]',
                  state === value
                    ? 'border-navy-800 bg-navy-800 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <PersonalGeminiPanel />

          <p className="mt-2.5 text-xs text-slate-500">
            Currently previewing the <strong className="font-semibold text-slate-700">{GEMINI_STATUS[state].label}</strong> state.
          </p>
        </section>
      </div>
    </>
  );
}

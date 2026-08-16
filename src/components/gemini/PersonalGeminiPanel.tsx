import { useState } from 'react';
import { AlertTriangle, Check, CloudOff, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePersonalGemini } from '@/context/personalGeminiStore';
import { DEMO_ACCOUNT, DEMO_WORKSPACES } from '@/lib/fixtures/personalGeminiDemo';
import {
  CHECK_STAGES,
  GEMINI_STATUS,
  RECORD_STATUS,
  showsAccountRecord,
} from '@/types/personalGemini';

const H3 = 'font-display text-[1.0625rem] font-extrabold text-navy-900';
const BODY = 'text-[0.8125rem] leading-relaxed text-slate-700';
const KEY = 'text-2xs font-bold uppercase tracking-[0.11em] text-slate-500';

/** Explanatory block used by the reconnect, limit, provider and no-workspace states. */
function Explainer({
  tone,
  icon,
  title,
  happened,
  next,
}: {
  tone: 'warning' | 'neutral';
  icon: React.ReactNode;
  title: string;
  happened: string;
  next: string;
}) {
  return (
    <div
      className={cn(
        'mb-4 flex items-start gap-3 rounded-lg border px-4 py-3.5',
        tone === 'warning'
          ? 'border-amber-400 bg-amber-50'
          : 'border-l-[3px] border-slate-300 border-l-slate-500 bg-slate-50',
      )}
    >
      <span className="mt-px shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className={cn(H3, 'mb-1.5 text-base')}>{title}</h3>
        <p className={cn(BODY, 'mb-1')}>
          <strong className="font-bold text-navy-900">What happened:</strong> {happened}
        </p>
        <p className={BODY}>
          <strong className="font-bold text-navy-900">What you can do:</strong> {next}
        </p>
      </div>
    </div>
  );
}

/**
 * The Personal Gemini panel in a staff member's own account.
 *
 * Every connection state renders here. Nothing in this component performs an
 * authorization, contacts Google or Gemini, or stores a credential — the state
 * is local to the session. Setup copy is written as intent, because the
 * architecture behind it is not yet technically proven.
 *
 * Staff are never asked for an API key, password or token, and no such field
 * exists anywhere in this file.
 */
export function PersonalGeminiPanel() {
  const { state, checkStage, workspaceId, setWorkspaceId, go, runCheck } = usePersonalGemini();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const tone = GEMINI_STATUS[state];
  const picked = DEMO_WORKSPACES.find((w) => w.id === workspaceId);
  const canUseWorkspace = Boolean(picked?.ok);

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-slate-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3">
          <span className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-navy-800" aria-hidden="true" />
            <span className="text-2xs font-bold uppercase tracking-[0.13em] text-navy-900">
              Personal Gemini Access
            </span>
          </span>
          <span
            aria-live="polite"
            className={cn(
              'inline-flex items-center gap-2 rounded border px-2.5 py-1',
              'text-2xs font-bold uppercase tracking-wide',
              tone.chip,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
            {tone.label}
          </span>
        </div>

        <div className="px-4 pb-5 pt-4.5">
          {state === 'not_configured' && (
            <div className="max-w-prose">
              <h3 className={cn(H3, 'mb-1.5')}>Set up your personal Gemini access</h3>
              <p className={cn(BODY, 'mb-2.5')}>
                Connect your Google account to enable AI-assisted document processing for your
                HajjERP account. Your connection is individual to you and is not shared with other
                staff.
              </p>
              <ul className={cn(BODY, 'mb-4 list-disc space-y-1 pl-5')}>
                <li>
                  Intended for reading the documents you upload in Flight Document Ops and Visa &amp;
                  Contract Logger.
                </li>
                <li>Your HajjERP sign-in stays as it is — this is an additional authorization.</li>
                <li>You can disconnect at any time without affecting your HajjERP account.</li>
              </ul>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  onClick={() => go('connect_google')}
                  className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
                >
                  Set Up My Gemini Access
                </Button>
                <Button variant="secondary" onClick={() => go('not_configured')} className="min-h-[44px]">
                  Not now
                </Button>
              </div>
            </div>
          )}

          {state === 'connect_google' && (
            <div className="max-w-prose">
              <h3 className={cn(H3, 'mb-1.5')}>Connect your Google account</h3>
              <p className={cn(BODY, 'mb-3.5')}>
                Choose the Google account you want to use for your personal AI access. You will
                finish this on Google's own sign-in page, then return to HajjERP.
              </p>
              <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3">
                <p className={cn(KEY, 'mb-1.5')}>What HajjERP will ask for</p>
                <p className={BODY}>
                  Permission to use your Google account's Gemini access on your behalf, for documents
                  you upload yourself. You will never be asked to enter or paste an API key, password
                  or authorization token.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="secondary" onClick={runCheck} className="min-h-[44px]">
                  Continue with Google
                </Button>
                <Button variant="secondary" onClick={() => go('cancelled')} className="min-h-[44px]">
                  Cancel
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Google's sign-in and permission screens are shown by Google, outside HajjERP.
              </p>
            </div>
          )}

          {state === 'checking' && (
            <div className="max-w-prose">
              <h3 className={cn(H3, 'mb-1')}>Preparing your personal access</h3>
              <p className={cn(BODY, 'mb-4')}>
                This usually takes a few seconds. You can leave this page open.
              </p>
              <ol aria-live="polite" className="mb-4.5 flex flex-col gap-0.5">
                {CHECK_STAGES.map((label, index) => {
                  const done = index < checkStage;
                  const active = index === checkStage;
                  return (
                    <li
                      key={label}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                        active ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white',
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                        {done ? (
                          <Check className="h-4 w-4 text-emerald-700" />
                        ) : active ? (
                          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-600" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-[0.8125rem]',
                          active ? 'font-bold text-navy-900' : done ? 'text-navy-900' : 'text-slate-500',
                        )}
                      >
                        {label}
                      </span>
                      <span
                        className={cn(
                          'ml-auto text-2xs font-bold uppercase tracking-wide',
                          done ? 'text-emerald-700' : active ? 'text-brand-800' : 'text-slate-500',
                        )}
                      >
                        {done ? 'Done' : active ? 'Working' : 'Waiting'}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <Button variant="secondary" onClick={() => go('cancelled')} className="min-h-[44px]">
                Cancel
              </Button>
            </div>
          )}

          {state === 'workspace' && (
            <div className="max-w-3xl">
              <h3 className={cn(H3, 'mb-1.5')}>Choose where to use Gemini</h3>
              <p className={cn(BODY, 'mb-3.5')}>
                Your Google account has more than one eligible workspace. Pick the one HajjERP should
                use for your AI-assisted processing. If you only ever have one, you will not see this
                step.
              </p>

              <div role="radiogroup" aria-label="Available workspaces" className="mb-4 flex flex-col gap-2.5">
                {DEMO_WORKSPACES.map((workspace, index) => {
                  const selected = workspace.id === workspaceId;
                  return (
                    <div
                      key={workspace.id}
                      role="radio"
                      aria-checked={selected}
                      aria-disabled={!workspace.ok}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setWorkspaceId(workspace.id)}
                      onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          event.preventDefault();
                          setWorkspaceId(workspace.id);
                        }
                        if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
                          event.preventDefault();
                          const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
                          const next =
                            DEMO_WORKSPACES[
                              (index + step + DEMO_WORKSPACES.length) % DEMO_WORKSPACES.length
                            ];
                          setWorkspaceId(next.id);
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3.5 transition-colors',
                        selected ? 'border-navy-800 bg-slate-50' : 'border-slate-300 bg-white hover:border-brand-400',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 bg-white',
                          selected ? 'border-navy-800' : 'border-slate-400',
                        )}
                        aria-hidden="true"
                      >
                        <span className={cn('h-2 w-2 rounded-full', selected && 'bg-navy-800')} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm font-extrabold text-navy-900">{workspace.name}</span>
                          <span
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide',
                              workspace.ok
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-amber-400 bg-amber-50 text-amber-800',
                            )}
                          >
                            {workspace.status}
                          </span>
                          {workspace.recommended && (
                            <span className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-brand-800">
                              Recommended
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{workspace.ident}</span>
                        <span className="mt-1 block text-xs text-slate-700">{workspace.note}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  onClick={() => canUseWorkspace && go('connected')}
                  disabled={!canUseWorkspace}
                  className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
                >
                  Use This Workspace
                </Button>
                <Button variant="secondary" onClick={() => go('cancelled')} className="min-h-[44px]">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {state === 'no_workspace' && (
            <div className="max-w-prose">
              <Explainer
                tone="warning"
                icon={<AlertTriangle className="h-[18px] w-[18px] text-amber-700" />}
                title="Gemini setup required"
                happened="your Google account connected successfully, but HajjERP did not find a workspace on it that is ready to use Gemini."
                next="some additional Google-side setup may be needed before your personal Gemini access can be used. Review the setup options, or try again if you have just changed something on your Google account."
              />
              <div className="flex flex-wrap items-center gap-2.5">
                <Button className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900">
                  Review setup options
                </Button>
                <Button variant="secondary" onClick={runCheck} className="min-h-[44px]">
                  Try again
                </Button>
                <Button variant="ghost" onClick={() => go('cancelled')} className="min-h-[44px]">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {state === 'cancelled' && (
            <div className="max-w-prose">
              <h3 className={cn(H3, 'mb-1.5')}>Google connection was not completed</h3>
              <p className={cn(BODY, 'mb-4')}>
                Nothing was changed on your account. You can try again whenever you are ready — the
                rest of HajjERP works as normal in the meantime.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  onClick={() => go('connect_google')}
                  className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {showsAccountRecord(state) && (
            <div>
              {state === 'reconnect' && (
                <Explainer
                  tone="warning"
                  icon={<RefreshCw className="h-[18px] w-[18px] text-amber-700" />}
                  title="Reconnect Personal Gemini Access"
                  happened="your Google authorization needs to be renewed before AI-assisted document processing can continue."
                  next="reconnect the same Google account below. Your uploaded work and operational data are untouched, and no other staff account is used in the meantime."
                />
              )}
              {state === 'limit' && (
                <Explainer
                  tone="warning"
                  icon={<Clock className="h-[18px] w-[18px] text-amber-700" />}
                  title="Personal Gemini access temporarily unavailable"
                  happened="your personal Gemini access cannot process another request right now. Your connection itself is still in place."
                  next="try again later, or check the connection below. Everything you have already uploaded and reviewed stays exactly as it is."
                />
              )}
              {state === 'provider' && (
                <Explainer
                  tone="neutral"
                  icon={<CloudOff className="h-[18px] w-[18px] text-slate-600" />}
                  title="Gemini service temporarily unavailable"
                  happened="the AI provider is currently unavailable. This is not related to your account or your own usage."
                  next="try again, or continue later. Your HajjERP data and uploaded workflow remain intact."
                />
              )}

              <dl className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-x-6 gap-y-3.5">
                {[
                  ['Status', RECORD_STATUS[state] ?? 'Connected'],
                  ['Google account', DEMO_ACCOUNT.googleAccount],
                  ['Workspace', picked?.name ?? DEMO_ACCOUNT.workspace],
                  ['Last verified', DEMO_ACCOUNT.lastVerified],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className={KEY}>{k}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-navy-900">{v}</dd>
                  </div>
                ))}
              </dl>

              {/* Approved wording. Deliberately about what staff and administrators
                  are shown — not a claim about what the backend does or does not store. */}
              <p className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                You will never be asked to enter or paste an API key, password or authorization
                token. Connection credentials are not displayed to staff or administrators.
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                {state === 'reconnect' ? (
                  <>
                    <Button
                      onClick={() => go('connect_google')}
                      className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
                    >
                      Reconnect Google Account
                    </Button>
                    <Button variant="secondary" onClick={() => go('connected')} className="min-h-[44px]">
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    {state === 'provider' && (
                      <Button
                        onClick={() => go('connected')}
                        className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
                      >
                        Try again
                      </Button>
                    )}
                    <Button variant="secondary" onClick={runCheck} className="min-h-[44px]">
                      Check connection
                    </Button>
                    {state === 'limit' && (
                      <Button variant="secondary" className="min-h-[44px]">
                        Try again later
                      </Button>
                    )}
                    {(state === 'limit' || state === 'provider') && (
                      <Button variant="secondary" className="min-h-[44px]">
                        Help
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => setDisconnectOpen(true)}
                      className="min-h-[44px] border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Built on the platform ConfirmDialog, so it inherits focus trapping,
          Escape handling, scroll locking and focus restoration. */}
      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Personal Gemini Access?"
        confirmLabel="Disconnect Personal Gemini"
        cancelLabel="Cancel"
        danger
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={() => {
          setDisconnectOpen(false);
          go('not_configured');
        }}
        message={
          <>
            <p className="mb-2">
              AI-assisted extraction will stop working for your HajjERP account until you connect
              again. Flight Document Ops and Visa &amp; Contract Logger stay available — uploads,
              staff-entered fields and existing records are unaffected.
            </p>
            <p>Your HajjERP account and sign-in are not changed in any way.</p>
          </>
        }
      />
    </>
  );
}

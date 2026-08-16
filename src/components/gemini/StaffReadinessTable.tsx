import { cn } from '@/lib/utils';
import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { DEMO_STAFF_READINESS } from '@/lib/fixtures/personalGeminiDemo';
import { readinessDot, readinessTone, type StaffReadiness } from '@/types/personalGemini';

function StatusPill({ status }: { status: StaffReadiness['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5',
        'text-2xs font-bold uppercase tracking-wide',
        readinessTone(status),
      )}
    >
      <span className={cn('h-1 w-1 shrink-0 rounded-full', readinessDot(status))} aria-hidden="true" />
      {status}
    </span>
  );
}

const KEY = 'text-2xs font-bold uppercase tracking-[0.1em] text-slate-500';

/**
 * Personal Gemini readiness across staff accounts, for administrators.
 *
 * READINESS ONLY. This surface answers one question — is this staff member able
 * to use AI-assisted processing — so an administrator knows who to ask to
 * reconnect.
 *
 * It deliberately shows no credential of any kind: no API key, password, access
 * token, refresh token or client secret appears here or in the type behind it.
 * There is also no action to act as, borrow or impersonate another person's
 * connection, because one person's access is never another's to use.
 *
 * Below `md` the table becomes stacked cards rather than scrolling sideways.
 */
export function StaffReadinessTable() {
  const rows = DEMO_STAFF_READINESS;

  return (
    <Panel
      title="Personal Gemini readiness"
      description="Whether each staff member can use AI-assisted document processing. Connection credentials are not shown, and an administrator cannot use another person's access."
      bodyClassName="p-0"
      actions={
        <Badge tone="caution" icon={<FlaskConical className="h-3 w-3 shrink-0" aria-hidden="true" />}>
          Preview data
        </Badge>
      }
    >
      {/* Personal Gemini is not yet connected to anything. These rows are local
          demonstration data so the readiness view can be reviewed — they are not
          live connection records and nothing here was read from or written to
          the database. */}
      <p className="border-b border-slate-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
        <strong className="font-bold">Demonstration data.</strong> Personal Gemini Access is not yet
        connected, so no staff member has a real connection to report. These rows are local preview
        data — they are not live records and are not stored.
      </p>
      {/* Phone and small tablet: one card per staff member */}
      <ul className="divide-y divide-slate-200 md:hidden">
        {rows.map((row) => (
          <li key={row.email} className="px-4 py-3.5">
            <p className="text-sm font-extrabold text-navy-900">{row.name}</p>
            <p className="mb-2.5 break-words text-xs text-slate-500">{row.email}</p>
            <StatusPill status={row.status} />
            <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-x-3.5 gap-y-2.5">
              <div className="min-w-0">
                <dt className={KEY}>Google account</dt>
                <dd className="mt-0.5 break-words text-xs text-slate-700">{row.googleAccount}</dd>
              </div>
              <div className="min-w-0">
                <dt className={KEY}>Workspace</dt>
                <dd className="mt-0.5 break-words text-xs text-slate-700">{row.workspace}</dd>
              </div>
              <div className="min-w-0">
                <dt className={KEY}>Last verified</dt>
                <dd className="mt-0.5 text-xs text-slate-700">{row.lastVerified}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      {/* md and up: full table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Personal Gemini readiness for {rows.length} staff accounts
          </caption>
          <thead>
            <tr>
              {['Staff member', 'Status', 'Google account', 'Workspace', 'Last verified'].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className="border-b border-slate-200 px-4 py-2.5 text-left text-2xs font-bold uppercase tracking-[0.1em] text-slate-500"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.email}>
                <td className="border-b border-slate-100 px-4 py-3 align-top">
                  <p className="text-[0.8125rem] font-bold text-navy-900">{row.name}</p>
                  <p className="break-words text-xs text-slate-500">{row.email}</p>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">
                  <StatusPill status={row.status} />
                </td>
                <td className="border-b border-slate-100 px-4 py-3 align-top text-[0.8125rem] text-slate-700">
                  <span className="break-words">{row.googleAccount}</span>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 align-top text-[0.8125rem] text-slate-700">
                  {row.workspace}
                </td>
                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 align-top text-[0.8125rem] text-slate-700">
                  {row.lastVerified}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
        Administrators can see whether a staff member is ready to use AI-assisted processing, and ask
        them to reconnect. They are not shown another person's connection credentials and cannot use
        their access.
      </p>
    </Panel>
  );
}

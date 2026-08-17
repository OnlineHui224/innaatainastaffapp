import { AlertTriangle, Link2, Link2Off, RefreshCw, TableProperties } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
import { canSyncToOfficeRegister, syncActionLabel } from '@/lib/visaSheetSync';
import {
  PILGRIM_MATCH_LABELS,
  SYNC_STATUS_LABELS,
  recordHeadline,
  responsibilityLabel,
  type VisaContractRecord,
} from '@/types/visaContract';

/**
 * The live state of the Visa & Contract record behind the case on screen.
 *
 * Three states are shown side by side rather than merged, because they answer
 * different questions and one does not imply another: has the identity been
 * reviewed, is the traveller tied to a pilgrim, and has the office spreadsheet
 * been updated. A record that is Reviewed / Confirmed and Pending Pilgrim Match
 * is complete and valid.
 *
 * Presentation is deliberately plain — a compact bar of labelled facts, not a
 * dashboard card. Colour appears only where it carries meaning.
 */

function Cell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'pending';
}) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <dt className="text-2xs font-bold uppercase tracking-[0.11em] text-slate-500">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-sm font-semibold',
          tone === 'good' && 'text-emerald-800',
          tone === 'pending' && 'text-amber-800',
          tone === 'neutral' && 'text-navy-900',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function RecordStatusBar({
  record,
  persistFailed,
  retrying,
  onRetry,
  syncing = false,
  onSync,
}: {
  record: VisaContractRecord | null;
  /** The case has values but no database row behind it. */
  persistFailed: boolean;
  retrying: boolean;
  onRetry: () => void;
  /** An office-register synchronisation is in flight. */
  syncing?: boolean;
  /** Omitted where the office register is not actionable from this screen. */
  onSync?: () => void;
}) {
  /* No record and no failure means nothing has been started yet — the officer
     is still on step 1, and an empty status bar would be noise. */
  if (!record && !persistFailed) return null;

  if (!record) {
    return (
      <div
        role="alert"
        className="rounded-lg border-2 border-red-700 bg-white px-4 py-3.5"
      >
        <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
          This Visa case is not yet saved to HajjERP. Retry saving.
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-slate-700">
          The document was read and the values below are kept, but no Visa &amp; Contract record
          exists yet, so responsibility tracking has not started for this traveller. Retrying saves
          the record only — the document is not read again.
        </p>
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            loading={retrying}
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Retry saving
          </Button>
        </div>
      </div>
    );
  }

  const confirmed = record.record_status === 'REVIEWED_CONFIRMED';
  const matched = record.pilgrim_match_status === 'MATCHED';
  const synced = record.spreadsheet_sync_status === 'SYNCED';
  /* Every confirmed record that is not synced is actionable, whatever the
     reason — never sent, left pending on a missing month tab, or failed. That
     is deliberate: records confirmed before this existed are not back-filled
     automatically, and a browser closed mid-sync must leave a way back. */
  const canSync = Boolean(onSync) && canSyncToOfficeRegister(record);

  return (
    <section
      aria-label="Visa and contract record state"
      className="overflow-hidden rounded-lg border border-slate-300 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h2 className="text-2xs font-bold uppercase tracking-[0.11em] text-navy-900">
          Visa &amp; Contract record
        </h2>
        <span className="inline-flex items-center gap-1.5 text-2xs text-slate-600">
          {matched ? (
            <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <Link2Off className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <Identifier value={record.id.slice(0, 8)} />
        </span>
      </div>

      <dl className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        <Cell label="Status" value={recordHeadline(record)} tone={confirmed ? 'good' : 'pending'} />
        <Cell
          label="Pilgrim"
          value={PILGRIM_MATCH_LABELS[record.pilgrim_match_status]}
          tone={matched ? 'good' : 'pending'}
        />
        <Cell label="Responsibility" value={responsibilityLabel(record)} />
        <Cell
          label="Office register"
          value={
            synced && record.spreadsheet_tab
              ? `${SYNC_STATUS_LABELS.SYNCED} — ${record.spreadsheet_tab}`
              : SYNC_STATUS_LABELS[record.spreadsheet_sync_status]
          }
          tone={synced ? 'good' : 'neutral'}
        />
      </dl>

      {/* Stated explicitly so nobody reads "Pending Pilgrim Match" as a fault. */}
      {confirmed && !matched && (
        <p className="border-t border-slate-200 bg-white px-4 py-2.5 text-xs leading-relaxed text-slate-600">
          This record is complete. The traveller is not yet in Pilgrims, which does not affect the
          company&rsquo;s responsibility for this visa — it can be linked later.
        </p>
      )}

      {/*
        The office register is a copy, so its state is reported here rather than
        alarmed about. What the officer needs is the reason and a way to act on
        it — the server writes both, and neither is inferred in the browser.
      */}
      {canSync && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-navy-900">
              {record.spreadsheet_sync_status === 'NOT_SYNCED'
                ? 'Not yet written to the office register.'
                : 'The office register is not up to date for this record.'}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
              {record.sync_error ??
                'This record is confirmed in HajjERP. Syncing adds or updates its row in the office spreadsheet.'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSync}
            loading={syncing}
            icon={<TableProperties className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {syncActionLabel(record)}
          </Button>
        </div>
      )}

      {synced && record.last_synced_at && (
        <p className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
          Written to the office register
          {record.spreadsheet_tab ? ` (${record.spreadsheet_tab} tab)` : ''} on{' '}
          {new Date(record.last_synced_at).toLocaleString()}.
        </p>
      )}
    </section>
  );
}

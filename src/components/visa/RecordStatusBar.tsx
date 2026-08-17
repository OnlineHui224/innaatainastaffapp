import { AlertTriangle, Link2, Link2Off, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
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
}: {
  record: VisaContractRecord | null;
  /** The case has values but no database row behind it. */
  persistFailed: boolean;
  retrying: boolean;
  onRetry: () => void;
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
        <Cell label="Office register" value={SYNC_STATUS_LABELS[record.spreadsheet_sync_status]} />
      </dl>

      {/* Stated explicitly so nobody reads "Pending Pilgrim Match" as a fault. */}
      {confirmed && !matched && (
        <p className="border-t border-slate-200 bg-white px-4 py-2.5 text-xs leading-relaxed text-slate-600">
          This record is complete. The traveller is not yet in Pilgrims, which does not affect the
          company&rsquo;s responsibility for this visa — it can be linked later.
        </p>
      )}
    </section>
  );
}

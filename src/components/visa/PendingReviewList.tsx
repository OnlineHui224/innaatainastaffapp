import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { formatDate } from '@/lib/priority';
import { fetchPendingReviewRecords } from '@/lib/visaContractRecords';
import {
  ENTRY_SOURCE_LABELS,
  responsibilityLabel,
  type VisaContractRecord,
} from '@/types/visaContract';

/**
 * Visa cases awaiting review, so a colleague's part-finished work can be picked
 * up rather than restarted.
 *
 * Deliberately a short list on the first step of the workflow, not a second
 * dashboard: the officer either starts a new case or continues an open one, and
 * both choices belong in the same place.
 */

/** How much of the identity has already been checked, read from the record. */
function reviewedCount(record: VisaContractRecord): number {
  const fields = (record.extraction_metadata as { fields?: Record<string, { reviewed?: boolean }> })
    ?.fields;
  if (!fields) return 0;
  return ['passengerName', 'passportNumber', 'visaNumber', 'nationality'].filter(
    (key) => fields[key]?.reviewed === true,
  ).length;
}

/** The officers who have reviewed something on this case, in first-seen order. */
function reviewers(record: VisaContractRecord): string[] {
  const fields = (record.extraction_metadata as {
    fields?: Record<string, { reviewed?: boolean; reviewed_by_name?: string | null }>;
  })?.fields;
  if (!fields) return [];
  const names = Object.values(fields)
    .filter((f) => f?.reviewed === true && f.reviewed_by_name)
    .map((f) => f.reviewed_by_name as string);
  return [...new Set(names)];
}

export function PendingReviewList({
  onContinue,
  disabled,
}: {
  onContinue: (record: VisaContractRecord) => void;
  disabled?: boolean;
}) {
  const [records, setRecords] = useState<VisaContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await fetchPendingReviewRecords());
    } catch {
      setError('Open visa cases could not be loaded.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Nothing outstanding is the normal state, and an empty panel would be noise
     on a page whose job is starting a new case. */
  if (!loading && !error && records.length === 0) return null;

  return (
    <Panel
      title="Open visa cases"
      description="Cases already recorded and awaiting review. Continue one rather than starting it again."
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={loading}
          icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Refresh
        </Button>
      }
      bodyClassName="p-0"
    >
      {error ? (
        <p className="px-4.5 py-3.5 text-sm text-red-700">{error}</p>
      ) : loading ? (
        <p className="px-4.5 py-3.5 text-sm text-slate-600">Loading open cases…</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {records.map((record) => {
            const done = reviewedCount(record);
            const names = reviewers(record);
            return (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy-900">
                    {record.traveller_name || 'Identity not yet read'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                    {record.passport_number ? (
                      <Identifier value={record.passport_number} />
                    ) : (
                      <span className="text-slate-500">No passport number yet</span>
                    )}
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span>{responsibilityLabel(record)}</span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span>{formatDate(record.record_date)}</span>
                  </p>
                  <p className="mt-0.5 text-2xs text-slate-500">
                    {ENTRY_SOURCE_LABELS[record.entry_source]} · {done} of 4 reviewed
                    {names.length > 0 && ` · Reviewed by ${names.join(', ')}`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onContinue(record)}
                  disabled={disabled}
                  className="shrink-0"
                >
                  Continue review
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

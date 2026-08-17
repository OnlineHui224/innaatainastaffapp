import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TableProperties } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { formatDate } from '@/lib/priority';
import { fetchAwaitingSyncRecords } from '@/lib/visaContractRecords';
import { syncActionLabel } from '@/lib/visaSheetSync';
import {
  SYNC_STATUS_LABELS,
  responsibilityLabel,
  type VisaContractRecord,
} from '@/types/visaContract';

/**
 * Confirmed visas the office spreadsheet does not yet show.
 *
 * Synchronisation is never back-filled: no deployment, migration or background
 * job writes historical records into the office register. Everything that has
 * not been sent — including every record confirmed before this feature existed
 * — waits here until a person sends it, which is also why the panel names the
 * reason rather than just the status.
 *
 * Ordered oldest first, and hidden entirely when there is nothing outstanding.
 */
export function AwaitingSyncList({
  onSync,
  syncingId,
  disabled,
}: {
  onSync: (record: VisaContractRecord) => void;
  /** The record currently being written, if any. */
  syncingId?: string | null;
  disabled?: boolean;
}) {
  const [records, setRecords] = useState<VisaContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await fetchAwaitingSyncRecords());
    } catch {
      setError('Visa records awaiting office-register sync could not be loaded.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Everything synced is the normal state, and an empty panel would be noise on
     a page whose job is starting a new case. */
  if (!loading && !error && records.length === 0) return null;

  return (
    <Panel
      title="Awaiting office register"
      description="Confirmed visas that have not been written to the office spreadsheet yet. Nothing is sent automatically — send each one when the register is ready for it."
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
        <p className="px-4.5 py-3.5 text-sm text-slate-600">Loading records awaiting sync…</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {records.map((record) => (
            <li
              key={record.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy-900">
                  {record.traveller_name || 'Identity not recorded'}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                  {record.passport_number ? (
                    <Identifier value={record.passport_number} />
                  ) : (
                    <span className="text-slate-500">No passport number</span>
                  )}
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span>{responsibilityLabel(record)}</span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span>Departs {formatDate(record.planned_departure_date)}</span>
                </p>
                {/* The server's own explanation, not a status guessed from one. */}
                <p className="mt-0.5 text-2xs text-slate-500">
                  {SYNC_STATUS_LABELS[record.spreadsheet_sync_status]}
                  {record.sync_error ? ` · ${record.sync_error}` : ''}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSync(record)}
                loading={syncingId === record.id}
                disabled={disabled || (Boolean(syncingId) && syncingId !== record.id)}
                icon={<TableProperties className="h-3.5 w-3.5" aria-hidden="true" />}
                className="shrink-0"
              >
                {syncActionLabel(record)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Identifier } from '@/components/ui/Field';
import { formatDate } from '@/lib/priority';
import {
  ActualEventNotice,
  EMPTY_MOVEMENT,
  MOVEMENT_COPY,
  MovementFields,
  RecordingOfficer,
  type MovementFormValues,
  type MovementKind,
} from './MovementConfirmation';

export interface BulkTarget {
  id: string;
  full_name: string;
  passport_number: string;
  agentName?: string | null;
}

interface BulkConfirmDialogProps {
  open: boolean;
  kind: MovementKind;
  targets: BulkTarget[];
  officerName: string;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (values: MovementFormValues) => void;
}

/**
 * Bulk arrival/departure confirmation.
 *
 * Safeguards, all mandatory before the action can run:
 *  1. the exact list of affected records is shown, not just a count;
 *  2. every value that will be written identically to all of them is labelled Shared;
 *  3. an acknowledgment checkbox echoes the action, count, date, time, port and flight;
 *  4. the final button restates the exact number of pilgrims affected.
 */
export function BulkConfirmDialog({
  open,
  kind,
  targets,
  officerName,
  loading,
  error,
  onCancel,
  onConfirm,
}: BulkConfirmDialogProps) {
  const [values, setValues] = useState<MovementFormValues>(EMPTY_MOVEMENT);
  const [acknowledged, setAcknowledged] = useState(false);
  const copy = MOVEMENT_COPY[kind];
  const count = targets.length;

  useEffect(() => {
    if (open) {
      setValues(EMPTY_MOVEMENT);
      setAcknowledged(false);
    }
  }, [open, kind]);

  const hasRequiredValues = Boolean(values.date && values.time);

  /** The acknowledgment sentence echoes exactly what will be written. */
  const acknowledgmentText = useMemo(() => {
    const parts = [
      `Confirm ${copy.noun.toLowerCase()} for ${count} ${count === 1 ? 'pilgrim' : 'pilgrims'}`,
      values.date ? `on ${formatDate(values.date)}` : 'on a date not yet chosen',
      values.time ? `at ${values.time}` : 'at a time not yet chosen',
    ];
    if (values.port) parts.push(`via ${values.port}`);
    if (values.flight) parts.push(`flight ${values.flight}`);
    return `${parts.join(', ')}.`;
  }, [copy.noun, count, values]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      busy={loading}
      size="lg"
      title={`Bulk confirm ${copy.noun.toLowerCase()} — ${count} ${count === 1 ? 'pilgrim' : 'pilgrims'}`}
      description={`One ${copy.noun.toLowerCase()} event will be written to each of the ${count} records listed below, using the same shared values.`}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="confirm"
            onClick={() => onConfirm(values)}
            loading={loading}
            disabled={!hasRequiredValues || !acknowledged || count === 0}
          >
            {/* The final control restates the exact count */}
            Confirm {copy.noun} for {count} {count === 1 ? 'Pilgrim' : 'Pilgrims'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="critical">{error}</Alert>}

        <ActualEventNotice kind={kind}>
          Every record below receives its own audit entry.
        </ActualEventNotice>

        {/* 1 — Affected records, listed explicitly */}
        <section>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-600">
            Affected records ({count})
          </h3>
          <div className="max-h-52 overflow-y-auto rounded-md border border-slate-300 scrollbar-thin">
            <ul className="divide-y divide-slate-200">
              {targets.map((target, index) => (
                <li key={target.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-6 shrink-0 text-right text-2xs tabular-nums text-slate-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                    {target.full_name}
                  </span>
                  <Identifier value={target.passport_number} className="shrink-0" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2 — Shared values */}
        <section>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-600">
            Shared event values
          </h3>
          <MovementFields
            kind={kind}
            values={values}
            onChange={setValues}
            idPrefix={`bulk-${kind}`}
            sharedLabels
            showNotes={false}
          />
        </section>

        <RecordingOfficer officerName={officerName} />

        {/* 3 — Acknowledgment echoing action, count, date, time, port and flight */}
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-amber-400 bg-amber-50 p-3.5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={!hasRequiredValues}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400 disabled:opacity-40"
          />
          <span className="text-sm leading-relaxed text-amber-900">
            <span className="font-bold">I acknowledge:</span> {acknowledgmentText}
            {!hasRequiredValues && (
              <span className="mt-1 block text-xs font-medium text-amber-800">
                Enter the shared date and time before acknowledging.
              </span>
            )}
          </span>
        </label>
      </div>
    </Modal>
  );
}

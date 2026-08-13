import type { ReactNode } from 'react';
import { PlaneLanding, PlaneTakeoff, UserCheck } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

export type MovementKind = 'arrival' | 'departure';

export interface MovementFormValues {
  date: string;
  time: string;
  port: string;
  flight: string;
  notes: string;
}

export const EMPTY_MOVEMENT: MovementFormValues = {
  date: '',
  time: '',
  port: '',
  flight: '',
  notes: '',
};

export const MOVEMENT_COPY: Record<
  MovementKind,
  { noun: string; verb: string; placeName: string; placeExample: string; icon: typeof PlaneLanding }
> = {
  arrival: {
    noun: 'Arrival',
    verb: 'arrived',
    placeName: 'Arrival port',
    placeExample: 'e.g. Jeddah',
    icon: PlaneLanding,
  },
  departure: {
    noun: 'Departure',
    verb: 'departed',
    placeName: 'Departure airport',
    placeExample: 'e.g. King Abdulaziz International',
    icon: PlaneTakeoff,
  },
};

/**
 * The banner every confirmation surface leads with.
 *
 * A confirmation writes an ACTUAL event onto the record — the phrasing here is
 * deliberately unambiguous so it can never be mistaken for editing a plan.
 */
export function ActualEventNotice({ kind, children }: { kind: MovementKind; children?: ReactNode }) {
  const copy = MOVEMENT_COPY[kind];
  return (
    <Alert tone="warning" title={`You are recording an ACTUAL ${copy.noun.toLowerCase()} event`}>
      This is not a planned date. Saving writes a confirmed {copy.noun.toLowerCase()} onto the record, stamped
      with your name and the current time, and it appears in the audit history.
      {children && <div className="mt-2">{children}</div>}
    </Alert>
  );
}

/** Identity strip showing who the event is being recorded against and who is recording it. */
export function RecordingOfficer({
  officerName,
  className,
}: {
  officerName: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-2.5',
        className,
      )}
    >
      <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <div className="min-w-0 text-xs leading-relaxed text-slate-600">
        <p>
          Recording officer:{' '}
          <span className="font-semibold text-slate-900">{officerName || 'Unknown staff member'}</span>
        </p>
        <p className="mt-0.5 text-slate-500">
          Your identity and the confirmation timestamp are stored on the record.
        </p>
      </div>
    </div>
  );
}

/**
 * Shared date / time / port / flight / notes inputs.
 *
 * `sharedLabels` marks every field whose value will be applied identically to
 * every selected record — used by the bulk workflow so shared values are never
 * mistaken for per-record values.
 */
export function MovementFields({
  kind,
  values,
  onChange,
  idPrefix,
  sharedLabels = false,
  showNotes = true,
}: {
  kind: MovementKind;
  values: MovementFormValues;
  onChange: (values: MovementFormValues) => void;
  idPrefix: string;
  sharedLabels?: boolean;
  showNotes?: boolean;
}) {
  const copy = MOVEMENT_COPY[kind];
  const set = (patch: Partial<MovementFormValues>) => onChange({ ...values, ...patch });

  const sharedTag = sharedLabels ? (
    <span className="rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-amber-900">
      Shared
    </span>
  ) : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={`${copy.noun} date`}
          htmlFor={`${idPrefix}-date`}
          required
          action={sharedTag}
          hint={sharedLabels ? 'Applied to every selected record.' : undefined}
        >
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={values.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </Field>
        <Field
          label={`${copy.noun} time`}
          htmlFor={`${idPrefix}-time`}
          required
          action={sharedTag}
          hint={sharedLabels ? 'Applied to every selected record.' : undefined}
        >
          <Input
            id={`${idPrefix}-time`}
            type="time"
            value={values.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={copy.placeName}
          htmlFor={`${idPrefix}-port`}
          action={sharedTag}
          hint={sharedLabels ? 'Applied to every selected record.' : 'Optional.'}
        >
          <Input
            id={`${idPrefix}-port`}
            type="text"
            value={values.port}
            onChange={(e) => set({ port: e.target.value })}
            placeholder={copy.placeExample}
          />
        </Field>
        <Field
          label="Flight number"
          htmlFor={`${idPrefix}-flight`}
          action={sharedTag}
          hint={sharedLabels ? 'Applied to every selected record.' : 'Optional.'}
        >
          {/* Flight number is a genuine operational identifier */}
          <Input
            id={`${idPrefix}-flight`}
            type="text"
            identifier
            value={values.flight}
            onChange={(e) => set({ flight: e.target.value.toUpperCase() })}
            placeholder="e.g. SV600"
          />
        </Field>
      </div>

      {showNotes && (
        <Field label="Notes" htmlFor={`${idPrefix}-notes`} hint="Optional. Evidence or context for this event.">
          <Textarea
            id={`${idPrefix}-notes`}
            rows={2}
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Additional notes or evidence…"
          />
        </Field>
      )}
    </div>
  );
}

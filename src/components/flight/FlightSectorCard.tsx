import { ArrowRight, Bot, Check, PenLine, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { REVIEW_MARK_LABELS, type FlightLegField, type FlightLegView } from '@/types/flightOps';

interface FlightSectorCardProps {
  leg: FlightLegView;
  index: number;
  total: number;
  editing: boolean;
  missingFields: string[];
  outOfSequence: boolean;
  disabled?: boolean;
  onToggleEdit: () => void;
  onFieldChange: (field: FlightLegField, value: string) => void;
  onReview: () => void;
  onUnreview: () => void;
}

/** Airport code pair — the journey's most scannable fact, so it leads the card. */
function RoutePair({ from, to }: { from: string; to: string }) {
  return (
    <p className="flex items-center gap-2 text-lg font-bold leading-none text-navy-900">
      <span className="identifier text-lg">{from || '—'}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="identifier text-lg">{to || '—'}</span>
    </p>
  );
}

function ReadValue({
  label,
  value,
  identifier,
  missing,
}: {
  label: string;
  value: string;
  identifier?: boolean;
  missing?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-sm text-slate-900',
          identifier && 'identifier text-[0.8125rem]',
          missing && 'font-semibold text-amber-800',
        )}
      >
        {value || (missing ? 'Missing' : '—')}
      </dd>
    </div>
  );
}

/**
 * One flight sector.
 *
 * Keeps the useful "journey card" idea from the current operational tool — a
 * scannable origin → destination pair with its times beneath — but rebuilt in
 * the HajjERP structural language: a bordered panel with a rule under its
 * header, not a large rounded card.
 *
 * The sector's review mark follows the platform rule that TYPING IS NOT
 * REVIEWING: any edit returns the sector to AI Extracted, and only the explicit
 * control promotes it to Staff Reviewed.
 */
export function FlightSectorCard({
  leg,
  index,
  total,
  editing,
  missingFields,
  outOfSequence,
  disabled = false,
  onToggleEdit,
  onFieldChange,
  onReview,
  onUnreview,
}: FlightSectorCardProps) {
  const reviewed = leg.review.mark === 'staff_reviewed';
  const isMissing = (label: string) => missingFields.includes(label);
  const fieldId = (name: string) => `sector-${leg.id}-${name}`;

  return (
    <article
      className={cn(
        'rounded-lg border bg-white',
        reviewed ? 'border-emerald-400' : outOfSequence || missingFields.length > 0 ? 'border-amber-400' : 'border-slate-300',
      )}
      aria-label={`Sector ${index + 1} of ${total}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-inherit px-3.5 py-2">
        <p className="text-2xs font-bold uppercase tracking-[0.1em] text-slate-500">
          Sector {index + 1} of {total}
        </p>
        <Badge
          tone={reviewed ? 'positive' : 'neutral'}
          treatment={reviewed ? 'solid' : 'outline'}
          icon={
            reviewed ? (
              <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <Bot className="h-3 w-3 shrink-0" aria-hidden="true" />
            )
          }
        >
          {REVIEW_MARK_LABELS[leg.review.mark]}
        </Badge>
      </div>

      <div className="px-3.5 py-3">
        {editing ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="From (airport code)" htmlFor={fieldId('from')}>
              <Input
                id={fieldId('from')}
                identifier
                value={leg.departureCity}
                onChange={(e) => onFieldChange('departureCity', e.target.value)}
                invalid={isMissing('From')}
              />
            </Field>
            <Field label="To (airport code)" htmlFor={fieldId('to')}>
              <Input
                id={fieldId('to')}
                identifier
                value={leg.arrivalCity}
                onChange={(e) => onFieldChange('arrivalCity', e.target.value)}
                invalid={isMissing('To')}
              />
            </Field>
            <Field label="Date" htmlFor={fieldId('date')} error={outOfSequence ? 'Out of sequence' : null}>
              <Input
                id={fieldId('date')}
                value={leg.date}
                onChange={(e) => onFieldChange('date', e.target.value)}
                invalid={isMissing('Date') || outOfSequence}
              />
            </Field>
            <Field label="Departure time" htmlFor={fieldId('dep')}>
              <Input
                id={fieldId('dep')}
                value={leg.departureTime}
                onChange={(e) => onFieldChange('departureTime', e.target.value)}
                invalid={isMissing('Departure')}
              />
            </Field>
            <Field label="Arrival time" htmlFor={fieldId('arr')}>
              <Input
                id={fieldId('arr')}
                value={leg.arrivalTime}
                onChange={(e) => onFieldChange('arrivalTime', e.target.value)}
                invalid={isMissing('Arrival')}
              />
            </Field>
            <Field label="Carrier" htmlFor={fieldId('carrier')}>
              <Input
                id={fieldId('carrier')}
                identifier
                value={leg.carrier}
                onChange={(e) => onFieldChange('carrier', e.target.value)}
                invalid={isMissing('Carrier')}
              />
            </Field>
            <Field label="Flight number" htmlFor={fieldId('flight')}>
              <Input
                id={fieldId('flight')}
                identifier
                value={leg.flightNumber}
                onChange={(e) => onFieldChange('flightNumber', e.target.value)}
                invalid={isMissing('Flight number')}
              />
            </Field>
            <Field label="Departure airport" htmlFor={fieldId('depname')} className="sm:col-span-2 lg:col-span-1">
              <Input
                id={fieldId('depname')}
                value={leg.departureAirport}
                onChange={(e) => onFieldChange('departureAirport', e.target.value)}
              />
            </Field>
            <Field label="Arrival airport" htmlFor={fieldId('arrname')} className="sm:col-span-2 lg:col-span-1">
              <Input
                id={fieldId('arrname')}
                value={leg.arrivalAirport}
                onChange={(e) => onFieldChange('arrivalAirport', e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <RoutePair from={leg.departureCity} to={leg.arrivalCity} />
              <p className="text-xs text-slate-600">{leg.date || 'Date missing'}</p>
            </div>

            {(leg.departureAirport || leg.arrivalAirport) && (
              <p className="mt-1 truncate text-2xs text-slate-500">
                {leg.departureAirport || '—'} → {leg.arrivalAirport || '—'}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-slate-200 pt-2.5 sm:grid-cols-4">
              <ReadValue label="Departure" value={leg.departureTime} missing={isMissing('Departure')} />
              <ReadValue label="Arrival" value={leg.arrivalTime} missing={isMissing('Arrival')} />
              <ReadValue label="Carrier" value={leg.carrier} identifier missing={isMissing('Carrier')} />
              <ReadValue
                label="Flight no."
                value={leg.flightNumber}
                identifier
                missing={isMissing('Flight number')}
              />
            </dl>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3.5 py-2">
        <p className="text-2xs text-slate-600">
          {leg.review.edited && <span className="font-semibold text-slate-700">Corrected by staff. </span>}
          {reviewed && leg.review.reviewedByName
            ? `Reviewed by ${leg.review.reviewedByName}`
            : 'Not yet reviewed'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<PenLine className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={onToggleEdit}
            disabled={disabled}
          >
            {editing ? 'Done editing' : 'Correct'}
          </Button>
          {reviewed ? (
            <Button variant="ghost" size="sm" onClick={onUnreview} disabled={disabled}>
              Undo review
            </Button>
          ) : (
            <Button
              variant="confirm"
              size="sm"
              icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={onReview}
              disabled={disabled}
            >
              Mark reviewed
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

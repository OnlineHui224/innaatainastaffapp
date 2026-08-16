import { Bot, Check, PenLine, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Identifier, Input } from '@/components/ui/Field';
import { DataGrid, DataRow, Panel } from '@/components/ui/Panel';
import {
  REVIEW_MARK_LABELS,
  totalPax,
  type JourneySummaryView,
  type SummaryField,
} from '@/types/flightOps';

interface JourneySummaryCardProps {
  summary: JourneySummaryView;
  editing: boolean;
  disabled?: boolean;
  onToggleEdit: () => void;
  onFieldChange: (field: SummaryField, value: string) => void;
  onReview: () => void;
  onUnreview: () => void;
}

/**
 * Journey-level facts: who is travelling, under which booking, on which carrier.
 *
 * Carries its own review mark separately from the sectors, because a correct set
 * of flights under the wrong passenger or PNR is still a wrong itinerary.
 */
export function JourneySummaryCard({
  summary,
  editing,
  disabled = false,
  onToggleEdit,
  onFieldChange,
  onReview,
  onUnreview,
}: JourneySummaryCardProps) {
  const reviewed = summary.review.mark === 'staff_reviewed';

  return (
    <Panel
      title="Journey Summary"
      edge={reviewed ? 'confirmed' : 'default'}
      actions={
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
          {REVIEW_MARK_LABELS[summary.review.mark]}
        </Badge>
      }
      bodyClassName="px-4 py-3.5"
    >
      {editing ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Passenger" htmlFor="summary-passenger" className="sm:col-span-2 lg:col-span-1">
            <Input
              id="summary-passenger"
              value={summary.passengerName}
              onChange={(e) => onFieldChange('passengerName', e.target.value)}
              invalid={!summary.passengerName.trim()}
            />
          </Field>
          <Field label="Booking reference (PNR)" htmlFor="summary-pnr">
            <Input
              id="summary-pnr"
              identifier
              value={summary.pnr}
              onChange={(e) => onFieldChange('pnr', e.target.value)}
              invalid={!summary.pnr.trim()}
            />
          </Field>
          <Field label="Primary carrier" htmlFor="summary-carrier">
            <Input
              id="summary-carrier"
              identifier
              value={summary.primaryCarrier}
              onChange={(e) => onFieldChange('primaryCarrier', e.target.value)}
            />
          </Field>
          <Field label="Adults" htmlFor="summary-adults">
            <Input
              id="summary-adults"
              type="number"
              min={0}
              value={String(summary.adults)}
              onChange={(e) => onFieldChange('adults', e.target.value)}
            />
          </Field>
          <Field label="Children" htmlFor="summary-children">
            <Input
              id="summary-children"
              type="number"
              min={0}
              value={String(summary.children)}
              onChange={(e) => onFieldChange('children', e.target.value)}
            />
          </Field>
          <Field label="Total passengers" htmlFor="summary-total" hint="Calculated from adults and children.">
            <Input id="summary-total" value={String(totalPax(summary))} readOnly disabled />
          </Field>
        </div>
      ) : (
        <DataGrid columns={3}>
          <DataRow label="Passenger">{summary.passengerName || '—'}</DataRow>
          <DataRow label="Booking reference (PNR)">
            <Identifier value={summary.pnr} />
          </DataRow>
          <DataRow label="Primary carrier">
            <Identifier value={summary.primaryCarrier} />
          </DataRow>
          <DataRow label="Adults">{summary.adults}</DataRow>
          <DataRow label="Children">{summary.children}</DataRow>
          <DataRow label="Total passengers">
            <span className="font-semibold">{totalPax(summary)}</span>
          </DataRow>
        </DataGrid>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
        <p className="text-2xs text-slate-600">
          {summary.review.edited && <span className="font-semibold text-slate-700">Corrected by staff. </span>}
          {reviewed && summary.review.reviewedByName
            ? `Reviewed by ${summary.review.reviewedByName}`
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
    </Panel>
  );
}

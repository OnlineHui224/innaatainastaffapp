import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  carrierLabel,
  formatSectorDate,
  showTime,
  totalPax,
  type FlightSector,
  type JourneySummary,
  type TripDetails,
} from '@/types/flightOps';

interface ConfirmationReviewProps {
  summary: JourneySummary;
  sectors: FlightSector[];
  trip: TripDetails;
  documentCount: number;
  breaks: number;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onEditReview: () => void;
  onEditTrip: () => void;
}

const SECTION_TITLE = 'text-2xs font-bold uppercase tracking-[0.11em] text-navy-900';
const KEY = 'text-2xs font-bold uppercase tracking-[0.13em] text-slate-500';

function Section({
  title,
  editLabel,
  onEdit,
  rows,
}: {
  title: string;
  editLabel: string;
  onEdit: () => void;
  rows: Array<{ k: string; v: string; tone?: 'default' | 'accent' | 'muted' | 'warning' }>;
}) {
  return (
    <div className="border-b border-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4.5 py-2.5">
        <span className={SECTION_TITLE}>{title}</span>
        <Button variant="secondary" size="sm" onClick={onEdit} className="text-brand-700">
          {editLabel}
        </Button>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))]">
        {rows.map((row) => (
          <div key={row.k} className="min-w-0 border-r border-t border-slate-100 px-4.5 py-3">
            <dt className={KEY}>{row.k}</dt>
            <dd
              className={cn(
                'mt-1 break-words text-sm font-bold leading-snug',
                row.tone === 'accent' && 'identifier text-brand-700',
                row.tone === 'muted' && 'text-slate-600',
                row.tone === 'warning' && 'text-amber-700',
                (!row.tone || row.tone === 'default') && 'text-navy-900',
              )}
            >
              {row.v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Step 4 — the final operational review.
 *
 * Shows exactly what will be written into the Word itinerary, and nothing is
 * generated until staff explicitly acknowledge it. Generation stays blocked
 * while any sequence break remains: a journey that does not join up would
 * produce a document that is wrong in the traveller's hand.
 */
export function ConfirmationReview({
  summary,
  sectors,
  trip,
  documentCount,
  breaks,
  acknowledged,
  onAcknowledge,
  onEditReview,
  onEditTrip,
}: ConfirmationReviewProps) {
  const total = totalPax(summary);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="rounded-lg border border-slate-300 bg-white">
        <div className="border-b border-slate-200 px-4.5 py-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-navy-900">
            Final operational review
          </h2>
          <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-slate-600">
            This is exactly what will be written into the Word itinerary. Nothing is generated until
            you choose to generate it.
          </p>
        </div>

        <Section
          title="Passenger and party"
          editLabel="Edit in review"
          onEdit={onEditReview}
          rows={[
            { k: 'Primary passenger', v: summary.passenger || '—' },
            { k: 'Adults', v: String(summary.adults ?? '—') },
            { k: 'Children', v: summary.children === null ? '—' : String(summary.children) },
            { k: 'Total passengers', v: total === null ? '—' : String(total) },
          ]}
        />

        <Section
          title="Booking"
          editLabel="Edit in review"
          onEdit={onEditReview}
          rows={[
            { k: 'Booking reference (PNR)', v: summary.pnr || '—', tone: 'accent' },
            { k: 'Primary carrier', v: carrierLabel(summary.carrier) },
            { k: 'Flight sectors', v: String(sectors.length) },
            { k: 'Source documents', v: String(documentCount) },
          ]}
        />

        <Section
          title="Group and accommodation"
          editLabel="Edit trip details"
          onEdit={onEditTrip}
          rows={[
            {
              k: 'Group name',
              v: trip.groupName || 'Not set — individual traveller',
              tone: trip.groupName ? 'default' : 'muted',
            },
            {
              k: 'Makkah hotel',
              v: trip.makkahHotelName || 'Not selected',
              tone: trip.makkahHotelName ? 'default' : 'warning',
            },
            {
              k: 'Madinah hotel',
              v: trip.madinahHotelName || 'Not selected',
              tone: trip.madinahHotelName ? 'default' : 'warning',
            },
          ]}
        />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4.5 py-2.5">
            <span className={SECTION_TITLE}>Journey — chronological</span>
            <Button variant="secondary" size="sm" onClick={onEditReview} className="text-brand-700">
              Edit journey
            </Button>
          </div>

          <ol>
            {sectors.map((sector, index) => (
              <li
                key={sector.id}
                className="flex flex-wrap items-center gap-3.5 border-b border-slate-100 px-4.5 py-2.5"
              >
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-brand-200 bg-brand-50 text-2xs font-bold text-brand-700"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="basis-32 text-xs text-slate-600">{formatSectorDate(sector.date)}</span>
                <span className="min-w-0 flex-1 basis-48 text-[0.8125rem] font-bold text-navy-900">
                  <span className="identifier">{sector.dep || '···'}</span> →{' '}
                  <span className="identifier">{sector.arr || '···'}</span>
                </span>
                <span className="basis-36 text-[0.8125rem] tabular-nums text-slate-900">
                  {showTime(sector.depT, sector.fmt) || '—'} → {showTime(sector.arrT, sector.fmt) || '—'}
                </span>
                <span className="identifier shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-navy-900">
                  {sector.flight || '—'}
                </span>
              </li>
            ))}
          </ol>

          <p
            className={cn(
              'flex items-center gap-2 px-4.5 py-3 text-xs',
              breaks === 0 ? 'text-emerald-700' : 'text-amber-700',
            )}
          >
            {breaks === 0 ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {breaks === 0
              ? 'The journey reads chronologically with no sequence break.'
              : `${breaks} ${breaks === 1 ? 'sequence break remains' : 'sequence breaks remain'} — go back and correct the journey before generating.`}
          </p>
        </div>
      </div>

      {/* Explicit acknowledgement. Generation never happens automatically. */}
      <div className="rounded-lg border border-slate-300 bg-white px-4.5 py-4">
        <label htmlFor="cf-ack" className="flex cursor-pointer items-start gap-3">
          <input
            id="cf-ack"
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-navy-800"
          />
          <span className="text-[0.8125rem] leading-relaxed text-slate-900">
            I have checked this summary against the source documents and confirm it is correct for
            the traveller.
          </span>
        </label>
      </div>
    </div>
  );
}

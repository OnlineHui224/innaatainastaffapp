import { HotelReferenceCombobox } from './HotelReferenceCombobox';
import type { TripDetails } from '@/types/flightOps';

interface TripDetailsFormProps {
  details: TripDetails;
  plannedFileName: string;
  onChange: (updates: Partial<TripDetails>) => void;
  disabled?: boolean;
}

const SECTION = 'text-xs font-extrabold uppercase tracking-[0.09em] text-navy-900';
const LABEL = 'block text-2xs font-bold uppercase tracking-[0.13em] text-slate-500';

/**
 * Step 3 — the operational details staff add to a reviewed journey.
 *
 * Exactly what the proven workflow asks for: an optional group name, a Makkah
 * hotel and a Madinah hotel. The hotels come from the real HajjERP hotel
 * reference; see `HotelReferenceCombobox`.
 */
export function TripDetailsForm({
  details,
  plannedFileName,
  onChange,
  disabled = false,
}: TripDetailsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className={`${SECTION} mb-2.5`}>Group</h2>
        <div className="rounded-lg border border-slate-300 bg-white p-4.5">
          <label htmlFor="tp-group" className={`${LABEL} mb-1.5`}>
            Group name{' '}
            <span className="text-2xs font-normal normal-case tracking-normal text-slate-500">
              — optional
            </span>
          </label>
          <input
            id="tp-group"
            value={details.groupName}
            onChange={(event) => onChange({ groupName: event.target.value })}
            placeholder="e.g. FHFJ"
            aria-describedby="tp-group-help"
            disabled={disabled}
            className="min-h-[44px] w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tracking-wide text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600 disabled:bg-slate-50"
          />
          <p id="tp-group-help" className="mt-2 max-w-prose text-xs leading-relaxed text-slate-600">
            Printed as the group heading and used for the generated filename. Leave blank for an
            individual traveller — the passenger surname is used instead.
          </p>
          <p className="mt-2.5 text-xs text-slate-600">
            Filename will be{' '}
            <strong className="font-bold text-navy-900">{plannedFileName}</strong>
          </p>
        </div>
      </section>

      <section>
        <h2 className={`${SECTION} mb-2.5`}>Accommodation</h2>
        <div className="rounded-lg border border-slate-300 bg-white">
          <div className="border-b border-slate-100 p-4.5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <span className={LABEL}>Makkah hotel</span>
              <span className="text-xs text-slate-500">HajjERP hotel reference</span>
            </div>
            <HotelReferenceCombobox
              city="Makkah"
              label="Makkah hotel"
              selectedId={details.makkahHotelId}
              selectedName={details.makkahHotelName}
              onSelect={(id, name) => onChange({ makkahHotelId: id, makkahHotelName: name })}
              disabled={disabled}
            />
          </div>

          <div className="border-b border-slate-100 p-4.5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <span className={LABEL}>Madinah hotel</span>
              <span className="text-xs text-slate-500">HajjERP hotel reference</span>
            </div>
            <HotelReferenceCombobox
              city="Madinah"
              label="Madinah hotel"
              selectedId={details.madinahHotelId}
              selectedName={details.madinahHotelName}
              onSelect={(id, name) => onChange({ madinahHotelId: id, madinahHotelName: name })}
              disabled={disabled}
            />
          </div>

          <p className="rounded-b-lg bg-slate-50 px-4.5 py-3 text-xs text-slate-600">
            Both hotels are required — they print in the HOTEL ACCOMMODATION table of the Word
            itinerary.
          </p>
        </div>
      </section>
    </div>
  );
}

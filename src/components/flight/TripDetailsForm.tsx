import { AlertCircle, Hotel } from 'lucide-react';
import { Field, Input } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { SearchableCombobox, type ComboboxOption } from '@/components/visa/SearchableCombobox';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import type { TripDetailsView } from '@/types/flightOps';

interface TripDetailsFormProps {
  details: TripDetailsView;
  onChange: (updates: Partial<TripDetailsView>) => void;
  disabled?: boolean;
}

/**
 * Hotel picker bound to the existing HajjERP hotel reference search.
 *
 * `useHotelSearch` is a read-only SELECT against `hotel_references` — the same
 * source the Visa & Contract Logger uses — so staff get real Makkah and Madinah
 * hotels rather than a mock list. Nothing here writes.
 */
function HotelField({
  city,
  label,
  selectedId,
  selectedName,
  onSelect,
  disabled,
}: {
  city: 'Makkah' | 'Madinah';
  label: string;
  selectedId: string | null;
  selectedName: string;
  onSelect: (id: string | null, name: string) => void;
  disabled?: boolean;
}) {
  const search = useHotelSearch(city);

  const options: ComboboxOption[] = search.results.map((hotel) => ({
    value: hotel.id,
    label: hotel.name_en,
    secondary: hotel.name_ar || '',
    tertiary: [hotel.classification, hotel.district].filter(Boolean).join(' · '),
  }));

  return (
    <Field
      label={label}
      hint={
        selectedName
          ? undefined
          : `Search the ${city} hotel reference by name, district or licence number.`
      }
    >
      <SearchableCombobox
        options={options}
        value={selectedId}
        onChange={(id) => {
          const match = search.results.find((hotel) => hotel.id === id);
          onSelect(id, match?.name_en ?? '');
        }}
        onSearchChange={search.search}
        loading={search.loading}
        placeholder={`Search ${city} hotels…`}
        emptyMessage={
          search.error ? 'Search unavailable' : `No ${city} hotels match that search`
        }
        icon={Hotel}
        disabled={disabled}
        error={Boolean(search.error)}
      />

      {/* The hook surfaces genuine query failures — reported rather than shown
          as an empty result, which would read as "no such hotel". */}
      {search.error && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-red-700">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            The {city} hotel reference could not be searched just now. Check your connection and try
            again — you can continue without a hotel and add it later.
          </span>
        </p>
      )}
    </Field>
  );
}

/**
 * Step 3 — the operational details staff add to an extracted journey.
 *
 * Matches what the proven workflow asks for: an optional group name, a Makkah
 * hotel and a Madinah hotel.
 */
export function TripDetailsForm({ details, onChange, disabled = false }: TripDetailsFormProps) {
  return (
    <Panel
      title="Trip Details"
      description="Added by staff. These appear on the generated itinerary alongside the extracted flights."
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-3">
        <Field
          label="Group name"
          htmlFor="trip-group-name"
          hint="Optional. When set, it names the generated document instead of the passenger."
        >
          <Input
            id="trip-group-name"
            value={details.groupName}
            onChange={(e) => onChange({ groupName: e.target.value })}
            placeholder="e.g. Ramadan Group B"
            disabled={disabled}
          />
        </Field>

        <HotelField
          city="Makkah"
          label="Makkah hotel"
          selectedId={details.makkahHotelId}
          selectedName={details.makkahHotelName}
          onSelect={(id, name) => onChange({ makkahHotelId: id, makkahHotelName: name })}
          disabled={disabled}
        />

        <HotelField
          city="Madinah"
          label="Madinah hotel"
          selectedId={details.madinahHotelId}
          selectedName={details.madinahHotelName}
          onSelect={(id, name) => onChange({ madinahHotelId: id, madinahHotelName: name })}
          disabled={disabled}
        />
      </div>
    </Panel>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Building2, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useHotelSearch } from '@/hooks/useHotelSearch';

interface HotelReferenceComboboxProps {
  city: 'Makkah' | 'Madinah';
  label: string;
  selectedId: string | null;
  selectedName: string;
  onSelect: (id: string | null, name: string) => void;
  disabled?: boolean;
}

/**
 * Hotel picker bound to the REAL HajjERP hotel reference.
 *
 * `useHotelSearch` performs a read-only SELECT against `hotel_references` —
 * city-filtered, active hotels only, case-insensitive partial match across the
 * English name, Arabic name, licence number and district. It is the same source
 * the Visa & Contract Logger uses and it is the single source of truth.
 *
 * There are deliberately NO hotel fixtures behind this control. Demonstration
 * hotel names must never become application data, and nothing here writes.
 *
 * Interaction follows the approved design: a combobox with a listbox popup,
 * arrow-key navigation, Enter to select, Esc to close, and distinct loading,
 * searching, empty and error states.
 */
export function HotelReferenceCombobox({
  city,
  label,
  selectedId,
  selectedName,
  onSelect,
  disabled = false,
}: HotelReferenceComboboxProps) {
  const search = useHotelSearch(city);
  const generatedId = useId();
  const inputId = `hotel-${city.toLowerCase()}-${generatedId}`;
  const listId = `${inputId}-list`;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = search.results;

  useEffect(() => {
    setHighlighted(0);
  }, [results]);

  const pick = useCallback(
    (id: string, name: string) => {
      onSelect(id, name);
      setOpen(false);
      setQuery('');
      search.clear();
    },
    [onSelect, search],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
        setHighlighted((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((current) => Math.max(current - 1, 0));
      } else if (event.key === 'Enter') {
        const option = results[highlighted];
        if (option) {
          event.preventDefault();
          pick(option.id, option.name_en);
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    },
    [highlighted, pick, results],
  );

  // A selected hotel collapses the control to a confirmed row.
  if (selectedId && selectedName) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-3">
        <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
        <span className="min-w-0 flex-1 basis-48 text-sm font-bold text-navy-900">{selectedName}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onSelect(null, '');
              setOpen(true);
            }}
            disabled={disabled}
            className="border-emerald-300 text-emerald-900 hover:bg-emerald-100"
          >
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(null, '')}
            disabled={disabled}
            className="text-emerald-900 hover:bg-emerald-100"
          >
            Clear
          </Button>
        </div>
      </div>
    );
  }

  const trimmed = query.trim();
  const showPanel = open && !disabled;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-label={label}
          aria-activedescendant={
            showPanel && results.length ? `${listId}-opt-${highlighted}` : undefined
          }
          value={query}
          disabled={disabled}
          placeholder={`Search ${city} hotels by name…`}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            search.search(next);
          }}
          onFocus={() => setOpen(true)}
          onBlur={(event) => {
            const to = event.relatedTarget as HTMLElement | null;
            if (to && containerRef.current?.contains(to)) return;
            setOpen(false);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'min-h-[44px] w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900',
            'transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600',
            'disabled:cursor-not-allowed disabled:bg-slate-50',
            search.error ? 'border-red-400' : open ? 'border-brand-600' : 'border-slate-300',
          )}
        />
        {search.loading && (
          <span
            className="absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-pulse-dot rounded-full bg-brand-600"
            aria-hidden="true"
          />
        )}
      </div>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
          className={cn(
            'absolute z-20 mt-2 w-full overflow-hidden rounded-lg border bg-white shadow-raised',
            search.error ? 'border-red-400' : 'border-slate-300',
          )}
        >
          {search.error ? (
            <div className="border-l-[3px] border-l-red-700 bg-white px-4 py-3.5">
              <p className="text-[0.8125rem] font-bold text-navy-900">
                Hotel reference list could not be loaded
              </p>
              <p className="mb-3 mt-1 text-xs leading-snug text-slate-600">
                The list is unavailable right now, so hotels cannot be selected. Nothing you have
                entered has been lost.
              </p>
              <Button variant="secondary" size="sm" onClick={() => search.search(query)}>
                Try loading again
              </Button>
            </div>
          ) : search.loading ? (
            <div className="bg-slate-50 px-4 py-3.5">
              <p className="mb-2.5 text-xs text-slate-600">
                Searching the reference list for “{trimmed}”…
              </p>
              <span className="mb-2 block h-2.5 w-[72%] rounded bg-slate-200" aria-hidden="true" />
              <span className="mb-2 block h-2.5 w-[56%] rounded bg-slate-200" aria-hidden="true" />
              <span className="block h-2.5 w-[64%] rounded bg-slate-200" aria-hidden="true" />
            </div>
          ) : !trimmed ? (
            <div className="bg-slate-50 px-4 py-3.5">
              <p className="text-xs text-slate-600">
                Start typing to search the {city} hotel reference — by name, district or licence
                number.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-slate-50 px-4 py-3.5">
              <p className="text-[0.8125rem] font-bold text-navy-900">
                No hotel matches “{trimmed}”
              </p>
              <p className="mt-1 text-xs leading-snug text-slate-600">
                Check the spelling, or try a shorter part of the name. If the hotel is genuinely
                missing, an administrator can add it through Hotel Reference Import.
              </p>
            </div>
          ) : (
            <>
              <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-2xs font-bold uppercase tracking-wider text-slate-500">
                {results.length} {results.length === 1 ? 'match' : 'matches'}
              </p>
              <div className="max-h-60 overflow-auto">
                {results.map((hotel, index) => (
                  <button
                    key={hotel.id}
                    type="button"
                    role="option"
                    id={`${listId}-opt-${index}`}
                    tabIndex={-1}
                    aria-selected={index === highlighted}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => pick(hotel.id, hotel.name_en)}
                    className={cn(
                      'flex min-h-[44px] w-full items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 text-left last:border-0',
                      index === highlighted ? 'bg-brand-50' : 'bg-white',
                    )}
                  >
                    <Building2
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        index === highlighted ? 'text-brand-700' : 'text-slate-500',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] text-slate-900">
                        {hotel.name_en}
                      </span>
                      {(hotel.classification || hotel.district) && (
                        <span className="block truncate text-2xs text-slate-500">
                          {[hotel.classification, hotel.district].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-2xs text-slate-500">{hotel.city}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-600">
        {search.error && (
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-red-700" aria-hidden="true" />
        )}
        <span>
          {search.error
            ? 'Hotels cannot be selected until the reference list loads.'
            : 'Type to search. Arrow keys to move, Enter to select, Esc to close.'}
        </span>
      </p>
    </div>
  );
}

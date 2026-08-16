import { Bus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TRANSPORT_PACKAGE_LABELS,
  TRANSPORT_PACKAGE_LEGS,
  TRANSPORT_PACKAGE_ORDER,
  type TransportPackage,
} from '@/types/visa';

interface TransportPackageFieldProps {
  value: TransportPackage | null;
  onChange: (value: TransportPackage) => void;
  error?: string;
  disabled?: boolean;
}

const DESCRIPTION: Record<TransportPackage, string> = {
  airport_transfers: 'Arrival and departure airport transfers only.',
  full_route: 'Airport transfers plus intercity travel and the ziyarat tour.',
  no_transport: 'The traveller arranges their own ground transport.',
};

/**
 * Visa-level transportation entitlement.
 *
 * Three mutually exclusive packages — what the traveller is entitled to, not how
 * it will be delivered. There is deliberately no route, vehicle, provider,
 * pickup or price here: those are transport *contract* concerns and belong to
 * the future Ground Transport Contracts module.
 *
 * Nothing is preselected. A package is an operational commitment, so it must be
 * an explicit staff choice rather than a default the officer never made.
 */
export function TransportPackageField({
  value,
  onChange,
  error,
  disabled = false,
}: TransportPackageFieldProps) {
  const legs = value ? TRANSPORT_PACKAGE_LEGS[value] : [];

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Transportation package"
        aria-required="true"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
      >
        {TRANSPORT_PACKAGE_ORDER.map((pkg, index) => {
          const selected = value === pkg;
          return (
            <button
              key={pkg}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!value && index === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(pkg)}
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
                event.preventDefault();
                const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
                const at =
                  (index + step + TRANSPORT_PACKAGE_ORDER.length) % TRANSPORT_PACKAGE_ORDER.length;
                onChange(TRANSPORT_PACKAGE_ORDER[at]);
                const group = event.currentTarget.parentElement;
                group?.querySelectorAll<HTMLElement>('[role="radio"]')[at]?.focus();
              }}
              className={cn(
                'flex min-h-[44px] flex-col items-start gap-1 rounded-lg border px-3.5 py-3 text-left transition-colors',
                selected
                  ? 'border-navy-800 bg-slate-50'
                  : error
                    ? 'border-red-400 bg-white hover:border-brand-400'
                    : 'border-slate-300 bg-white hover:border-brand-400',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 bg-white',
                    selected ? 'border-navy-800' : 'border-slate-400',
                  )}
                  aria-hidden="true"
                >
                  <span className={cn('h-2 w-2 rounded-full', selected && 'bg-navy-800')} />
                </span>
                <span className="text-sm font-bold text-navy-900">
                  {TRANSPORT_PACKAGE_LABELS[pkg]}
                </span>
              </span>
              <span className="text-xs leading-snug text-slate-600">{DESCRIPTION[pkg]}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : value ? (
        <div className="mt-2.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-[0.11em] text-slate-500">
            Included legs
          </p>
          {legs.length === 0 ? (
            <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-slate-700">
              <Bus className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              No transport legs are included in this package.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {legs.map((leg) => (
                <li
                  key={leg}
                  className="flex items-center gap-1.5 text-[0.8125rem] text-slate-700"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                  {leg}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">
          Select the package this visa record covers. Nothing is assumed.
        </p>
      )}
    </div>
  );
}

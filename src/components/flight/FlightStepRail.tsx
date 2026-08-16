import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FLIGHT_STEP_LABELS } from '@/types/flightOps';

interface FlightStepRailProps {
  /** Index of the step currently in progress. */
  currentIndex: number;
  /** Returns to an already-completed step. Steps ahead are never selectable. */
  onSelect: (index: number) => void;
  /** Steps that cannot be returned to even once passed (Generate, Download). */
  isReturnable: (index: number) => boolean;
}

/**
 * The six-step workflow rail.
 *
 * One low horizontal band rather than a tall banner — the whole workflow stays
 * visible without spending vertical space. Cells wrap onto further rows on
 * narrow viewports instead of scrolling sideways.
 */
export function FlightStepRail({ currentIndex, onSelect, isReturnable }: FlightStepRailProps) {
  return (
    <nav
      aria-label="Workflow progress"
      className="overflow-hidden rounded-md border border-slate-300 bg-white"
    >
      <ol className="flex flex-wrap items-stretch">
        {FLIGHT_STEP_LABELS.map((label, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          const selectable = done && isReturnable(index);

          const body = (
            <>
              <span
                className={cn(
                  'flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded border text-2xs font-bold',
                  current && 'border-navy-800 bg-navy-800 text-white',
                  done && !current && 'border-emerald-300 bg-emerald-50 text-emerald-700',
                  !done && !current && 'border-slate-300 bg-white text-slate-500',
                )}
              >
                {done ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  'min-w-0 text-left text-xs leading-tight',
                  current ? 'font-extrabold text-navy-900' : done ? 'font-semibold text-slate-700' : 'font-semibold text-slate-500',
                )}
              >
                {label}
              </span>
            </>
          );

          return (
            <li
              key={label}
              className="flex min-w-[140px] flex-1 border-l border-slate-200 first:border-l-0"
              aria-current={current ? 'step' : undefined}
            >
              {selectable ? (
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors',
                    'bg-slate-50/60 hover:bg-slate-100',
                  )}
                >
                  {body}
                  <span className="sr-only"> — completed, return to this step</span>
                </button>
              ) : (
                <span
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3.5 py-3',
                    current ? 'bg-white' : 'bg-slate-50/60',
                  )}
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageStepperProps<K extends string> {
  steps: readonly K[];
  labels: Record<K, string>;
  /** Shorter labels used on narrow viewports where the full label would wrap. */
  shortLabels?: Record<K, string>;
  current: K;
  completed: Set<K>;
  /**
   * Allows returning to an already-completed step. Steps that are not complete
   * are never selectable — the workflow is not a free-form tab bar.
   */
  onStepSelect?: (step: K) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Horizontal workflow progress.
 *
 * Deliberately low: a single rule-bound row rather than a tall banner, so a
 * six-step workflow costs roughly one line of vertical space on desktop.
 *
 * Below `sm` the row collapses to a "Step n of m" line plus a segmented rule.
 * That is a genuine responsive transformation — the numbered row is not merely
 * shrunk until it is unreadable.
 */
export function StageStepper<K extends string>({
  steps,
  labels,
  shortLabels,
  current,
  completed,
  onStepSelect,
  className,
  ariaLabel = 'Workflow progress',
}: StageStepperProps<K>) {
  const currentIndex = steps.indexOf(current);

  return (
    <nav aria-label={ariaLabel} className={cn('w-full', className)}>
      {/* Narrow viewports: position sentence + segmented rule */}
      <div className="sm:hidden">
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-display text-[0.8125rem] font-bold text-navy-900">
            {labels[current]}
          </span>
          <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Step {currentIndex + 1} of {steps.length}
          </span>
        </p>
        <ol className="mt-2 flex gap-1" aria-hidden="true">
          {steps.map((step, index) => (
            <li
              key={step}
              className={cn(
                'h-1 flex-1 rounded-full',
                completed.has(step)
                  ? 'bg-emerald-600'
                  : index === currentIndex
                    ? 'bg-brand-600'
                    : 'bg-slate-300',
              )}
            />
          ))}
        </ol>
      </div>

      {/* sm and up: numbered steps with connecting rules */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const isComplete = completed.has(step);
          const isCurrent = step === current;
          const label = shortLabels?.[step] ?? labels[step];
          const selectable = Boolean(onStepSelect) && isComplete && !isCurrent;

          const marker = (
            <>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-bold',
                  isComplete && 'border-emerald-700 bg-emerald-700 text-white',
                  isCurrent && 'border-brand-600 bg-brand-600 text-white',
                  !isComplete && !isCurrent && 'border-slate-300 bg-white text-slate-500',
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs font-semibold lg:text-[0.8125rem]',
                  isCurrent ? 'text-navy-900' : isComplete ? 'text-slate-700' : 'text-slate-500',
                )}
              >
                {label}
              </span>
            </>
          );

          return (
            <li
              key={step}
              className={cn('flex min-w-0 items-center gap-2', index < steps.length - 1 && 'flex-1')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {selectable ? (
                <button
                  type="button"
                  onClick={() => onStepSelect?.(step)}
                  className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-slate-100"
                >
                  {marker}
                  <span className="sr-only"> — completed, return to this step</span>
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2 px-1 py-0.5">{marker}</span>
              )}

              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px min-w-3 flex-1',
                    completed.has(step) ? 'bg-emerald-600/60' : 'bg-slate-300',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

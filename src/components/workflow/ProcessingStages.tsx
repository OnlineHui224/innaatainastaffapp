import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingStagesProps<K extends string> {
  stages: readonly K[];
  labels: Record<K, string>;
  /** The stage running now. `null` once every stage has finished. */
  current: K | null;
  /** Stages already finished, in order. */
  completed: Set<K>;
  heading: string;
  description?: string;
  className?: string;
}

/**
 * Named-stage progress.
 *
 * There is deliberately NO percentage bar. The extraction and generation steps
 * report which stage they are in, not how far through it they are, and inventing
 * a percentage would tell staff something the system does not actually know.
 *
 * The whole list is a polite live region, so a screen reader announces each
 * stage as it becomes active rather than only on completion.
 */
export function ProcessingStages<K extends string>({
  stages,
  labels,
  current,
  completed,
  heading,
  description,
  className,
}: ProcessingStagesProps<K>) {
  return (
    <div className={cn('mx-auto max-w-xl', className)}>
      <div className="text-center">
        <h2 className="font-display text-base font-bold text-navy-900">{heading}</h2>
        {description && <p className="mt-1 text-[0.8125rem] leading-snug text-slate-600">{description}</p>}
      </div>

      <ol role="status" aria-live="polite" className="mt-5 space-y-0.5">
        {stages.map((stage) => {
          const isComplete = completed.has(stage);
          const isCurrent = stage === current;

          return (
            <li
              key={stage}
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-3 py-2 transition-colors',
                isCurrent
                  ? 'border-brand-300 bg-brand-50'
                  : isComplete
                    ? 'border-transparent'
                    : 'border-transparent',
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                {isComplete ? (
                  <Check className="h-4 w-4 text-emerald-700" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-700" />
                ) : (
                  <span className="h-2 w-2 rounded-full border border-slate-300 bg-white" />
                )}
              </span>

              <span
                className={cn(
                  'min-w-0 text-[0.8125rem] leading-snug',
                  isCurrent
                    ? 'font-semibold text-navy-900'
                    : isComplete
                      ? 'text-slate-700'
                      : 'text-slate-400',
                )}
              >
                {labels[stage]}
              </span>

              {/* Status word, so state never depends on the icon or colour alone. */}
              <span className="ml-auto shrink-0 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                {isComplete ? 'Done' : isCurrent ? 'Working' : 'Waiting'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

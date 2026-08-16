import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageProgressPanelProps {
  heading: string;
  meta: string;
  description: string;
  /** `[label, note]` pairs, in order. */
  stages: Array<[string, string]>;
  currentIndex: number;
  footer: ReactNode;
  progressLabel: string;
}

/**
 * Named-stage progress for extraction and generation.
 *
 * There is deliberately NO percentage. Neither step reports how far through it
 * is, only which stage is running, and inventing a figure would tell staff
 * something the system does not know. The indeterminate sweep above the list
 * signals activity without asserting progress.
 */
export function StageProgressPanel({
  heading,
  meta,
  description,
  stages,
  currentIndex,
  footer,
  progressLabel,
}: StageProgressPanelProps) {
  return (
    <div className="max-w-3xl rounded-md border border-slate-300 bg-white">
      <div className="border-b border-slate-200 px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold tracking-tight text-navy-900">{heading}</h2>
          <p className="text-xs text-slate-600">{meta}</p>
        </div>
        <p className="mt-2 text-[0.8125rem] text-slate-600">{description}</p>

        <div
          role="progressbar"
          aria-label={progressLabel}
          className="relative mt-4 h-1 overflow-hidden rounded-full bg-slate-200"
        >
          <span className="absolute left-0 top-0 h-1 w-[28%] animate-sweep rounded-full bg-brand-600" />
        </div>
      </div>

      <ol className="px-5 pb-4 pt-2" role="status" aria-live="polite">
        {stages.map(([label, note], index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;

          return (
            <li
              key={label}
              className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0"
            >
              <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded border" aria-hidden="true">
                {done ? (
                  <span className="flex h-full w-full items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                ) : current ? (
                  <span className="flex h-full w-full items-center justify-center rounded border border-brand-200 bg-brand-50">
                    <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-brand-600" />
                  </span>
                ) : (
                  <span className="h-full w-full rounded border border-slate-200 bg-slate-50" />
                )}
              </span>

              <span
                className={cn(
                  'min-w-0 text-[0.8125rem]',
                  current ? 'font-bold text-slate-900' : done ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {label}
              </span>

              <span className="ml-auto shrink-0 text-2xs text-slate-500">
                {done ? 'Done' : current ? note : ''}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>
    </div>
  );
}

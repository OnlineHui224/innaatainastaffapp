import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Stage {
  key: string;
  label: string;
}

/**
 * Stage rail for an import workflow.
 *
 * Shows where the operator is in a multi-step intake, with completed steps
 * marked by a tick rather than colour alone.
 */
export function ImportStages({
  stages,
  currentIndex,
  className,
}: {
  stages: Stage[];
  currentIndex: number;
  className?: string;
}) {
  return (
    <nav aria-label="Import progress" className={cn('overflow-x-auto scrollbar-thin', className)}>
      <ol className="flex min-w-max items-center gap-1">
        {stages.map((stage, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li key={stage.key} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-1.5',
                  complete && 'border-emerald-400 bg-emerald-50 text-emerald-900',
                  current && 'border-brand-600 bg-brand-600 text-white',
                  !complete && !current && 'border-dashed border-slate-300 bg-white text-slate-500',
                )}
                aria-current={current ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                    complete && 'bg-emerald-700 text-white',
                    current && 'bg-white text-brand-700',
                    !complete && !current && 'bg-slate-200 text-slate-600',
                  )}
                  aria-hidden="true"
                >
                  {complete ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="whitespace-nowrap text-xs font-semibold">{stage.label}</span>
                {complete && <span className="sr-only"> (completed)</span>}
              </div>
              {index < stages.length - 1 && (
                <span
                  className={cn('mx-1 h-px w-5 shrink-0', complete ? 'bg-emerald-400' : 'bg-slate-300')}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type OutcomeTone = 'ready' | 'review' | 'blocked' | 'neutral' | 'info';

const OUTCOME_STYLES: Record<OutcomeTone, { frame: string; rule: string; value: string; word: string }> = {
  /* Green = ready / valid */
  ready: {
    frame: 'border-emerald-300',
    rule: 'bg-emerald-700',
    value: 'text-emerald-900',
    word: 'Ready to import',
  },
  /* Amber = human review required */
  review: {
    frame: 'border-amber-400',
    rule: 'bg-amber-600',
    value: 'text-amber-900',
    word: 'Human review required',
  },
  /* Red = blocked / duplicate */
  blocked: { frame: 'border-red-300', rule: 'bg-red-600', value: 'text-red-900', word: 'Blocked' },
  neutral: { frame: 'border-slate-300', rule: 'bg-slate-400', value: 'text-navy-900', word: '' },
  info: { frame: 'border-brand-300', rule: 'bg-brand-600', value: 'text-brand-900', word: '' },
};

/**
 * Outcome counter for an import stage.
 * The tone is always paired with a readable meaning so colour is never the only signal.
 */
export function OutcomeTile({
  label,
  value,
  tone = 'neutral',
  description,
  className,
}: {
  label: string;
  value: number;
  tone?: OutcomeTone;
  description?: ReactNode;
  className?: string;
}) {
  const isZero = value === 0;
  const cfg = OUTCOME_STYLES[isZero ? 'neutral' : tone];

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-white', cfg.frame, className)}>
      <div className={cn('h-0.5 w-full', isZero ? 'bg-slate-200' : cfg.rule)} aria-hidden="true" />
      <div className="p-3.5">
        <p className="text-2xs font-bold uppercase tracking-wide text-slate-600">{label}</p>
        <p
          className={cn(
            'mt-1.5 font-display text-2xl font-extrabold tabular-nums',
            isZero ? 'text-slate-400' : cfg.value,
          )}
        >
          {value}
        </p>
        {(description || (!isZero && cfg.word)) && (
          <p className="mt-1 text-2xs leading-tight text-slate-500">{description ?? cfg.word}</p>
        )}
      </div>
    </div>
  );
}

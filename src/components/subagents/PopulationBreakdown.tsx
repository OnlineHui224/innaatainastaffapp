import { cn } from '@/lib/utils';

export interface AgentPopulation {
  assigned: number;
  inSaudi: number;
  departingSoon: number;
  overdue: number;
}

/**
 * Honest representation of the sub-agent population relationship:
 *
 *     Assigned ⊇ In KSA ⊇ (Departing soon + Overdue)
 *
 * These are nested subsets, not four separate populations. The UI indents each
 * level and states it as "N of M" so the numbers can never be read as additive.
 * Zero counts stay visually quiet; genuine risk counts get emphasis.
 */
export function PopulationBreakdown({
  population,
  className,
}: {
  population: AgentPopulation;
  className?: string;
}) {
  const { assigned, inSaudi, departingSoon, overdue } = population;

  return (
    <div className={cn('text-sm', className)}>
      <Level
        label="Assigned pilgrims"
        value={assigned}
        emphasis={assigned > 0 ? 'normal' : 'quiet'}
        depth={0}
      />
      <Level
        label="in Saudi Arabia"
        value={inSaudi}
        of={assigned}
        emphasis={inSaudi > 0 ? 'positive' : 'quiet'}
        depth={1}
      />
      <Level
        label="departing within 3 days"
        value={departingSoon}
        of={inSaudi}
        emphasis={departingSoon > 0 ? 'caution' : 'quiet'}
        depth={2}
      />
      <Level
        label="past the expected return date"
        value={overdue}
        of={inSaudi}
        emphasis={overdue > 0 ? 'critical' : 'quiet'}
        depth={2}
      />
      <p className="mt-2 border-t border-slate-200 pt-2 text-2xs leading-relaxed text-slate-500">
        These are nested populations, not separate groups: every pilgrim counted at an indented level is also
        counted at the level above it.
      </p>
    </div>
  );
}

function Level({
  label,
  value,
  of,
  emphasis,
  depth,
}: {
  label: string;
  value: number;
  of?: number;
  emphasis: 'normal' | 'quiet' | 'positive' | 'caution' | 'critical';
  depth: 0 | 1 | 2;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-2 py-1',
        depth === 1 && 'pl-4',
        depth === 2 && 'pl-9',
      )}
    >
      {depth > 0 && (
        <span className="shrink-0 text-slate-400" aria-hidden="true">
          ↳
        </span>
      )}
      <span
        className={cn(
          'font-display font-extrabold tabular-nums',
          depth === 0 ? 'text-lg' : 'text-base',
          emphasis === 'quiet' && 'text-slate-400',
          emphasis === 'normal' && 'text-navy-900',
          emphasis === 'positive' && 'text-emerald-800',
          emphasis === 'caution' && 'text-amber-900',
          emphasis === 'critical' && 'text-red-800',
        )}
      >
        {of != null ? `${value} of ${of}` : value}
      </span>
      <span className={cn('text-xs', emphasis === 'quiet' ? 'text-slate-400' : 'text-slate-600')}>{label}</span>
    </div>
  );
}

/** Inline, table-cell form of one nested level. */
export function NestedCount({
  value,
  of,
  emphasis = 'normal',
  indent = false,
}: {
  value: number;
  of?: number;
  emphasis?: 'normal' | 'positive' | 'caution' | 'critical';
  indent?: boolean;
}) {
  const quiet = value === 0;
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      {indent && (
        <span className="text-slate-400" aria-hidden="true">
          ↳
        </span>
      )}
      <span
        className={cn(
          'font-semibold tabular-nums',
          quiet && 'text-slate-400',
          !quiet && emphasis === 'normal' && 'text-slate-900',
          !quiet && emphasis === 'positive' && 'text-emerald-800',
          !quiet && emphasis === 'caution' && 'text-amber-900',
          !quiet && emphasis === 'critical' && 'text-red-800',
        )}
      >
        {value}
      </span>
      {of != null && <span className={cn('text-2xs', quiet ? 'text-slate-400' : 'text-slate-500')}>of {of}</span>}
    </span>
  );
}

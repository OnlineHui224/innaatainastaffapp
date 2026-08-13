import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProvenanceTag } from '@/components/ui/Badge';
import type { Provenance } from '@/lib/provenance';

export type MetricEmphasis = 'critical' | 'caution' | 'confirmed' | 'neutral';

const EMPHASIS: Record<MetricEmphasis, { frame: string; rule: string; value: string }> = {
  critical: { frame: 'border-red-300 bg-white', rule: 'bg-red-600', value: 'text-red-800' },
  caution: { frame: 'border-amber-300 bg-white', rule: 'bg-amber-600', value: 'text-amber-900' },
  confirmed: { frame: 'border-emerald-300 bg-white', rule: 'bg-emerald-700', value: 'text-emerald-900' },
  neutral: { frame: 'border-slate-300 bg-white', rule: 'bg-slate-400', value: 'text-navy-900' },
};

export interface MetricTileProps {
  label: string;
  value: number;
  /** Whether the number reflects a human confirmation or a system calculation. */
  provenance: Provenance;
  emphasis?: MetricEmphasis;
  description?: ReactNode;
  /** Rendered under the value as an indented, visually subordinate relationship. */
  subset?: {
    label: string;
    value: number;
    /** Population the subset is measured against, so it never reads as additive. */
    of: number;
    emphasis?: MetricEmphasis;
    to?: string;
  };
  context?: ReactNode;
  to?: string;
  linkLabel?: string;
  className?: string;
}

/**
 * Operational metric tile.
 *
 * A zero count is deliberately quiet; a real risk count is emphasised. Every
 * tile states whether its number is Confirmed or Derived in words, so the
 * distinction never rests on colour alone.
 */
export function MetricTile({
  label,
  value,
  provenance,
  emphasis = 'neutral',
  description,
  subset,
  context,
  to,
  linkLabel,
  className,
}: MetricTileProps) {
  const isZero = value === 0;
  const cfg = EMPHASIS[isZero ? 'neutral' : emphasis];

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-lg border', cfg.frame, className)}>
      <div className={cn('h-0.5 w-full', isZero ? 'bg-slate-200' : cfg.rule)} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-2xs font-bold uppercase tracking-wide text-slate-600">{label}</p>
          <ProvenanceTag provenance={provenance} className="shrink-0" />
        </div>

        <p
          className={cn(
            'mt-2 font-display text-3xl font-extrabold tabular-nums',
            isZero ? 'text-slate-400' : cfg.value,
          )}
        >
          {value}
        </p>

        {subset && (
          <div className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2">
            <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-slate-600">
              {/* Stated as a proportion of the parent so the two counts can never
                  be read as separate additive populations. */}
              <span
                className={cn(
                  'font-bold tabular-nums',
                  subset.value === 0
                    ? 'text-slate-500'
                    : subset.emphasis === 'critical'
                      ? 'text-red-800'
                      : 'text-slate-900',
                )}
              >
                {subset.value} of {subset.of}
              </span>{' '}
              {subset.label}
              {subset.to && subset.value > 0 && (
                <>
                  {' '}
                  <Link to={subset.to} className="font-semibold text-brand-700 hover:underline">
                    View
                  </Link>
                </>
              )}
            </p>
          </div>
        )}

        {description && <p className="mt-2 text-xs leading-relaxed text-slate-600">{description}</p>}
        {context && <div className="mt-2 text-xs leading-relaxed text-slate-600">{context}</div>}

        {to && (
          <Link
            to={to}
            className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-brand-700 hover:underline"
          >
            {linkLabel ?? 'View records'}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Compact metric used in the general-information tier. */
export function MetricLine({
  label,
  value,
  provenance,
  description,
  to,
}: {
  label: string;
  value: number;
  provenance: Provenance;
  description?: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p
          className={cn(
            'font-display text-2xl font-extrabold tabular-nums',
            value === 0 ? 'text-slate-400' : 'text-navy-900',
          )}
        >
          {value}
        </p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <ProvenanceTag provenance={provenance} />
        {description && <p className="min-w-0 truncate text-2xs text-slate-500">{description}</p>}
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="block bg-white p-4 transition-colors hover:bg-slate-50">
        {body}
      </Link>
    );
  }
  return <div className="bg-white p-4">{body}</div>;
}

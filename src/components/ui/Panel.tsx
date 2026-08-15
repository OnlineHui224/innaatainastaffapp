import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Structural edge treatment. `derived` uses the dashed/planned language. */
  edge?: 'default' | 'derived' | 'confirmed' | 'critical' | 'caution';
  as?: ElementType;
  id?: string;
}

const EDGES: Record<NonNullable<PanelProps['edge']>, string> = {
  default: 'border-slate-300',
  derived: 'border-brand-300 border-dashed bg-brand-50/30',
  confirmed: 'border-emerald-400',
  critical: 'border-red-400',
  caution: 'border-amber-400',
};

/**
 * Structural surface. Deliberately square-ish with a visible rule between the
 * header and the body — not a large rounded white card.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  edge = 'default',
  as: Tag = 'section',
  id,
}: PanelProps) {
  return (
    <Tag id={id} className={cn('rounded-lg border bg-white', EDGES[edge], className)}>
      {(title || actions) && (
        <div className="flex flex-col gap-2 border-b border-inherit px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-navy-900">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs leading-snug text-slate-600">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('px-4 py-3.5', bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** A labelled value inside a record panel. Values are ordinary text unless flagged as identifiers. */
export function DataRow({
  label,
  children,
  className,
  identifier,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  identifier?: boolean;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 text-sm text-slate-900', identifier && 'identifier text-[0.8125rem]')}>
        {children}
      </dd>
    </div>
  );
}

export function DataGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-5 gap-y-3',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** Section rule used to separate major regions without nesting another card. */
export function SectionHeading({
  children,
  description,
  actions,
  className,
}: {
  children: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-2.5 flex flex-col gap-1.5 border-b border-slate-300 pb-1.5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-navy-900">
          {children}
        </h2>
        {description && <p className="mt-0.5 text-xs leading-snug text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

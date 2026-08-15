import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded bg-slate-200/80', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(226,232,240,0.4) 0%, rgba(241,245,249,0.9) 50%, rgba(226,232,240,0.4) 100%)',
        backgroundSize: '800px 100%',
      }}
    />
  );
}

/** Skeleton stand-in for a table while its data loads. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white" aria-hidden="true">
      <div className="flex gap-4 border-b border-slate-300 bg-slate-100 px-3 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-slate-200 px-3 py-3.5 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-2.5 py-12">
      <span
        className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600"
        aria-hidden="true"
      />
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: 'neutral' | 'positive';
}

export function EmptyState({ icon, title, description, action, className, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-9 text-center',
        tone === 'positive' ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-300 bg-white',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-2.5 flex h-10 w-10 items-center justify-center rounded-md border',
            tone === 'positive'
              ? 'border-emerald-300 bg-white text-emerald-700'
              : 'border-slate-300 bg-slate-50 text-slate-500',
          )}
        >
          {icon}
        </div>
      )}
      <p className="font-display text-sm font-bold text-navy-900">{title}</p>
      {description && <div className="mt-1 max-w-md text-[0.8125rem] leading-snug text-slate-600">{description}</div>}
      {action && <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Read-only notice shown to Viewers in place of write controls. */
export function ReadOnlyNotice({
  children = 'You have Viewer access. This module is read-only for your role — records can be browsed but not created, edited, or confirmed.',
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-slate-300 bg-slate-100 px-3.5 py-2.5',
        className,
      )}
    >
      <span
        className="mt-0.5 rounded border border-slate-400 bg-white px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-slate-700"
        aria-hidden="true"
      >
        Read only
      </span>
      <p className="text-xs leading-snug text-slate-700 sm:text-[0.8125rem]">{children}</p>
    </div>
  );
}

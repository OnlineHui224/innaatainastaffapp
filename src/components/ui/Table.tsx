import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared table primitives.
 *
 * Wide tables scroll inside their own container so the page body never scrolls
 * horizontally. Where a table stops being usable on small screens, modules
 * render responsive record cards instead — see `RecordCard`.
 */
export function TableFrame({
  children,
  className,
  caption,
}: {
  children: ReactNode;
  className?: string;
  caption?: string;
}) {
  return (
    // `contain: inline-size` keeps a wide table's intrinsic width inside this
    // frame, so the horizontal scrollbar stays on the table and never on the page.
    <div className={cn('overflow-hidden rounded-lg border border-slate-300 bg-white [contain:inline-size]', className)}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-300 bg-slate-100">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-200">{children}</tbody>;
}

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  /**
   * Opt in to a single-line header.
   *
   * Headers wrap by default. A nowrap header inflates the table's min-content
   * width, which leaks past the scroll wrapper and puts a scrollbar on the whole
   * page — so it is only ever used for genuinely short labels.
   */
  nowrap?: boolean;
}

export function TH({ children, className, align = 'left', numeric, nowrap, ...rest }: THProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-2xs font-bold uppercase leading-tight tracking-wide text-slate-600',
        nowrap && 'whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        numeric && 'tabular-nums',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
}

export function TD({ children, className, align = 'left', numeric, ...rest }: TDProps) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle text-slate-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tabular-nums',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function TR({
  children,
  className,
  selected,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors hover:bg-slate-50', selected && 'bg-brand-50/60', className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

/**
 * Mobile equivalent of a table row. Modules render these below the `md`
 * breakpoint rather than shrinking a desktop table into unreadability.
 */
export function RecordCard({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: 'critical' | 'caution' | 'none';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-300 bg-white p-4',
        accent === 'critical' && 'border-l-4 border-l-red-600',
        accent === 'caution' && 'border-l-4 border-l-amber-600',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = 'records',
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row"
    >
      <p className="text-xs text-slate-600">
        Showing <span className="font-semibold tabular-nums text-slate-900">{from}</span>–
        <span className="font-semibold tabular-nums text-slate-900">{to}</span> of{' '}
        <span className="font-semibold tabular-nums text-slate-900">{total}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-1 text-xs text-slate-600" aria-live="polite">
          Page <span className="font-semibold tabular-nums">{page}</span> of{' '}
          <span className="font-semibold tabular-nums">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

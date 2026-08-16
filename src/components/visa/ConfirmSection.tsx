import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One provenance-labelled region of the final confirmation.
 *
 * The three regions are kept apart deliberately: what staff entered, what staff
 * reviewed, and which HajjERP record the save will update are different kinds
 * of fact, and collapsing them into one list would hide where each value came
 * from.
 */
export function ConfirmSection({
  title,
  provenance,
  children,
}: {
  title: string;
  /** Short tag naming how this region's values came to be. */
  provenance: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4.5 py-2.5">
        <h3 className="text-2xs font-bold uppercase tracking-[0.11em] text-navy-900">{title}</h3>
        <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-slate-700">
          {provenance}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-4.5 py-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function ConfirmRow({
  label,
  children,
  note,
  className,
}: {
  label: string;
  children: ReactNode;
  /** Supporting provenance detail, e.g. who reviewed the value and when. */
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
      {note && <p className="mt-0.5 text-2xs text-slate-500">{note}</p>}
    </div>
  );
}

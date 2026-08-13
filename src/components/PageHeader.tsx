import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Crumb } from '@/lib/navigation';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Small uppercase context line above the title. */
  eyebrow?: string;
  /** Additional row rendered below the title (filters, tabs, notices). */
  children?: ReactNode;
  className?: string;
  /**
   * @deprecated Retained so existing call sites keep compiling. The redesigned
   * header uses typographic hierarchy and rules instead of a decorative icon tile.
   */
  icon?: ReactNode;
}

/**
 * Contextual page header.
 *
 * Breadcrumbs live in the application shell (`AppLayout`) so every page gets
 * consistent wayfinding without repeating markup — the generic browser-history
 * "Back" strip has been removed in favour of that trail.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex flex-col gap-3 border-b border-slate-300 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-2xs font-bold uppercase tracking-widest text-brand-700">{eyebrow}</p>
          )}
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">
            {title}
          </h1>
          {subtitle && <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Breadcrumb trail rendered by the application shell. */
export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <li className="flex items-center gap-1">
          <Link to="/app/dashboard" className="rounded px-1 py-0.5 hover:text-slate-900 hover:underline">
            HajjERP
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
              {crumb.to && !isLast ? (
                <Link to={crumb.to} className="rounded px-1 py-0.5 hover:text-slate-900 hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="px-1 py-0.5 font-semibold text-slate-800" aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

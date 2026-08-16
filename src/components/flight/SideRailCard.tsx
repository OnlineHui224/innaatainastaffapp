import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A card in the right-hand guidance rail.
 *
 * The rail carries context that helps staff decide — what happens next, what a
 * document must show, what is still outstanding — without competing with the
 * working column for attention. It drops below the main column on narrow
 * viewports rather than being squeezed alongside it.
 */
export function SideRailCard({
  title,
  children,
  bodyClassName,
}: {
  title: string;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white">
      <h2 className="border-b border-slate-200 px-4 py-3 text-2xs font-bold uppercase tracking-[0.11em] text-navy-900">
        {title}
      </h2>
      <div className={cn('px-4 py-3.5', bodyClassName)}>{children}</div>
    </section>
  );
}

import { AlertCircle, Check, PenLine, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BLOCK_STATE_LABELS, type BlockState } from '@/types/flightOps';

const STYLES: Record<BlockState, string> = {
  ai: 'border-brand-300 bg-brand-50 text-brand-700',
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  edited: 'border-amber-400 bg-amber-50 text-amber-800',
  need: 'border-amber-400 bg-amber-50 text-amber-800',
};

const ICONS: Record<BlockState, typeof Check> = {
  ai: Sparkles,
  ok: Check,
  edited: PenLine,
  need: AlertCircle,
};

/**
 * Provenance mark for a review block.
 *
 * Carries a full readable label rather than colour alone, so the difference
 * between an AI guess and a staff confirmation survives greyscale and screen
 * readers. `Edited — not yet reviewed` is deliberately distinct from both: an
 * edit clears a review, it never stands in for one.
 */
export function BlockStateBadge({
  state,
  label,
  className,
}: {
  state: BlockState;
  /** Overrides the default wording (e.g. "Added by staff" for a manual sector). */
  label?: string;
  className?: string;
}) {
  const Icon = ICONS[state];

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1',
        'text-2xs font-bold uppercase tracking-wide',
        STYLES[state],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label ?? BLOCK_STATE_LABELS[state]}</span>
    </span>
  );
}

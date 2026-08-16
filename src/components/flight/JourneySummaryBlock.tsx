import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { BlockStateBadge } from './BlockStateBadge';
import {
  carrierLabel,
  totalPax,
  type BlockState,
  type JourneySummary,
} from '@/types/flightOps';

export interface SummaryDraft {
  passenger: string;
  pnr: string;
  carrier: string;
  adults: string;
  children: string;
}

interface JourneySummaryBlockProps {
  summary: JourneySummary;
  state: BlockState;
  confidenceLabel: string;
  editing: boolean;
  draft: SummaryDraft;
  onDraftChange: (field: keyof SummaryDraft, value: string) => void;
  onToggleEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleReviewed: () => void;
  disabled?: boolean;
}

const RAIL: Record<BlockState, string> = {
  ok: 'border-l-emerald-700',
  ai: 'border-l-brand-600',
  edited: 'border-l-amber-400',
  need: 'border-l-amber-400',
};

const LABEL = 'block text-2xs font-bold uppercase tracking-[0.13em] text-slate-500';
const INPUT =
  'w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-[0.8125rem] ' +
  'text-slate-900 transition-colors hover:border-slate-400 focus:border-brand-600';

/**
 * Journey-level facts: who is travelling, under which booking, on which carrier.
 *
 * Reviewed separately from the sectors, because a correct set of flights under
 * the wrong passenger or PNR is still the wrong itinerary.
 *
 * A missing child count reads as "Not found" and blocks review — it is never
 * quietly assumed to be zero, because that would put an unverified number on a
 * document staff are held to.
 */
export function JourneySummaryBlock({
  summary,
  state,
  confidenceLabel,
  editing,
  draft,
  onDraftChange,
  onToggleEdit,
  onSave,
  onCancel,
  onToggleReviewed,
  disabled = false,
}: JourneySummaryBlockProps) {
  const total = totalPax(summary);
  const childrenMissing = summary.children === null;

  return (
    <section
      className={cn('rounded-lg border border-l-[3px] border-slate-300 bg-white', RAIL[state])}
      aria-label="Journey summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-slate-200 px-4.5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <BlockStateBadge state={state} />
          <span className="text-xs text-slate-600">{confidenceLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onToggleEdit} disabled={disabled}>
            {editing ? 'Editing…' : 'Correct'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleReviewed}
            disabled={disabled || state === 'need'}
            className={cn(
              state === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
              state !== 'ok' && 'border-navy-800 text-navy-900',
            )}
          >
            {state === 'ok' ? 'Reviewed' : 'Mark reviewed'}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="bg-slate-50 px-4.5 py-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(168px,100%),1fr))] gap-3.5">
            <div>
              <label htmlFor="f-pax" className={cn(LABEL, 'mb-1.5')}>Primary passenger</label>
              <input id="f-pax" className={INPUT} value={draft.passenger} onChange={(e) => onDraftChange('passenger', e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-pnr" className={cn(LABEL, 'mb-1.5')}>Booking reference</label>
              <input id="f-pnr" className={cn(INPUT, 'identifier')} value={draft.pnr} onChange={(e) => onDraftChange('pnr', e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-car" className={cn(LABEL, 'mb-1.5')}>Primary carrier</label>
              <input id="f-car" className={cn(INPUT, 'identifier')} value={draft.carrier} onChange={(e) => onDraftChange('carrier', e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-ad" className={cn(LABEL, 'mb-1.5')}>Adults</label>
              <input id="f-ad" type="number" min={0} className={INPUT} value={draft.adults} onChange={(e) => onDraftChange('adults', e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-ch" className={cn(LABEL, 'mb-1.5')}>Children</label>
              <input
                id="f-ch"
                type="number"
                min={0}
                placeholder="Not found — enter"
                className={cn(INPUT, childrenMissing && !draft.children && 'border-amber-400')}
                value={draft.children}
                onChange={(e) => onDraftChange('children', e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" size="sm" onClick={onSave} className="border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900">
              Save corrections
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-xs text-slate-600">
              Saving a correction clears the reviewed mark on this block.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-5 px-4.5 pb-4 pt-4.5">
            <div className="min-w-[220px]">
              <p className={LABEL}>Primary passenger</p>
              <p className="mt-1.5 font-display text-2xl font-extrabold leading-tight tracking-tight text-navy-900">
                {summary.passenger || '—'}
              </p>
            </div>
            <div className="text-right">
              <p className={LABEL}>Booking reference (PNR)</p>
              <p className="identifier mt-1.5 text-2xl font-extrabold leading-tight tracking-wider text-brand-700">
                {summary.pnr || '—'}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(148px,100%),1fr))] border-t border-slate-200">
            <div className="border-r border-slate-100 px-4.5 py-3">
              <dt className={LABEL}>Carrier</dt>
              <dd className="mt-1 text-sm font-bold text-slate-900">{carrierLabel(summary.carrier)}</dd>
            </div>
            <div className="border-r border-slate-100 px-4.5 py-3">
              <dt className={LABEL}>Adults</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">{summary.adults}</dd>
            </div>
            <div className="border-r border-slate-100 px-4.5 py-3">
              <dt className={LABEL}>Children</dt>
              <dd className={cn('mt-1 text-sm font-bold tabular-nums', childrenMissing ? 'text-amber-700' : 'text-slate-900')}>
                {childrenMissing ? 'Not found' : summary.children}
              </dd>
            </div>
            <div className="px-4.5 py-3">
              <dt className={LABEL}>Total passengers</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">{total ?? '—'}</dd>
            </div>
          </dl>

          {state === 'need' && (
            <div className="flex flex-wrap items-center gap-3 border-t border-amber-400 bg-amber-50 px-4.5 py-3">
              <p className="min-w-0 flex-1 basis-64 text-[0.8125rem] leading-snug text-amber-900">
                The child count was not found in the source documents. Enter it before this block can
                be marked reviewed.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={onToggleEdit}
                disabled={disabled}
                className="border-amber-400 text-amber-900 hover:bg-amber-100"
              >
                Add manually
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

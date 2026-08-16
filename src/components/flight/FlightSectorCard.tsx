import { ArrowDown, ArrowUp, PenLine, Plane, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/Button';
import { BlockStateBadge } from '@/components/ReviewStateBadge';
import {
  arrivesNextDay,
  carrierLabel,
  formatSectorDate,
  humanDuration,
  missingSectorFields,
  sectorDurationMinutes,
  showTime,
  timeFormatNote,
  type BlockState,
  type FlightSector,
  type TimeFormat,
} from '@/types/flightOps';

export interface SectorDraft {
  dep: string;
  depCity: string;
  arr: string;
  arrCity: string;
  date: string;
  depT: string;
  arrT: string;
  flight: string;
  fmt: TimeFormat;
}

interface FlightSectorCardProps {
  sector: FlightSector;
  index: number;
  total: number;
  state: BlockState;
  /** True when this sector was added by staff rather than extracted. */
  addedByStaff: boolean;
  editing: boolean;
  draft: SectorDraft;
  onDraftChange: (field: keyof SectorDraft, value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleReviewed: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
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
 * One flight sector.
 *
 * Keeps the scannable origin → destination pair from the current operational
 * tool, rebuilt in the HajjERP structural language: a bordered panel with a
 * state rail down its left edge and rules between its regions.
 *
 * Two rules are load-bearing here:
 *
 *  1. TYPING IS NOT REVIEWING. Saving a correction clears the reviewed mark;
 *     only the explicit control sets it.
 *  2. TIMES ARE NEVER SILENTLY CONVERTED. Each sector records whether its own
 *     ticket printed a 12- or 24-hour clock, and is displayed that way. The
 *     format is a staff decision, shown and changed explicitly.
 */
export function FlightSectorCard({
  sector,
  index,
  total,
  state,
  addedByStaff,
  editing,
  draft,
  onDraftChange,
  onEdit,
  onSave,
  onCancel,
  onToggleReviewed,
  onMoveUp,
  onMoveDown,
  onRemove,
  disabled = false,
}: FlightSectorCardProps) {
  const segmentLabel = `Segment ${index + 1} of ${total}`;
  const missing = missingSectorFields(sector);
  const duration = sectorDurationMinutes(sector);
  const fieldId = (name: string) => `${sector.id}-${name}`;

  const needText = addedByStaff
    ? 'This sector was added manually. Complete every field, then mark it reviewed.'
    : `Not found in the source document: ${missing.join(', ')}. Add it before marking this sector reviewed.`;

  return (
    <article
      className={cn('rounded-lg border border-l-[3px] border-slate-300 bg-white', RAIL[state])}
      aria-label={segmentLabel}
    >
      {editing ? (
        <div className="rounded-r-lg bg-slate-50 px-4.5 py-4">
          <p className="mb-3.5 text-2xs font-bold uppercase tracking-[0.11em] text-navy-900">
            Correcting {segmentLabel}
          </p>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-3.5">
            <div>
              <label htmlFor={fieldId('dep')} className={cn(LABEL, 'mb-1.5')}>From (code)</label>
              <input id={fieldId('dep')} className={cn(INPUT, 'identifier uppercase')} placeholder="KAN" value={draft.dep} onChange={(e) => onDraftChange('dep', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('depcity')} className={cn(LABEL, 'mb-1.5')}>From (city)</label>
              <input id={fieldId('depcity')} className={INPUT} placeholder="Kano" value={draft.depCity} onChange={(e) => onDraftChange('depCity', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('arr')} className={cn(LABEL, 'mb-1.5')}>To (code)</label>
              <input id={fieldId('arr')} className={cn(INPUT, 'identifier uppercase')} placeholder="JED" value={draft.arr} onChange={(e) => onDraftChange('arr', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('arrcity')} className={cn(LABEL, 'mb-1.5')}>To (city)</label>
              <input id={fieldId('arrcity')} className={INPUT} placeholder="Jeddah" value={draft.arrCity} onChange={(e) => onDraftChange('arrCity', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('date')} className={cn(LABEL, 'mb-1.5')}>Date</label>
              <input id={fieldId('date')} type="date" className={INPUT} value={draft.date} onChange={(e) => onDraftChange('date', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('dept')} className={cn(LABEL, 'mb-1.5')}>Departure time</label>
              <input id={fieldId('dept')} type="time" className={INPUT} value={draft.depT} onChange={(e) => onDraftChange('depT', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('arrt')} className={cn(LABEL, 'mb-1.5')}>Arrival time</label>
              <input id={fieldId('arrt')} type="time" className={cn(INPUT, !draft.arrT && 'border-amber-400')} value={draft.arrT} onChange={(e) => onDraftChange('arrT', e.target.value)} />
            </div>
            <div>
              <label htmlFor={fieldId('flight')} className={cn(LABEL, 'mb-1.5')}>Flight number</label>
              <input id={fieldId('flight')} className={cn(INPUT, 'identifier')} placeholder="ET 0940" value={draft.flight} onChange={(e) => onDraftChange('flight', e.target.value)} />
            </div>
          </div>

          {/* Source time format — never inferred, never silently changed. */}
          <div
            role="group"
            aria-label="How the ticket prints these times"
            className="mt-3.5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5"
          >
            <span className="text-xs text-slate-600">How the ticket prints these times</span>
            <div className="flex items-center">
              {(
                [
                  ['12h', '12-hour · 1:35 pm'],
                  ['24h', '24-hour · 13:35'],
                ] as Array<[TimeFormat, string]>
              ).map(([value, label], position) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={draft.fmt === value}
                  onClick={() => onDraftChange('fmt', value)}
                  className={cn(
                    'min-h-[36px] border border-slate-300 px-3.5 py-2 text-xs font-bold transition-colors',
                    position === 0 ? 'rounded-l-lg' : 'rounded-r-lg border-l-0',
                    draft.fmt === value
                      ? 'bg-navy-800 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="min-w-0 flex-1 basis-56 text-xs text-slate-600">
              The itinerary reproduces the ticket's own format — times are never silently converted.
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" size="sm" onClick={onSave} className="border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900">
              Save sector
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-xs text-slate-600">A corrected sector must still be marked reviewed.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-tr-lg border-b border-slate-100 bg-slate-50 px-4.5 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-2xs font-bold uppercase tracking-[0.13em] text-slate-500">
                {segmentLabel}
              </span>
              <span className="text-xs font-bold text-navy-900">{formatSectorDate(sector.date)}</span>
            </div>
            <BlockStateBadge
              state={state}
              label={state === 'need' && addedByStaff ? 'Added by staff' : undefined}
            />
          </div>

          {/* Route — the sector's most scannable fact */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3.5 px-4.5 py-4">
            <div className="min-w-0 flex-1 basis-24">
              <p className="identifier text-[1.6875rem] font-extrabold leading-none text-navy-900">
                {sector.dep || '···'}
              </p>
              <p className="mt-1 text-xs text-slate-600">{sector.depCity || 'City not set'}</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
                {showTime(sector.depT, sector.fmt) || '—'}
              </p>
            </div>

            <div className="flex min-w-0 flex-[2_1_8rem] flex-col items-center gap-1.5">
              <span className="whitespace-nowrap text-xs tabular-nums text-slate-600">
                {duration ? humanDuration(duration) : 'Duration unknown'}
              </span>
              <span className="flex w-full items-center" aria-hidden="true">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                <span className="h-px flex-1 bg-slate-300" />
                <Plane className="h-3.5 w-3.5 shrink-0 rotate-90 fill-brand-600 text-brand-600" />
                <span className="h-px flex-1 bg-slate-300" />
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
              </span>
              <span className="whitespace-nowrap text-xs text-amber-700">
                {arrivesNextDay(sector) ? 'Arrives next day' : ''}
              </span>
            </div>

            <div className="min-w-0 flex-1 basis-24 text-right">
              <p className="identifier text-[1.6875rem] font-extrabold leading-none text-navy-900">
                {sector.arr || '···'}
              </p>
              <p className="mt-1 text-xs text-slate-600">{sector.arrCity || 'City not set'}</p>
              <p
                className={cn(
                  'mt-2 text-lg font-bold tabular-nums',
                  sector.arrT ? 'text-slate-900' : 'text-amber-700',
                )}
              >
                {showTime(sector.arrT, sector.fmt) || 'Not found'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-slate-100 bg-slate-50 px-4.5 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-600">{carrierLabel(sector.carrier)}</span>
              <span className="identifier rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-navy-900">
                {sector.flight || 'No flight number'}
              </span>
              <span className="text-xs text-slate-600">{timeFormatNote(sector.fmt)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 pr-1">
                <IconButton
                  label="Move sector earlier"
                  icon={<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
                  variant="secondary"
                  size="sm"
                  onClick={onMoveUp}
                  disabled={disabled || index === 0}
                />
                <IconButton
                  label="Move sector later"
                  icon={<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
                  variant="secondary"
                  size="sm"
                  onClick={onMoveDown}
                  disabled={disabled || index === total - 1}
                />
                <IconButton
                  label={`Delete ${segmentLabel}`}
                  icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  variant="secondary"
                  size="sm"
                  onClick={onRemove}
                  disabled={disabled}
                  className="hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                />
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={<PenLine className="h-3 w-3" aria-hidden="true" />}
                onClick={onEdit}
                disabled={disabled}
              >
                Correct
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

          {state === 'need' && (
            <div className="flex flex-wrap items-center gap-3 rounded-br-lg border-t border-amber-400 bg-amber-50 px-4.5 py-2.5">
              <p className="min-w-0 flex-1 basis-64 text-[0.8125rem] leading-snug text-amber-900">
                {needText}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={onEdit}
                disabled={disabled}
                className="border-amber-400 text-amber-900 hover:bg-amber-100"
              >
                Complete this sector
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

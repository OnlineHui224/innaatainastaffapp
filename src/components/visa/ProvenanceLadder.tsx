import { Bot, CheckCircle2, Database, Link2, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CASE_STAGE_LABELS, type CaseStage } from '@/types/visa';
import { formatDateTime } from '@/lib/priority';

export interface LadderStageState {
  reached: boolean;
  /** Short factual detail — confidence, officer + time, matched record, persisted time. */
  detail?: string | null;
}

export interface CaseProvenance {
  ai_extracted: LadderStageState;
  human_reviewed: LadderStageState;
  matched: LadderStageState;
  saved: LadderStageState;
}

const STAGE_ORDER: CaseStage[] = ['ai_extracted', 'human_reviewed', 'matched', 'saved'];

const STAGE_ICON = {
  ai_extracted: Bot,
  human_reviewed: UserCheck,
  matched: Link2,
  saved: Database,
} as const;

/**
 * The permanent four-stage provenance ladder for a visa case:
 *
 *   AI Extracted → Human Reviewed → Matched to HajjERP → Saved
 *
 * The four states are never collapsed into one another. All four can be — and
 * routinely are — displayed simultaneously, so the case panel always shows how
 * far a value has travelled from a machine guess to a persisted record.
 *
 * Visual language:
 *   AI Extracted     dashed / amber, with confidence
 *   Human Reviewed   solid neutral ink, with officer and time
 *   Matched          blue, with the verified record identity
 *   Saved            solid navy — the final persisted state
 */
export function ProvenanceLadder({
  provenance,
  className,
  orientation = 'vertical',
}: {
  provenance: CaseProvenance;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}) {
  return (
    <ol
      className={cn(
        orientation === 'vertical' ? 'space-y-2' : 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
      aria-label="Case provenance"
    >
      {STAGE_ORDER.map((stage) => (
        <li key={stage}>
          <LadderStage stage={stage} state={provenance[stage]} />
        </li>
      ))}
    </ol>
  );
}

function LadderStage({ stage, state }: { stage: CaseStage; state: LadderStageState }) {
  const Icon = STAGE_ICON[stage];
  const { reached, detail } = state;

  const styles = !reached
    ? 'border-dashed border-slate-300 bg-white text-slate-500'
    : stage === 'ai_extracted'
      ? 'border-dashed border-amber-500 bg-amber-50 text-amber-900'
      : stage === 'human_reviewed'
        ? 'border-slate-700 bg-slate-100 text-slate-900'
        : stage === 'matched'
          ? 'border-brand-600 bg-brand-50 text-brand-900'
          : 'border-navy-900 bg-navy-900 text-white';

  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border px-3 py-2.5', styles)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
          {CASE_STAGE_LABELS[stage]}
          {reached && <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />}
        </p>
        <p className={cn('mt-0.5 text-2xs leading-relaxed', stage === 'saved' && reached ? 'text-white/70' : 'opacity-80')}>
          {reached ? (detail ?? 'Reached') : 'Not reached yet'}
        </p>
      </div>
      <span className="sr-only">{reached ? 'Stage reached.' : 'Stage not reached.'}</span>
    </div>
  );
}

/** Convenience builder used by the logger page. */
export function buildCaseProvenance(input: {
  extractedAt: string;
  extractionConfidenceNote: string;
  verifiedCount: number;
  requiredCount: number;
  reviewOfficer: string | null;
  reviewedAt: string | null;
  matchedPilgrimName: string | null;
  matchedPassport: string | null;
  savedAt: string | null;
}): CaseProvenance {
  const allVerified = input.requiredCount > 0 && input.verifiedCount === input.requiredCount;

  return {
    ai_extracted: {
      reached: Boolean(input.extractedAt),
      detail: input.extractedAt ? input.extractionConfidenceNote : null,
    },
    human_reviewed: {
      reached: allVerified,
      detail: allVerified
        ? `${input.verifiedCount} of ${input.requiredCount} fields verified by ${
            input.reviewOfficer ?? 'the reviewing officer'
          }${input.reviewedAt ? ` · ${formatDateTime(input.reviewedAt)}` : ''}`
        : `${input.verifiedCount} of ${input.requiredCount} required fields verified`,
    },
    matched: {
      reached: Boolean(input.matchedPilgrimName),
      detail: input.matchedPilgrimName
        ? `${input.matchedPilgrimName}${input.matchedPassport ? ` · passport ${input.matchedPassport}` : ''}`
        : null,
    },
    saved: {
      reached: Boolean(input.savedAt),
      detail: input.savedAt ? `Persisted to the pilgrim record · ${formatDateTime(input.savedAt)}` : null,
    },
  };
}

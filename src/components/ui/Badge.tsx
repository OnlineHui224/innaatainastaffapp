import type { ReactNode } from 'react';
import { CheckCircle2, Circle, Crown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META, type JourneyStatus } from '@/lib/status';
import {
  journeyStatusProvenance,
  provenanceReason,
  PROVENANCE_LABEL,
  type ArrivalEvidence,
  type DepartureEvidence,
  type Provenance,
} from '@/lib/provenance';
import { ROLE_LABELS, ROLE_SHORT_LABELS, type UserRole } from '@/types';

export type Tone = 'neutral' | 'info' | 'positive' | 'caution' | 'critical' | 'accent';

/** Solid = human-confirmed. Outline = system-derived. */
const SOLID: Record<Tone, string> = {
  neutral: 'bg-slate-700 text-white border-slate-700',
  info: 'bg-brand-700 text-white border-brand-700',
  positive: 'bg-emerald-700 text-white border-emerald-700',
  caution: 'bg-amber-700 text-white border-amber-700',
  critical: 'bg-red-700 text-white border-red-700',
  accent: 'bg-gold-700 text-white border-gold-700',
};

const OUTLINE: Record<Tone, string> = {
  neutral: 'bg-white text-slate-700 border-slate-400',
  info: 'bg-brand-50 text-brand-800 border-brand-400',
  positive: 'bg-emerald-50 text-emerald-800 border-emerald-400',
  caution: 'bg-amber-50 text-amber-900 border-amber-500',
  critical: 'bg-red-50 text-red-800 border-red-400',
  accent: 'bg-gold-50 text-gold-900 border-gold-500',
};

export interface BadgeProps {
  tone?: Tone;
  /** 'solid' asserts a human-confirmed fact. 'outline' asserts a derived one. */
  treatment?: 'solid' | 'outline';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({
  tone = 'neutral',
  treatment = 'outline',
  icon,
  children,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5',
        'text-2xs font-semibold uppercase tracking-wide',
        treatment === 'solid' ? SOLID[tone] : OUTLINE[tone],
        treatment === 'outline' && 'provenance-derived',
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Maps a journey status to its semantic tone. */
const STATUS_TONE: Record<JourneyStatus, Tone> = {
  travel_scheduled: 'info',
  unverified: 'neutral',
  in_saudi_arabia: 'positive',
  departing_soon: 'caution',
  departure_overdue: 'critical',
  departure_confirmed: 'info',
};

export interface StatusBadgeProps {
  status: JourneyStatus;
  /**
   * The record itself. Provenance is read from its confirmation evidence —
   * never from the status label or a colour.
   */
  record: ArrivalEvidence & DepartureEvidence;
  /** Append a readable Confirmed/Derived word so meaning never depends on treatment alone. */
  showProvenance?: boolean;
  className?: string;
}

/**
 * Journey-status badge carrying the global provenance rule.
 *
 * The badge always keeps readable text. When `showProvenance` is set, the
 * Confirmed/Derived word is rendered alongside it, so the distinction survives
 * greyscale, colour-blindness, and screen readers.
 */
export function StatusBadge({ status, record, showProvenance = false, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const provenance = journeyStatusProvenance(status, record);
  const reason = provenanceReason(status, record);

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <Badge
        tone={STATUS_TONE[status]}
        treatment={provenance === 'confirmed' ? 'solid' : 'outline'}
        title={reason}
        icon={
          provenance === 'confirmed' ? (
            <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />
          )
        }
      >
        {meta.label}
      </Badge>
      {showProvenance && <ProvenanceTag provenance={provenance} title={reason} />}
      <span className="sr-only">
        {' '}
        — {PROVENANCE_LABEL[provenance]}. {reason}
      </span>
    </span>
  );
}

export function ProvenanceTag({
  provenance,
  title,
  className,
}: {
  provenance: Provenance;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
        provenance === 'confirmed'
          ? 'border-slate-300 bg-slate-100 text-slate-700'
          : 'border-dashed border-slate-300 bg-white text-slate-500',
        className,
      )}
    >
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}

const ROLE_TONE: Record<UserRole, { tone: Tone; treatment: 'solid' | 'outline' }> = {
  platform_owner: { tone: 'accent', treatment: 'solid' },
  super_admin: { tone: 'info', treatment: 'solid' },
  admin: { tone: 'info', treatment: 'outline' },
  operations_manager: { tone: 'positive', treatment: 'outline' },
  operations_staff: { tone: 'neutral', treatment: 'outline' },
  viewer: { tone: 'neutral', treatment: 'outline' },
};

/**
 * System role badge. Deliberately uppercase and boxed so a SYSTEM ROLE can never
 * be misread as a job title, which is always rendered as ordinary text.
 */
export function RoleBadge({
  role,
  short = false,
  className,
}: {
  role: UserRole;
  short?: boolean;
  className?: string;
}) {
  const cfg = ROLE_TONE[role];
  return (
    <Badge
      tone={cfg.tone}
      treatment={cfg.treatment}
      className={cn('rounded-sm', className)}
      title={`System role: ${ROLE_LABELS[role]}`}
      icon={
        role === 'platform_owner' ? (
          <Crown className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : role === 'super_admin' ? (
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : undefined
      }
    >
      {short ? ROLE_SHORT_LABELS[role] : ROLE_LABELS[role]}
    </Badge>
  );
}

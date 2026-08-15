import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Four risk tiers for administrative actions.
 *
 * The tier controls how loudly an action is presented and how much friction it
 * carries. It never relaxes what the backend requires — server-side password
 * verification and role checks stay exactly as they are.
 */
export type RiskTier = 'normal' | 'sensitive' | 'high' | 'critical';

export const RISK_TIER_LABEL: Record<RiskTier, string> = {
  normal: 'Normal',
  sensitive: 'Sensitive',
  high: 'High risk',
  critical: 'Critical',
};

export const RISK_TIER_DESCRIPTION: Record<RiskTier, string> = {
  normal: 'Routine administration. Reversible.',
  sensitive: 'Affects another person’s access. Reversible, but disruptive.',
  high: 'Changes what someone can do, or removes their account.',
  critical: 'Irreversible, platform-level. Changes who controls this platform.',
};

const TIER_STYLES: Record<RiskTier, string> = {
  normal: 'border-slate-300 bg-white text-slate-700',
  sensitive: 'border-brand-400 bg-brand-50 text-brand-900',
  high: 'border-amber-500 bg-amber-50 text-amber-900',
  critical: 'border-gold-600 bg-gold-50 text-gold-900',
};

export function RiskTierTag({ tier, className }: { tier: RiskTier; className?: string }) {
  return (
    <span
      title={RISK_TIER_DESCRIPTION[tier]}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide',
        TIER_STYLES[tier],
        className,
      )}
    >
      {RISK_TIER_LABEL[tier]}
    </span>
  );
}

/** Menu entry for an administrative action, labelled with its risk tier. */
export function RiskAction({
  tier,
  label,
  description,
  icon,
  onClick,
  disabled,
  disabledReason,
}: {
  tier: RiskTier;
  label: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : RISK_TIER_DESCRIPTION[tier]}
      className={cn(
        'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        tier === 'critical' ? 'hover:bg-gold-50' : tier === 'high' ? 'hover:bg-amber-50' : 'hover:bg-slate-50',
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 text-slate-500">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800">{label}</span>
          {tier !== 'normal' && <RiskTierTag tier={tier} />}
        </span>
        {(description || (disabled && disabledReason)) && (
          <span className="mt-0.5 block text-2xs leading-relaxed text-slate-500">
            {disabled && disabledReason ? disabledReason : description}
          </span>
        )}
      </span>
    </button>
  );
}

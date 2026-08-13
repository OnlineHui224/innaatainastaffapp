import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertTone = 'info' | 'success' | 'warning' | 'critical';

const TONES: Record<AlertTone, { wrap: string; icon: string; Icon: typeof Info; role: 'status' | 'alert' }> = {
  info: {
    wrap: 'border-brand-200 bg-brand-50 text-brand-900',
    icon: 'text-brand-700',
    Icon: Info,
    role: 'status',
  },
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: 'text-emerald-700',
    Icon: CheckCircle2,
    role: 'status',
  },
  warning: {
    wrap: 'border-amber-300 bg-amber-50 text-amber-900',
    icon: 'text-amber-700',
    Icon: AlertTriangle,
    role: 'status',
  },
  critical: {
    wrap: 'border-red-300 bg-red-50 text-red-900',
    icon: 'text-red-700',
    Icon: AlertCircle,
    role: 'alert',
  },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  actions?: ReactNode;
}

export function Alert({ tone = 'info', title, children, onDismiss, className, actions }: AlertProps) {
  const cfg = TONES[tone];
  const Icon = cfg.Icon;

  return (
    <div role={cfg.role} className={cn('flex items-start gap-3 rounded-md border p-4', cfg.wrap, className)}>
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cfg.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-bold">{title}</p>}
        {children && <div className={cn('text-sm leading-relaxed', Boolean(title) && 'mt-1')}>{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className={cn('shrink-0 rounded p-1 transition-opacity hover:opacity-70', cfg.icon)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

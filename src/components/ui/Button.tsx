import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'critical'
  | 'confirm';

export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold ' +
  'transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed ' +
  'disabled:pointer-events-none border';

const VARIANTS: Record<ButtonVariant, string> = {
  /* Enterprise blue — the standard operational action */
  primary: 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700 hover:border-brand-700',
  /* Structural outline — the default for secondary actions */
  secondary: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  /* Reversible destructive action */
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300',
  /* Irreversible destructive action */
  critical: 'border-red-700 bg-red-700 text-white hover:bg-red-800 hover:border-red-800',
  /* Recording a genuine, human-confirmed operational event */
  confirm: 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 hover:border-emerald-800',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, icon, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps {
  to: string;
  'aria-label'?: string;
  title?: string;
  onClick?: () => void;
}

/** Router link styled as a button. Renders a real anchor for keyboard and screen readers. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'danger' | 'secondary';
  size?: 'sm' | 'md';
}

/**
 * Icon-only control. `label` is mandatory — an icon alone is never an accessible name.
 * Touch target stays at least 32px (sm) / 40px (md).
 */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        variant === 'ghost' && 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900',
        variant === 'secondary' && 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
        variant === 'danger' && 'border-transparent text-slate-500 hover:bg-red-50 hover:text-red-700',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

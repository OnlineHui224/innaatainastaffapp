import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONTROL =
  'w-full rounded-md border border-slate-300 bg-white text-sm text-slate-900 ' +
  'placeholder:text-slate-400 transition-colors ' +
  'hover:border-slate-400 focus:border-brand-600 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const CONTROL_INVALID = 'border-red-400 hover:border-red-500 focus:border-red-600';

export interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  /** Optional trailing element rendered on the label row (e.g. a verification control). */
  action?: ReactNode;
}

/**
 * Label + control + hint/error wrapper.
 * The hint and error are wired to the control through aria-describedby by the
 * Input/Textarea/Select components below when they receive an `id`.
 */
export function Field({ label, htmlFor, required, hint, error, children, className, action }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-700">
          {label}
          {required && (
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="mt-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Render the value in the operational-identifier monospace face. */
  identifier?: boolean;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, identifier, leadingIcon, ...rest },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        'h-10 px-3 max-sm:min-h-[44px]',
        Boolean(leadingIcon) && 'pl-9',
        identifier && 'identifier',
        invalid && CONTROL_INVALID,
        className,
      )}
      {...rest}
    />
  );

  if (!leadingIcon) return control;

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        {leadingIcon}
      </span>
      {control}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'resize-y px-3 py-2', invalid && CONTROL_INVALID, className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'h-10 px-2.5 font-medium max-sm:min-h-[44px]', invalid && CONTROL_INVALID, className)}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  onClear?: () => void;
}

/**
 * Search control with an always-present accessible name and a clear affordance.
 * The visible label may be hidden, but the field is never unlabelled.
 */
export function SearchInput({
  value,
  onValueChange,
  label,
  onClear,
  className,
  id,
  ...rest
}: SearchInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(CONTROL, 'h-10 pl-9 pr-9 max-sm:min-h-[44px]')}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onValueChange('');
            onClear?.();
          }}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * Operational identifier: passport, visa, flight, batch, licence, reference.
 * Never use for names, headings, ordinary dates, or KPI numbers.
 */
export function Identifier({
  value,
  className,
  fallback = '—',
}: {
  value: string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  if (!value) return <span className={cn('text-slate-400', className)}>{fallback}</span>;
  return <span className={cn('identifier text-[0.8125rem] text-slate-700', className)}>{value}</span>;
}

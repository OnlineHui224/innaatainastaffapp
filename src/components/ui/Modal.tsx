import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

let openModalCount = 0;

/**
 * Locks page scroll while any modal/drawer is open. Reference-counted so nested
 * surfaces (e.g. a confirm dialog above a drawer) restore scroll correctly.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    if (openModalCount === 0) {
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.dataset.prevOverflow = body.style.overflow;
      body.dataset.prevPaddingRight = body.style.paddingRight;
      body.style.overflow = 'hidden';
      if (scrollBarWidth > 0) body.style.paddingRight = `${scrollBarWidth}px`;
    }
    openModalCount += 1;

    return () => {
      openModalCount -= 1;
      if (openModalCount === 0) {
        body.style.overflow = body.dataset.prevOverflow ?? '';
        body.style.paddingRight = body.dataset.prevPaddingRight ?? '';
        delete body.dataset.prevOverflow;
        delete body.dataset.prevPaddingRight;
      }
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside `containerRef`, moves initial focus into the surface,
 * and restores focus to the previously focused element on close.
 */
export function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const target =
        container.querySelector<HTMLElement>('[data-autofocus]') ??
        container.querySelector<HTMLElement>(FOCUSABLE) ??
        container;
      target.focus();
    };
    // Defer so the surface is painted before focus moves.
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Blocks Escape and the backdrop while a request is in flight. */
  busy?: boolean;
  /** Gold rule reserved for genuinely critical, irreversible actions. */
  critical?: boolean;
  icon?: ReactNode;
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Accessible modal surface: role="dialog", aria-modal, labelled title,
 * Escape to close, focus trap, scroll lock, restored focus.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  busy,
  critical,
  icon,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useScrollLock(open);
  useFocusTrap(open, panelRef);

  const handleClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="fixed inset-0 bg-navy-950/60 animate-fade-in"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative my-auto w-full rounded-lg border border-slate-300 bg-white shadow-overlay animate-scale-in',
          SIZES[size],
        )}
      >
        {critical && <div className="h-1 rounded-t-lg bg-gold-500" aria-hidden="true" />}
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5">
          {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-[0.9375rem] font-bold leading-snug text-navy-900">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[0.8125rem] leading-snug text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label="Close dialog"
            className="-mr-1 shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {children && <div className="max-h-[68vh] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>}

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-2.5 sm:flex-row sm:items-center sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

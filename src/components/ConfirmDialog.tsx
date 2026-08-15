import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
  /** Gold rule + critical styling, reserved for irreversible platform-level actions. */
  critical?: boolean;
  /** Disables the confirm control until the caller's safeguards are satisfied. */
  confirmDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
}

/**
 * Standard confirmation surface. Built on the accessible `Modal` primitive so
 * every confirmation gets focus trapping, Escape handling, scroll locking and
 * a labelled dialog role for free.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading,
  danger,
  critical,
  confirmDisabled,
  size = 'md',
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      busy={loading}
      critical={critical}
      size={size}
      icon={
        danger || critical ? (
          <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden="true" />
        ) : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={critical || danger ? 'critical' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <div className="text-sm leading-relaxed text-slate-700">{message}</div>}
      {children}
    </Modal>
  );
}

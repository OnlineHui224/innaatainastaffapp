import { useId, useRef, useState, type FormEvent } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/Logo';
import { friendlyError } from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useFocusTrap, useScrollLock } from '@/components/ui/Modal';

/**
 * Blocking password-change surface.
 *
 * Intentionally not dismissible: an Administrator has required this change, so
 * the only exits are setting a new password or signing out. It still carries a
 * dialog role, a focus trap and a scroll lock so it is operable by keyboard.
 */
export function PasswordChangeModal() {
  const { profile, updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const required = Boolean(profile?.must_change_password);
  useScrollLock(required);
  useFocusTrap(required, panelRef);

  if (!required) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);
    if (updateError) {
      setError(friendlyError({ message: updateError }));
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-navy-950/85 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-slate-300 bg-white shadow-overlay"
      >
        <div className="h-1 rounded-t-lg bg-gold-500" aria-hidden="true" />
        <div className="border-b border-slate-200 px-6 py-5 text-center">
          <LogoMark size={44} className="mx-auto mb-3 rounded-md bg-white p-1" />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gold-300 bg-gold-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-gold-900">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            Security action required
          </span>
          <h2 id={titleId} className="mt-3 font-display text-lg font-bold text-navy-900">
            Change your password
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            An Administrator has required you to set a new password before continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5" noValidate>
          {error && <Alert tone="critical">{error}</Alert>}

          <Field label="New password" htmlFor="new-password" required hint="At least 6 characters.">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={Boolean(error)}
              data-autofocus
              leadingIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
            />
          </Field>

          <Field label="Confirm new password" htmlFor="confirm-password" required>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              invalid={Boolean(error)}
              leadingIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
            />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={loading}>
            Set new password
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => signOut()}>
            Sign out instead
          </Button>
        </form>
      </div>
    </div>
  );
}

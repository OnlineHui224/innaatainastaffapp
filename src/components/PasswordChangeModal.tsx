import { useState, type FormEvent } from 'react';
import { Lock, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/Logo';
import { friendlyError } from '@/lib/validation';

export function PasswordChangeModal() {
  const { profile, updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile?.must_change_password) return null;

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
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      setError(friendlyError({ message: error }));
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl animate-scale-in">
        <div className="p-6 text-center border-b border-slate-100">
          <LogoMark size={48} className="rounded-full bg-white p-1 mx-auto mb-3" />
          <div className="inline-flex items-center gap-2 rounded-full bg-gold-50 border border-gold-200 px-3 py-1 mb-3">
            <ShieldCheck className="h-4 w-4 text-gold-700" />
            <span className="text-xs font-semibold text-gold-800">Security Action Required</span>
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900">Change Your Password</h2>
          <p className="mt-2 text-sm text-slate-500">
            An administrator has required you to set a new password before continuing.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-600 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            Set New Password
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}

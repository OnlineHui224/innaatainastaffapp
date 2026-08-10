import { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';

/**
 * One-time admin bootstrap.
 * Shows a banner when the current user is NOT an admin AND no admin exists yet.
 * Once an admin exists, bootstrap is permanently disabled.
 */
export function BootstrapBanner() {
  const { profile, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(true);
  const [adminExists, setAdminExists] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    checkAdminExists();
  }, []);

  async function checkAdminExists() {
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'platform_owner')
        .limit(1);
      if (error) throw error;
      setAdminExists((data || []).length > 0);
    } catch (e) {
      console.error('Failed to check admin status:', e);
    } finally {
      setChecking(false);
    }
  }

  async function handleBootstrap() {
    setBootstrapping(true);
    setError(null);
    try {
      // Call the secure RPC function
      const { data, error } = await supabase.rpc('bootstrap_first_admin');
      if (error) throw error;
      const result = data as { success: boolean; message: string };
      if (!result.success) {
        setError(result.message);
        return;
      }
      await logAudit({
        action: 'staff_role_changed',
        recordType: 'staff_user',
        recordId: profile?.id ?? null,
        recordLabel: profile?.full_name ?? '',
        previousValue: { role: 'operations_staff' },
        newValue: { role: 'administrator' },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
      await refreshProfile();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bootstrap failed.');
    } finally {
      setBootstrapping(false);
    }
  }

  if (checking) return null;
  if (adminExists) return null;
  if (profile?.role === 'platform_owner') return null;
  if (done) return null;

  return (
    <div className="mb-6 rounded-2xl border-2 border-gold-300 bg-gradient-to-r from-gold-50 to-amber-50 p-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold-500 text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-gold-900">Initial Administrator Setup</h3>
            <p className="mt-1 text-sm text-gold-800/80 max-w-xl">
              No administrator has been designated yet. As the project owner, you can set yourself as the initial Administrator. This one-time setup is permanently disabled once an Administrator exists.
            </p>
            {error && (
              <p className="mt-2 text-sm text-red-700 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleBootstrap}
          disabled={bootstrapping}
          className="inline-flex items-center gap-2 rounded-xl bg-gold-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-gold-700 transition-all active:scale-95 disabled:opacity-50 shrink-0"
        >
          {bootstrapping ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          Become Administrator
        </button>
      </div>
    </div>
  );
}

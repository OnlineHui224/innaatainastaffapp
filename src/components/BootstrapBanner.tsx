import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/Button';

/**
 * One-time platform-owner bootstrap.
 * Shows only while no Platform Owner exists. Once one exists, bootstrap is
 * permanently disabled — the banner never returns.
 */
export function BootstrapBanner() {
  const { profile, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(true);
  const [ownerExists, setOwnerExists] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkOwnerExists() {
      try {
        const { data, error: queryError } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'platform_owner')
          .limit(1);
        if (queryError) throw queryError;
        if (active) setOwnerExists((data || []).length > 0);
      } catch (e) {
        console.error('Failed to check platform owner status:', e);
      } finally {
        if (active) setChecking(false);
      }
    }
    checkOwnerExists();
    return () => {
      active = false;
    };
  }, []);

  async function handleBootstrap() {
    setBootstrapping(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('bootstrap_first_admin');
      if (rpcError) throw rpcError;
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
      console.error('Bootstrap failed:', e);
      setError('This step could not be completed. Please contact your administrator.');
    } finally {
      setBootstrapping(false);
    }
  }

  if (checking || ownerExists || done) return null;
  if (profile?.role === 'platform_owner') return null;

  return (
    <section
      aria-labelledby="bootstrap-heading"
      className="mb-6 overflow-hidden rounded-lg border border-slate-300 bg-white"
    >
      {/* Gold rule — deliberate, reserved for platform-ownership level actions */}
      <div className="h-1 bg-gold-500" aria-hidden="true" />
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="bootstrap-heading" className="font-display text-sm font-bold uppercase tracking-wide text-navy-900">
            Initial platform owner setup
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            No Platform Owner has been designated yet. You can claim the role once. This one-time setup is
            permanently disabled as soon as a Platform Owner exists.
          </p>
          {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
        </div>
        <Button
          onClick={handleBootstrap}
          loading={bootstrapping}
          icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          className="shrink-0"
        >
          Become Platform Owner
        </Button>
      </div>
    </section>
  );
}

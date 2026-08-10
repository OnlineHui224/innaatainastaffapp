import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';
import {
  canManageStaff,
  canViewAudit,
  canEditPilgrims,
  canDeleteRecords,
  canUseSampleData,
  canManageSuperAdmins,
  canTransferOwnership,
} from '@/lib/permissions';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  // Permission flags
  isPlatformOwner: boolean;
  isSuperAdminOrHigher: boolean;
  isAdminOrHigher: boolean;
  canManageStaff: boolean;
  canViewAudit: boolean;
  canEditPilgrims: boolean;
  canDeleteRecords: boolean;
  canUseSampleData: boolean;
  canManageSuperAdmins: boolean;
  canTransferOwnership: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, job_title, is_active, must_change_password, last_login_at, created_by_id, promoted_by_name, deactivated_by_id, deactivated_at, created_at, updated_at')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    if (!data) return null;

    const email = session?.user?.email ?? '';
    return {
      ...data,
      email,
      role: data.role as UserRole,
    } as Profile;
  }, [session?.user?.email]);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      const p = await fetchProfile(session.user.id);
      setProfile(p);
    }
  }, [session?.user?.id, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user?.id) {
        fetchProfile(s.user.id).then((p) => {
          if (mounted) {
            setProfile(p);
            setLoading(false);
          }
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user?.id) {
        fetchProfile(s.user.id).then((p) => {
          if (mounted) setProfile(p);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // Record last login
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
      }
      return { error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const updatePassword = useCallback(
    async (newPassword: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      // Clear the must_change_password flag
      if (session?.user?.id) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false, updated_at: new Date().toISOString() })
          .eq('id', session.user.id);
        await refreshProfile();
      }
      return { error: null };
    },
    [session?.user?.id, refreshProfile]
  );

  const role = profile?.role;

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
    updatePassword,
    isPlatformOwner: role === 'platform_owner',
    isSuperAdminOrHigher: role === 'platform_owner' || role === 'super_admin',
    isAdminOrHigher: canManageStaff(role),
    canManageStaff: canManageStaff(role),
    canViewAudit: canViewAudit(role),
    canEditPilgrims: canEditPilgrims(role),
    canDeleteRecords: canDeleteRecords(role),
    canUseSampleData: canUseSampleData(role),
    canManageSuperAdmins: canManageSuperAdmins(role),
    canTransferOwnership: canTransferOwnership(role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Loader2,
  Mail,
  MoreVertical,
  X,
  AlertCircle,
  CheckCircle2,
  Ban,
  Crown,
  ArrowUpCircle,
  KeyRound,
  Trash2,
  ArrowRightLeft,
  Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { validateEmail, friendlyError } from '@/lib/validation';
import { PageHeader } from '@/components/PageHeader';
import {
  ROLE_LABELS,
  JOB_TITLE_SUGGESTIONS,
  type Profile,
  type UserRole,
} from '@/types';
import {
  ROLE_BADGE_STYLES,
  canChangeRole,
  canSuspend,
  canResetPassword,
  canDeleteUser,
} from '@/lib/permissions';
import {
  adminCreateUser,
  adminResetPassword,
  adminDeleteUser,
  changeStaffRole,
  suspendStaffAccount,
  activateStaffAccount,
  transferPlatformOwnership,
  requirePasswordChange,
} from '@/lib/adminApi';

interface StaffUser extends Profile {
  email: string;
  created_by_profile?: { full_name: string } | null;
}

type ModalType =
  | { kind: 'invite' }
  | { kind: 'role'; user: StaffUser; newRole: UserRole }
  | { kind: 'suspend'; user: StaffUser }
  | { kind: 'activate'; user: StaffUser }
  | { kind: 'reset_password'; user: StaffUser }
  | { kind: 'require_pw_change'; user: StaffUser }
  | { kind: 'delete'; user: StaffUser }
  | { kind: 'transfer_ownership'; user: StaffUser };

export default function StaffUsersPage() {
  const {
    profile,
    canManageSuperAdmins,
    canTransferOwnership,
    refreshProfile,
    isSuperAdminOrHigher,
  } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modal, setModal] = useState<ModalType | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Password confirmation for secure actions
  const [actorPassword, setActorPassword] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteTitle, setInviteTitle] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('operations_staff');
  const [inviteRequirePwChange, setInviteRequirePwChange] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Reset password form
  const [newPassword, setNewPassword] = useState('');

  // Ownership transfer
  const [transferConfirmText, setTransferConfirmText] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, created_by_profile:created_by_id(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const profiles = (data || []) as unknown as Array<Profile & { created_by_profile?: { full_name: string } | null }>;
      const currentEmail = profile?.email || '';

      const usersWithEmail: StaffUser[] = profiles.map((p) => ({
        ...p,
        email: p.id === profile?.id ? currentEmail : '(email protected)',
        created_by_profile: p.created_by_profile,
      }));

      setUsers(usersWithEmail);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.email]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q)
    );
  });

  function resetActionState() {
    setActionError(null);
    setActorPassword('');
    setNewPassword('');
    setTransferConfirmText('');
  }

  function closeModal() {
    setModal(null);
    resetActionState();
  }

  async function handleInvite() {
    setInviteError(null);
    if (!inviteEmail.trim() || !invitePassword) {
      setInviteError('Email and password are required.');
      return;
    }
    if (!validateEmail(inviteEmail)) {
      setInviteError('Email address is not valid.');
      return;
    }
    if (invitePassword.length < 6) {
      setInviteError('Password must be at least 6 characters.');
      return;
    }
    setActionLoading(true);
    const result = await adminCreateUser({
      email: inviteEmail.trim(),
      password: invitePassword,
      full_name: inviteName.trim(),
      job_title: inviteTitle.trim(),
      role: inviteRole,
      require_password_change: inviteRequirePwChange,
    });
    setActionLoading(false);
    if (result.error) {
      setInviteError(result.error);
      return;
    }
    setModal(null);
    setInviteEmail('');
    setInviteName('');
    setInviteTitle('');
    setInvitePassword('');
    setInviteRole('operations_staff');
    setInviteRequirePwChange(true);
    setSuccessMsg('Staff account created successfully.');
    await fetchUsers();
  }

  async function handleRoleChange() {
    if (!modal || modal.kind !== 'role') return;
    setActionError(null);
    if (!actorPassword) {
      setActionError('Please enter your password to confirm this role change.');
      return;
    }
    setActionLoading(true);
    const result = await changeStaffRole({
      target_uid: modal.user.id,
      new_role: modal.newRole,
      actor_password: actorPassword,
    });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name} is now ${ROLE_LABELS[modal.newRole]}.`);
    closeModal();
    await fetchUsers();
  }

  async function handleSuspend() {
    if (!modal || modal.kind !== 'suspend') return;
    setActionError(null);
    if (!actorPassword) {
      setActionError('Please enter your password to confirm this action.');
      return;
    }
    setActionLoading(true);
    const result = await suspendStaffAccount({
      target_uid: modal.user.id,
      actor_password: actorPassword,
    });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name}'s account has been suspended.`);
    closeModal();
    await fetchUsers();
  }

  async function handleActivate() {
    if (!modal || modal.kind !== 'activate') return;
    setActionLoading(true);
    const result = await activateStaffAccount({ target_uid: modal.user.id });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name}'s account has been activated.`);
    closeModal();
    await fetchUsers();
  }

  async function handleResetPassword() {
    if (!modal || modal.kind !== 'reset_password') return;
    setActionError(null);
    if (!newPassword || newPassword.length < 6) {
      setActionError('New password must be at least 6 characters.');
      return;
    }
    setActionLoading(true);
    const result = await adminResetPassword({
      target_uid: modal.user.id,
      new_password: newPassword,
    });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`Password reset for ${modal.user.full_name}. They must change it at next login.`);
    closeModal();
  }

  async function handleRequirePwChange() {
    if (!modal || modal.kind !== 'require_pw_change') return;
    setActionLoading(true);
    const result = await requirePasswordChange({ target_uid: modal.user.id });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name} will be required to change their password at next login.`);
    closeModal();
    await fetchUsers();
  }

  async function handleDelete() {
    if (!modal || modal.kind !== 'delete') return;
    setActionLoading(true);
    const result = await adminDeleteUser({ target_uid: modal.user.id });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name}'s account has been deleted.`);
    closeModal();
    await fetchUsers();
  }

  async function handleTransferOwnership() {
    if (!modal || modal.kind !== 'transfer_ownership') return;
    setActionError(null);
    if (!actorPassword) {
      setActionError('Please enter your password to confirm the ownership transfer.');
      return;
    }
    if (transferConfirmText !== 'TRANSFER OWNERSHIP') {
      setActionError('Please type "TRANSFER OWNERSHIP" exactly to confirm.');
      return;
    }
    setActionLoading(true);
    const result = await transferPlatformOwnership({
      target_uid: modal.user.id,
      actor_password: actorPassword,
    });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await refreshProfile();
    setSuccessMsg(`Platform ownership transferred to ${modal.user.full_name}.`);
    closeModal();
    await fetchUsers();
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all';
  const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5';

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle={`${users.length} staff account${users.length !== 1 ? 's' : ''}`}
        icon={<ShieldCheck className="h-6 w-6" />}
        actions={
          <button
            onClick={() => { setInviteError(null); setModal({ kind: 'invite' }); }}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95"
          >
            <UserPlus className="h-4 w-4" /> Add Staff Member
          </button>
        }
      />

      {successMsg && (
        <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800">{successMsg}</p>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, role, or job title..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          >
            <option value="all">All Roles</option>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden md:table-cell">Job Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden sm:table-cell">Created</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === profile?.id;
                  return (
                    <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white uppercase">
                            {u.full_name.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {u.full_name || 'Unnamed'}
                              {isSelf && <span className="ml-2 text-[10px] font-semibold text-brand-600">(You)</span>}
                            </p>
                            <p className="text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{u.job_title || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${ROLE_BADGE_STYLES[u.role]}`}>
                          {u.role === 'platform_owner' && <Crown className="h-3 w-3" />}
                          {u.role === 'super_admin' && <ShieldCheck className="h-3 w-3" />}
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.is_active ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell text-xs">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === u.id ? null : u.id); }}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {menuOpen === u.id && (
                          <ActionMenu
                            user={u}
                            actorId={profile?.id ?? ''}
                            actorRole={profile?.role}
                            canTransferOwnership={canTransferOwnership}
                            onAction={(m) => { setMenuOpen(null); resetActionState(); setModal(m); }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {modal?.kind === 'invite' && (
        <ModalShell title="Add Staff Member" onClose={closeModal} loading={actionLoading}>
          {inviteError && (
            <ErrorBanner message={inviteError} />
          )}
          {inviteRole === 'super_admin' && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Super Administrators have access to all pilgrims, staff, reports, operational records, and system settings. Only grant this role to highly trusted senior officers.
              </p>
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name</label>
                <input className={inputCls} value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Staff member name" />
              </div>
              <div>
                <label className={labelCls}>Job Title</label>
                <input className={inputCls} value={inviteTitle} onChange={(e) => setInviteTitle(e.target.value)} placeholder="e.g. CEO, Operations Manager" list="job-titles" />
                <datalist id="job-titles">
                  {JOB_TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className={labelCls}>Email <span className="text-red-500">*</span></label>
              <input type="email" className={inputCls} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="new.staff@innaataina.com" />
            </div>
            <div>
              <label className={labelCls}>Temporary Password <span className="text-red-500">*</span></label>
              <input type="password" className={inputCls} value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <div>
              <label className={labelCls}>System Role</label>
              <select className={inputCls} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => {
                  const disabled = (r === 'platform_owner') || (r === 'super_admin' && !canManageSuperAdmins) || (r === 'admin' && !isSuperAdminOrHigher);
                  return (
                    <option key={r} value={r} disabled={disabled}>
                      {ROLE_LABELS[r]}{r === 'platform_owner' ? ' (cannot be assigned)' : ''}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">Job title is for identification. System role controls permissions.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={inviteRequirePwChange} onChange={(e) => setInviteRequirePwChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-200" />
              <span className="text-sm text-slate-600">Require password change at next login</span>
            </label>
          </div>
          <ModalFooter onCancel={closeModal} onConfirm={handleInvite} confirmLabel="Create Account" loading={actionLoading} icon={<Mail className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Role Change Modal */}
      {modal?.kind === 'role' && (
        <ModalShell title={`Change Role — ${modal.user.full_name}`} onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          {modal.newRole === 'super_admin' && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Super Administrators have access to all pilgrims, staff, reports, operational records, and system settings. Only grant this role to highly trusted senior officers.
              </p>
            </div>
          )}
          <p className="text-sm text-slate-600">
            Change <strong>{modal.user.full_name}</strong>'s role from <strong>{ROLE_LABELS[modal.user.role]}</strong> to <strong>{ROLE_LABELS[modal.newRole]}</strong>?
          </p>
          <PasswordConfirm label="Enter your password to confirm this role change" password={actorPassword} onChange={setActorPassword} />
          <ModalFooter onCancel={closeModal} onConfirm={handleRoleChange} confirmLabel="Confirm Role Change" loading={actionLoading} danger={modal.newRole === 'super_admin'} icon={<ArrowUpCircle className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Suspend Modal */}
      {modal?.kind === 'suspend' && (
        <ModalShell title={`Suspend Account — ${modal.user.full_name}`} onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          <p className="text-sm text-slate-600">
            Suspend <strong>{modal.user.full_name}</strong>? They will no longer be able to sign in until reactivated.
          </p>
          <PasswordConfirm label="Enter your password to confirm suspension" password={actorPassword} onChange={setActorPassword} />
          <ModalFooter onCancel={closeModal} onConfirm={handleSuspend} confirmLabel="Suspend Account" loading={actionLoading} danger icon={<Ban className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Activate Modal */}
      {modal?.kind === 'activate' && (
        <ModalShell title={`Activate Account — ${modal.user.full_name}`} onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          <p className="text-sm text-slate-600">
            Activate <strong>{modal.user.full_name}</strong>? They will be able to sign in again.
          </p>
          <ModalFooter onCancel={closeModal} onConfirm={handleActivate} confirmLabel="Activate Account" loading={actionLoading} icon={<CheckCircle2 className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Reset Password Modal */}
      {modal?.kind === 'reset_password' && (
        <ModalShell title={`Reset Password — ${modal.user.full_name}`} onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          <p className="text-sm text-slate-600">
            Set a new temporary password for <strong>{modal.user.full_name}</strong>. They will be required to change it at their next login.
          </p>
          <div>
            <label className={labelCls}>New Temporary Password</label>
            <input type="password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <ModalFooter onCancel={closeModal} onConfirm={handleResetPassword} confirmLabel="Reset Password" loading={actionLoading} icon={<KeyRound className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Require Password Change Modal */}
      {modal?.kind === 'require_pw_change' && (
        <ModalShell title={`Require Password Change — ${modal.user.full_name}`} onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          <p className="text-sm text-slate-600">
            <strong>{modal.user.full_name}</strong> will be required to set a new password at their next login.
          </p>
          <ModalFooter onCancel={closeModal} onConfirm={handleRequirePwChange} confirmLabel="Require Change" loading={actionLoading} icon={<Lock className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Delete Modal */}
      {modal?.kind === 'delete' && (
        <ModalShell title={`Delete Account — ${modal.user.full_name}`} onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          <p className="text-sm text-red-700">
            Permanently delete <strong>{modal.user.full_name}</strong>'s account? This action cannot be undone. All their audit records will remain.
          </p>
          <ModalFooter onCancel={closeModal} onConfirm={handleDelete} confirmLabel="Delete Account" loading={actionLoading} danger icon={<Trash2 className="h-4 w-4" />} />
        </ModalShell>
      )}

      {/* Transfer Ownership Modal */}
      {modal?.kind === 'transfer_ownership' && (
        <ModalShell title="Transfer Platform Ownership" onClose={closeModal} loading={actionLoading}>
          {actionError && <ErrorBanner message={actionError} />}
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <Crown className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Critical Action</p>
                <p className="mt-1 text-sm text-red-700">
                  You are about to transfer Platform Ownership to <strong>{modal.user.full_name}</strong>. You will become a Super Administrator. This action is recorded in the audit log and cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <PasswordConfirm label="Enter your password to confirm the transfer" password={actorPassword} onChange={setActorPassword} />
          <div>
            <label className={labelCls}>Type "TRANSFER OWNERSHIP" to confirm</label>
            <input className={inputCls} value={transferConfirmText} onChange={(e) => setTransferConfirmText(e.target.value)} placeholder="TRANSFER OWNERSHIP" />
          </div>
          <ModalFooter onCancel={closeModal} onConfirm={handleTransferOwnership} confirmLabel="Transfer Ownership" loading={actionLoading} danger icon={<ArrowRightLeft className="h-4 w-4" />} />
        </ModalShell>
      )}
    </div>
  );
}

function ActionMenu({
  user,
  actorId,
  actorRole,
  canTransferOwnership,
  onAction,
}: {
  user: StaffUser;
  actorId: string;
  actorRole?: UserRole;
  canTransferOwnership: boolean;
  onAction: (m: ModalType) => void;
}) {
  const isSelf = user.id === actorId;
  return (
    <div className="absolute right-4 top-12 z-10 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1 animate-scale-in max-h-96 overflow-y-auto">
      {/* Change Role submenu */}
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Change Role</p>
      {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => {
        const check = canChangeRole(actorRole, actorId, user.id, user.role, r);
        const disabled = check.allowed === false || r === 'platform_owner' || isSelf || r === user.role;
        if (r === 'platform_owner') return null;
        return (
          <button
            key={r}
            disabled={disabled}
            onClick={() => onAction({ kind: 'role', user, newRole: r })}
            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title={check.reason}
          >
            {r === 'super_admin' && <ArrowUpCircle className="inline h-3.5 w-3.5 mr-1.5 text-amber-500" />}
            {r === 'admin' && <ShieldCheck className="inline h-3.5 w-3.5 mr-1.5 text-brand-500" />}
            Set as {ROLE_LABELS[r]}
          </button>
        );
      })}

      <div className="my-1 border-t border-slate-100" />

      {/* Account actions */}
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Account</p>
      {user.is_active ? (
        <MenuButton
          icon={<Ban className="h-3.5 w-3.5" />}
          label="Suspend Account"
          disabled={canSuspend(actorRole, actorId, user.id, user.role).allowed === false}
          onClick={() => onAction({ kind: 'suspend', user })}
        />
      ) : (
        <MenuButton
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Activate Account"
          onClick={() => onAction({ kind: 'activate', user })}
        />
      )}
      <MenuButton
        icon={<KeyRound className="h-3.5 w-3.5" />}
        label="Reset Password"
        disabled={canResetPassword(actorRole, actorId, user.id, user.role).allowed === false}
        onClick={() => onAction({ kind: 'reset_password', user })}
      />
      <MenuButton
        icon={<Lock className="h-3.5 w-3.5" />}
        label="Require Password Change"
        disabled={actorRole === 'admin' && (user.role === 'platform_owner' || user.role === 'super_admin')}
        onClick={() => onAction({ kind: 'require_pw_change', user })}
      />
      <MenuButton
        icon={<Trash2 className="h-3.5 w-3.5" />}
        label="Delete Account"
        disabled={canDeleteUser(actorRole, actorId, user.id, user.role).allowed === false}
        onClick={() => onAction({ kind: 'delete', user })}
        danger
      />

      {canTransferOwnership && user.role === 'super_admin' && user.is_active && (
        <>
          <div className="my-1 border-t border-slate-100" />
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ownership</p>
          <MenuButton
            icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
            label="Transfer Ownership"
            onClick={() => onAction({ kind: 'transfer_ownership', user })}
            danger
          />
        </>
      )}
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ModalShell({ title, children, onClose, loading }: { title: string; children: React.ReactNode; onClose: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm animate-fade-in" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onConfirm, confirmLabel, loading, danger, icon }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; loading: boolean; danger?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3">
      <button onClick={onCancel} disabled={loading} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={loading}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50 ${
          danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-600'
        }`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {confirmLabel}
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

function PasswordConfirm({ label, password, onChange }: { label: string; password: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-4">
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          type="password"
          value={password}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your current password"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Required for security verification.</p>
    </div>
  );
}

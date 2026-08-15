import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  Crown,
  KeyRound,
  Lock,
  MoreVertical,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { friendlyError, validateEmail } from '@/lib/validation';
import { formatDate, formatDateTime } from '@/lib/priority';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge, RoleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, SearchInput, Select } from '@/components/ui/Field';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { RecordCard, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';
import { RiskAction, RiskTierTag } from '@/components/admin/RiskTier';
import { JOB_TITLE_SUGGESTIONS, ROLE_LABELS, type Profile, type UserRole } from '@/types';
import {
  canChangeRole,
  canDeleteUser,
  canResetPassword,
  canSuspend,
} from '@/lib/permissions';
import {
  activateStaffAccount,
  adminCreateUser,
  adminDeleteUser,
  adminResetPassword,
  changeStaffRole,
  requirePasswordChange,
  suspendStaffAccount,
  transferPlatformOwnership,
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

const TRANSFER_PHRASE = 'TRANSFER OWNERSHIP';

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

  const [actorPassword, setActorPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [transferAcknowledged, setTransferAcknowledged] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteTitle, setInviteTitle] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('operations_staff');
  const [inviteRequirePwChange, setInviteRequirePwChange] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('*, created_by_profile:created_by_id(full_name)')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;

      const profiles = (data || []) as unknown as Array<
        Profile & { created_by_profile?: { full_name: string } | null }
      >;
      const currentEmail = profile?.email || '';

      setUsers(
        profiles.map((p) => ({
          ...p,
          email: p.id === profile?.id ? currentEmail : '(email protected)',
          created_by_profile: p.created_by_profile,
        })),
      );
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
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(null);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 6000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      ROLE_LABELS[u.role].toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q)
    );
  });

  function resetActionState() {
    setActionError(null);
    setActorPassword('');
    setNewPassword('');
    setTransferConfirmText('');
    setTransferAcknowledged(false);
  }

  function closeModal() {
    setModal(null);
    resetActionState();
  }

  async function handleInvite() {
    setInviteError(null);
    if (!inviteEmail.trim() || !invitePassword) {
      setInviteError('Email and a temporary password are both required.');
      return;
    }
    if (!validateEmail(inviteEmail)) {
      setInviteError('That email address is not valid.');
      return;
    }
    if (invitePassword.length < 12) {
      setInviteError('The temporary password must be at least 12 characters.');
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
    setSuccessMsg('Staff account created.');
    await fetchUsers();
  }

  async function handleRoleChange() {
    if (modal?.kind !== 'role') return;
    setActionError(null);
    if (!actorPassword) {
      setActionError('Enter your own password to confirm this role change.');
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
    if (modal?.kind !== 'suspend') return;
    setActionError(null);
    if (!actorPassword) {
      setActionError('Enter your own password to confirm this suspension.');
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
    if (modal?.kind !== 'activate') return;
    setActionLoading(true);
    const result = await activateStaffAccount({ target_uid: modal.user.id });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name}'s account has been reactivated.`);
    closeModal();
    await fetchUsers();
  }

  async function handleResetPassword() {
    if (modal?.kind !== 'reset_password') return;
    setActionError(null);
    if (!newPassword || newPassword.length < 12) {
      setActionError('The new temporary password must be at least 12 characters.');
      return;
    }
    setActionLoading(true);
    const result = await adminResetPassword({ target_uid: modal.user.id, new_password: newPassword });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`Password reset for ${modal.user.full_name}. They must change it at their next login.`);
    closeModal();
  }

  async function handleRequirePwChange() {
    if (modal?.kind !== 'require_pw_change') return;
    setActionLoading(true);
    const result = await requirePasswordChange({ target_uid: modal.user.id });
    setActionLoading(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSuccessMsg(`${modal.user.full_name} must set a new password at their next login.`);
    closeModal();
    await fetchUsers();
  }

  async function handleDelete() {
    if (modal?.kind !== 'delete') return;
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
    if (modal?.kind !== 'transfer_ownership') return;
    setActionError(null);
    if (!transferAcknowledged) {
      setActionError('Acknowledge the consequences before transferring ownership.');
      return;
    }
    if (transferConfirmText.trim() !== TRANSFER_PHRASE) {
      setActionError(`Type ${TRANSFER_PHRASE} exactly to confirm.`);
      return;
    }
    if (!actorPassword) {
      setActionError('Enter your own password to confirm the ownership transfer.');
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

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Staff Management"
        subtitle={`${users.length} staff ${users.length === 1 ? 'account' : 'accounts'}. Job title describes the person; the system role decides what they can do.`}
        actions={
          <Button
            onClick={() => {
              setInviteError(null);
              setModal({ kind: 'invite' });
            }}
            icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
          >
            Add staff member
          </Button>
        }
      />

      {successMsg && (
        <Alert tone="success" className="mb-5" onDismiss={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}
      {error && (
        <Alert tone="critical" title="Staff accounts could not be loaded" className="mb-5">
          {error}
        </Alert>
      )}

      <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-slate-300 bg-white p-2.5 sm:flex-row sm:items-center">
        <SearchInput
          label="Search staff accounts"
          value={search}
          onValueChange={setSearch}
          placeholder="Search by name, email, job title or system role…"
          className="flex-1"
        />
        <label className="sr-only" htmlFor="role-filter">
          Filter by system role
        </label>
        <Select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="sm:w-56"
        >
          <option value="all">All system roles</option>
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          title="No staff accounts match this view"
          description="Adjust the search or role filter to see more accounts."
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <TableFrame caption="Staff accounts, system roles and account status">
              <THead>
                <tr>
                  <TH nowrap>Staff member</TH>
                  <TH nowrap>Job title</TH>
                  <TH nowrap>System role</TH>
                  <TH>Account status</TH>
                  <TH numeric nowrap>Last login</TH>
                  <TH numeric className="hidden xl:table-cell">
                    Created
                  </TH>
                  <TH align="right" nowrap>Actions</TH>
                </tr>
              </THead>
              <TBody>
                {filtered.map((u) => {
                  const isSelf = u.id === profile?.id;
                  return (
                    <TR key={u.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold uppercase text-white"
                            aria-hidden="true"
                          >
                            {u.full_name.charAt(0) || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {u.full_name || 'Unnamed'}
                              {isSelf && (
                                <span className="ml-2 text-2xs font-bold uppercase tracking-wide text-brand-700">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </TD>
                      {/* Job title is ordinary text — never a badge */}
                      <TD>{u.job_title || <span className="text-slate-400">Not recorded</span>}</TD>
                      {/* System role is an explicit uppercase, boxed badge */}
                      <TD>
                        <RoleBadge role={u.role} />
                      </TD>
                      <TD>
                        {u.is_active ? (
                          <Badge tone="positive" treatment="solid" icon={<CheckCircle2 className="h-3 w-3" />}>
                            Active
                          </Badge>
                        ) : (
                          <Badge tone="critical" icon={<Ban className="h-3 w-3" />}>
                            Suspended
                          </Badge>
                        )}
                      </TD>
                      <TD numeric className="whitespace-nowrap text-xs">
                        {u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}
                      </TD>
                      <TD numeric className="hidden whitespace-nowrap text-xs xl:table-cell">
                        {formatDate(u.created_at.slice(0, 10))}
                      </TD>
                      <TD align="right" className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === u.id ? null : u.id);
                          }}
                          aria-label={`Actions for ${u.full_name}`}
                          aria-expanded={menuOpen === u.id}
                          aria-haspopup="menu"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {menuOpen === u.id && (
                          <div ref={menuRef}>
                            <ActionMenu
                              user={u}
                              actorId={profile?.id ?? ''}
                              actorRole={profile?.role}
                              canTransferOwnership={canTransferOwnership}
                              onAction={(m) => {
                                setMenuOpen(null);
                                resetActionState();
                                setModal(m);
                              }}
                            />
                          </div>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableFrame>
          </div>

          <div className="space-y-3 lg:hidden">
            {filtered.map((u) => {
              const isSelf = u.id === profile?.id;
              return (
                <RecordCard key={u.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {u.full_name || 'Unnamed'}
                        {isSelf && (
                          <span className="ml-2 text-2xs font-bold uppercase tracking-wide text-brand-700">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                      <p className="mt-1 text-xs text-slate-700">
                        {u.job_title || <span className="text-slate-400">Job title not recorded</span>}
                      </p>
                    </div>
                    {u.is_active ? (
                      <Badge tone="positive" treatment="solid" className="shrink-0">
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="critical" className="shrink-0">
                        Suspended
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                    <RoleBadge role={u.role} />
                    <div className="relative">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(menuOpen === u.id ? null : u.id);
                        }}
                        aria-expanded={menuOpen === u.id}
                      >
                        Actions
                      </Button>
                      {menuOpen === u.id && (
                        <div ref={menuRef}>
                          <ActionMenu
                            user={u}
                            actorId={profile?.id ?? ''}
                            actorRole={profile?.role}
                            canTransferOwnership={canTransferOwnership}
                            onAction={(m) => {
                              setMenuOpen(null);
                              resetActionState();
                              setModal(m);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </RecordCard>
              );
            })}
          </div>
        </>
      )}

      {/* ── Invite ─────────────────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'invite'}
        onClose={closeModal}
        busy={actionLoading}
        title="Add staff member"
        description="Creates a platform account. There is no public registration — every account originates here."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleInvite} loading={actionLoading}>
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {inviteError && <Alert tone="critical">{inviteError}</Alert>}
          {inviteRole === 'super_admin' && (
            <Alert tone="warning" title="Super Administrator is a high-trust role">
              Super Administrators reach every pilgrim, staff account, operational record and system setting.
              Grant it only to senior officers you trust with the whole platform.
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="invite-name">
              <Input id="invite-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            </Field>
            <Field label="Job title" htmlFor="invite-title" hint="Descriptive only. It grants no permissions.">
              <Input
                id="invite-title"
                value={inviteTitle}
                onChange={(e) => setInviteTitle(e.target.value)}
                list="job-titles"
                placeholder="e.g. Visa Officer"
              />
              <datalist id="job-titles">
                {JOB_TITLE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Email" htmlFor="invite-email" required className="sm:col-span-2">
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="new.staff@innaataina.com"
              />
            </Field>
            <Field
              label="Temporary password"
              htmlFor="invite-password"
              required
              hint="At least 12 characters. Share it through a secure channel."
              className="sm:col-span-2"
            >
              <Input
                id="invite-password"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
              />
            </Field>
            <Field
              label="System role"
              htmlFor="invite-role"
              required
              hint="The system role — not the job title — decides what this person can do."
              className="sm:col-span-2"
            >
              <Select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => {
                  const disabled =
                    r === 'platform_owner' ||
                    (r === 'super_admin' && !canManageSuperAdmins) ||
                    (r === 'admin' && !isSuperAdminOrHigher);
                  return (
                    <option key={r} value={r} disabled={disabled}>
                      {ROLE_LABELS[r]}
                      {r === 'platform_owner' ? ' (cannot be assigned)' : ''}
                    </option>
                  );
                })}
              </Select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={inviteRequirePwChange}
              onChange={(e) => setInviteRequirePwChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-400"
            />
            <span className="text-sm text-slate-700">Require a password change at their first login</span>
          </label>
        </div>
      </Modal>

      {/* ── High risk — change role ────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'role'}
        onClose={closeModal}
        busy={actionLoading}
        title={modal?.kind === 'role' ? `Change system role — ${modal.user.full_name}` : ''}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="critical" onClick={handleRoleChange} loading={actionLoading}>
              Confirm role change
            </Button>
          </>
        }
      >
        {modal?.kind === 'role' && (
          <div className="space-y-4">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <RiskTierTag tier="high" />
            {modal.newRole === 'super_admin' && (
              <Alert tone="warning" title="Super Administrator is a high-trust role">
                Super Administrators reach every pilgrim, staff account, operational record and system setting.
              </Alert>
            )}
            <p className="text-sm leading-relaxed text-slate-700">
              Change <strong>{modal.user.full_name}</strong> from{' '}
              <strong>{ROLE_LABELS[modal.user.role]}</strong> to{' '}
              <strong>{ROLE_LABELS[modal.newRole]}</strong>? This changes what they can do immediately.
            </p>
            <ActorPasswordField
              value={actorPassword}
              onChange={setActorPassword}
              label="Enter your own password to confirm this role change"
            />
          </div>
        )}
      </Modal>

      {/* ── High risk — suspend ────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'suspend'}
        onClose={closeModal}
        busy={actionLoading}
        title={modal?.kind === 'suspend' ? `Suspend account — ${modal.user.full_name}` : ''}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="critical" onClick={handleSuspend} loading={actionLoading}>
              Suspend account
            </Button>
          </>
        }
      >
        {modal?.kind === 'suspend' && (
          <div className="space-y-4">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <RiskTierTag tier="high" />
            <p className="text-sm leading-relaxed text-slate-700">
              Suspend <strong>{modal.user.full_name}</strong>? They will not be able to sign in until an
              administrator reactivates the account. Their existing records and audit history are untouched.
            </p>
            {/* No "reason" field: the existing server action does not accept one,
                and offering a box that goes nowhere would be dishonest. */}
            <ActorPasswordField
              value={actorPassword}
              onChange={setActorPassword}
              label="Enter your own password to confirm this suspension"
            />
          </div>
        )}
      </Modal>

      {/* ── Normal — activate ──────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'activate'}
        onClose={closeModal}
        busy={actionLoading}
        title={modal?.kind === 'activate' ? `Reactivate account — ${modal.user.full_name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleActivate} loading={actionLoading}>
              Reactivate account
            </Button>
          </>
        }
      >
        {modal?.kind === 'activate' && (
          <div className="space-y-4">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <RiskTierTag tier="normal" />
            <p className="text-sm text-slate-700">
              Reactivate <strong>{modal.user.full_name}</strong>? They will be able to sign in again with their
              existing system role.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Sensitive — reset password ─────────────────────────────── */}
      <Modal
        open={modal?.kind === 'reset_password'}
        onClose={closeModal}
        busy={actionLoading}
        title={modal?.kind === 'reset_password' ? `Reset password — ${modal.user.full_name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} loading={actionLoading}>
              Reset password
            </Button>
          </>
        }
      >
        {modal?.kind === 'reset_password' && (
          <div className="space-y-4">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <RiskTierTag tier="sensitive" />
            <p className="text-sm leading-relaxed text-slate-700">
              Set a new temporary password for <strong>{modal.user.full_name}</strong>. They will be required to
              change it at their next login. Share it through a secure channel.
            </p>
            <Field label="New temporary password" htmlFor="reset-password" required hint="At least 12 characters.">
              <Input
                id="reset-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-autofocus
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* ── Normal — require password change ───────────────────────── */}
      <Modal
        open={modal?.kind === 'require_pw_change'}
        onClose={closeModal}
        busy={actionLoading}
        title={modal?.kind === 'require_pw_change' ? `Require password change — ${modal.user.full_name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleRequirePwChange} loading={actionLoading}>
              Require change
            </Button>
          </>
        }
      >
        {modal?.kind === 'require_pw_change' && (
          <div className="space-y-4">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <RiskTierTag tier="normal" />
            <p className="text-sm text-slate-700">
              <strong>{modal.user.full_name}</strong> will have to set a new password before they can continue
              at their next login.
            </p>
          </div>
        )}
      </Modal>

      {/* ── High risk — delete ─────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'delete'}
        onClose={closeModal}
        busy={actionLoading}
        title={modal?.kind === 'delete' ? `Delete account — ${modal.user.full_name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="critical" onClick={handleDelete} loading={actionLoading}>
              Delete account
            </Button>
          </>
        }
      >
        {modal?.kind === 'delete' && (
          <div className="space-y-4">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <RiskTierTag tier="high" />
            <p className="text-sm leading-relaxed text-slate-700">
              Permanently delete <strong>{modal.user.full_name}</strong>&rsquo;s account? This cannot be undone.
              The audit entries they created remain on the platform.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Critical — platform ownership transfer ─────────────────── */}
      <Modal
        open={modal?.kind === 'transfer_ownership'}
        onClose={closeModal}
        busy={actionLoading}
        critical
        icon={<Crown className="h-5 w-5 text-gold-700" aria-hidden="true" />}
        title="Transfer platform ownership"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="critical"
              onClick={handleTransferOwnership}
              loading={actionLoading}
              disabled={!transferAcknowledged || transferConfirmText.trim() !== TRANSFER_PHRASE || !actorPassword}
            >
              {modal?.kind === 'transfer_ownership'
                ? `Transfer Ownership to ${modal.user.full_name}`
                : 'Transfer ownership'}
            </Button>
          </>
        }
      >
        {modal?.kind === 'transfer_ownership' && (
          <div className="space-y-5">
            {actionError && <Alert tone="critical">{actionError}</Alert>}

            <div className="flex items-center gap-2">
              <RiskTierTag tier="critical" />
              <span className="text-xs text-slate-600">The highest-consequence action on this platform.</span>
            </div>

            <div className="rounded-md border border-gold-500 bg-gold-50 p-4">
              <p className="font-display text-sm font-bold text-gold-900">
                What happens when you transfer ownership
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gold-900/90">
                <li>
                  <strong>{modal.user.full_name}</strong> becomes the Platform Owner — the single highest
                  authority on this platform.
                </li>
                <li>You are demoted to Super Administrator and lose Platform Owner powers immediately.</li>
                <li>Only the new Platform Owner can grant Super Admin access or transfer ownership again.</li>
                <li>You cannot reverse this yourself. Only the new owner can transfer it back.</li>
                <li>The transfer is recorded permanently in the audit history.</li>
              </ul>
            </div>

            <Field
              label={`Type ${TRANSFER_PHRASE} to confirm`}
              htmlFor="transfer-phrase"
              required
              hint="Must match exactly."
            >
              <Input
                id="transfer-phrase"
                value={transferConfirmText}
                onChange={(e) => setTransferConfirmText(e.target.value)}
                placeholder={TRANSFER_PHRASE}
                autoComplete="off"
                identifier
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gold-500 bg-white p-3.5">
              <input
                type="checkbox"
                checked={transferAcknowledged}
                onChange={(e) => setTransferAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400"
              />
              <span className="text-sm leading-relaxed text-slate-800">
                I understand that I will stop being the Platform Owner, that{' '}
                <strong>{modal.user.full_name}</strong> will hold that authority instead, and that I cannot undo
                this myself.
              </span>
            </label>

            <ActorPasswordField
              value={actorPassword}
              onChange={setActorPassword}
              label="Enter your own password to confirm the ownership transfer"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Actor password confirmation.
 * Required by the existing server actions for role change, suspension and
 * ownership transfer — never omitted, never faked.
 */
function ActorPasswordField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Field
      label={label}
      htmlFor="actor-password"
      required
      hint="Your password is verified by the server before this action runs."
    >
      <Input
        id="actor-password"
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your current password"
        leadingIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
      />
    </Field>
  );
}

/**
 * Per-account action menu.
 *
 * Every entry is gated by the existing permission helpers. On your own row the
 * menu shows only what those helpers actually allow — which is nothing, so it
 * says so rather than offering controls that would be rejected.
 */
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
  const suspendCheck = canSuspend(actorRole, actorId, user.id, user.role);
  const resetCheck = canResetPassword(actorRole, actorId, user.id, user.role);
  const deleteCheck = canDeleteUser(actorRole, actorId, user.id, user.role);
  const showOwnershipTransfer = canTransferOwnership && !isSelf && user.role === 'super_admin' && user.is_active;

  const assignableRoles = (Object.keys(ROLE_LABELS) as UserRole[])
    .filter((r) => r !== 'platform_owner' && r !== user.role)
    .map((r) => ({ role: r, check: canChangeRole(actorRole, actorId, user.id, user.role, r) }))
    .filter((entry) => entry.check.allowed);

  if (isSelf) {
    return (
      <div
        role="menu"
        className="absolute right-0 top-9 z-20 w-72 rounded-md border border-slate-300 bg-white p-3 shadow-overlay"
      >
        <p className="text-sm font-semibold text-slate-800">This is your own account</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          You cannot change your own system role, suspend or delete your own account, or reset your own password
          from here. Use the change-password screen for your own password, and ask another administrator for any
          role change.
        </p>
      </div>
    );
  }

  return (
    <div
      role="menu"
      className="absolute right-0 top-9 z-20 max-h-[26rem] w-80 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-overlay scrollbar-thin"
    >
      {assignableRoles.length > 0 && (
        <>
          <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wide text-slate-500">
            Change system role
          </p>
          {assignableRoles.map(({ role }) => (
            <RiskAction
              key={role}
              tier="high"
              label={`Set as ${ROLE_LABELS[role]}`}
              description="Requires your own password."
              icon={
                role === 'super_admin' ? (
                  <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : role === 'admin' ? (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : undefined
              }
              onClick={() => onAction({ kind: 'role', user, newRole: role })}
            />
          ))}
          <div className="my-1 border-t border-slate-200" />
        </>
      )}

      <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wide text-slate-500">Account</p>

      {user.is_active ? (
        <RiskAction
          tier="high"
          label="Suspend account"
          description="Blocks sign-in. Requires your own password."
          icon={<Ban className="h-3.5 w-3.5" aria-hidden="true" />}
          disabled={!suspendCheck.allowed}
          disabledReason={suspendCheck.reason}
          onClick={() => onAction({ kind: 'suspend', user })}
        />
      ) : (
        <RiskAction
          tier="normal"
          label="Reactivate account"
          description="Restores sign-in with the same system role."
          icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => onAction({ kind: 'activate', user })}
        />
      )}

      <RiskAction
        tier="sensitive"
        label="Reset password"
        description="Sets a temporary password they must change."
        icon={<KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
        disabled={!resetCheck.allowed}
        disabledReason={resetCheck.reason}
        onClick={() => onAction({ kind: 'reset_password', user })}
      />

      <RiskAction
        tier="normal"
        label="Require password change"
        description="Forces a new password at their next login."
        icon={<Lock className="h-3.5 w-3.5" aria-hidden="true" />}
        disabled={actorRole === 'admin' && (user.role === 'platform_owner' || user.role === 'super_admin')}
        disabledReason="Administrators cannot manage Super Admin or Platform Owner accounts."
        onClick={() => onAction({ kind: 'require_pw_change', user })}
      />

      <RiskAction
        tier="high"
        label="Delete account"
        description="Permanent. Audit entries they created remain."
        icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
        disabled={!deleteCheck.allowed}
        disabledReason={deleteCheck.reason}
        onClick={() => onAction({ kind: 'delete', user })}
      />

      {showOwnershipTransfer && (
        <>
          <div className="my-1 border-t border-gold-400" />
          <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wide text-gold-800">
            Platform ownership
          </p>
          <RiskAction
            tier="critical"
            label="Transfer platform ownership"
            description="You become a Super Administrator. Irreversible by you."
            icon={<ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onAction({ kind: 'transfer_ownership', user })}
          />
        </>
      )}
    </div>
  );
}

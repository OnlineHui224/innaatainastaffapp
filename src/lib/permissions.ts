import type { UserRole } from '@/types';
import { ROLE_HIERARCHY } from '@/types';

/**
 * Returns the hierarchy index of a role (0 = highest).
 */
export function roleRank(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * True if the actor's role is at or above the required tier.
 */
export function hasRoleLevel(actorRole: UserRole | undefined | null, required: UserRole): boolean {
  if (!actorRole) return false;
  return roleRank(actorRole) <= roleRank(required);
}

/**
 * Can the actor view the dashboard, pilgrims, sub-agents (all roles can).
 */
export function canViewOperations(role: UserRole | undefined | null): boolean {
  return Boolean(role);
}

/**
 * Can the actor create/edit pilgrims and record arrivals/departures.
 * Operations_manager, operations_staff and all admin tiers can.
 */
export function canEditPilgrims(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'operations_staff');
}

/**
 * Can the actor delete pilgrims or sub-agents.
 * Only admin or higher.
 */
export function canDeleteRecords(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'admin');
}

/**
 * Can the actor view the Staff Management page.
 * Admin or higher.
 */
export function canManageStaff(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'admin');
}

/**
 * Can the actor view the Audit History page.
 * Admin or higher.
 */
export function canViewAudit(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'admin');
}

/**
 * Can the actor use sample-data tools.
 * Platform owner or super admin only (admin tier too for dev).
 */
export function canUseSampleData(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'admin');
}

/**
 * Can the actor create/promote a SUPER_ADMIN.
 * Platform owner only.
 */
export function canManageSuperAdmins(role: UserRole | undefined | null): boolean {
  return role === 'platform_owner';
}

/**
 * Can the actor transfer platform ownership.
 * Platform owner only.
 */
export function canTransferOwnership(role: UserRole | undefined | null): boolean {
  return role === 'platform_owner';
}

/**
 * Can the actor change the target's role to newRole?
 * Enforces the hierarchy rules from the spec.
 */
export function canChangeRole(
  actorRole: UserRole | undefined | null,
  actorId: string,
  targetId: string,
  targetRole: UserRole,
  newRole: UserRole
): { allowed: boolean; reason?: string } {
  if (!actorRole) return { allowed: false, reason: 'Not authenticated.' };
  if (actorId === targetId) return { allowed: false, reason: 'You cannot change your own role.' };

  // Granting super_admin or platform_owner: platform_owner only
  if ((newRole === 'super_admin' || newRole === 'platform_owner') && actorRole !== 'platform_owner') {
    return { allowed: false, reason: 'Only the Platform Owner can grant Super Admin or Platform Owner access.' };
  }

  // Admin cannot manage super_admin or platform_owner accounts
  if (actorRole === 'admin' && (targetRole === 'platform_owner' || targetRole === 'super_admin')) {
    return { allowed: false, reason: 'Administrators cannot manage Super Admin or Platform Owner accounts.' };
  }

  // Admin cannot promote to admin
  if (actorRole === 'admin' && newRole === 'admin') {
    return { allowed: false, reason: 'Only Super Admin or higher can promote to Administrator.' };
  }

  // Must be admin or higher to change any role
  if (!hasRoleLevel(actorRole, 'admin')) {
    return { allowed: false, reason: 'You do not have permission to change staff roles.' };
  }

  return { allowed: true };
}

/**
 * Can the actor suspend the target account?
 */
export function canSuspend(
  actorRole: UserRole | undefined | null,
  actorId: string,
  targetId: string,
  targetRole: UserRole
): { allowed: boolean; reason?: string } {
  if (!actorRole) return { allowed: false, reason: 'Not authenticated.' };
  if (actorId === targetId) return { allowed: false, reason: 'You cannot suspend your own account.' };
  if (!hasRoleLevel(actorRole, 'admin')) return { allowed: false, reason: 'You do not have permission to suspend accounts.' };
  if (actorRole === 'admin' && (targetRole === 'platform_owner' || targetRole === 'super_admin')) {
    return { allowed: false, reason: 'Administrators cannot suspend Super Admin or Platform Owner accounts.' };
  }
  if (targetRole === 'super_admin' && actorRole !== 'platform_owner') {
    return { allowed: false, reason: 'Only the Platform Owner can suspend a Super Admin.' };
  }
  if (targetRole === 'platform_owner' && actorRole !== 'platform_owner') {
    return { allowed: false, reason: 'Only the Platform Owner can suspend another Platform Owner.' };
  }
  return { allowed: true };
}

/**
 * Can the actor reset the target's password?
 */
export function canResetPassword(
  actorRole: UserRole | undefined | null,
  actorId: string,
  targetId: string,
  targetRole: UserRole
): { allowed: boolean; reason?: string } {
  if (!actorRole) return { allowed: false, reason: 'Not authenticated.' };
  if (actorId === targetId) return { allowed: false, reason: 'Use the change-password screen to change your own password.' };
  if (!hasRoleLevel(actorRole, 'admin')) return { allowed: false, reason: 'You do not have permission to reset passwords.' };
  if (actorRole === 'admin' && (targetRole === 'platform_owner' || targetRole === 'super_admin')) {
    return { allowed: false, reason: 'Administrators cannot reset Super Admin or Platform Owner passwords.' };
  }
  if (targetRole === 'super_admin' && actorRole !== 'platform_owner') {
    return { allowed: false, reason: 'Only the Platform Owner can reset a Super Admin password.' };
  }
  return { allowed: true };
}

/**
 * Can the actor delete the target user?
 */
export function canDeleteUser(
  actorRole: UserRole | undefined | null,
  actorId: string,
  targetId: string,
  targetRole: UserRole
): { allowed: boolean; reason?: string } {
  if (!actorRole) return { allowed: false, reason: 'Not authenticated.' };
  if (actorId === targetId) return { allowed: false, reason: 'You cannot delete your own account.' };
  if (!hasRoleLevel(actorRole, 'admin')) return { allowed: false, reason: 'You do not have permission to delete accounts.' };
  if ((targetRole === 'platform_owner' || targetRole === 'super_admin') && actorRole !== 'platform_owner') {
    return { allowed: false, reason: 'Only the Platform Owner can delete Super Admin or Platform Owner accounts.' };
  }
  return { allowed: true };
}

/**
 * Can the actor use the Visa & Contract Logger.
 * Operations_staff and all higher roles can process visas.
 */
export function canUseVisaLogger(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'operations_staff');
}

/**
 * Can the actor confirm and save visa records (full processing).
 * Operations_staff and all higher roles can confirm.
 */
export function canConfirmVisa(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'operations_staff');
}

/**
 * Can the actor resolve visa extraction conflicts.
 * Admin and higher only.
 */
export function canResolveVisaConflicts(role: UserRole | undefined | null): boolean {
  return hasRoleLevel(role, 'admin');
}

export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  platform_owner: 'bg-gold-100 text-gold-900 border-gold-300',
  super_admin: 'bg-purple-50 text-purple-800 border-purple-200',
  admin: 'bg-brand-50 text-brand-700 border-brand-200',
  operations_manager: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  operations_staff: 'bg-slate-100 text-slate-700 border-slate-200',
  viewer: 'bg-slate-50 text-slate-500 border-slate-200',
};

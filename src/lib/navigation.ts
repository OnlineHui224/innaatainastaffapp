import {
  Building2,
  ClipboardList,
  FileScan,
  Gauge,
  Hotel,
  PlaneTakeoff,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Short description shown in the mobile drawer. */
  hint?: string;
}

/** Day-to-day operational modules. Visible to every authenticated role. */
export const OPERATIONS_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: Gauge, hint: 'Operational risk overview' },
  { to: '/app/pilgrims', label: 'Pilgrims', icon: Users, hint: 'Pilgrim directory and records' },
  { to: '/app/sub-agents', label: 'Sub-Agents', icon: Building2, hint: 'Responsibility by organisation' },
  { to: '/app/visa-logger', label: 'Visa & Contract Logger', icon: FileScan, hint: 'Visa extraction and review' },
  {
    to: '/app/flight-document-ops',
    label: 'Flight Document Ops',
    icon: PlaneTakeoff,
    hint: 'Itinerary extraction and documents',
  },
];

export interface AdminNavItem extends NavItem {
  /** Permission flag name on the auth context that gates this item. */
  requires: 'canManageStaff' | 'canViewAudit';
}

/** Administration modules. Rendered only when the actor holds the permission. */
export const ADMINISTRATION_NAV: AdminNavItem[] = [
  {
    to: '/app/staff-users',
    label: 'Staff Management',
    icon: ShieldCheck,
    requires: 'canManageStaff',
    hint: 'Accounts, system roles and access',
  },
  {
    to: '/app/audit-history',
    label: 'Audit History',
    icon: ScrollText,
    requires: 'canViewAudit',
    hint: 'Immutable record of platform activity',
  },
  {
    to: '/app/hotel-import',
    label: 'Hotel Reference Import',
    icon: Hotel,
    requires: 'canManageStaff',
    hint: 'Makkah and Madinah hotel reference data',
  },
];

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Static breadcrumb segments per route.
 *
 * Routes carrying a record id resolve their leaf label at render time from the
 * loaded record, so a breadcrumb never displays a raw UUID.
 *
 * The Verified Import route is intentionally reachable by URL only and is not
 * present in either navigation list — it keeps a breadcrumb so staff who arrive
 * by link still know where they are.
 */
const ROUTE_CRUMBS: Array<{ pattern: RegExp; crumbs: Crumb[] }> = [
  { pattern: /^\/app\/dashboard$/, crumbs: [{ label: 'Dashboard' }] },

  { pattern: /^\/app\/pilgrims$/, crumbs: [{ label: 'Pilgrims' }] },
  {
    pattern: /^\/app\/pilgrims\/new$/,
    crumbs: [{ label: 'Pilgrims', to: '/app/pilgrims' }, { label: 'Add Pilgrim' }],
  },
  {
    pattern: /^\/app\/pilgrims\/import-csv$/,
    crumbs: [{ label: 'Pilgrims', to: '/app/pilgrims' }, { label: 'Import CSV' }],
  },
  {
    pattern: /^\/app\/pilgrims\/import$/,
    crumbs: [{ label: 'Pilgrims', to: '/app/pilgrims' }, { label: 'Verified Import' }],
  },
  {
    pattern: /^\/app\/pilgrims\/review-queue$/,
    crumbs: [{ label: 'Pilgrims', to: '/app/pilgrims' }, { label: 'Review Queue' }],
  },
  {
    pattern: /^\/app\/pilgrims\/[^/]+\/edit$/,
    crumbs: [{ label: 'Pilgrims', to: '/app/pilgrims' }, { label: 'Edit Pilgrim' }],
  },
  {
    pattern: /^\/app\/pilgrims\/[^/]+$/,
    crumbs: [{ label: 'Pilgrims', to: '/app/pilgrims' }, { label: 'Pilgrim Record' }],
  },

  { pattern: /^\/app\/sub-agents$/, crumbs: [{ label: 'Sub-Agents' }] },
  {
    pattern: /^\/app\/sub-agents\/new$/,
    crumbs: [{ label: 'Sub-Agents', to: '/app/sub-agents' }, { label: 'Add Sub-Agent' }],
  },
  {
    pattern: /^\/app\/sub-agents\/[^/]+\/edit$/,
    crumbs: [{ label: 'Sub-Agents', to: '/app/sub-agents' }, { label: 'Edit Sub-Agent' }],
  },
  {
    pattern: /^\/app\/sub-agents\/[^/]+$/,
    crumbs: [{ label: 'Sub-Agents', to: '/app/sub-agents' }, { label: 'Sub-Agent Record' }],
  },

  { pattern: /^\/app\/visa-logger$/, crumbs: [{ label: 'Visa & Contract Logger' }] },

  { pattern: /^\/app\/flight-document-ops$/, crumbs: [{ label: 'Flight Document Ops' }] },

  /* Account surfaces are reached from the identity block, never the sidebar nav. */
  { pattern: /^\/app\/account$/, crumbs: [{ label: 'My Account' }] },

  { pattern: /^\/app\/staff-users$/, crumbs: [{ label: 'Administration' }, { label: 'Staff Management' }] },
  { pattern: /^\/app\/audit-history$/, crumbs: [{ label: 'Administration' }, { label: 'Audit History' }] },
  {
    pattern: /^\/app\/hotel-import$/,
    crumbs: [{ label: 'Administration' }, { label: 'Hotel Reference Import' }],
  },
];

export function crumbsForPath(pathname: string): Crumb[] {
  const match = ROUTE_CRUMBS.find((entry) => entry.pattern.test(pathname));
  return match ? match.crumbs : [];
}

export const ICON_BY_PATH: Record<string, LucideIcon> = {
  '/app/pilgrims/review-queue': ClipboardList,
  ...Object.fromEntries(OPERATIONS_NAV.map((item) => [item.to, item.icon])),
  ...Object.fromEntries(ADMINISTRATION_NAV.map((item) => [item.to, item.icon])),
};

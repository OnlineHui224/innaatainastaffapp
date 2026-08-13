import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/Logo';
import { Breadcrumbs } from '@/components/PageHeader';
import { RoleBadge } from '@/components/ui/Badge';
import { useFocusTrap, useScrollLock } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { ADMINISTRATION_NAV, OPERATIONS_NAV, crumbsForPath, type NavItem } from '@/lib/navigation';

function NavSection({
  heading,
  items,
  onNavigate,
  showHints,
}: {
  heading: string;
  items: NavItem[];
  onNavigate?: () => void;
  showHints?: boolean;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-2xs font-bold uppercase tracking-widest text-white/40">{heading}</p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-start gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? /* Enterprise blue selection — gold is never a navigation fill */
                        'border-l-brand-400 bg-brand-800/70 font-semibold text-white'
                      : 'border-l-transparent text-white/65 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block leading-tight">{item.label}</span>
                      {showHints && item.hint && (
                        <span className="mt-0.5 block text-2xs leading-tight text-white/40">{item.hint}</span>
                      )}
                    </span>
                    {isActive && <span className="sr-only"> (current page)</span>}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AppLayout() {
  const { profile, signOut, canManageStaff, canViewAudit } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useScrollLock(drawerOpen);
  useFocusTrap(drawerOpen, drawerRef);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const permissions = { canManageStaff, canViewAudit };
  const adminItems = ADMINISTRATION_NAV.filter((item) => permissions[item.requires]);
  const crumbs = crumbsForPath(location.pathname);

  const identity = (
    <div className="border-t border-white/10 p-3">
      <div className="rounded-md border border-white/10 bg-white/5 p-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600 text-sm font-bold uppercase text-white"
            aria-hidden="true"
          >
            {(profile?.full_name || 'U').charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.full_name || 'Staff member'}</p>
            {/* Job title is ordinary text; the system role is an explicit boxed badge. */}
            {profile?.job_title && (
              <p className="mt-0.5 truncate text-xs text-white/50">{profile.job_title}</p>
            )}
          </div>
        </div>
        {profile && (
          <div className="mt-2.5">
            <RoleBadge role={profile.role} short className="border-white/25 bg-white/10 text-white" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );

  const brand = (
    <div className="border-b border-white/10 px-4 py-4">
      <div className="flex items-center gap-3">
        <LogoMark size={38} className="shrink-0 rounded-md bg-white p-1" />
        <div className="min-w-0 leading-tight">
          <p className="font-display text-xs font-bold tracking-wide text-white">INNA ATAINA TRAVELS</p>
          <p className="mt-0.5 text-2xs text-white/45">Operations Platform</p>
        </div>
      </div>
      <div className="mt-3 border-t border-gold-500/40 pt-2.5">
        <p className="font-display text-sm font-extrabold tracking-wide text-white">HajjERP</p>
        <p className="text-2xs text-white/45">Pilgrim Journey Control &amp; Risk Monitoring</p>
      </div>
    </div>
  );

  function sidebarContent(showHints: boolean, onNavigate?: () => void) {
    return (
      <div className="flex h-full flex-col bg-navy-900 text-white">
        {brand}
        <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-2 py-4 scrollbar-thin">
          <NavSection heading="Operations" items={OPERATIONS_NAV} onNavigate={onNavigate} showHints={showHints} />
          {adminItems.length > 0 && (
            <NavSection
              heading="Administration"
              items={adminItems}
              onNavigate={onNavigate}
              showHints={showHints}
            />
          )}
        </nav>
        {identity}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <a href="#main-content" className="skip-link rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white">
        Skip to main content
      </a>

      {/* Desktop sidebar. A 64px collapsed rail remains deliberately deferred —
          it is not implemented purely for decoration. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 lg:block">
        {sidebarContent(false)}
      </aside>

      {/* Mobile navigation drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/70" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 w-[19rem] max-w-[86%] shadow-overlay animate-slide-in"
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            {sidebarContent(true, () => setDrawerOpen(false))}
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-navy-800 bg-navy-900 px-3 py-2.5 text-white lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-white/10"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size={26} className="rounded bg-white p-0.5" />
            <span className="font-display text-sm font-bold">HajjERP</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-white/10"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Contextual breadcrumb rail — replaces the removed browser-history Back strip */}
        {crumbs.length > 0 && (
          <div className="border-b border-slate-300 bg-white px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1600px]">
              <Breadcrumbs crumbs={crumbs} />
            </div>
          </div>
        )}

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

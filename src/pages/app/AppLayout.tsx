import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ScrollText,
  ChevronLeft,
  FileScan,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/types';

const navItems = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/pilgrims', label: 'Pilgrims', icon: Users },
  { to: '/app/sub-agents', label: 'Sub-Agents', icon: Building2 },
  { to: '/app/visa-logger', label: 'Visa & Contract Logger', icon: FileScan },
];

export default function AppLayout() {
  const { profile, signOut, canManageStaff, canViewAudit } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const adminItems: typeof navItems = [];
  if (canManageStaff) adminItems.push({ to: '/app/staff-users', label: 'Staff Management', icon: ShieldCheck });
  if (canViewAudit) adminItems.push({ to: '/app/audit-history', label: 'Audit History', icon: ScrollText });
  if (canManageStaff) adminItems.push({ to: '/app/hotel-import', label: 'Hotel Reference Import', icon: Building2 });
  const showAdminSection = adminItems.length > 0;
  const allItems = showAdminSection ? [...navItems, ...adminItems] : navItems;

  const sidebar = (
    <div className="flex flex-col h-full bg-navy-900 text-white">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <LogoMark size={44} className="rounded-full bg-white p-1" />
          <div className="leading-tight">
            <p className="font-display font-bold text-sm text-white">INNA ATAINA</p>
            <p className="font-display font-bold text-sm text-white">TRAVELS</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="text-[11px] font-semibold tracking-wider text-gold-300 uppercase">HajjERP</p>
          <p className="text-[11px] text-white/40">Operations Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <p className="px-3 mb-2 text-[10px] font-semibold tracking-wider text-white/30 uppercase">Menu</p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-900/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </div>

        {showAdminSection && (
          <>
            <p className="px-3 mt-6 mb-2 text-[10px] font-semibold tracking-wider text-white/30 uppercase">Administration</p>
            <div className="space-y-1">
              {adminItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-gold-500 text-navy-950 shadow-lg'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      )
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold uppercase">
            {(profile?.full_name || 'U').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{profile?.full_name || 'Staff'}</p>
            <p className="text-[11px] text-gold-300/80">
              {profile ? ROLE_LABELS[profile.role] : ''}
            </p>
            {profile?.job_title && (
              <p className="text-[10px] text-white/30 truncate">{profile.job_title}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 fixed inset-y-0 left-0 z-30">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] shadow-2xl animate-slide-in">
            {sidebar}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center justify-between bg-navy-900 text-white px-4 py-3 shadow-md">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size={28} className="rounded-full bg-white p-0.5" />
            <span className="font-display font-bold text-sm">HajjERP</span>
          </div>
          <button onClick={handleSignOut} aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Back button row for context */}
        <div className="hidden lg:flex items-center gap-2 px-8 py-3 text-xs text-slate-400 border-b border-slate-100 bg-white">
          {allItems.some((i) => location.pathname.startsWith(i.to)) && (
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 hover:text-slate-600 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Mobile close button when overlay open */}
      {mobileOpen && (
        <button
          className="lg:hidden fixed top-4 right-4 z-50 text-white"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

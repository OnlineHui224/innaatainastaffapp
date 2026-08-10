import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Users,
  AlertTriangle,
  LayoutDashboard,
  ArrowRight,
  Lock,
  Eye,
  Activity,
  Building2,
  CheckCircle2,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { Logo } from '@/components/Logo';

const HERO_IMAGE =
  'https://images.pexels.com/photos/38546891/pexels-photo-38546891.jpeg?auto=compress&cs=tinysrgb&w=1920';

const capabilities = [
  {
    icon: Users,
    title: 'Pilgrim Tracking',
    desc: 'Arrival and departure visibility',
  },
  {
    icon: Building2,
    title: 'Sub-Agent Accountability',
    desc: 'Clear responsibility for every pilgrim',
  },
  {
    icon: AlertTriangle,
    title: 'Risk Monitoring',
    desc: 'Detect overdue and unconfirmed departures',
  },
  {
    icon: LayoutDashboard,
    title: 'Operations Dashboard',
    desc: 'Live operational overview',
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-navy-950 text-white font-sans">
      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-navy-950/95 backdrop-blur-md shadow-lg border-b border-white/5'
            : 'bg-gradient-to-b from-black/50 to-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo variant="badge" imgClassName="h-11 w-11 rounded-full bg-white p-0.5" />
              <div className="hidden sm:block leading-tight">
                <p className="font-display font-bold text-base text-white">INNA ATAINA TRAVELS</p>
                <p className="text-[11px] tracking-wider text-gold-300">HajjERP Operations Platform</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <a href="#overview" className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                Overview
              </a>
              <a href="#features" className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                Features
              </a>
              <a href="#security" className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                Security
              </a>
              <Link
                to="/login"
                className="ml-2 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/30 hover:bg-brand-400 transition-all hover:shadow-brand-700/40 active:scale-95"
              >
                Staff Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </nav>

            <button
              className="md:hidden p-2 text-white"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-navy-950/98 backdrop-blur-md border-t border-white/5">
            <nav className="flex flex-col px-4 py-4 gap-1">
              <a href="#overview" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-white/80 hover:text-white rounded-lg hover:bg-white/5">Overview</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-white/80 hover:text-white rounded-lg hover:bg-white/5">Features</a>
              <a href="#security" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-white/80 hover:text-white rounded-lg hover:bg-white/5">Security</a>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white">
                Staff Login <ArrowRight className="h-4 w-4" />
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={HERO_IMAGE}
            alt="Kaaba in Makkah"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-950/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-transparent to-navy-950/40" />
          <div className="absolute inset-0 bg-islamic-pattern opacity-60" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-28 pb-44 md:pb-52">
          <div className="max-w-3xl">
            <p className="animate-fade-in text-sm font-semibold tracking-[0.2em] text-gold-300 uppercase mb-4">
              INNA ATAINA TRAVELS
            </p>
            <h1 className="animate-fade-in-up font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] text-white text-balance">
              Complete Visibility Over Every Pilgrim Journey
            </h1>
            <p className="animate-fade-in-delay-1 mt-6 text-lg text-white/80 max-w-2xl leading-relaxed">
              Track arrivals, expected departures, confirmed departures, sub-agent responsibility and operational risks from one secure control centre.
            </p>

            <div className="animate-fade-in-delay-2 mt-9 flex flex-col sm:flex-row gap-4">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-brand-900/40 hover:bg-brand-400 transition-all hover:shadow-brand-700/50 active:scale-95"
              >
                Staff Login
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 backdrop-blur-sm px-7 py-3.5 text-base font-semibold text-white hover:bg-white/10 transition-all active:scale-95"
              >
                View Platform Features
                <ChevronRight className="h-5 w-5" />
              </a>
            </div>

            <div className="animate-fade-in-delay-3 mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-4 py-2">
              <ShieldCheck className="h-4 w-4 text-gold-300" />
              <span className="text-sm text-white/80 font-medium">Secure Internal Operations Platform</span>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Capability Panel */}
      <section className="relative z-20 -mt-32 md:-mt-36 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="animate-fade-in-up rounded-3xl bg-white shadow-2xl shadow-navy-950/40 border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map((cap, i) => {
                const Icon = cap.icon;
                return (
                  <div
                    key={cap.title}
                    className={`group p-7 lg:p-8 transition-colors hover:bg-slate-50 ${
                      i < capabilities.length - 1 ? 'lg:border-r border-slate-100' : ''
                    } ${i % 2 === 0 ? 'sm:border-r border-slate-100' : ''} ${
                      i < 2 ? 'border-b sm:border-b-0 lg:border-b-0' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition-colors">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-base text-slate-900">{cap.title}</h3>
                        <p className="mt-1 text-sm text-slate-500 leading-relaxed">{cap.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/50 px-7 py-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-7 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-navy-800 transition-all active:scale-95"
              >
                Open Staff Portal
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why the platform exists */}
      <section id="overview" className="bg-white py-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Why It Exists</p>
              <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight text-balance">
                Operational visibility from registration to confirmed departure
              </h2>
              <p className="mt-5 text-lg text-slate-600 leading-relaxed">
                Inna Ataina Travels manages Hajj and Umrah pilgrims, including pilgrims introduced by different sub-agents. Management needs complete operational visibility to answer the questions that matter:
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  'Where is every pilgrim right now?',
                  'Has the pilgrim arrived in Saudi Arabia?',
                  'When is the pilgrim expected to depart?',
                  'Has the departure been confirmed?',
                  'Which pilgrims require immediate follow-up?',
                ].map((q) => (
                  <li key={q} className="flex items-start gap-3 text-slate-700">
                    <CheckCircle2 className="h-5 w-5 text-brand-500 mt-0.5 shrink-0" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-100 to-gold-100 rounded-3xl rotate-3" />
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src={HERO_IMAGE}
                  alt="Pilgrims at the Grand Mosque"
                  className="w-full h-[420px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/60 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/90 backdrop-blur-sm px-4 py-2">
                    <Activity className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-semibold text-navy-900">Live operational control</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core operational capabilities */}
      <section id="features" className="bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 border-y border-slate-100">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Core Capabilities</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold text-slate-900 text-balance">
              A complete operational toolkit for pilgrim journey control
            </h2>
          </div>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Users, title: 'Pilgrim Management', desc: 'Register, search, filter and track every pilgrim with full record history and validation.' },
              { icon: Building2, title: 'Sub-Agent Accountability', desc: 'Maintain a clear chain of responsibility from sub-agent to pilgrim across every journey.' },
              { icon: Eye, title: 'Arrival & Departure Tracking', desc: 'Record arrivals, set expected departures, confirm actual departures — all timestamped and audited.' },
              { icon: AlertTriangle, title: 'Departure-Risk Monitoring', desc: 'Automatically flag overdue and unconfirmed departures for immediate staff follow-up.' },
              { icon: LayoutDashboard, title: 'Reactive Dashboard', desc: 'Live cards for total pilgrims, in-country, departing soon, overdue and unconfirmed departures.' },
              { icon: Lock, title: 'Role-Based Security', desc: 'Administrator and Operations Officer roles with enforced backend authorisation on every request.' },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl bg-white p-7 border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display font-bold text-lg text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Role-based security */}
      <section id="security" className="bg-navy-900 py-24 px-4 sm:px-6 lg:px-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-islamic-pattern opacity-30" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-semibold tracking-wider text-gold-300 uppercase">Role-Based Security</p>
              <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-balance">
                Authorised access enforced at every layer
              </h2>
              <p className="mt-5 text-lg text-white/70 leading-relaxed">
                Permissions are enforced on both the interface and the backend. Hiding a button is not enough — unauthorised requests are rejected at the database level.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2">
                <Lock className="h-4 w-4 text-gold-300" />
                <span className="text-sm font-medium">Backend authorisation on every mutation</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-400/20 text-gold-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg">Administrator</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">
                  Full access: pilgrims, sub-agents, staff users, sample-data tools, audit history and role assignment.
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-400/20 text-brand-200">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg">Operations Officer</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">
                  Operational access: create and update pilgrims, record arrivals, confirm departures, assign sub-agents.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Departure-risk monitoring */}
      <section className="bg-white py-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Departure-Risk Monitoring</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold text-slate-900 text-balance">
            Detect overdue departures before they become a problem
          </h2>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-3xl mx-auto">
            The main operational risk is failure to confirm departures promptly. The platform automatically flags overdue records as an operational warning requiring staff investigation — never as proof of an overstay.
          </p>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: AlertTriangle, label: 'Overdue Departures', color: 'text-red-600 bg-red-50' },
              { icon: Activity, label: 'Departing Soon', color: 'text-amber-600 bg-amber-50' },
              { icon: Eye, label: 'Unconfirmed', color: 'text-brand-600 bg-brand-50' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-slate-100 p-8 shadow-sm">
                  <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${item.color}`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <p className="mt-4 font-display font-bold text-lg text-slate-900">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Internal staff access CTA */}
      <section className="bg-navy-950 py-20 px-4 sm:px-6 lg:px-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        <div className="relative mx-auto max-w-4xl text-center">
          <Logo variant="badge" imgClassName="h-16 w-16 rounded-full bg-white p-1 mx-auto" className="justify-center mb-6" />
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-balance">
            Internal staff access only
          </h2>
          <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
            This platform is restricted to authorised Inna Ataina Travels staff. To request access, please contact an Administrator. Public self-registration is not available.
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-8 py-4 text-base font-semibold text-white shadow-xl hover:bg-brand-400 transition-all active:scale-95"
          >
            Staff Login
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="mt-6 text-xs text-white/40">
            Authorised staff access only. Activity may be monitored for operational security.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy-950 border-t border-white/5 py-10 px-4 sm:px-6 lg:px-8 text-white">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo variant="badge" imgClassName="h-8 w-8 rounded-full bg-white p-0.5" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">INNA ATAINA TRAVELS</p>
              <p className="text-[11px] text-white/40">HajjERP Operations Platform</p>
            </div>
          </div>
          <p className="text-xs text-white/40">Pilgrim Journey Control & Risk Monitoring</p>
        </div>
      </footer>
    </div>
  );
}

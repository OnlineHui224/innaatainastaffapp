import { Link } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { Logo } from '@/components/Logo';

/**
 * Internal gateway.
 *
 * This is deliberately not a marketing website: HajjERP is an authorised
 * internal platform, so the landing surface only identifies the platform,
 * states what it is for, and routes staff to sign in.
 */

const CAPABILITY_STATEMENTS = [
  {
    title: 'Pilgrim journey control',
    detail:
      'Every pilgrim record carries a journey state that is either confirmed by a named officer or clearly marked as derived from planned dates.',
  },
  {
    title: 'Sub-agent accountability',
    detail:
      'Responsibility for each pilgrim is traced to the introducing organisation, with assigned, in-country and overdue populations shown honestly.',
  },
  {
    title: 'Departure-risk monitoring',
    detail:
      'Unconfirmed and overdue departures are surfaced for follow-up as operational flags — never as a claim of legal overstay.',
  },
  {
    title: 'Controlled record intake',
    detail:
      'CSV and visa-document intake pass through explicit review before anything becomes an active operational record.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-navy-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo variant="badge" imgClassName="h-11 w-11 rounded-md bg-white p-1" />
            <div className="leading-tight">
              <p className="font-display text-xs font-bold tracking-wide sm:text-sm">INNA ATAINA TRAVELS</p>
              <p className="text-2xs text-gold-300">HajjERP Operations Platform</p>
            </div>
          </div>
          <Link
            to="/login"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-brand-500 bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Staff Login
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main id="main-content" className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-hajj-motif opacity-60" aria-hidden="true" />
        <div className="absolute inset-0 bg-grid-pattern opacity-30" aria-hidden="true" />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-14 lg:px-8 lg:py-16">
          <div className="lg:w-[52%]">
            <p className="text-2xs font-bold uppercase tracking-[0.28em] text-gold-300">Authorised internal platform</p>
            <h1 className="mt-3.5 font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight text-balance sm:text-[2.5rem]">
              Pilgrim Journey Control &amp; Risk Monitoring
            </h1>
            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-white/70">
              HajjERP is the internal operations platform of Inna Ataina Travels. Access is restricted to
              authorised staff accounts issued by an Administrator.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-brand-500 bg-brand-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Staff Login
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-sm text-white/50">No public registration.</p>
            </div>

            <div className="mt-10 flex items-start gap-3 border-t border-gold-500/30 pt-5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-white/50">
                Authorised staff access only. Permissions are enforced by the backend on every request, and
                activity is recorded in the platform audit history for operational security.
              </p>
            </div>
          </div>

          <div className="lg:w-[48%]">
            <div className="overflow-hidden rounded-lg border border-white/15">
              {CAPABILITY_STATEMENTS.map((statement, index) => (
                <div
                  key={statement.title}
                  className={`bg-white/[0.04] px-4 py-3.5 ${index > 0 ? 'border-t border-white/10' : ''}`}
                >
                  <h2 className="font-display text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-white">{statement.title}</h2>
                  <p className="mt-1.5 text-[0.8125rem] leading-snug text-white/55">{statement.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <div className="flex items-center gap-3">
            <Logo variant="badge" imgClassName="h-8 w-8 rounded bg-white p-0.5" />
            <div className="leading-tight">
              <p className="text-xs font-semibold">INNA ATAINA TRAVELS</p>
              <p className="text-2xs text-white/40">HajjERP Operations Platform</p>
            </div>
          </div>
          <p className="text-2xs text-white/40">Pilgrim Journey Control &amp; Risk Monitoring</p>
        </div>
      </footer>
    </div>
  );
}

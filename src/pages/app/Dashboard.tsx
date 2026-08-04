import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  MapPin,
  CalendarClock,
  AlertTriangle,
  Clock,
  ArrowRight,
  Loader2,
  TrendingUp,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  calculateDashboardMetrics,
  calculateJourneyStatus,
  sortPilgrimsByPriority,
  STATUS_META,
  dateToStr,
  type DashboardMetrics,
} from '@/lib/status';
import type { Pilgrim, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { BootstrapBanner } from '@/components/BootstrapBanner';

interface PilgrimRow extends Pilgrim {
  sub_agents: SubAgent | null;
}

export default function Dashboard() {
  const [pilgrims, setPilgrims] = useState<PilgrimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    total: 0,
    inSaudiArabia: 0,
    departingIn3Days: 0,
    overdue: 0,
    unconfirmed: 0,
    departureConfirmed: 0,
    unverifiedImported: 0,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pilgrims')
        .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as PilgrimRow[];
      setPilgrims(rows);
      setMetrics(calculateDashboardMetrics(rows));
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const priorityPilgrims = sortPilgrimsByPriority(pilgrims).slice(0, 8);
  const today = dateToStr(new Date());

  const cards = [
    {
      label: 'Total Pilgrims',
      value: metrics.total,
      icon: Users,
      iconBg: 'bg-brand-50 text-brand-600',
      sub: 'All registered records',
      ring: '',
    },
    {
      label: 'In Saudi Arabia',
      value: metrics.inSaudiArabia,
      icon: MapPin,
      iconBg: 'bg-emerald-50 text-emerald-600',
      sub: 'Arrived, not yet departed',
      ring: '',
    },
    {
      label: 'Departing in 3 Days',
      value: metrics.departingIn3Days,
      icon: CalendarClock,
      iconBg: 'bg-amber-50 text-amber-600',
      sub: 'Expected return within 3 days',
      ring: '',
    },
    {
      label: 'Overdue Departures',
      value: metrics.overdue,
      icon: AlertTriangle,
      iconBg: 'bg-red-50 text-red-600',
      sub: 'Past expected return date',
      ring: metrics.overdue > 0 ? 'ring-2 ring-red-200' : '',
    },
    {
      label: 'Unconfirmed Departures',
      value: metrics.unconfirmed,
      icon: Clock,
      iconBg: 'bg-slate-100 text-slate-600',
      sub: 'Return date reached, no departure',
      ring: '',
    },
    {
      label: 'Departure Confirmed',
      value: metrics.departureConfirmed,
      icon: CheckCircle2,
      iconBg: 'bg-brand-50 text-brand-600',
      sub: 'Manually confirmed by staff',
      ring: '',
    },
    {
      label: 'Unverified Imported',
      value: metrics.unverifiedImported,
      icon: HelpCircle,
      iconBg: 'bg-blue-50 text-blue-600',
      sub: 'Imported, arrival not confirmed',
      ring: '',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        subtitle={`Live operational overview — ${today}`}
        icon={<TrendingUp className="h-6 w-6" />}
        actions={
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <BootstrapBanner />

      {/* Risk warning */}
      {metrics.overdue > 0 && !loading && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 leading-relaxed">
              <span className="font-bold">{metrics.overdue}</span> pilgrims have passed their expected return date without a confirmed departure. This is an operational flag — it does not confirm an overstay. Please follow up immediately.
            </p>
          </div>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm h-36 animate-pulse">
              <div className="h-10 w-10 rounded-xl bg-slate-100" />
              <div className="mt-4 h-8 w-20 bg-slate-100 rounded" />
              <div className="mt-2 h-4 w-32 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md ${card.ring}`}
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconBg}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <p className="mt-4 text-3xl font-display font-extrabold text-slate-900 tabular-nums">
                  {card.value}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{card.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{card.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Priority records */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Priority Records</h2>
            <p className="text-sm text-slate-500">Ordered by operational urgency</p>
          </div>
          <Link
            to="/app/pilgrims"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-all"
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : priorityPilgrims.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
            <Users className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="mt-3 text-sm text-slate-500">No pilgrim records yet.</p>
            <Link
              to="/app/pilgrims/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-all"
            >
              Add First Pilgrim
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Nationality</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden sm:table-cell">Scheduled Departure</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden md:table-cell">Sub-Agent</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {priorityPilgrims.map((p) => {
                    const status = calculateJourneyStatus(p);
                    const meta = STATUS_META[status];
                    return (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">{p.full_name}</td>
                        <td className="px-4 py-3 text-slate-600">{p.nationality}</td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{p.expected_departure_date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.bgColor} ${meta.color} border ${meta.borderColor}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                          {p.sub_agents?.organisation_name || <span className="text-slate-400">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/app/pilgrims/${p.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                          >
                            View <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

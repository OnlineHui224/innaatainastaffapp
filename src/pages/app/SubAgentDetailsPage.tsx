import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Building2,
  Mail,
  Phone,
  MapPin,
  User,
  Users,
  AlertTriangle,
  CalendarClock,
  MapPin as LocationIcon,
  Loader2,
  StickyNote,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  calculateJourneyStatus,
  STATUS_META,
  isOverdue,
  isDepartingIn3Days,
  isPhysicallyPresent,
} from '@/lib/status';
import type { SubAgent, Pilgrim } from '@/types';
import { PageHeader } from '@/components/PageHeader';

export default function SubAgentDetailsPage() {
  const { id } = useParams();
  const [subAgent, setSubAgent] = useState<SubAgent | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('sub_agents').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setError('Sub-agent not found.');
      setLoading(false);
      return;
    }
    setSubAgent(data as SubAgent);
    const { data: pData } = await supabase.from('pilgrims').select('*').eq('sub_agent_id', id).order('full_name');
    setPilgrims((pData || []) as Pilgrim[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !subAgent) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-700">{error || 'Sub-agent not found.'}</p>
        <Link to="/app/sub-agents" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to sub-agents
        </Link>
      </div>
    );
  }

  const inSaudi = pilgrims.filter(isPhysicallyPresent).length;
  const departing = pilgrims.filter(isDepartingIn3Days).length;
  const overdue = pilgrims.filter(isOverdue).length;

  const stats = [
    { icon: Users, label: 'Assigned Pilgrims', value: pilgrims.length, color: 'text-slate-600 bg-slate-50' },
    { icon: LocationIcon, label: 'In Saudi Arabia', value: inSaudi, color: 'text-emerald-600 bg-emerald-50' },
    { icon: CalendarClock, label: 'Departing Soon', value: departing, color: 'text-amber-600 bg-amber-50' },
    { icon: AlertTriangle, label: 'Overdue', value: overdue, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div>
      <Link to="/app/sub-agents" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to sub-agents
      </Link>

      <PageHeader
        title={subAgent.organisation_name}
        subtitle={subAgent.contact_person}
        icon={<Building2 className="h-6 w-6" />}
        actions={
          <Link to={`/app/sub-agents/${id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-all">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Details card */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-4">Contact Details</h3>
            <div className="space-y-4">
              <DetailRow icon={User} label="Contact Person" value={subAgent.contact_person} />
              <DetailRow icon={MapPin} label="Country" value={subAgent.country} />
              <DetailRow icon={Mail} label="Email" value={subAgent.email || '—'} />
              <DetailRow icon={Phone} label="Phone" value={subAgent.phone_number || '—'} />
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${subAgent.active_status ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {subAgent.active_status ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {subAgent.notes && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="font-display font-bold text-base text-slate-900 mb-3 flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-slate-400" /> Notes
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{subAgent.notes}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-2xl font-display font-extrabold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Assigned pilgrims */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-display font-bold text-base text-slate-900">Assigned Pilgrims ({pilgrims.length})</h3>
            </div>
            {pilgrims.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="mt-3 text-sm text-slate-500">No pilgrims assigned to this sub-agent.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden sm:table-cell">Nationality</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pilgrims.map((p) => {
                      const status = calculateJourneyStatus(p);
                      const meta = STATUS_META[status];
                      return (
                        <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.full_name}</td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{p.nationality}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.bgColor} ${meta.color} border ${meta.borderColor}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link to={`/app/pilgrims/${p.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                              View →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

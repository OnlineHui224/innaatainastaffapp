import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Eye,
  Loader2,
  MapPin,
  Users,
  AlertTriangle,
  CalendarClock,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  isOverdue,
  isDepartingIn3Days,
  isPhysicallyPresent,
} from '@/lib/status';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { SubAgent, Pilgrim } from '@/types';
import { PageHeader } from '@/components/PageHeader';

interface SubAgentWithStats extends SubAgent {
  _pilgrims?: Pilgrim[];
  _assignedCount?: number;
  _inSaudi?: number;
  _departing?: number;
  _overdue?: number;
}

export default function SubAgentsPage() {
  const { profile, canDeleteRecords } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SubAgentWithStats | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('sub_agents').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const agents = (data || []) as SubAgent[];

      // Fetch pilgrims for stats
      const { data: pilgrimData } = await supabase.from('pilgrims').select('*');
      const pilgrims = (pilgrimData || []) as Pilgrim[];

      const withStats: SubAgentWithStats[] = agents.map((sa) => {
        const assigned = pilgrims.filter((p) => p.sub_agent_id === sa.id);
        return {
          ...sa,
          _pilgrims: assigned,
          _assignedCount: assigned.length,
          _inSaudi: assigned.filter((p) => isPhysicallyPresent(p)).length,
          _departing: assigned.filter((p) => isDepartingIn3Days(p)).length,
          _overdue: assigned.filter((p) => isOverdue(p)).length,
        };
      });

      setSubAgents(withStats);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  const filtered = subAgents.filter((sa) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      sa.organisation_name.toLowerCase().includes(q) ||
      sa.contact_person.toLowerCase().includes(q) ||
      sa.country.toLowerCase().includes(q)
    );
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      // Check for assigned pilgrims
      const { count } = await supabase
        .from('pilgrims')
        .select('id', { count: 'exact', head: true })
        .eq('sub_agent_id', deleteTarget.id);
      if (count && count > 0) {
        setDeleteError(`This sub-agent has ${count} assigned pilgrim(s). Please reassign them before deleting.`);
        setDeleteLoading(false);
        return;
      }
      const { error } = await supabase.from('sub_agents').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      await logAudit({
        action: 'sub_agent_deleted',
        recordType: 'sub_agent',
        recordId: deleteTarget.id,
        recordLabel: deleteTarget.organisation_name,
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
      setDeleteTarget(null);
      await fetchData();
    } catch (e) {
      setDeleteError(friendlyError(e));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sub-Agents"
        subtitle={`${subAgents.length} organisation${subAgents.length !== 1 ? 's' : ''}`}
        icon={<Building2 className="h-6 w-6" />}
        actions={
          <Link to="/app/sub-agents/new" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95">
            <Plus className="h-4 w-4" /> Add Sub-Agent
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by organisation, contact, or country..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">No sub-agents found.</p>
          <Link to="/app/sub-agents/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-all">
            <Plus className="h-4 w-4" /> Add Sub-Agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((sa) => (
            <div key={sa.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <Link to={`/app/sub-agents/${sa.id}`} className="font-display font-bold text-base text-slate-900 hover:text-brand-600 transition-colors">
                      {sa.organisation_name}
                    </Link>
                    <p className="text-sm text-slate-500 mt-0.5">{sa.contact_person}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${sa.active_status ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {sa.active_status ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="h-4 w-4" /> {sa.country}
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <Stat icon={Users} label="Assigned" value={sa._assignedCount || 0} color="text-slate-600" />
                <Stat icon={MapPin} label="In KSA" value={sa._inSaudi || 0} color="text-emerald-600" />
                <Stat icon={CalendarClock} label="Soon" value={sa._departing || 0} color="text-amber-600" />
                <Stat icon={AlertTriangle} label="Overdue" value={sa._overdue || 0} color="text-red-600" />
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-50 pt-4">
                <div className="flex items-center gap-1">
                  <Link to={`/app/sub-agents/${sa.id}`} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all" title="View">
                    <Eye className="h-4 w-4" />
                  </Link>
                  <Link to={`/app/sub-agents/${sa.id}/edit`} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  {canDeleteRecords && (
                    <button
                      onClick={() => { setDeleteError(null); setDeleteTarget(sa); }}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Link to={`/app/sub-agents/${sa.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  View details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Sub-Agent"
        message={
          deleteError ? (
            <span className="text-red-700 font-medium">{deleteError}</span>
          ) : (
            <>Are you sure you want to delete <strong>{deleteTarget?.organisation_name}</strong>? This action cannot be undone.</>
          )
        }
        confirmLabel={deleteError ? 'OK' : 'Delete'}
        onConfirm={deleteError ? () => { setDeleteError(null); setDeleteTarget(null); } : handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        loading={deleteLoading}
        danger
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <Icon className={`h-4 w-4 mx-auto ${color}`} />
      <p className={`mt-1 text-lg font-display font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

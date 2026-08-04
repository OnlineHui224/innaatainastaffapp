import { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Search,
  Loader2,
  User,
  Building2,
  ShieldCheck,
  Plane,
  Database,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/types';
import { PageHeader } from '@/components/PageHeader';

const ACTION_ICONS: Record<string, React.ElementType> = {
  pilgrim_created: User,
  pilgrim_edited: Pencil,
  arrival_recorded: Plane,
  departure_confirmed: Plane,
  departure_correction: Pencil,
  pilgrim_note_added: Pencil,
  sub_agent_created: Building2,
  sub_agent_edited: Pencil,
  sub_agent_deleted: Trash2,
  sub_agent_assignment_changed: Building2,
  staff_user_created: ShieldCheck,
  staff_role_changed: ShieldCheck,
  staff_account_deactivated: AlertTriangle,
  staff_account_activated: ShieldCheck,
  sample_data_loaded: Database,
  sample_data_reset: Database,
  record_deleted: Trash2,
};

function formatAction(action: string): string {
  const map: Record<string, string> = {
    pilgrim_created: 'Pilgrim Created',
    pilgrim_edited: 'Pilgrim Edited',
    arrival_recorded: 'Arrival Recorded',
    departure_confirmed: 'Departure Confirmed',
    departure_correction: 'Departure Corrected',
    pilgrim_note_added: 'Operational Note Added',
    expected_departure_changed: 'Expected Departure Changed',
    sub_agent_created: 'Sub-Agent Created',
    sub_agent_edited: 'Sub-Agent Edited',
    sub_agent_deleted: 'Sub-Agent Deleted',
    sub_agent_assignment_changed: 'Sub-Agent Assignment Changed',
    staff_user_created: 'Staff User Created',
    staff_role_changed: 'Staff Role Changed',
    staff_account_deactivated: 'Staff Account Deactivated',
    staff_account_activated: 'Staff Account Activated',
    sample_data_loaded: 'Sample Data Loaded',
    sample_data_reset: 'Sample Data Reset',
    record_deleted: 'Record Deleted',
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const RECORD_LABELS: Record<string, string> = {
  pilgrim: 'Pilgrim',
  sub_agent: 'Sub-Agent',
  staff_user: 'Staff User',
  system: 'System',
};

export default function AuditHistoryPage() {
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setEntries((data || []) as AuditLog[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const uniqueActions = Array.from(new Set(entries.map((e) => e.action))).sort();

  const filtered = entries.filter((e) => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.record_label.toLowerCase().includes(q) ||
      e.performed_by_name.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q)
    );
  });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div>
      <PageHeader
        title="Audit History"
        subtitle={`${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`}
        icon={<ScrollText className="h-6 w-6" />}
      />

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by record, staff member, or action..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          >
            <option value="all">All Actions</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{formatAction(a)}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-400">
        The audit log is immutable. Operations Officers cannot delete or alter audit records.
      </p>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{error}</div>
      ) : paged.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <ScrollText className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">No audit entries yet.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-50">
              {paged.map((entry) => {
                const Icon = ACTION_ICONS[entry.action] || ScrollText;
                const prev = entry.previous_value;
                const next = entry.new_value;
                return (
                  <div key={entry.id} className="flex items-start gap-4 p-5 hover:bg-slate-50/40 transition-colors">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 text-sm">{formatAction(entry.action)}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {RECORD_LABELS[entry.record_type] || entry.record_type}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {entry.record_label && <span className="font-medium">{entry.record_label}</span>}
                      </p>
                      {(prev || next) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {prev && Object.keys(prev).length > 0 && (
                            <span className="rounded-lg bg-red-50 text-red-700 px-2 py-1 font-mono">
                              was: {JSON.stringify(prev).slice(0, 80)}
                            </span>
                          )}
                          {next && Object.keys(next).length > 0 && (
                            <span className="rounded-lg bg-emerald-50 text-emerald-700 px-2 py-1 font-mono">
                              now: {JSON.stringify(next).slice(0, 80)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-700">{entry.performed_by_name || 'System'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(entry.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

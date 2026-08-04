import { useState, useEffect, useCallback } from 'react';
import { FileText, Eye, History, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface VisaLogRow {
  id: string;
  pilgrim_name: string;
  visa_number: string | null;
  passport_number: string;
  agent_name: string | null;
  visa_company: string | null;
  created_at: string;
}

export function ViewerReadOnly() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<VisaLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('pilgrims')
        .select('id, full_name, visa_number, passport_number, visa_company, created_at, sub_agents(organisation_name)')
        .not('visa_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (query.trim()) {
        q = q.or(`full_name.ilike.%${query.trim()}%,passport_number.ilike.%${query.trim()}%,visa_number.ilike.%${query.trim()}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows: VisaLogRow[] = (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        pilgrim_name: r.full_name as string,
        visa_number: r.visa_number as string | null,
        passport_number: r.passport_number as string,
        agent_name: (r.sub_agents as { organisation_name: string } | null)?.organisation_name ?? null,
        visa_company: r.visa_company as string | null,
        created_at: r.created_at as string,
      }));
      setRecords(rows);
    } catch (e) {
      console.error('Failed to load visa records:', e);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  return (
    <div className="space-y-6">
      {/* Read-only banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
        <Eye className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">Read-Only Access</p>
          <p className="mt-0.5 text-sm text-blue-700">
            You have viewer access. You can browse visa records but cannot upload, extract, edit, or confirm.
            Contact an administrator if you need processing access.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by pilgrim name, passport, or visa number..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
        />
      </div>

      {/* Records table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <h3 className="font-display font-bold text-base text-navy-900">Visa Records</h3>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 rounded-full border-3 border-slate-200 border-t-brand-500 animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-10 w-10 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No visa records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pilgrim</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Passport</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Visa No.</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Agent</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">{row.pilgrim_name}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{row.passport_number}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{row.visa_number || '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{row.agent_name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-400">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 text-center">Logged in as: {profile?.full_name || 'Viewer'}</p>
    </div>
  );
}

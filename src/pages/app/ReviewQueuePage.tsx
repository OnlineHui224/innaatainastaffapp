import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import { parseDate } from '@/lib/verifiedImport';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';

interface ReviewQueueRow {
  id: string;
  batch_id: string | null;
  full_name: string;
  passport_number: string;
  visa_number: string | null;
  agent_name: string | null;
  agent_match_key: string | null;
  departure_date: string | null;
  expected_return_date: string | null;
  makkah_hotel: string | null;
  madinah_hotel: string | null;
  transportation: string | null;
  visa_company: string | null;
  arrival_port: string | null;
  contract_record_date: string | null;
  review_reason: string | null;
  source_sheet: string | null;
  source_row: number | null;
  original_departure_value: string | null;
  original_return_value: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function ReviewQueuePage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('import_review_queue')
      .select('*')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    const { data, error: qErr } = await query;
    if (qErr) {
      setError(friendlyError(qErr));
      setRows([]);
    } else {
      setRows((data ?? []) as ReviewQueueRow[]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    supabase.from('sub_agents').select('*').eq('active_status', true).order('organisation_name').then(({ data }) => {
      if (data) setSubAgents(data as SubAgent[]);
    });
  }, []);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(s) ||
      r.passport_number.toLowerCase().includes(s) ||
      (r.agent_name ?? '').toLowerCase().includes(s) ||
      (r.review_reason ?? '').toLowerCase().includes(s)
    );
  });

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const approvedCount = rows.filter((r) => r.status === 'approved').length;
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;

  async function approveRow(row: ReviewQueueRow, edits: Record<string, string>) {
    setActionLoading(row.id);
    setError(null);

    const fullName = edits.full_name?.trim() || row.full_name;
    const passportNumber = edits.passport_number?.trim() || row.passport_number;
    const departureDate = parseDate(edits.departure_date || row.departure_date || '');
    const returnDate = parseDate(edits.expected_return_date || row.expected_return_date || '');
    const contractDate = parseDate(edits.contract_record_date || row.contract_record_date || '');

    if (!fullName) {
      setError('Pilgrim name is required to approve this row.');
      setActionLoading(null);
      return;
    }
    if (!passportNumber) {
      setError('Passport number is required to approve this row.');
      setActionLoading(null);
      return;
    }
    if (!departureDate) {
      setError('A valid departure date is required to approve this row.');
      setActionLoading(null);
      return;
    }

    const subAgentId = edits.sub_agent_id || null;

    const insertData: Record<string, unknown> = {
      full_name: fullName,
      passport_number: passportNumber,
      nationality: 'Nigeria',
      sub_agent_id: subAgentId,
      expected_departure_date: departureDate,
      actual_departure_date: null,
      expected_return_date: returnDate,
      arrival_date: null,
      operational_notes: null,
      visa_number: edits.visa_number || row.visa_number || null,
      makkah_hotel: edits.makkah_hotel || row.makkah_hotel || null,
      madinah_hotel: edits.madinah_hotel || row.madinah_hotel || null,
      transportation: edits.transportation || row.transportation || null,
      visa_company: edits.visa_company || row.visa_company || null,
      arrival_port: edits.arrival_port || row.arrival_port || null,
      contract_record_date: contractDate,
      source_sheet: row.source_sheet,
      source_row: row.source_row,
      import_batch_id: row.batch_id,
      is_sample_data: false,
      status_source: 'CSV_IMPORT',
      actual_arrival_at: null,
      arrival_confirmed_at: null,
      arrival_confirmed_by: null,
      departure_confirmed_at: null,
      departure_confirmed_by: null,
      created_by: profile?.id ?? null,
      updated_by: profile?.id ?? null,
    };

    const { error: insertErr } = await supabase.from('pilgrims').insert(insertData);

    if (insertErr) {
      if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
        setError(`A pilgrim with passport ${passportNumber} already exists. Cannot approve this row.`);
      } else {
        setError(friendlyError(insertErr));
      }
      setActionLoading(null);
      return;
    }

    await supabase
      .from('import_review_queue')
      .update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        resolved_by: profile?.id ?? null,
        full_name: fullName,
        passport_number: passportNumber,
        departure_date: edits.departure_date || row.departure_date,
        expected_return_date: edits.expected_return_date || row.expected_return_date,
      })
      .eq('id', row.id);

    await logAudit({
      action: 'review_queue_approved',
      recordType: 'pilgrim',
      recordId: row.id,
      recordLabel: `Approved review row: ${fullName} (${passportNumber})`,
      newValue: { batch_id: row.batch_id, review_reason: row.review_reason },
      performedBy: profile?.id ?? null,
      performedByName: profile?.full_name ?? '',
    });

    setActionResult(`Approved: ${fullName} imported as active pilgrim.`);
    setActionLoading(null);
    setExpandedId(null);
    await loadRows();
  }

  async function rejectRow(row: ReviewQueueRow) {
    setActionLoading(row.id);
    await supabase
      .from('import_review_queue')
      .update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: profile?.id ?? null,
      })
      .eq('id', row.id);

    await logAudit({
      action: 'review_queue_rejected',
      recordType: 'pilgrim',
      recordId: row.id,
      recordLabel: `Rejected review row: ${row.full_name} (${row.passport_number})`,
      newValue: { batch_id: row.batch_id, review_reason: row.review_reason },
      performedBy: profile?.id ?? null,
      performedByName: profile?.full_name ?? '',
    });

    setActionResult(`Rejected: ${row.full_name} will not be imported.`);
    setActionLoading(null);
    await loadRows();
  }

  return (
    <div>
      <Link to="/app/pilgrims" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Pilgrims
      </Link>

      <PageHeader
        title="Import Review Queue"
        subtitle={`${pendingCount} pending, ${approvedCount} approved, ${rejectedCount} rejected`}
        icon={<ClipboardList className="h-6 w-6" />}
        actions={
          <button
            onClick={loadRows}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-5">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {actionResult && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700">{actionResult}</p>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, passport, agent, or review reason..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium capitalize transition-all ${
                  statusFilter === s
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-900/20'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">Loading review queue...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <ClipboardList className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">
            {statusFilter === 'pending' ? 'No pending review rows.' : `No ${statusFilter} rows.`}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Review rows appear here after a verified import that contained REVIEW-status CSV rows.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <ReviewRowCard
              key={row.id}
              row={row}
              subAgents={subAgents}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              onApprove={(edits) => approveRow(row, edits)}
              onReject={() => rejectRow(row)}
              actionLoading={actionLoading === row.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewRowCard({
  row,
  subAgents,
  expanded,
  onToggle,
  onApprove,
  onReject,
  actionLoading,
}: {
  row: ReviewQueueRow;
  subAgents: SubAgent[];
  expanded: boolean;
  onToggle: () => void;
  onApprove: (edits: Record<string, string>) => void;
  onReject: () => void;
  actionLoading: boolean;
}) {
  const statusConfig = {
    pending: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Pending' },
    approved: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Approved' },
    rejected: { icon: XCircle, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Rejected' },
  };
  const cfg = statusConfig[row.status];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border ${cfg.border} bg-white shadow-sm overflow-hidden`}>
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={onToggle}
          className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          disabled={row.status !== 'pending'}
        >
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900">
              {row.full_name || <span className="text-red-600 italic">(missing name)</span>}
            </p>
            <span className="text-xs font-mono text-slate-500 rounded bg-slate-100 px-1.5 py-0.5">
              {row.passport_number}
            </span>
            {row.visa_number && (
              <span className="text-xs font-mono text-slate-400">Visa: {row.visa_number}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Building2 className="h-3.5 w-3.5" />
            {row.agent_name || 'No agent'}
            {row.source_sheet && <span>· Sheet: {row.source_sheet}</span>}
            {row.source_row && <span>· Row: {row.source_row}</span>}
          </div>
          <p className="mt-1.5 text-sm text-orange-700 bg-orange-50/60 rounded-lg px-3 py-1.5 inline-block">
            {row.review_reason || 'No review reason provided'}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 ${cfg.color}`}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-semibold hidden sm:inline">{cfg.label}</span>
        </div>
      </div>

      {/* Expanded edit panel */}
      {expanded && row.status === 'pending' && (
        <ExpandedEditor
          row={row}
          subAgents={subAgents}
          onApprove={onApprove}
          onReject={onReject}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

function ExpandedEditor({
  row,
  subAgents,
  onApprove,
  onReject,
  actionLoading,
}: {
  row: ReviewQueueRow;
  subAgents: SubAgent[];
  onApprove: (edits: Record<string, string>) => void;
  onReject: () => void;
  actionLoading: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  };

  const getValue = (key: keyof ReviewQueueRow): string => {
    const editVal = edits[key];
    if (editVal !== undefined) return editVal;
    const dbVal = row[key];
    return dbVal ?? '';
  };

  return (
    <div className="border-t border-slate-100 p-5 bg-slate-50/40">
      <p className="text-sm font-semibold text-slate-700 mb-4">
        Correct the fields below, then approve to import this pilgrim as an active record.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pilgrim Name" value={getValue('full_name')} onChange={(v) => set('full_name', v)} required />
        <Field label="Passport Number" value={getValue('passport_number')} onChange={(v) => set('passport_number', v)} required />
        <Field label="Visa Number" value={getValue('visa_number')} onChange={(v) => set('visa_number', v)} />
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Assign to Agent</label>
          <select
            value={edits.sub_agent_id ?? ''}
            onChange={(e) => set('sub_agent_id', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
          >
            <option value="">— Select agent —</option>
            {subAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.organisation_name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Departure Date" value={getValue('departure_date')} onChange={(v) => set('departure_date', v)} placeholder="YYYY-MM-DD" required />
        <Field label="Expected Return Date" value={getValue('expected_return_date')} onChange={(v) => set('expected_return_date', v)} placeholder="YYYY-MM-DD" />
        <Field label="Makkah Hotel" value={getValue('makkah_hotel')} onChange={(v) => set('makkah_hotel', v)} />
        <Field label="Madinah Hotel" value={getValue('madinah_hotel')} onChange={(v) => set('madinah_hotel', v)} />
        <Field label="Transportation" value={getValue('transportation')} onChange={(v) => set('transportation', v)} />
        <Field label="Visa Company" value={getValue('visa_company')} onChange={(v) => set('visa_company', v)} />
        <Field label="Arrival Port" value={getValue('arrival_port')} onChange={(v) => set('arrival_port', v)} />
        <Field label="Contract Record Date" value={getValue('contract_record_date')} onChange={(v) => set('contract_record_date', v)} placeholder="YYYY-MM-DD" />
      </div>

      {/* Original values reference */}
      <div className="mt-4 rounded-lg bg-white border border-slate-100 p-3">
        <p className="text-xs font-semibold text-slate-400 mb-2">Original CSV Values (read-only reference)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-500">
          <div><span className="text-slate-400">Original Departure:</span> {row.original_departure_value || '—'}</div>
          <div><span className="text-slate-400">Original Return:</span> {row.original_return_value || '—'}</div>
          <div><span className="text-slate-400">Agent Match Key:</span> {row.agent_match_key || '—'}</div>
          <div><span className="text-slate-400">Source Row:</span> {row.source_row ?? '—'}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => onApprove(edits)}
          disabled={actionLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-40"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve & Import
        </button>
        <button
          onClick={onReject}
          disabled={actionLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-40"
        >
          <XCircle className="h-4 w-4" />
          Reject
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
      />
    </div>
  );
}

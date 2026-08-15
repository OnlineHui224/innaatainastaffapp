import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import { parseDate } from '@/lib/verifiedImport';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { Field, Identifier, Input, SearchInput, Select } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { cn } from '@/lib/utils';

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

/** Every field an officer can approve, paired with the original CSV value it came from. */
type ApprovedField =
  | 'full_name'
  | 'passport_number'
  | 'visa_number'
  | 'departure_date'
  | 'expected_return_date'
  | 'makkah_hotel'
  | 'madinah_hotel'
  | 'transportation'
  | 'visa_company'
  | 'arrival_port'
  | 'contract_record_date';

interface FieldSpec {
  key: ApprovedField;
  label: string;
  required?: boolean;
  /** Date fields are only carried over when the original parses cleanly. */
  isDate?: boolean;
  identifier?: boolean;
  hint?: string;
}

const FIELD_SPECS: FieldSpec[] = [
  { key: 'full_name', label: 'Pilgrim name', required: true },
  { key: 'passport_number', label: 'Passport number', required: true, identifier: true },
  { key: 'visa_number', label: 'Visa number', identifier: true },
  { key: 'departure_date', label: 'Scheduled outbound date', required: true, isDate: true, hint: 'YYYY-MM-DD' },
  { key: 'expected_return_date', label: 'Expected return date', isDate: true, hint: 'YYYY-MM-DD' },
  { key: 'contract_record_date', label: 'Contract record date', isDate: true, hint: 'YYYY-MM-DD' },
  { key: 'visa_company', label: 'Visa company' },
  { key: 'arrival_port', label: 'Planned arrival port' },
  { key: 'makkah_hotel', label: 'Makkah hotel' },
  { key: 'madinah_hotel', label: 'Madinah hotel' },
  { key: 'transportation', label: 'Ground transportation' },
];

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
    let query = supabase.from('import_review_queue').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data, error: queryError } = await query;
    if (queryError) {
      setError(friendlyError(queryError));
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
    supabase
      .from('sub_agents')
      .select('*')
      .eq('active_status', true)
      .order('organisation_name')
      .then(({ data }) => {
        if (data) setSubAgents(data as SubAgent[]);
      });
  }, []);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      r.passport_number.toLowerCase().includes(q) ||
      (r.agent_name ?? '').toLowerCase().includes(q) ||
      (r.review_reason ?? '').toLowerCase().includes(q)
    );
  });

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  async function approveRow(row: ReviewQueueRow, approved: Record<string, string>) {
    setActionLoading(row.id);
    setError(null);

    const fullName = (approved.full_name ?? '').trim();
    const passportNumber = (approved.passport_number ?? '').trim();
    const departureDate = parseDate(approved.departure_date ?? '');
    const returnDate = parseDate(approved.expected_return_date ?? '');
    const contractDate = parseDate(approved.contract_record_date ?? '');

    if (!fullName) {
      setError('An approved pilgrim name is required before this row can be imported.');
      setActionLoading(null);
      return;
    }
    if (!passportNumber) {
      setError('An approved passport number is required before this row can be imported.');
      setActionLoading(null);
      return;
    }
    if (!departureDate) {
      setError('A valid approved scheduled outbound date is required before this row can be imported.');
      setActionLoading(null);
      return;
    }

    const insertData: Record<string, unknown> = {
      full_name: fullName,
      passport_number: passportNumber,
      // Known limitation of the current importer — see deferred issues.
      nationality: 'Nigeria',
      sub_agent_id: approved.sub_agent_id || null,
      expected_departure_date: departureDate,
      actual_departure_date: null,
      expected_return_date: returnDate,
      arrival_date: null,
      operational_notes: null,
      visa_number: approved.visa_number || null,
      makkah_hotel: approved.makkah_hotel || null,
      madinah_hotel: approved.madinah_hotel || null,
      transportation: approved.transportation || null,
      visa_company: approved.visa_company || null,
      arrival_port: approved.arrival_port || null,
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
        setError(`A pilgrim with passport ${passportNumber} already exists. This row cannot be approved.`);
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
        departure_date: approved.departure_date || row.departure_date,
        expected_return_date: approved.expected_return_date || row.expected_return_date,
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

    setActionResult(`${fullName} approved and imported as an active pilgrim record.`);
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

    setActionResult(`${row.full_name} rejected. This row will not be imported.`);
    setActionLoading(null);
    await loadRows();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Pilgrims"
        title="Import Review Queue"
        subtitle="Rows that an import could not accept without a human decision. Each row shows the original CSV values beside the values you approve."
        actions={
          <Button
            variant="secondary"
            onClick={loadRows}
            loading={loading}
            icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert tone="critical" className="mb-5" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {actionResult && (
        <Alert tone="success" className="mb-5" onDismiss={() => setActionResult(null)}>
          {actionResult}
        </Alert>
      )}

      <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-slate-300 bg-white p-2.5 lg:flex-row lg:items-center">
        <SearchInput
          label="Search the review queue"
          value={search}
          onValueChange={setSearch}
          placeholder="Search by name, passport, agent or review reason…"
          className="flex-1"
        />
        <div
          className="flex flex-wrap gap-1 rounded-md border border-slate-300 p-1"
          role="group"
          aria-label="Filter by resolution status"
        >
          {(['pending', 'approved', 'rejected', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              aria-pressed={statusFilter === value}
              className={cn(
                'h-8 rounded px-3 text-xs font-semibold capitalize transition-colors',
                statusFilter === value
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {value}
              {value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingBlock label="Loading the review queue…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
          tone={statusFilter === 'pending' ? 'positive' : 'neutral'}
          title={statusFilter === 'pending' ? 'Nothing is waiting for review' : `No ${statusFilter} rows`}
          description="Rows arrive here when an import cannot accept them without a human decision — for example an invalid date, a missing name, or an ambiguous agent."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <ReviewRow
              key={row.id}
              row={row}
              subAgents={subAgents}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              onApprove={(approved) => approveRow(row, approved)}
              onReject={() => rejectRow(row)}
              busy={actionLoading === row.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewRow({
  row,
  subAgents,
  expanded,
  onToggle,
  onApprove,
  onReject,
  busy,
}: {
  row: ReviewQueueRow;
  subAgents: SubAgent[];
  expanded: boolean;
  onToggle: () => void;
  onApprove: (approved: Record<string, string>) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const statusBadge =
    row.status === 'pending' ? (
      <Badge tone="caution" icon={<AlertTriangle className="h-3 w-3" aria-hidden="true" />}>
        Pending review
      </Badge>
    ) : row.status === 'approved' ? (
      <Badge tone="positive" treatment="solid" icon={<CheckCircle2 className="h-3 w-3" aria-hidden="true" />}>
        Approved
      </Badge>
    ) : (
      <Badge tone="neutral" icon={<XCircle className="h-3 w-3" aria-hidden="true" />}>
        Rejected
      </Badge>
    );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-white',
        row.status === 'pending' ? 'border-amber-400' : 'border-slate-300',
      )}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">
              {row.full_name || <span className="italic text-red-700">(name missing)</span>}
            </p>
            <Identifier value={row.passport_number} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            {row.agent_name || 'No agent on the row'}
            {row.source_sheet && <span>· Source: {row.source_sheet}</span>}
            {row.source_row != null && <span>· Row {row.source_row}</span>}
          </p>
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
            {row.review_reason || 'No review reason was recorded for this row.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {statusBadge}
          {row.status === 'pending' && (
            <Button size="sm" variant="secondary" onClick={onToggle} aria-expanded={expanded}>
              {expanded ? 'Close' : 'Resolve'}
            </Button>
          )}
        </div>
      </div>

      {expanded && row.status === 'pending' && (
        <ResolutionEditor row={row} subAgents={subAgents} onApprove={onApprove} onReject={onReject} busy={busy} />
      )}
    </div>
  );
}

/**
 * Original-versus-approved comparison.
 *
 * Left: the original CSV values, read-only and quoted so their exact content is
 * unambiguous. Right: the values the officer approves.
 *
 * Rule — leave empty rather than guess: where the original cannot be used (an
 * unparseable date, a missing name) the approved field starts empty. The system
 * never invents a plausible value on the officer's behalf.
 */
function ResolutionEditor({
  row,
  subAgents,
  onApprove,
  onReject,
  busy,
}: {
  row: ReviewQueueRow;
  subAgents: SubAgent[];
  onApprove: (approved: Record<string, string>) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const originals: Record<ApprovedField, string | null> = {
    full_name: row.full_name,
    passport_number: row.passport_number,
    visa_number: row.visa_number,
    departure_date: row.original_departure_value ?? row.departure_date,
    expected_return_date: row.original_return_value ?? row.expected_return_date,
    contract_record_date: row.contract_record_date,
    visa_company: row.visa_company,
    arrival_port: row.arrival_port,
    makkah_hotel: row.makkah_hotel,
    madinah_hotel: row.madinah_hotel,
    transportation: row.transportation,
  };

  const [approved, setApproved] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const spec of FIELD_SPECS) {
      const original = originals[spec.key];
      if (!original) {
        initial[spec.key] = '';
        continue;
      }
      if (spec.isDate) {
        // Carried over only when it parses cleanly. Otherwise: empty, not guessed.
        initial[spec.key] = parseDate(original) ?? '';
      } else {
        initial[spec.key] = original;
      }
    }
    initial.sub_agent_id = '';
    return initial;
  });

  const set = (key: string, value: string) => setApproved((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
      <Panel
        title="Original CSV values"
        description="Exactly as they appeared in the source file. These are read-only."
        className="mb-5"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_SPECS.map((spec) => (
            <div key={spec.key} className="min-w-0">
              <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{spec.label}</dt>
              <dd className="mt-0.5 text-sm">
                {originals[spec.key] ? (
                  /* Quoted, and monospace where the value is an identifier or a raw date string */
                  <span
                    className={cn(
                      'break-all text-slate-800',
                      (spec.identifier || spec.isDate) && 'identifier text-[0.8125rem]',
                    )}
                  >
                    &ldquo;{originals[spec.key]}&rdquo;
                  </span>
                ) : (
                  <span className="text-slate-400">Not present in the file</span>
                )}
              </dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Agent match key</dt>
            <dd className="mt-0.5 text-sm">
              {row.agent_match_key ? (
                <span className="identifier break-all text-[0.8125rem] text-slate-800">
                  &ldquo;{row.agent_match_key}&rdquo;
                </span>
              ) : (
                <span className="text-slate-400">Not present in the file</span>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <div className="mb-4 flex items-center gap-2 text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-300" />
        <ArrowRight className="h-4 w-4" />
        <span className="h-px flex-1 bg-slate-300" />
      </div>

      <Panel
        title="Approved system values"
        description="What will be written to the pilgrim record. Where the original could not be used, the field is left empty — complete it yourself rather than guessing."
        edge="confirmed"
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_SPECS.map((spec) => {
            const original = originals[spec.key];
            const emptiedBecauseUnusable = Boolean(spec.isDate && original && !parseDate(original));
            return (
              <Field
                key={spec.key}
                label={spec.label}
                htmlFor={`approved-${row.id}-${spec.key}`}
                required={spec.required}
                hint={
                  emptiedBecauseUnusable
                    ? `The original value could not be read as a date. Enter the correct date (${spec.hint}).`
                    : spec.hint
                }
              >
                <Input
                  id={`approved-${row.id}-${spec.key}`}
                  value={approved[spec.key] ?? ''}
                  onChange={(e) => set(spec.key, e.target.value)}
                  identifier={spec.identifier}
                  invalid={spec.required && !(approved[spec.key] ?? '').trim()}
                  placeholder={spec.isDate ? 'YYYY-MM-DD' : ''}
                />
              </Field>
            );
          })}

          <Field
            label="Assigned sub-agent"
            htmlFor={`approved-${row.id}-agent`}
            hint="Leave unassigned rather than guessing which organisation is responsible."
          >
            <Select
              id={`approved-${row.id}-agent`}
              value={approved.sub_agent_id ?? ''}
              onChange={(e) => set('sub_agent_id', e.target.value)}
            >
              <option value="">Leave unassigned</option>
              {subAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.organisation_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant="confirm"
          onClick={() => onApprove(approved)}
          loading={busy}
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        >
          Approve &amp; import this pilgrim
        </Button>
        <Button
          variant="secondary"
          onClick={onReject}
          disabled={busy}
          icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
        >
          Reject this row
        </Button>
        <p className="text-xs text-slate-500 sm:ml-2">
          Approving creates an active pilgrim record with planned travel only.
        </p>
      </div>
    </div>
  );
}

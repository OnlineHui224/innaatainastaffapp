import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/priority';
import { friendlyError } from '@/lib/validation';
import type { AuditLog } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { SearchInput, Select } from '@/components/ui/Field';
import { Pagination, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';

/**
 * Actions that genuinely edit a stored record, where a Field / Previous / New
 * comparison is meaningful. Everything else is an event: something happened at a
 * point in time, and inventing a "previous value" for it would be a fabrication.
 */
const RECORD_EDIT_ACTIONS = new Set([
  'pilgrim_edited',
  'sub_agent_edited',
  'staff_role_changed',
  'expected_departure_changed',
  'transport_rate_overridden',
]);

/** Fields worth surfacing in a record-edit comparison, in a stable order. */
const COMPARABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'full_name', label: 'Full name' },
  { key: 'passport_number', label: 'Passport number' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'phone_number', label: 'Phone number' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'sub_agent_id', label: 'Assigned sub-agent' },
  { key: 'expected_departure_date', label: 'Scheduled outbound' },
  { key: 'expected_return_date', label: 'Expected return' },
  { key: 'operational_notes', label: 'Operational notes' },
  { key: 'organisation_name', label: 'Organisation name' },
  { key: 'contact_person', label: 'Contact person' },
  { key: 'country', label: 'Country' },
  { key: 'email', label: 'Email' },
  { key: 'active_status', label: 'Active status' },
  { key: 'notes', label: 'Notes' },
  { key: 'role', label: 'System role' },
  { key: 'rate', label: 'Reference rate' },
  { key: 'agreed_rate', label: 'Agreed rate' },
];

const ACTION_LABELS: Record<string, string> = {
  pilgrim_created: 'Pilgrim created',
  pilgrim_edited: 'Pilgrim record edited',
  arrival_recorded: 'Arrival recorded',
  arrival_confirmed: 'Arrival confirmed',
  arrival_correction: 'Arrival confirmation corrected',
  bulk_arrival_confirmed: 'Arrival confirmed (bulk)',
  departure_confirmed: 'Departure confirmed',
  departure_correction: 'Departure confirmation corrected',
  bulk_departure_confirmed: 'Departure confirmed (bulk)',
  pilgrim_note_added: 'Operational note added',
  expected_departure_changed: 'Expected departure changed',
  sub_agent_created: 'Sub-agent created',
  sub_agent_edited: 'Sub-agent edited',
  sub_agent_deleted: 'Sub-agent deleted',
  sub_agent_assignment_changed: 'Sub-agent assignment changed',
  staff_user_created: 'Staff account created',
  staff_role_changed: 'Staff system role changed',
  staff_account_deactivated: 'Staff account suspended',
  staff_account_activated: 'Staff account reactivated',
  sample_data_loaded: 'Sample data loaded',
  sample_data_reset: 'Sample data reset',
  record_deleted: 'Record deleted',
  csv_import_completed: 'CSV import completed',
  verified_pilgrim_import: 'Verified pilgrim import executed',
  review_queue_approved: 'Review queue row approved',
  review_queue_rejected: 'Review queue row rejected',
  visa_record_saved: 'Visa record saved',
  hotel_reference_imported: 'Hotel reference import completed',
  proposed_agent_entered: 'Proposed agent submitted',
  new_agent_created_from_ops_pro: 'Agent created from the visa logger',
  custom_hotel_entered: 'Custom hotel recorded',
  transport_route_selected: 'Transport route selected',
  transport_rate_applied: 'Transport reference rate applied',
  transport_rate_overridden: 'Transport rate overridden',
  custom_transport_route_entered: 'Custom transport route recorded',
};

const RECORD_TYPE_LABELS: Record<string, string> = {
  pilgrim: 'Pilgrim',
  sub_agent: 'Sub-Agent',
  staff_user: 'Staff account',
  proposed_agent: 'Proposed agent',
  hotel_reference: 'Hotel reference',
  hotel_references: 'Hotel reference',
  transport: 'Transport',
  system: 'System',
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface FieldChange {
  label: string;
  previous: string;
  next: string;
}

/** Extracts only the fields that genuinely changed between two record snapshots. */
function extractFieldChanges(entry: AuditLog): FieldChange[] {
  const previous = entry.previous_value;
  const next = entry.new_value;
  if (!previous || !next) return [];

  const changes: FieldChange[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const before = (previous as Record<string, unknown>)[field.key];
    const after = (next as Record<string, unknown>)[field.key];
    if (before === undefined && after === undefined) continue;
    if (formatValue(before) === formatValue(after)) continue;
    changes.push({ label: field.label, previous: formatValue(before), next: formatValue(after) });
  }
  return changes;
}

/** Context worth showing for an event-style action, without inventing before/after. */
function extractEventContext(entry: AuditLog): Array<{ label: string; value: string }> {
  const payload = entry.new_value;
  if (!payload || typeof payload !== 'object') return [];

  const interesting: Array<{ key: string; label: string }> = [
    { key: 'date', label: 'Event date' },
    { key: 'time', label: 'Event time' },
    { key: 'port', label: 'Port' },
    { key: 'flight', label: 'Flight' },
    { key: 'count', label: 'Records affected' },
    { key: 'file_name', label: 'File' },
    { key: 'total_rows', label: 'Total rows' },
    { key: 'created', label: 'Created' },
    { key: 'pilgrims_created', label: 'Pilgrims created' },
    { key: 'review_queued', label: 'Queued for review' },
    { key: 'duplicates', label: 'Duplicates skipped' },
    { key: 'duplicates_skipped', label: 'Duplicates skipped' },
    { key: 'agents_created', label: 'Agents created' },
    { key: 'agents_matched', label: 'Agents matched' },
    { key: 'added', label: 'Hotels added' },
    { key: 'updated', label: 'Hotels updated' },
    { key: 'visa_number', label: 'Visa number' },
    { key: 'review_reason', label: 'Review reason' },
    { key: 'city', label: 'City' },
    { key: 'status', label: 'Status' },
  ];

  const record = payload as Record<string, unknown>;
  return interesting
    .filter((item) => record[item.key] !== undefined && record[item.key] !== null && record[item.key] !== '')
    .map((item) => ({ label: item.label, value: formatValue(record[item.key]) }));
}

const PAGE_SIZE = 25;

export default function AuditHistoryPage() {
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (queryError) throw queryError;
      setEntries((data || []) as AuditLog[]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter]);

  const uniqueActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (actionFilter !== 'all' && e.action !== actionFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          e.record_label.toLowerCase().includes(q) ||
          e.performed_by_name.toLowerCase().includes(q) ||
          formatAction(e.action).toLowerCase().includes(q)
        );
      }),
    [entries, actionFilter, search],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Audit History"
        subtitle="An immutable record of platform activity. Record edits show what changed; everything else is presented as the event it was."
      />

      <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-slate-300 bg-white p-2.5 sm:flex-row sm:items-center">
        <SearchInput
          label="Search the audit history"
          value={search}
          onValueChange={setSearch}
          placeholder="Search by record, staff member or action…"
          className="flex-1"
        />
        <label className="sr-only" htmlFor="audit-action-filter">
          Filter by action
        </label>
        <Select
          id="audit-action-filter"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="sm:w-72"
        >
          <option value="all">All actions</option>
          {uniqueActions.map((action) => (
            <option key={action} value={action}>
              {formatAction(action)}
            </option>
          ))}
        </Select>
      </div>

      <p className="mb-4 text-xs text-slate-500">
        The audit log is append-only. Showing the {entries.length} most recent entries.
      </p>

      {loading ? (
        <LoadingBlock label="Loading the audit history…" />
      ) : error ? (
        <Alert tone="critical" title="The audit history could not be loaded">
          {error}
        </Alert>
      ) : paged.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" aria-hidden="true" />}
          title="No audit entries match this view"
          description="Adjust the search or action filter to see more of the history."
        />
      ) : (
        <>
          <TableFrame caption="Platform audit history">
            <THead>
              <tr>
                <TH nowrap>Action</TH>
                <TH nowrap>Target</TH>
                <TH nowrap>Performed by</TH>
                <TH numeric nowrap>Timestamp</TH>
                <TH align="right" nowrap>Detail</TH>
              </tr>
            </THead>
            <TBody>
              {paged.map((entry) => {
                const isRecordEdit = RECORD_EDIT_ACTIONS.has(entry.action);
                const changes = isRecordEdit ? extractFieldChanges(entry) : [];
                const context = isRecordEdit ? [] : extractEventContext(entry);
                const expandable = changes.length > 0 || context.length > 0;
                const expanded = expandedId === entry.id;

                return (
                  <Fragment key={entry.id}>
                    <TR>
                      <TD>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{formatAction(entry.action)}</span>
                          {isRecordEdit ? (
                            <Badge tone="info">Record edit</Badge>
                          ) : (
                            <Badge tone="neutral">Event</Badge>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <span className="block max-w-xs truncate">{entry.record_label || '—'}</span>
                        <span className="text-2xs uppercase tracking-wide text-slate-500">
                          {RECORD_TYPE_LABELS[entry.record_type] || entry.record_type}
                        </span>
                      </TD>
                      <TD>{entry.performed_by_name || 'System'}</TD>
                      <TD numeric className="whitespace-nowrap text-xs">
                        {formatDateTime(entry.created_at)}
                      </TD>
                      <TD align="right">
                        {expandable ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : entry.id)}
                            aria-expanded={expanded}
                            className="text-xs font-semibold text-brand-700 hover:underline"
                          >
                            {expanded ? 'Hide' : isRecordEdit ? 'What changed' : 'Context'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TD>
                    </TR>

                    {expanded && (
                      <tr className="bg-slate-50">
                        <TD colSpan={5} className="px-3 py-4">
                          {/* Field / Previous / New only where a record was genuinely edited */}
                          {isRecordEdit && changes.length > 0 && (
                            <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
                              <table className="w-full text-sm">
                                <caption className="sr-only">
                                  Fields changed by this edit
                                </caption>
                                <thead className="border-b border-slate-300 bg-slate-100">
                                  <tr>
                                    <TH nowrap>Field</TH>
                                    <TH nowrap>Previous</TH>
                                    <TH nowrap>New</TH>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {changes.map((change) => (
                                    <tr key={change.label}>
                                      <TD className="font-medium text-slate-800">{change.label}</TD>
                                      <TD className="text-slate-600 line-through decoration-slate-400">
                                        {change.previous}
                                      </TD>
                                      <TD className="font-medium text-slate-900">{change.next}</TD>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {isRecordEdit && changes.length === 0 && (
                            <p className="text-sm text-slate-600">
                              No field-level difference was recorded for this edit.
                            </p>
                          )}

                          {/* Event-style presentation — no fabricated before/after */}
                          {!isRecordEdit && context.length > 0 && (
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                              {context.map((item) => (
                                <div key={item.label} className="min-w-0">
                                  <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                                    {item.label}
                                  </dt>
                                  <dd className="mt-0.5 break-words text-sm text-slate-900">{item.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </TD>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </TableFrame>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="entries"
          />
        </>
      )}
    </div>
  );
}

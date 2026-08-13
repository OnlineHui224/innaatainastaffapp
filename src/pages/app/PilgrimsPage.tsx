import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ClipboardList,
  Eye,
  Filter,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  SlidersHorizontal,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePilgrims, type PilgrimWithAgent } from '@/hooks/usePilgrims';
import { STATUS_META, calculateJourneyStatus, type JourneyStatus } from '@/lib/status';
import { formatDate, priorityReason } from '@/lib/priority';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ReadOnlyNotice, TableSkeleton } from '@/components/ui/Feedback';
import { Identifier, SearchInput, Select } from '@/components/ui/Field';
import { Pagination, RecordCard, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';
import { BulkConfirmDialog, type BulkTarget } from '@/components/pilgrims/BulkConfirmDialog';
import type { MovementFormValues, MovementKind } from '@/components/pilgrims/MovementConfirmation';
import { cn } from '@/lib/utils';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...(Object.keys(STATUS_META) as JourneyStatus[]).map((status) => ({
    value: status,
    label: STATUS_META[status].label,
  })),
];

/** Designed for hundreds today and thousands later. */
const PAGE_SIZE = 25;

export default function PilgrimsPage() {
  const { profile, canEditPilgrims } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState<MovementKind | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* Filters live in the URL so dashboard and sub-agent tiles can link straight
     into a filtered view, and staff can share or bookmark one. */
  const statusFilter = searchParams.get('status') ?? 'all';
  const subAgentFilter = searchParams.get('subAgent') ?? 'all';
  const nationalityFilter = searchParams.get('nationality') ?? 'all';

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearch('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const { pilgrims, allPilgrims, loading, error, total, refetch } = usePilgrims({
    search: debouncedSearch,
    statusFilter,
    subAgentFilter,
    nationalityFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    supabase
      .from('sub_agents')
      .select('*')
      .order('organisation_name')
      .then(({ data }) => {
        if (data) setSubAgents(data as SubAgent[]);
      });
  }, []);

  useEffect(() => {
    supabase
      .from('pilgrims')
      .select('nationality')
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(
            new Set((data as { nationality: string }[]).map((d) => d.nationality).filter(Boolean)),
          ).sort();
          setNationalities(unique);
        }
      });
  }, [allPilgrims.length]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, subAgentFilter, nationalityFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (subAgentFilter !== 'all' ? 1 : 0) +
    (nationalityFilter !== 'all' ? 1 : 0);
  const hasFilters = activeFilterCount > 0 || Boolean(search);

  const sortedPilgrims = useMemo(
    () =>
      [...pilgrims].sort((a, b) => {
        const pa = STATUS_META[calculateJourneyStatus(a)].priority;
        const pb = STATUS_META[calculateJourneyStatus(b)].priority;
        if (pa !== pb) return pa - pb;
        return a.full_name.localeCompare(b.full_name);
      }),
    [pilgrims],
  );

  const selectableIds = useMemo(() => sortedPilgrims.map((p) => p.id), [sortedPilgrims]);
  const allOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const bulkTargets: BulkTarget[] = useMemo(
    () =>
      allPilgrims
        .filter((p) => selectedIds.has(p.id))
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          passport_number: p.passport_number,
          agentName: p.sub_agents?.organisation_name ?? null,
        })),
    [allPilgrims, selectedIds],
  );

  function toggleSelectAll() {
    const next = new Set(selectedIds);
    if (allOnPageSelected) selectableIds.forEach((id) => next.delete(id));
    else selectableIds.forEach((id) => next.add(id));
    setSelectedIds(next);
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  /**
   * Bulk confirmation. The written columns and audit behaviour are unchanged from
   * the existing implementation — only the surrounding safeguards were redesigned.
   */
  async function handleBulkConfirm(values: MovementFormValues) {
    if (!bulkKind || selectedIds.size === 0) return;
    if (!values.date || !values.time) {
      setBulkError('Both date and time are required.');
      return;
    }
    setBulkLoading(true);
    setBulkError(null);

    const eventTimestamp = `${values.date}T${values.time}:00`;
    const updates: Record<string, unknown> =
      bulkKind === 'arrival'
        ? {
            actual_arrival_at: values.date,
            arrival_date: values.date,
            arrival_confirmed_at: eventTimestamp,
            arrival_confirmed_by: profile?.id ?? null,
            arrival_port_actual: values.port || null,
            arrival_flight_number: values.flight || null,
            status_source: 'MANUAL_CONFIRMATION',
          }
        : {
            actual_departure_date: values.date,
            departure_confirmed_at: eventTimestamp,
            departure_confirmed_by: profile?.id ?? null,
            departure_airport: values.port || null,
            departure_flight_number: values.flight || null,
            status_source: 'MANUAL_CONFIRMATION',
          };

    const ids = Array.from(selectedIds);
    const { error: updateError } = await supabase
      .from('pilgrims')
      .update({ ...updates, updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateError) {
      setBulkError(friendlyError(updateError));
      setBulkLoading(false);
      return;
    }

    const action = bulkKind === 'arrival' ? 'bulk_arrival_confirmed' : 'bulk_departure_confirmed';
    const label = bulkKind === 'arrival' ? 'Bulk arrival confirmed' : 'Bulk departure confirmed';
    for (const id of ids) {
      const target = bulkTargets.find((t) => t.id === id);
      await logAudit({
        action,
        recordType: 'pilgrim',
        recordId: id,
        recordLabel: `${label}: ${target?.full_name ?? id}`,
        newValue: {
          date: values.date,
          time: values.time,
          flight: values.flight,
          port: values.port,
          count: ids.length,
        },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
    }

    setBulkLoading(false);
    setBulkResult(
      `${ids.length} ${ids.length === 1 ? 'pilgrim' : 'pilgrims'} confirmed as ${
        bulkKind === 'arrival' ? 'arrived' : 'departed'
      } on ${formatDate(values.date)} at ${values.time}.`,
    );
    setBulkKind(null);
    setSelectedIds(new Set());
    refetch();
  }

  const filterControls = (
    <>
      <label className="sr-only" htmlFor="filter-status">
        Filter by journey status
      </label>
      <Select
        id="filter-status"
        value={statusFilter}
        onChange={(e) => setFilter('status', e.target.value)}
        className="w-full sm:w-auto"
      >
        {STATUS_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <label className="sr-only" htmlFor="filter-sub-agent">
        Filter by sub-agent
      </label>
      <Select
        id="filter-sub-agent"
        value={subAgentFilter}
        onChange={(e) => setFilter('subAgent', e.target.value)}
        className="w-full sm:w-auto"
      >
        <option value="all">All sub-agents</option>
        <option value="unassigned">Unassigned</option>
        {subAgents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.organisation_name}
          </option>
        ))}
      </Select>

      <label className="sr-only" htmlFor="filter-nationality">
        Filter by nationality
      </label>
      <Select
        id="filter-nationality"
        value={nationalityFilter}
        onChange={(e) => setFilter('nationality', e.target.value)}
        className="w-full sm:w-auto"
      >
        <option value="all">All nationalities</option>
        {nationalities.map((nationality) => (
          <option key={nationality} value={nationality}>
            {nationality}
          </option>
        ))}
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          onClick={clearFilters}
          icon={<X className="h-4 w-4" aria-hidden="true" />}
          className="w-full sm:w-auto"
        >
          Clear
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Pilgrims"
        subtitle={
          <>
            {total.toLocaleString()} {total === 1 ? 'record' : 'records'} match the current view.
            {!canEditPilgrims && ' Your role has read access to this directory.'}
          </>
        }
        actions={
          canEditPilgrims ? (
            <>
              <ButtonLink
                to="/app/pilgrims/review-queue"
                variant="secondary"
                icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
              >
                Review Queue
              </ButtonLink>
              <ButtonLink
                to="/app/pilgrims/import-csv"
                variant="secondary"
                icon={<Upload className="h-4 w-4" aria-hidden="true" />}
              >
                Import CSV
              </ButtonLink>
              <ButtonLink to="/app/pilgrims/new" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                Add Pilgrim
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      {!canEditPilgrims && (
        <ReadOnlyNotice className="mb-5">
          You have Viewer access. Pilgrim records are read-only for your role — you can search, filter and open
          any record, but creating, editing, importing and confirming movement are not available. Contact an
          Administrator if you need operational access.
        </ReadOnlyNotice>
      )}

      {bulkResult && (
        <Alert tone="success" className="mb-4" onDismiss={() => setBulkResult(null)}>
          {bulkResult}
        </Alert>
      )}

      {/* Filters — a bar on desktop, a disclosure sheet on small screens */}
      <div className="mb-5 rounded-lg border border-slate-300 bg-white">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <SearchInput
            label="Search pilgrims"
            value={search}
            onValueChange={setSearch}
            placeholder="Search by name, passport, nationality or phone…"
            className="flex-1"
          />
          <div className="hidden flex-wrap items-center gap-2 lg:flex">{filterControls}</div>
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="pilgrim-filter-sheet"
            icon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>
        {filtersOpen && (
          <div
            id="pilgrim-filter-sheet"
            className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-3 lg:hidden"
          >
            {filterControls}
          </div>
        )}
      </div>

      {/* Bulk action bar — only for roles that may write */}
      {canEditPilgrims && selectedIds.size > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-brand-400 bg-brand-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-brand-900">
            <span className="tabular-nums">{selectedIds.size}</span>{' '}
            {selectedIds.size === 1 ? 'pilgrim' : 'pilgrims'} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="confirm"
              onClick={() => {
                setBulkError(null);
                setBulkKind('arrival');
              }}
              icon={<PlaneLanding className="h-4 w-4" aria-hidden="true" />}
            >
              Confirm arrival
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setBulkError(null);
                setBulkKind('departure');
              }}
              icon={<PlaneTakeoff className="h-4 w-4" aria-hidden="true" />}
            >
              Confirm departure
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedIds(new Set())}
              icon={<X className="h-4 w-4" aria-hidden="true" />}
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : error ? (
        <Alert tone="critical" title="The pilgrim directory could not be loaded">
          {error}
        </Alert>
      ) : sortedPilgrims.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<Filter className="h-5 w-5" aria-hidden="true" />}
            title="No pilgrims match these filters"
            description="Adjust or clear the filters to widen the search."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            title="No pilgrim records yet"
            description={
              canEditPilgrims
                ? 'Add a pilgrim manually, or import a CSV batch to populate the directory.'
                : 'No pilgrim records have been registered on the platform yet.'
            }
            action={
              canEditPilgrims ? (
                <>
                  <ButtonLink to="/app/pilgrims/new" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                    Add Pilgrim
                  </ButtonLink>
                  <ButtonLink to="/app/pilgrims/import-csv" variant="secondary">
                    Import CSV
                  </ButtonLink>
                </>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          {/* Desktop / laptop table */}
          <div className="hidden md:block">
            <TableFrame caption="Pilgrim directory">
              <THead>
                <tr>
                  {canEditPilgrims && (
                    <TH className="w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        aria-label={
                          allOnPageSelected ? 'Deselect all rows on this page' : 'Select all rows on this page'
                        }
                        className="h-4 w-4 rounded border-slate-400"
                      />
                    </TH>
                  )}
                  <TH>Name</TH>
                  <TH className="hidden xl:table-cell">Nationality</TH>
                  <TH className="hidden lg:table-cell">Passport</TH>
                  <TH numeric>Sched. out</TH>
                  <TH numeric>Sched. return</TH>
                  <TH>Status</TH>
                  <TH className="hidden xl:table-cell">Sub-agent</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {sortedPilgrims.map((p) => {
                  const status = calculateJourneyStatus(p);
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <TR key={p.id} selected={isSelected}>
                      {canEditPilgrims && (
                        <TD>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(p.id)}
                            aria-label={`Select ${p.full_name}`}
                            className="h-4 w-4 rounded border-slate-400"
                          />
                        </TD>
                      )}
                      <TD>
                        <Link
                          to={`/app/pilgrims/${p.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {p.full_name}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-500 xl:hidden">{p.nationality}</span>
                      </TD>
                      <TD className="hidden xl:table-cell">{p.nationality}</TD>
                      <TD className="hidden lg:table-cell">
                        <Identifier value={p.passport_number} />
                      </TD>
                      <TD numeric className="whitespace-nowrap">
                        {formatDate(p.expected_departure_date, 'Not set')}
                      </TD>
                      <TD numeric className="whitespace-nowrap">
                        {formatDate(p.expected_return_date, 'Not set')}
                      </TD>
                      <TD>
                        <StatusBadge status={status} record={p} />
                      </TD>
                      <TD className="hidden xl:table-cell">
                        {p.sub_agents ? (
                          <Link
                            to={`/app/sub-agents/${p.sub_agents.id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {p.sub_agents.organisation_name}
                          </Link>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/app/pilgrims/${p.id}`}
                            aria-label={`View ${p.full_name}`}
                            title="View record"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Link>
                          {canEditPilgrims && (
                            <Link
                              to={`/app/pilgrims/${p.id}/edit`}
                              aria-label={`Edit ${p.full_name}`}
                              title="Edit record"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableFrame>
          </div>

          {/* Mobile record cards */}
          <div className="space-y-3 md:hidden">
            {sortedPilgrims.map((p) => {
              const status = calculateJourneyStatus(p);
              const reason = priorityReason(p, status);
              const isSelected = selectedIds.has(p.id);
              return (
                <RecordCard
                  key={p.id}
                  className={cn(isSelected && 'border-brand-500 bg-brand-50/40')}
                  accent={
                    status === 'departure_overdue'
                      ? 'critical'
                      : status === 'departing_soon'
                        ? 'caution'
                        : 'none'
                  }
                >
                  <div className="flex items-start gap-3">
                    {canEditPilgrims && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Select ${p.full_name}`}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/app/pilgrims/${p.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {p.full_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {p.nationality} · <Identifier value={p.passport_number} />
                      </p>
                      <div className="mt-2">
                        <StatusBadge status={status} record={p} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2.5 text-xs">
                        <div>
                          <dt className="text-2xs uppercase tracking-wide text-slate-500">Sched. out</dt>
                          <dd className="text-slate-800">
                            {formatDate(p.expected_departure_date, 'Not set')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-2xs uppercase tracking-wide text-slate-500">Sched. return</dt>
                          <dd className="text-slate-800">{formatDate(p.expected_return_date, 'Not set')}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{reason.text}</p>
                      <p className="mt-1.5 text-xs text-slate-500">
                        {p.sub_agents?.organisation_name ?? 'Unassigned'}
                      </p>
                    </div>
                  </div>
                </RecordCard>
              );
            })}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="pilgrims"
          />
        </>
      )}

      {canEditPilgrims && bulkKind && (
        <BulkConfirmDialog
          open
          kind={bulkKind}
          targets={bulkTargets}
          officerName={profile?.full_name ?? ''}
          loading={bulkLoading}
          error={bulkError}
          onCancel={() => {
            setBulkKind(null);
            setBulkError(null);
          }}
          onConfirm={handleBulkConfirm}
        />
      )}
    </div>
  );
}

export type { PilgrimWithAgent };

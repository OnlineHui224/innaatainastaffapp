import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Filter,
  X,
  Upload,
  ClipboardList,
  PlaneLanding,
  PlaneTakeoff,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePilgrims, type PilgrimWithAgent } from '@/hooks/usePilgrims';
import { calculateJourneyStatus, STATUS_META, todayStr } from '@/lib/status';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const STATUS_FILTERS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'travel_scheduled', label: 'Travel Scheduled' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'in_saudi_arabia', label: 'In Saudi Arabia' },
  { value: 'departing_soon', label: 'Departing Soon' },
  { value: 'departure_overdue', label: 'Departure Overdue' },
  { value: 'departure_confirmed', label: 'Departure Confirmed' },
];

const PAGE_SIZE = 12;

export default function PilgrimsPage() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subAgentFilter, setSubAgentFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<'arrival' | 'departure' | null>(null);
  const [bulkDate, setBulkDate] = useState(todayStr());
  const [bulkTime, setBulkTime] = useState('');
  const [bulkFlight, setBulkFlight] = useState('');
  const [bulkPort, setBulkPort] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const { pilgrims, allPilgrims, loading, error, total } = usePilgrims({
    search: debouncedSearch,
    statusFilter,
    subAgentFilter,
    nationalityFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    supabase.from('sub_agents').select('*').order('organisation_name').then(({ data }) => {
      if (data) setSubAgents(data as SubAgent[]);
    });
  }, []);

  useEffect(() => {
    supabase.from('pilgrims').select('nationality').then(({ data }) => {
      if (data) {
        const unique = Array.from(new Set((data as { nationality: string }[]).map((d) => d.nationality))).sort();
        setNationalities(unique);
      }
    });
  }, [allPilgrims.length]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, subAgentFilter, nationalityFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = search || statusFilter !== 'all' || subAgentFilter !== 'all' || nationalityFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setSubAgentFilter('all');
    setNationalityFilter('all');
  }

  const sortedPilgrims = useMemo(() => {
    return [...pilgrims].sort((a, b) => {
      const sa = STATUS_META[calculateJourneyStatus(a)].priority;
      const sb = STATUS_META[calculateJourneyStatus(b)].priority;
      if (sa !== sb) return sa - sb;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [pilgrims]);

  const allOnPageSelected = sortedPilgrims.length > 0 && sortedPilgrims.every((p) => selectedIds.has(p.id));

  function toggleSelectAll() {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      sortedPilgrims.forEach((p) => next.delete(p.id));
    } else {
      sortedPilgrims.forEach((p) => next.add(p.id));
    }
    setSelectedIds(next);
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }



  async function handleBulkConfirm() {
    if (!bulkModal || selectedIds.size === 0) return;
    if (!bulkDate || !bulkTime) {
      setBulkError('Both date and time are required.');
      return;
    }
    setBulkLoading(true);
    setBulkError(null);
    const eventTimestamp = `${bulkDate}T${bulkTime}:00`;
    const updates: Record<string, unknown> =
      bulkModal === 'arrival'
        ? {
            actual_arrival_at: bulkDate,
            arrival_date: bulkDate,
            arrival_confirmed_at: eventTimestamp,
            arrival_confirmed_by: profile?.id ?? null,
            arrival_port_actual: bulkPort || null,
            arrival_flight_number: bulkFlight || null,
            status_source: 'MANUAL_CONFIRMATION',
          }
        : {
            actual_departure_date: bulkDate,
            departure_confirmed_at: eventTimestamp,
            departure_confirmed_by: profile?.id ?? null,
            departure_airport: bulkPort || null,
            departure_flight_number: bulkFlight || null,
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

    const action = bulkModal === 'arrival' ? 'bulk_arrival_confirmed' : 'bulk_departure_confirmed';
    const label = bulkModal === 'arrival' ? 'Bulk arrival confirmed' : 'Bulk departure confirmed';
    for (const id of ids) {
      const p = sortedPilgrims.find((sp) => sp.id === id);
      await logAudit({
        action,
        recordType: 'pilgrim',
        recordId: id,
        recordLabel: `${label}: ${p?.full_name ?? id}`,
        newValue: { date: bulkDate, time: bulkTime, flight: bulkFlight, port: bulkPort, count: ids.length },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
    }

    setBulkLoading(false);
    setBulkModal(null);
    setSelectedIds(new Set());
    setBulkDate(todayStr());
    setBulkTime('');
    setBulkFlight('');
    setBulkPort('');
  }

  return (
    <div>
      <PageHeader
        title="Pilgrims"
        subtitle={`${total} record${total !== 1 ? 's' : ''}`}
        icon={<Users className="h-6 w-6" />}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/app/pilgrims/review-queue"
              className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-all"
            >
              <ClipboardList className="h-4 w-4" /> Review Queue
            </Link>
            <Link
              to="/app/pilgrims/import-csv"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Upload className="h-4 w-4" /> Import CSV
            </Link>
            <Link
              to="/app/pilgrims/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Add Pilgrim
            </Link>
          </div>
        }
      />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <p className="text-sm font-semibold text-brand-800">
            {selectedIds.size} pilgrim{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBulkModal('arrival'); setBulkError(null); }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-all"
            >
              <PlaneLanding className="h-4 w-4" /> Bulk Confirm Arrival
            </button>
            <button
              onClick={() => { setBulkModal('departure'); setBulkError(null); }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-all"
            >
              <PlaneTakeoff className="h-4 w-4" /> Bulk Confirm Departure
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, passport, nationality, or phone..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={subAgentFilter}
              onChange={(e) => setSubAgentFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              <option value="all">All Sub-Agents</option>
              <option value="unassigned">Unassigned</option>
              {subAgents.map((sa) => (
                <option key={sa.id} value={sa.id}>{sa.organisation_name}</option>
              ))}
            </select>
            <select
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              <option value="all">All Nationalities</option>
              {nationalities.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">Loading pilgrims...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error}
        </div>
      ) : sortedPilgrims.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          {hasFilters ? (
            <>
              <Filter className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm text-slate-500">No pilgrims match your filters.</p>
              <button onClick={clearFilters} className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">
                Clear filters
              </button>
            </>
          ) : (
            <>
              <Users className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm text-slate-500">No pilgrims yet.</p>
              <Link to="/app/pilgrims/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-all">
                <Plus className="h-4 w-4" /> Add Pilgrim
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-brand-500 focus:ring-brand-200"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Nationality</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden md:table-cell">Passport</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden lg:table-cell">Scheduled</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 hidden sm:table-cell">Sub-Agent</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPilgrims.map((p) => {
                    const status = calculateJourneyStatus(p);
                    const meta = STATUS_META[status];
                    return (
                      <tr key={p.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors ${selectedIds.has(p.id) ? 'bg-brand-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded border-slate-300 text-brand-500 focus:ring-brand-200"
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{p.full_name}</td>
                        <td className="px-4 py-3 text-slate-600">{p.nationality}</td>
                        <td className="px-4 py-3 text-slate-600 hidden md:table-cell font-mono text-xs">{p.passport_number}</td>
                        <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{p.expected_departure_date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.bgColor} ${meta.color} border ${meta.borderColor}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                          {p.sub_agents?.organisation_name || <span className="text-slate-400">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/app/pilgrims/${p.id}`} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all" title="View">
                              <Eye className="h-4 w-4" />
                            </Link>
                            <Link to={`/app/pilgrims/${p.id}/edit`} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {page} of {totalPages} ({total} total)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk confirmation modal */}
      {bulkModal && (
        <ConfirmDialog
          open={bulkModal !== null}
          title={bulkModal === 'arrival' ? 'Bulk Confirm Arrival' : 'Bulk Confirm Departure'}
          confirmLabel={bulkModal === 'arrival' ? 'Confirm Arrivals' : 'Confirm Departures'}
          onConfirm={handleBulkConfirm}
          onCancel={() => { setBulkModal(null); setBulkError(null); }}
          loading={bulkLoading}
        >
          {bulkError && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {bulkError}
            </div>
          )}
          <p className="text-sm text-slate-600">
            You are about to confirm {bulkModal === 'arrival' ? 'arrival' : 'departure'} for{' '}
            <span className="font-bold">{selectedIds.size}</span> pilgrims. All will share the same date, time, and flight details.
          </p>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  {bulkModal === 'arrival' ? 'Arrival' : 'Departure'} Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  {bulkModal === 'arrival' ? 'Arrival' : 'Departure'} Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={bulkTime}
                  onChange={(e) => setBulkTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  {bulkModal === 'arrival' ? 'Arrival Port' : 'Departure Airport'} <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={bulkPort}
                  onChange={(e) => setBulkPort(e.target.value)}
                  placeholder="e.g. Jeddah"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Flight Number <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={bulkFlight}
                  onChange={(e) => setBulkFlight(e.target.value)}
                  placeholder="e.g. SV600"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                />
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Confirming as: <span className="font-semibold text-slate-700">{profile?.full_name || 'Staff Member'}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Each pilgrim will receive an individual audit log entry.
              </p>
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

export type { PilgrimWithAgent };

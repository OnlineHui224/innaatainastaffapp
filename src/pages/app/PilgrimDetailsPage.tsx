import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Plane,
  PlaneLanding,
  CalendarClock,
  User,
  Flag,
  Phone,
  Calendar,
  Building2,
  StickyNote,
  Loader2,
  AlertCircle,
  Undo2,
  ScrollText,
  Clock,
  PlaneTakeoff,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { calculateJourneyStatus, STATUS_META, dateToStr, todayStr } from '@/lib/status';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Pilgrim, SubAgent, AuditLog } from '@/types';
import { PageHeader } from '@/components/PageHeader';

interface PilgrimRow extends Pilgrim {
  sub_agents: SubAgent | null;
}

type ConfirmModalType =
  | { kind: 'arrival' }
  | { kind: 'departure' }
  | { kind: 'correct_departure' }
  | { kind: 'correct_arrival' }
  | null;

export default function PilgrimDetailsPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [pilgrim, setPilgrim] = useState<PilgrimRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [modal, setModal] = useState<ConfirmModalType>(null);
  const [noteText, setNoteText] = useState('');

  // Confirmation form state
  const [eventDate, setEventDate] = useState(todayStr());
  const [eventTime, setEventTime] = useState('');
  const [portValue, setPortValue] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');

  const fetchPilgrim = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('pilgrims')
      .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      setError('Pilgrim not found.');
    } else {
      setPilgrim(data as unknown as PilgrimRow);
    }
    setLoading(false);
  }, [id]);

  const fetchAudit = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('record_type', 'pilgrim')
      .eq('record_id', id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setAuditLog(data as AuditLog[]);
  }, [id]);

  useEffect(() => {
    fetchPilgrim();
    fetchAudit();
  }, [fetchPilgrim, fetchAudit]);

  function resetForm() {
    setEventDate(todayStr());
    setEventTime('');
    setPortValue('');
    setFlightNumber('');
    setConfirmNotes('');
  }

  function openModal(kind: NonNullable<ConfirmModalType>['kind']) {
    resetForm();
    if (kind === 'arrival') setPortValue(pilgrim?.arrival_port || '');
    setModal({ kind });
  }

  async function updatePilgrim(updates: Partial<Pilgrim>, action: string, prev: Pilgrim) {
    if (!id || !pilgrim) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const { data, error } = await supabase
        .from('pilgrims')
        .update({
          ...updates,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)')
        .maybeSingle();

      if (error) throw error;
      setPilgrim(data as unknown as PilgrimRow);
      await logAudit({
        action,
        recordType: 'pilgrim',
        recordId: id,
        recordLabel: pilgrim.full_name,
        previousValue: prev as unknown as Record<string, unknown>,
        newValue: (data as Record<string, unknown> | null) ?? null,
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
      await fetchAudit();
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setActionLoading(false);
      setModal(null);
    }
  }

  function handleConfirmAction() {
    if (!modal || !pilgrim) return;
    const prev = pilgrim;

    if (modal.kind === 'arrival') {
      if (!eventDate) {
        setActionError('Arrival date is required.');
        return;
      }
      if (!eventTime) {
        setActionError('Arrival time is required.');
        return;
      }
      const arrivalTimestamp = `${eventDate}T${eventTime}:00`;
      updatePilgrim(
        {
          actual_arrival_at: eventDate,
          arrival_date: eventDate,
          arrival_confirmed_at: arrivalTimestamp,
          arrival_confirmed_by: profile?.id ?? null,
          arrival_port_actual: portValue || null,
          arrival_flight_number: flightNumber || null,
          arrival_notes: confirmNotes || null,
          status_source: 'MANUAL_CONFIRMATION',
        },
        'arrival_confirmed',
        prev
      );
    } else if (modal.kind === 'departure') {
      if (!eventDate) {
        setActionError('Departure date is required.');
        return;
      }
      if (!eventTime) {
        setActionError('Departure time is required.');
        return;
      }
      const departureTimestamp = `${eventDate}T${eventTime}:00`;
      updatePilgrim(
        {
          actual_departure_date: eventDate,
          departure_confirmed_at: departureTimestamp,
          departure_confirmed_by: profile?.id ?? null,
          departure_airport: portValue || null,
          departure_flight_number: flightNumber || null,
          departure_notes: confirmNotes || null,
          status_source: 'MANUAL_CONFIRMATION',
        },
        'departure_confirmed',
        prev
      );
    } else if (modal.kind === 'correct_departure') {
      updatePilgrim(
        {
          actual_departure_date: null,
          departure_confirmed_at: null,
          departure_confirmed_by: null,
          departure_airport: null,
          departure_flight_number: null,
          departure_notes: null,
          status_source: 'MANUAL_CONFIRMATION',
        },
        'departure_correction',
        prev
      );
    } else if (modal.kind === 'correct_arrival') {
      updatePilgrim(
        {
          actual_arrival_at: null,
          arrival_date: null,
          arrival_confirmed_at: null,
          arrival_confirmed_by: null,
          arrival_port_actual: null,
          arrival_flight_number: null,
          arrival_notes: null,
          status_source: 'MANUAL_CONFIRMATION',
        },
        'arrival_correction',
        prev
      );
    }
  }

  async function handleAddNote() {
    if (!pilgrim || !noteText.trim()) return;
    const newNotes = pilgrim.operational_notes
      ? `${pilgrim.operational_notes}\n\n[${dateToStr(new Date())}] ${noteText.trim()}`
      : `[${dateToStr(new Date())}] ${noteText.trim()}`;
    await updatePilgrim({ operational_notes: newNotes }, 'pilgrim_note_added', pilgrim);
    setNoteText('');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !pilgrim) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
        <p className="mt-3 text-sm text-red-700">{error || 'Pilgrim not found.'}</p>
        <Link to="/app/pilgrims" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to pilgrims
        </Link>
      </div>
    );
  }

  const status = calculateJourneyStatus(pilgrim);
  const meta = STATUS_META[status];
  const hasArrival = !!(pilgrim.actual_arrival_at ?? pilgrim.arrival_date);
  const hasDeparture = !!(pilgrim.actual_departure_date && pilgrim.departure_confirmed_at && pilgrim.departure_confirmed_by);

  return (
    <div>
      <Link to="/app/pilgrims" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to pilgrims
      </Link>

      <PageHeader
        title={pilgrim.full_name}
        subtitle={`${pilgrim.nationality} • ${pilgrim.passport_number}`}
        icon={<User className="h-6 w-6" />}
        actions={
          <Link to={`/app/pilgrims/${id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-all">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        }
      />

      {actionError && (
        <div className="mb-5 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: status + details + actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status banner */}
          <div className={`rounded-2xl border-2 p-6 ${meta.borderColor} ${meta.bgColor}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Journey Status</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${meta.dotColor}`} />
                  <span className={`font-display text-2xl font-extrabold ${meta.color}`}>{meta.label}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {hasArrival && hasDeparture
                    ? 'Manually confirmed by staff.'
                    : hasArrival
                    ? 'Arrival confirmed. Departure pending manual confirmation.'
                    : 'Based on planned dates only. No manual confirmation yet.'}
                </p>
              </div>
              {actionLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            </div>
            {pilgrim.status_source === 'CSV_IMPORT' && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Source: CSV Import (unverified)
              </div>
            )}
            {pilgrim.status_source === 'MANUAL_CONFIRMATION' && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Source: Manual Staff Confirmation
              </div>
            )}
          </div>

          {/* Details */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-4">Pilgrim Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailRow icon={User} label="Full Name" value={pilgrim.full_name} />
              <DetailRow icon={Flag} label="Nationality" value={pilgrim.nationality} />
              <DetailRow icon={Phone} label="Phone" value={pilgrim.phone_number || '—'} />
              <DetailRow icon={Calendar} label="Date of Birth" value={pilgrim.date_of_birth || '—'} />
              <DetailRow icon={Building2} label="Sub-Agent" value={pilgrim.sub_agents?.organisation_name || 'Unassigned'} />
              {pilgrim.visa_number && (
                <DetailRow icon={Plane} label="Visa Number" value={pilgrim.visa_number} />
              )}
              {pilgrim.visa_company && (
                <DetailRow icon={Building2} label="Visa Company" value={pilgrim.visa_company} />
              )}
            </div>
          </div>

          {/* Planned Travel Dates */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-1">Planned Travel Dates</h3>
            <p className="text-xs text-slate-500 mb-4">From CSV or manual entry. These are schedules, not confirmations.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailRow icon={CalendarClock} label="Scheduled Outbound" value={pilgrim.expected_departure_date || 'Not set'} />
              <DetailRow icon={Calendar} label="Expected Return" value={pilgrim.expected_return_date || 'Not set'} />
            </div>
          </div>

          {/* Actual Confirmations */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-1">Actual Arrival &amp; Departure</h3>
            <p className="text-xs text-slate-500 mb-4">Confirmed by authorized staff only. CSV import cannot set these.</p>

            {/* Arrival block */}
            <div className={`rounded-xl border p-4 mb-3 ${hasArrival ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PlaneLanding className={`h-5 w-5 ${hasArrival ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="font-semibold text-sm text-slate-800">Arrival</span>
                </div>
                {hasArrival ? (
                  <span className="text-xs font-medium text-emerald-700">Confirmed</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Not confirmed</span>
                )}
              </div>
              {hasArrival ? (
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="text-slate-400">Date:</span> {pilgrim.actual_arrival_at ?? pilgrim.arrival_date}</p>
                  {pilgrim.arrival_confirmed_at && (
                    <p className="text-xs text-slate-400">
                      Confirmed at: {new Date(pilgrim.arrival_confirmed_at).toLocaleString()}
                    </p>
                  )}
                  {pilgrim.arrival_port_actual && <p><span className="text-slate-400">Port:</span> {pilgrim.arrival_port_actual}</p>}
                  {pilgrim.arrival_flight_number && <p><span className="text-slate-400">Flight:</span> {pilgrim.arrival_flight_number}</p>}
                  {pilgrim.arrival_notes && <p><span className="text-slate-400">Notes:</span> {pilgrim.arrival_notes}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No arrival has been confirmed for this pilgrim.</p>
              )}
            </div>

            {/* Departure block */}
            <div className={`rounded-xl border p-4 ${hasDeparture ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PlaneTakeoff className={`h-5 w-5 ${hasDeparture ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span className="font-semibold text-sm text-slate-800">Departure</span>
                </div>
                {hasDeparture ? (
                  <span className="text-xs font-medium text-brand-700">Confirmed</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Not confirmed</span>
                )}
              </div>
              {hasDeparture ? (
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="text-slate-400">Date:</span> {pilgrim.actual_departure_date}</p>
                  {pilgrim.departure_confirmed_at && (
                    <p className="text-xs text-slate-400">
                      Confirmed at: {new Date(pilgrim.departure_confirmed_at).toLocaleString()}
                    </p>
                  )}
                  {pilgrim.departure_airport && <p><span className="text-slate-400">Airport:</span> {pilgrim.departure_airport}</p>}
                  {pilgrim.departure_flight_number && <p><span className="text-slate-400">Flight:</span> {pilgrim.departure_flight_number}</p>}
                  {pilgrim.departure_notes && <p><span className="text-slate-400">Notes:</span> {pilgrim.departure_notes}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No departure has been confirmed for this pilgrim.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-4">Arrival &amp; Departure Operations</h3>
            <div className="flex flex-wrap gap-3">
              {!hasArrival && (
                <button
                  onClick={() => openModal('arrival')}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  <PlaneLanding className="h-4 w-4" /> Confirm Arrival
                </button>
              )}
              {hasArrival && !hasDeparture && (
                <button
                  onClick={() => openModal('departure')}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-all disabled:opacity-50"
                >
                  <PlaneTakeoff className="h-4 w-4" /> Confirm Departure
                </button>
              )}
              {hasArrival && (
                <button
                  onClick={() => openModal('correct_arrival')}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-all disabled:opacity-50"
                >
                  <Undo2 className="h-4 w-4" /> Correct Arrival
                </button>
              )}
              {hasDeparture && (
                <button
                  onClick={() => openModal('correct_departure')}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-all disabled:opacity-50"
                >
                  <Undo2 className="h-4 w-4" /> Correct Departure
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              All confirmation actions require date, time, and staff identity. They are recorded in the audit history with timestamp.
            </p>
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-slate-400" /> Operational Notes
            </h3>
            {pilgrim.operational_notes ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {pilgrim.operational_notes}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No operational notes recorded.</p>
            )}
            <div className="mt-4 flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim() || actionLoading}
                className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>

        {/* Right column: audit + sub-agent */}
        <div className="space-y-6">
          {pilgrim.sub_agents && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-400" /> Sub-Agent
              </h3>
              <Link to={`/app/sub-agents/${pilgrim.sub_agents.id}`} className="block rounded-xl bg-slate-50 p-4 hover:bg-slate-100 transition-colors">
                <p className="font-semibold text-slate-900">{pilgrim.sub_agents.organisation_name}</p>
                <p className="text-sm text-slate-500 mt-0.5">{pilgrim.sub_agents.contact_person}</p>
                <p className="text-xs text-slate-400 mt-1">{pilgrim.sub_agents.country}</p>
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-slate-400" /> Audit History
            </h3>
            {auditLog.length === 0 ? (
              <p className="text-sm text-slate-400">No actions recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="border-l-2 border-brand-100 pl-3 py-1">
                    <p className="text-sm font-semibold text-slate-800">{formatAction(entry.action)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {entry.performed_by_name || 'System'} • {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {modal && (
        <ConfirmDialog
          open={modal !== null}
          title={
            modal.kind === 'arrival' ? 'Confirm Arrival' :
            modal.kind === 'departure' ? 'Confirm Departure' :
            modal.kind === 'correct_departure' ? 'Correct Departure' :
            'Correct Arrival'
          }
          message={
            modal.kind === 'correct_departure'
              ? `Clear the actual departure confirmation for ${pilgrim.full_name}? This will return the record to active journey tracking.`
              : modal.kind === 'correct_arrival'
              ? `Clear the actual arrival confirmation for ${pilgrim.full_name}? This will return the record to unverified/travel scheduled.`
              : undefined
          }
          confirmLabel={
            modal.kind === 'arrival' ? 'Confirm Arrival' :
            modal.kind === 'departure' ? 'Confirm Departure' :
            modal.kind === 'correct_departure' ? 'Clear Departure' :
            'Clear Arrival'
          }
          onConfirm={handleConfirmAction}
          onCancel={() => { setModal(null); resetForm(); }}
          loading={actionLoading}
          danger={modal.kind === 'correct_departure' || modal.kind === 'correct_arrival'}
        >
          {/* Extra form fields rendered inside the dialog body */}
          {(modal.kind === 'arrival' || modal.kind === 'departure') && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {modal.kind === 'arrival' ? 'Arrival' : 'Departure'} Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {modal.kind === 'arrival' ? 'Arrival' : 'Departure'} Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {modal.kind === 'arrival' ? 'Arrival Port' : 'Departure Airport'} <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={portValue}
                    onChange={(e) => setPortValue(e.target.value)}
                    placeholder={modal.kind === 'arrival' ? 'e.g. Jeddah' : 'e.g. King Abdulaziz Int.'}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Flight Number <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    placeholder="e.g. SV600"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes or evidence..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                />
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Confirming as: <span className="font-semibold text-slate-700">{profile?.full_name || 'Staff Member'}</span>
                </p>
              </div>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    pilgrim_created: 'Pilgrim created',
    pilgrim_edited: 'Pilgrim record edited',
    arrival_recorded: 'Arrival recorded',
    arrival_confirmed: 'Arrival confirmed by staff',
    arrival_correction: 'Arrival confirmation corrected',
    departure_confirmed: 'Departure confirmed by staff',
    departure_correction: 'Departure confirmation corrected',
    pilgrim_note_added: 'Operational note added',
    sub_agent_assignment_changed: 'Sub-agent assignment changed',
    expected_departure_changed: 'Expected departure changed',
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

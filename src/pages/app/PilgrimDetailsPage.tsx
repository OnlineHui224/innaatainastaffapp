import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  History,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
  StickyNote,
  Undo2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { calculateJourneyStatus, todayStr } from '@/lib/status';
import {
  hasConfirmedArrivalEvidence,
  hasConfirmedDepartureEvidence,
  journeyStatusProvenance,
  provenanceReason,
} from '@/lib/provenance';
import { formatDate, formatDateTime } from '@/lib/priority';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import type { AuditLog, Pilgrim, Profile, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge, ProvenanceTag, StatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { LoadingBlock, ReadOnlyNotice } from '@/components/ui/Feedback';
import { Identifier, Textarea } from '@/components/ui/Field';
import { DataGrid, DataRow, Panel } from '@/components/ui/Panel';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  ActualEventNotice,
  EMPTY_MOVEMENT,
  MOVEMENT_COPY,
  MovementFields,
  RecordingOfficer,
  type MovementFormValues,
  type MovementKind,
} from '@/components/pilgrims/MovementConfirmation';

interface PilgrimRow extends Pilgrim {
  sub_agents: SubAgent | null;
}

type DialogState =
  | { kind: 'confirm'; movement: MovementKind }
  | { kind: 'correct'; movement: MovementKind }
  | null;

export default function PilgrimDetailsPage() {
  const { id } = useParams();
  const { profile, canEditPilgrims } = useAuth();

  const [pilgrim, setPilgrim] = useState<PilgrimRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [officers, setOfficers] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<DialogState>(null);
  const [movement, setMovement] = useState<MovementFormValues>(EMPTY_MOVEMENT);
  const [noteText, setNoteText] = useState('');

  const fetchPilgrim = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('pilgrims')
      .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)')
      .eq('id', id)
      .maybeSingle();
    if (queryError || !data) {
      setError('This pilgrim record could not be found.');
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
      .limit(25);
    if (data) setAuditLog(data as AuditLog[]);
  }, [id]);

  useEffect(() => {
    fetchPilgrim();
    fetchAudit();
  }, [fetchPilgrim, fetchAudit]);

  /* Resolve confirming-officer names so a confirmed event can name the person
     who recorded it rather than showing a bare identifier. */
  useEffect(() => {
    const ids = [pilgrim?.arrival_confirmed_by, pilgrim?.departure_confirmed_by].filter(
      (value): value is string => Boolean(value),
    );
    if (ids.length === 0) return;
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        (data as Pick<Profile, 'id' | 'full_name'>[]).forEach((p) => {
          map[p.id] = p.full_name;
        });
        setOfficers(map);
      });
  }, [pilgrim?.arrival_confirmed_by, pilgrim?.departure_confirmed_by]);

  function openDialog(next: NonNullable<DialogState>) {
    setActionError(null);
    setMovement({ ...EMPTY_MOVEMENT, date: todayStr(), port: next.movement === 'arrival' ? pilgrim?.arrival_port ?? '' : '' });
    setDialog(next);
  }

  async function applyUpdate(updates: Partial<Pilgrim>, action: string) {
    if (!id || !pilgrim) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('pilgrims')
        .update({ ...updates, updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)')
        .maybeSingle();

      if (updateError) throw updateError;
      setPilgrim(data as unknown as PilgrimRow);
      await logAudit({
        action,
        recordType: 'pilgrim',
        recordId: id,
        recordLabel: pilgrim.full_name,
        previousValue: pilgrim as unknown as Record<string, unknown>,
        newValue: (data as Record<string, unknown> | null) ?? null,
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
      await fetchAudit();
      setDialog(null);
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setActionLoading(false);
    }
  }

  function handleConfirmMovement() {
    if (!dialog || dialog.kind !== 'confirm') return;
    if (!movement.date || !movement.time) {
      setActionError('Both the event date and time are required to record an actual event.');
      return;
    }
    const timestamp = `${movement.date}T${movement.time}:00`;

    if (dialog.movement === 'arrival') {
      applyUpdate(
        {
          actual_arrival_at: movement.date,
          arrival_date: movement.date,
          arrival_confirmed_at: timestamp,
          arrival_confirmed_by: profile?.id ?? null,
          arrival_port_actual: movement.port || null,
          arrival_flight_number: movement.flight || null,
          arrival_notes: movement.notes || null,
          status_source: 'MANUAL_CONFIRMATION',
        },
        'arrival_confirmed',
      );
    } else {
      applyUpdate(
        {
          actual_departure_date: movement.date,
          departure_confirmed_at: timestamp,
          departure_confirmed_by: profile?.id ?? null,
          departure_airport: movement.port || null,
          departure_flight_number: movement.flight || null,
          departure_notes: movement.notes || null,
          status_source: 'MANUAL_CONFIRMATION',
        },
        'departure_confirmed',
      );
    }
  }

  function handleCorrection() {
    if (!dialog || dialog.kind !== 'correct') return;
    if (dialog.movement === 'arrival') {
      applyUpdate(
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
      );
    } else {
      applyUpdate(
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
      );
    }
  }

  async function handleAddNote() {
    if (!pilgrim || !noteText.trim()) return;
    const stamped = `[${todayStr()}] ${noteText.trim()}`;
    const newNotes = pilgrim.operational_notes ? `${pilgrim.operational_notes}\n\n${stamped}` : stamped;
    await applyUpdate({ operational_notes: newNotes }, 'pilgrim_note_added');
    setNoteText('');
  }

  if (loading) return <LoadingBlock label="Loading pilgrim record…" />;

  if (error || !pilgrim) {
    return (
      <div>
        <Alert tone="critical" title="Record unavailable">
          {error || 'This pilgrim record could not be found.'}
        </Alert>
        <ButtonLink
          to="/app/pilgrims"
          variant="secondary"
          className="mt-4"
          icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Back to pilgrims
        </ButtonLink>
      </div>
    );
  }

  const status = calculateJourneyStatus(pilgrim);
  const provenance = journeyStatusProvenance(status, pilgrim);
  const arrivalConfirmed = hasConfirmedArrivalEvidence(pilgrim);
  const departureConfirmed = hasConfirmedDepartureEvidence(pilgrim);
  /* Any arrival value at all — including legacy/planned ones that carry no
     confirmation. The UI must distinguish these two things. */
  const hasArrivalValue = Boolean(pilgrim.actual_arrival_at ?? pilgrim.arrival_date);

  return (
    <div>
      <PageHeader
        eyebrow="Pilgrim record"
        title={pilgrim.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{pilgrim.nationality}</span>
            <span aria-hidden="true" className="text-slate-300">
              |
            </span>
            <span>
              Passport <Identifier value={pilgrim.passport_number} />
            </span>
          </span>
        }
        actions={
          canEditPilgrims ? (
            <ButtonLink
              to={`/app/pilgrims/${id}/edit`}
              variant="secondary"
              icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            >
              Edit record
            </ButtonLink>
          ) : undefined
        }
      />

      {!canEditPilgrims && (
        <ReadOnlyNotice className="mb-5">
          You have Viewer access. This record is read-only for your role — arrival and departure confirmations,
          corrections, notes and edits are not available.
        </ReadOnlyNotice>
      )}

      {actionError && (
        <Alert tone="critical" className="mb-5" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Current journey state */}
      <section
        className={`mb-6 overflow-hidden rounded-lg border bg-white ${
          provenance === 'confirmed' ? 'border-slate-300' : 'border-dashed border-slate-400'
        }`}
        aria-label="Current journey status"
      >
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-wide text-slate-600">Current journey status</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} record={pilgrim} showProvenance />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {provenanceReason(status, pilgrim)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Identity and responsibility */}
          <Panel title="Identity">
            <DataGrid columns={3}>
              <DataRow label="Full name">{pilgrim.full_name}</DataRow>
              <DataRow label="Nationality">{pilgrim.nationality}</DataRow>
              <DataRow label="Passport number" identifier>
                {pilgrim.passport_number}
              </DataRow>
              <DataRow label="Phone">{pilgrim.phone_number || '—'}</DataRow>
              <DataRow label="Gender">
                {pilgrim.gender ? pilgrim.gender.charAt(0).toUpperCase() + pilgrim.gender.slice(1) : '—'}
              </DataRow>
              <DataRow label="Date of birth">{formatDate(pilgrim.date_of_birth)}</DataRow>
              <DataRow label="Visa number" identifier>
                {pilgrim.visa_number || '—'}
              </DataRow>
              <DataRow label="Visa company">{pilgrim.visa_company || '—'}</DataRow>
              <DataRow label="Makkah hotel">{pilgrim.makkah_hotel || '—'}</DataRow>
              <DataRow label="Madinah hotel">{pilgrim.madinah_hotel || '—'}</DataRow>
              <DataRow label="Ground transportation">{pilgrim.transportation || 'Not arranged'}</DataRow>
              <DataRow label="Import batch" identifier>
                {pilgrim.import_batch_id ? pilgrim.import_batch_id.slice(0, 8) : '—'}
              </DataRow>
            </DataGrid>
          </Panel>

          {/* PLANNED TRAVEL — system-derived treatment */}
          <Panel
            edge="derived"
            title={
              <span className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand-700" aria-hidden="true" />
                Planned travel
              </span>
            }
            description="Plans only — scheduled dates do not confirm movement."
            actions={<ProvenanceTag provenance="derived" />}
          >
            <DataGrid columns={2}>
              <DataRow label="Scheduled outbound">
                {formatDate(pilgrim.expected_departure_date, 'Not set')}
              </DataRow>
              <DataRow label="Expected return">
                {formatDate(pilgrim.expected_return_date, 'Not set')}
              </DataRow>
              <DataRow label="Planned arrival port">{pilgrim.arrival_port || '—'}</DataRow>
              <DataRow label="Contract record date">{formatDate(pilgrim.contract_record_date)}</DataRow>
            </DataGrid>
          </Panel>

          {/* ACTUAL MOVEMENT — confirmed-event treatment */}
          <Panel
            title="Actual movement"
            description="Events recorded by a named staff member through a confirmation workflow. CSV import can never write these."
            edge={arrivalConfirmed || departureConfirmed ? 'confirmed' : 'default'}
          >
            <div className="space-y-4">
              <MovementBlock
                kind="arrival"
                confirmed={arrivalConfirmed}
                /* An arrival value without confirmation evidence must never be
                   presented as a confirmed actual date. */
                unconfirmedValueNotice={
                  !arrivalConfirmed && hasArrivalValue
                    ? 'This record holds an arrival date that carries no staff confirmation. It is treated as derived, and no actual arrival event is claimed.'
                    : null
                }
                date={pilgrim.actual_arrival_at ?? pilgrim.arrival_date}
                confirmedAt={pilgrim.arrival_confirmed_at}
                place={pilgrim.arrival_port_actual}
                flight={pilgrim.arrival_flight_number}
                notes={pilgrim.arrival_notes}
                officer={
                  pilgrim.arrival_confirmed_by ? officers[pilgrim.arrival_confirmed_by] ?? 'Staff member' : null
                }
              />
              <MovementBlock
                kind="departure"
                confirmed={departureConfirmed}
                unconfirmedValueNotice={
                  !departureConfirmed && pilgrim.actual_departure_date
                    ? 'This record holds a departure date that carries no staff confirmation. It is treated as derived, and no actual departure event is claimed.'
                    : null
                }
                date={pilgrim.actual_departure_date}
                confirmedAt={pilgrim.departure_confirmed_at}
                place={pilgrim.departure_airport}
                flight={pilgrim.departure_flight_number}
                notes={pilgrim.departure_notes}
                officer={
                  pilgrim.departure_confirmed_by
                    ? officers[pilgrim.departure_confirmed_by] ?? 'Staff member'
                    : null
                }
              />
            </div>
          </Panel>

          {/* Confirmation operations */}
          {canEditPilgrims && (
            <Panel
              title="Arrival &amp; departure operations"
              description="Every action here writes an actual event, stamped with your name and the time, and is recorded in the audit history."
            >
              <div className="flex flex-wrap gap-2">
                {!arrivalConfirmed && (
                  <Button
                    variant="confirm"
                    onClick={() => openDialog({ kind: 'confirm', movement: 'arrival' })}
                    disabled={actionLoading}
                    icon={<PlaneLanding className="h-4 w-4" aria-hidden="true" />}
                  >
                    Confirm arrival
                  </Button>
                )}
                {arrivalConfirmed && !departureConfirmed && (
                  <Button
                    onClick={() => openDialog({ kind: 'confirm', movement: 'departure' })}
                    disabled={actionLoading}
                    icon={<PlaneTakeoff className="h-4 w-4" aria-hidden="true" />}
                  >
                    Confirm departure
                  </Button>
                )}
                {hasArrivalValue && (
                  <Button
                    variant="danger"
                    onClick={() => openDialog({ kind: 'correct', movement: 'arrival' })}
                    disabled={actionLoading}
                    icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                  >
                    Correct arrival
                  </Button>
                )}
                {pilgrim.actual_departure_date && (
                  <Button
                    variant="danger"
                    onClick={() => openDialog({ kind: 'correct', movement: 'departure' })}
                    disabled={actionLoading}
                    icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                  >
                    Correct departure
                  </Button>
                )}
              </div>
            </Panel>
          )}

          {/* Operational notes */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Operational notes
              </span>
            }
          >
            {pilgrim.operational_notes ? (
              <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">
                {pilgrim.operational_notes}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No operational notes recorded.</p>
            )}

            {canEditPilgrims && (
              <div className="mt-4">
                <label htmlFor="new-note" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Add a note
                </label>
                <Textarea
                  id="new-note"
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Record operational context for this pilgrim…"
                />
                <div className="mt-2 flex justify-end">
                  <Button onClick={handleAddNote} disabled={!noteText.trim() || actionLoading}>
                    Add note
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Right column — responsibility and activity */}
        <div className="space-y-6">
          <Panel title="Responsibility">
            {pilgrim.sub_agents ? (
              <Link
                to={`/app/sub-agents/${pilgrim.sub_agents.id}`}
                className="block rounded-md border border-slate-200 p-3.5 transition-colors hover:border-brand-400 hover:bg-brand-50/40"
              >
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  {pilgrim.sub_agents.organisation_name}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {pilgrim.sub_agents.contact_person === 'To be updated' ? (
                    <Badge tone="caution">Contact not verified</Badge>
                  ) : (
                    pilgrim.sub_agents.contact_person
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">{pilgrim.sub_agents.country}</p>
              </Link>
            ) : (
              <p className="text-sm text-slate-500">
                No sub-agent is assigned. Responsibility for this pilgrim is currently untraced.
              </p>
            )}
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Activity timeline
              </span>
            }
            description="Most recent activity recorded against this record."
          >
            {auditLog.length === 0 ? (
              <p className="text-sm text-slate-500">No activity has been recorded yet.</p>
            ) : (
              <ol className="max-h-[28rem] space-y-3 overflow-y-auto scrollbar-thin">
                {auditLog.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-slate-300 pl-3">
                    <p className="text-sm font-semibold text-slate-800">{formatAction(entry.action)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.performed_by_name || 'System'} · {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {/* Confirmation dialog — records an ACTUAL event */}
      {dialog?.kind === 'confirm' && (
        <Modal
          open
          onClose={() => setDialog(null)}
          busy={actionLoading}
          title={`Confirm ${MOVEMENT_COPY[dialog.movement].noun.toLowerCase()} — ${pilgrim.full_name}`}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialog(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="confirm" onClick={handleConfirmMovement} loading={actionLoading}>
                Record actual {MOVEMENT_COPY[dialog.movement].noun.toLowerCase()}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {actionError && <Alert tone="critical">{actionError}</Alert>}
            <ActualEventNotice kind={dialog.movement} />

            {/* Pilgrim identity and current status */}
            <div className="rounded-md border border-slate-300 bg-slate-50 p-3.5">
              <p className="text-2xs font-bold uppercase tracking-wide text-slate-600">Recording against</p>
              <p className="mt-1 font-semibold text-slate-900">{pilgrim.full_name}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {pilgrim.nationality} · Passport <Identifier value={pilgrim.passport_number} />
              </p>
              <div className="mt-2">
                <StatusBadge status={status} record={pilgrim} showProvenance />
              </div>
            </div>

            <MovementFields
              kind={dialog.movement}
              values={movement}
              onChange={setMovement}
              idPrefix={`single-${dialog.movement}`}
            />

            <RecordingOfficer officerName={profile?.full_name ?? ''} />
          </div>
        </Modal>
      )}

      {/* Correction dialog */}
      {dialog?.kind === 'correct' && (
        <ConfirmDialog
          open
          danger
          title={`Correct ${MOVEMENT_COPY[dialog.movement].noun.toLowerCase()} — ${pilgrim.full_name}`}
          confirmLabel={`Clear ${MOVEMENT_COPY[dialog.movement].noun.toLowerCase()} record`}
          loading={actionLoading}
          onCancel={() => setDialog(null)}
          onConfirm={handleCorrection}
          message={
            dialog.movement === 'arrival' ? (
              <>
                This clears the recorded arrival for <strong>{pilgrim.full_name}</strong>, including the
                confirming officer, timestamp, port, flight and notes. The record returns to a scheduled or
                unverified state. The correction is recorded in the audit history.
              </>
            ) : (
              <>
                This clears the recorded departure for <strong>{pilgrim.full_name}</strong>, including the
                confirming officer, timestamp, airport, flight and notes. The record returns to active journey
                tracking. The correction is recorded in the audit history.
              </>
            )
          }
        />
      )}
    </div>
  );
}

/**
 * One actual-movement event.
 *
 * A confirmed event shows date/time, port or airport, flight, officer and the
 * recorded timestamp. An unconfirmed event never displays a fabricated actual date.
 */
function MovementBlock({
  kind,
  confirmed,
  date,
  confirmedAt,
  place,
  flight,
  notes,
  officer,
  unconfirmedValueNotice,
}: {
  kind: MovementKind;
  confirmed: boolean;
  date: string | null | undefined;
  confirmedAt: string | null | undefined;
  place: string | null | undefined;
  flight: string | null | undefined;
  notes: string | null | undefined;
  officer: string | null;
  unconfirmedValueNotice: string | null;
}) {
  const copy = MOVEMENT_COPY[kind];
  const Icon = copy.icon;

  return (
    <div
      className={`rounded-md border p-4 ${
        confirmed ? 'border-emerald-400 bg-emerald-50/40' : 'border-dashed border-slate-400 bg-slate-50/60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-navy-900">
          <Icon
            className={`h-4 w-4 shrink-0 ${confirmed ? 'text-emerald-700' : 'text-slate-500'}`}
            aria-hidden="true"
          />
          {copy.noun}
        </p>
        {confirmed ? (
          <Badge tone="positive" treatment="solid">
            Confirmed event
          </Badge>
        ) : (
          <Badge tone="neutral">Not confirmed</Badge>
        )}
      </div>

      {confirmed ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <DataRow label={`${copy.noun} date`}>{formatDate(date)}</DataRow>
          <DataRow label={kind === 'arrival' ? 'Arrival port' : 'Departure airport'}>{place || '—'}</DataRow>
          <DataRow label="Flight" identifier>
            {flight || '—'}
          </DataRow>
          <DataRow label="Recording officer">{officer || 'Staff member'}</DataRow>
          <DataRow label="Recorded at" className="sm:col-span-2">
            {formatDateTime(confirmedAt)}
          </DataRow>
          {notes && (
            <DataRow label="Notes" className="sm:col-span-2">
              <span className="whitespace-pre-wrap">{notes}</span>
            </DataRow>
          )}
        </dl>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-slate-600">
            No {copy.noun.toLowerCase()} has been confirmed for this pilgrim.
          </p>
          {unconfirmedValueNotice && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {unconfirmedValueNotice}
            </p>
          )}
        </div>
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
    bulk_arrival_confirmed: 'Arrival confirmed in a bulk action',
    departure_confirmed: 'Departure confirmed by staff',
    departure_correction: 'Departure confirmation corrected',
    bulk_departure_confirmed: 'Departure confirmed in a bulk action',
    pilgrim_note_added: 'Operational note added',
    sub_agent_assignment_changed: 'Sub-agent assignment changed',
    expected_departure_changed: 'Expected departure changed',
    visa_record_saved: 'Visa record saved',
    review_queue_approved: 'Approved from the review queue',
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

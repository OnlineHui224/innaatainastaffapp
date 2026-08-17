/**
 * VISA & CONTRACT REGISTER — record model
 * =======================================
 *
 * A Visa & Contract record is the entry point into company liability tracking.
 * Inna Ataina carries the exposure for every visa it issues, including visas
 * issued for a Sub-Agent's client, so the record exists from the moment the
 * document is read — not when the paperwork is finished, and not conditional on
 * the traveller already existing in the Pilgrims table.
 */

/**
 * Where the identity on this record came from.
 *
 * Deliberately separate from {@link RecordStatus}: a case typed by hand when
 * extraction was unavailable is a perfectly good liability record, and must
 * never be described as machine-extracted.
 */
export type EntrySource = 'GEMINI' | 'MANUAL';

/** Whether staff have reviewed the four identity values. */
export type RecordStatus = 'PENDING_REVIEW' | 'REVIEWED_CONFIRMED';

/**
 * Whether the traveller has been tied to a HajjERP pilgrim.
 *
 * Independent of {@link RecordStatus}. A record that is REVIEWED_CONFIRMED and
 * PENDING_PILGRIM_MATCH is complete and valid — the visa is real whether or not
 * the traveller has been entered into Pilgrims yet.
 */
export type PilgrimMatchStatus = 'PENDING_PILGRIM_MATCH' | 'MATCHED';

/** Office spreadsheet synchronisation. Nothing writes to Google in M1. */
export type SyncStatus = 'NOT_SYNCED' | 'SYNC_PENDING' | 'SYNCED' | 'SYNC_FAILED';

/** Whether the traveller is Inna Ataina's own client or a Sub-Agent's. */
export type ClientSource = 'direct' | 'sub_agent';

export interface VisaContractRecord {
  id: string;
  /** Business date the case was logged, in the company's operating timezone. */
  record_date: string;

  traveller_name: string | null;
  passport_number: string | null;
  visa_number: string | null;
  nationality: string | null;

  client_source: ClientSource;
  sub_agent_id: string | null;
  agent_name_snapshot: string;
  assigned_staff_id: string | null;

  visa_company: string | null;
  planned_departure_date: string | null;
  expected_return_date: string | null;
  makkah_hotel_id: string | null;
  makkah_hotel_name: string | null;
  madinah_hotel_id: string | null;
  madinah_hotel_name: string | null;
  transport_package: string | null;
  transport_summary: string | null;
  arrival_port: string | null;

  record_status: RecordStatus;
  entry_source: EntrySource;
  pilgrim_id: string | null;
  pilgrim_match_status: PilgrimMatchStatus;
  spreadsheet_sync_status: SyncStatus;

  source_filename: string | null;
  source_mime_type: string | null;
  extracted_at: string | null;
  extraction_model: string | null;
  extraction_metadata: Record<string, unknown>;

  client_case_key: string;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/* ── Operational vocabulary ───────────────────────────────────────────────────
   Plain descriptions of state. Staff read "Pending Review", not a claim about
   how clever the software is. */

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  PENDING_REVIEW: 'Pending Review',
  REVIEWED_CONFIRMED: 'Reviewed / Confirmed',
};

export const ENTRY_SOURCE_LABELS: Record<EntrySource, string> = {
  GEMINI: 'Document Extracted',
  MANUAL: 'Manual Entry',
};

export const PILGRIM_MATCH_LABELS: Record<PilgrimMatchStatus, string> = {
  PENDING_PILGRIM_MATCH: 'Pending Pilgrim Match',
  MATCHED: 'Matched',
};

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  NOT_SYNCED: 'Not Synced',
  SYNC_PENDING: 'Sync Pending',
  SYNCED: 'Synced',
  SYNC_FAILED: 'Sync Failed',
};

/**
 * The combined headline for a record, e.g. "Document Extracted — Pending Review".
 *
 * Source and review state are shown together because either alone misleads:
 * "Pending Review" hides whether a human typed the values, and "Manual Entry"
 * hides whether anyone has checked them.
 */
export function recordHeadline(record: {
  entry_source: EntrySource;
  record_status: RecordStatus;
}): string {
  if (record.record_status === 'REVIEWED_CONFIRMED') {
    return RECORD_STATUS_LABELS.REVIEWED_CONFIRMED;
  }
  return `${ENTRY_SOURCE_LABELS[record.entry_source]} — ${RECORD_STATUS_LABELS.PENDING_REVIEW}`;
}

/** How the responsible party reads. Direct clients have no Sub-Agent row. */
export function responsibilityLabel(record: {
  client_source: ClientSource;
  agent_name_snapshot: string;
}): string {
  if (record.client_source === 'direct') return 'Inna Ataina (direct client)';
  return record.agent_name_snapshot || 'Unassigned';
}

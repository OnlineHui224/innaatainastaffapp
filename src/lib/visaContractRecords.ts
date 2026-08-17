import { supabase } from '@/lib/supabase';
import type { ExtractedFieldKey, VisaExtractionResult } from '@/types/visa';
import { EXTRACTED_FIELD_KEYS } from '@/types/visa';
import type { VisaContractRecord } from '@/types/visaContract';

/**
 * VISA & CONTRACT REGISTER — updates
 * ==================================
 *
 * Creation happens server-side in the `visa-gemini-extract` Edge Function,
 * because `entry_source` and `created_by` are provenance claims a browser must
 * not be able to forge — RLS grants no INSERT to `authenticated` at all.
 *
 * Updates run from here through RLS, which requires an operational role and
 * requires the actor to stamp themselves. Every function below therefore takes
 * the session's own user id, and a database trigger restores `created_by`,
 * `created_at`, `entry_source`, `record_date` and `client_case_key` on every
 * UPDATE so the liability trail cannot be rewritten from the client.
 */

/** One field's stored review trail, as the database keeps it. */
interface StoredFieldTrail {
  ai_value?: string | null;
  ai_confidence?: 'high' | 'medium' | 'low' | null;
  final_value?: string | null;
  edited?: boolean;
  reviewed?: boolean;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
}

function storedFields(record: VisaContractRecord): Record<string, StoredFieldTrail> {
  const metadata = record.extraction_metadata ?? {};
  const fields = (metadata as { fields?: unknown }).fields;
  return fields && typeof fields === 'object'
    ? (fields as Record<string, StoredFieldTrail>)
    : {};
}

/**
 * Rebuilds the working case from what the database holds.
 *
 * This is what makes a handover real: the second officer sees which fields are
 * already reviewed, by whom and when, because that state lives in the record
 * rather than in whoever's browser happened to do the reviewing.
 */
export function extractionFromRecord(record: VisaContractRecord): VisaExtractionResult {
  const fields = storedFields(record);
  const column: Record<ExtractedFieldKey, string | null> = {
    passengerName: record.traveller_name,
    passportNumber: record.passport_number,
    visaNumber: record.visa_number,
    nationality: record.nationality,
  };

  const rebuilt = {} as VisaExtractionResult;
  for (const key of EXTRACTED_FIELD_KEYS) {
    const trail = fields[key] ?? {};
    rebuilt[key] = {
      value: column[key],
      confidence: trail.ai_confidence ?? null,
      sourcePage: null,
      needsReview: !trail.reviewed,
      verified: trail.reviewed === true,
      verifiedAt: trail.reviewed_at ?? null,
      verifiedById: trail.reviewed_by ?? null,
      verifiedByName: trail.reviewed_by_name ?? null,
      edited: trail.edited === true,
      originalValue: trail.ai_value ?? null,
    };
  }
  rebuilt.extractedAt = record.extracted_at ?? record.created_at;
  return rebuilt;
}

export const RECORD_COLUMNS =
  'id, record_date, traveller_name, passport_number, visa_number, nationality, ' +
  'client_source, sub_agent_id, agent_name_snapshot, assigned_staff_id, ' +
  'visa_company, planned_departure_date, expected_return_date, ' +
  'makkah_hotel_id, makkah_hotel_name, madinah_hotel_id, madinah_hotel_name, ' +
  'transport_package, transport_summary, arrival_port, ' +
  'record_status, entry_source, pilgrim_id, pilgrim_match_status, ' +
  'spreadsheet_sync_status, spreadsheet_id, spreadsheet_tab, spreadsheet_row_ref, ' +
  'last_synced_at, sync_error, source_filename, source_mime_type, ' +
  'extracted_at, extraction_model, extraction_metadata, ' +
  'client_case_key, created_by, created_at, updated_by, updated_at';

export class VisaRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisaRecordError';
  }
}

async function applyUpdate(
  recordId: string,
  patch: Record<string, unknown>,
  actorId: string,
): Promise<VisaContractRecord> {
  const { data, error } = await supabase
    .from('visa_contract_records')
    .update({ ...patch, updated_by: actorId })
    .eq('id', recordId)
    .select(RECORD_COLUMNS)
    .single();

  if (error) throw new VisaRecordError(error.message);
  if (!data) {
    throw new VisaRecordError('The visa record could not be found. Reload the page.');
  }
  return data as unknown as VisaContractRecord;
}

/** Re-reads one record, e.g. after a reload or to confirm a write landed. */
export async function fetchRecord(recordId: string): Promise<VisaContractRecord | null> {
  const { data, error } = await supabase
    .from('visa_contract_records')
    .select(RECORD_COLUMNS)
    .eq('id', recordId)
    .maybeSingle();
  if (error) throw new VisaRecordError(error.message);
  return (data as unknown as VisaContractRecord) ?? null;
}

/** Unwraps an RPC result into a record, or throws something readable. */
function rpcResult(data: unknown, error: { message: string } | null): VisaContractRecord {
  if (error) throw new VisaRecordError(error.message);
  const record = Array.isArray(data) ? data[0] : data;
  if (!record) {
    throw new VisaRecordError('The visa record could not be found. Reload the page.');
  }
  return record as VisaContractRecord;
}

/**
 * Records that this officer has reviewed one identity field — immediately.
 *
 * The review lands in the database now, not at final confirmation, so a case
 * half-checked before a handover is not lost with the browser tab.
 *
 * Note what is NOT sent: no reviewer, no name, no timestamp. The database
 * function stamps all three from the authenticated session, which is what makes
 * "reviewed by Musa" a fact rather than a claim the browser made.
 */
export async function reviewField(
  recordId: string,
  field: ExtractedFieldKey,
  value: string,
): Promise<VisaContractRecord> {
  const { data, error } = await supabase.rpc('visa_contract_review_field', {
    p_record_id: recordId,
    p_field: field,
    p_value: value,
  });
  return rpcResult(data, error);
}

/**
 * Records a correction, or withdraws a review.
 *
 * Pass `value` to save a corrected value; omit it to retract an attestation
 * without changing anything. Either way that field's review is cleared — the
 * previous reviewer is not left standing over a value they never saw — and a
 * confirmed record returns to Pending Review.
 */
export async function clearFieldReview(
  recordId: string,
  field: ExtractedFieldKey,
  value?: string,
): Promise<VisaContractRecord> {
  const { data, error } = await supabase.rpc('visa_contract_clear_field_review', {
    p_record_id: recordId,
    p_field: field,
    p_value: value ?? null,
  });
  return rpcResult(data, error);
}

/**
 * Confirms the record from the evidence the database already holds.
 *
 * Deliberately sends nothing but the status and the confirming officer. The
 * per-field reviewers are not rebuilt from browser state — doing so would let
 * one officer's session overwrite a colleague's attribution — and the database
 * refuses the transition unless all four fields are genuinely reviewed.
 */
export async function confirmRecordReview(
  record: VisaContractRecord,
  actorId: string,
): Promise<VisaContractRecord> {
  return applyUpdate(record.id, { record_status: 'REVIEWED_CONFIRMED' }, actorId);
}

/**
 * Links the record to an existing pilgrim the officer explicitly chose.
 *
 * The reviewed identity is NOT overwritten with the pilgrim's values: what the
 * visa says and what the pilgrim record says are separate facts, and quietly
 * replacing one with the other would destroy the discrepancy an officer needs
 * to see.
 */
export async function linkPilgrim(
  recordId: string,
  pilgrimId: string,
  actorId: string,
): Promise<VisaContractRecord> {
  return applyUpdate(
    recordId,
    { pilgrim_id: pilgrimId, pilgrim_match_status: 'MATCHED' },
    actorId,
  );
}

/** Removes a link so a different pilgrim can be chosen. Never deletes a pilgrim. */
export async function unlinkPilgrim(
  recordId: string,
  actorId: string,
): Promise<VisaContractRecord> {
  return applyUpdate(
    recordId,
    { pilgrim_id: null, pilgrim_match_status: 'PENDING_PILGRIM_MATCH' },
    actorId,
  );
}

/**
 * Visa cases still awaiting review.
 *
 * The handover list. Deliberately small and ordered newest-first: it exists so
 * an officer can pick up a colleague's part-finished case, not to be a second
 * dashboard.
 */
export async function fetchPendingReviewRecords(limit = 15): Promise<VisaContractRecord[]> {
  const { data, error } = await supabase
    .from('visa_contract_records')
    .select(RECORD_COLUMNS)
    .eq('record_status', 'PENDING_REVIEW')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new VisaRecordError(error.message);
  return (data as unknown as VisaContractRecord[]) ?? [];
}

/**
 * Confirmed records the office spreadsheet does not yet reflect.
 *
 * This is the recovery surface for office-register synchronisation, and it
 * exists because nothing is ever back-filled automatically. Records confirmed
 * before synchronisation existed, records whose month tab had not been created
 * yet, and records whose browser was closed between confirmation and the write
 * all arrive here, and a person decides when each one is sent.
 *
 * Ordered oldest first: the record that has been missing from the office copy
 * longest is the one most likely to be acted on incorrectly.
 */
export async function fetchAwaitingSyncRecords(limit = 15): Promise<VisaContractRecord[]> {
  const { data, error } = await supabase
    .from('visa_contract_records')
    .select(RECORD_COLUMNS)
    .eq('record_status', 'REVIEWED_CONFIRMED')
    .in('spreadsheet_sync_status', ['NOT_SYNCED', 'SYNC_PENDING', 'SYNC_FAILED'])
    .order('record_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new VisaRecordError(error.message);
  return (data as unknown as VisaContractRecord[]) ?? [];
}

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

/** The four identity columns, in the order the register reports them. */
const IDENTITY_COLUMN: Record<ExtractedFieldKey, string> = {
  passengerName: 'traveller_name',
  passportNumber: 'passport_number',
  visaNumber: 'visa_number',
  nationality: 'nationality',
};

export const RECORD_COLUMNS =
  'id, record_date, traveller_name, passport_number, visa_number, nationality, ' +
  'client_source, sub_agent_id, agent_name_snapshot, assigned_staff_id, ' +
  'visa_company, planned_departure_date, expected_return_date, ' +
  'makkah_hotel_id, makkah_hotel_name, madinah_hotel_id, madinah_hotel_name, ' +
  'transport_package, transport_summary, arrival_port, ' +
  'record_status, entry_source, pilgrim_id, pilgrim_match_status, ' +
  'spreadsheet_sync_status, source_filename, source_mime_type, ' +
  'extracted_at, extraction_model, extraction_metadata, ' +
  'client_case_key, created_by, created_at, updated_by, updated_at';

export class VisaRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisaRecordError';
  }
}

/**
 * Rebuilds the per-field trail.
 *
 * The extractor's original value and confidence are preserved beside the final
 * value, so a correction never erases what the machine actually claimed — which
 * is the only way to tell later whether a wrong record was a bad read or a bad
 * keystroke.
 */
function buildFieldTrail(
  extraction: VisaExtractionResult,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const previous = (existing?.fields ?? {}) as Record<string, Record<string, unknown>>;

  return Object.fromEntries(
    EXTRACTED_FIELD_KEYS.map((key) => {
      const field = extraction[key];
      const prior = previous[key] ?? {};
      return [
        key,
        {
          /* Kept from the original insert. An edit must not overwrite it. */
          ai_value: prior.ai_value ?? null,
          ai_confidence: prior.ai_confidence ?? null,
          final_value: field.value,
          edited: field.edited,
          reviewed: field.verified,
          reviewed_by: field.verifiedById,
          reviewed_by_name: field.verifiedByName,
          reviewed_at: field.verifiedAt,
        },
      ];
    }),
  );
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

/**
 * Writes the reviewed identity to the canonical record and confirms it.
 *
 * This UPDATEs the record created at extraction. It never inserts: there is one
 * liability record per visa case, and a second would double-count the company's
 * exposure.
 */
export async function confirmRecordReview(
  record: VisaContractRecord,
  extraction: VisaExtractionResult,
  actorId: string,
): Promise<VisaContractRecord> {
  const identity = Object.fromEntries(
    EXTRACTED_FIELD_KEYS.map((key) => [IDENTITY_COLUMN[key], extraction[key].value]),
  );

  return applyUpdate(
    record.id,
    {
      ...identity,
      record_status: 'REVIEWED_CONFIRMED',
      extraction_metadata: {
        ...record.extraction_metadata,
        fields: buildFieldTrail(extraction, record.extraction_metadata),
      },
    },
    actorId,
  );
}

/**
 * Returns a confirmed record to pending after a staff edit.
 *
 * A confirmed record whose passport number has just been changed is not
 * confirmed any more. This runs only on a deliberate staff edit — never on a
 * retried extraction, which is refused upstream by the idempotency key.
 */
export async function revertRecordToPending(
  record: VisaContractRecord,
  extraction: VisaExtractionResult,
  actorId: string,
): Promise<VisaContractRecord> {
  return applyUpdate(
    record.id,
    {
      record_status: 'PENDING_REVIEW',
      extraction_metadata: {
        ...record.extraction_metadata,
        fields: buildFieldTrail(extraction, record.extraction_metadata),
      },
    },
    actorId,
  );
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

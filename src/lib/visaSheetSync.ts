import { supabase } from '@/lib/supabase';
import type { SyncStatus, VisaContractRecord } from '@/types/visaContract';

/**
 * OFFICE REGISTER SYNCHRONISATION — browser client
 * ================================================
 *
 * Asks the `visa-contract-sheet-sync` Edge Function to write a confirmed Visa &
 * Contract record to the company's Google Sheet.
 *
 * The request body is `{ recordId }` and nothing else. The spreadsheet id, the
 * month tab, the row, the resulting status and the timestamp are all derived and
 * verified on the server — this module could not name them if it wanted to, and
 * the database trigger restores those columns for any non-server writer anyway.
 *
 * The browser holds no Google credential and never reaches Google. It knows one
 * URL: our own function.
 */

export interface SheetSyncResult {
  status: Extract<SyncStatus, 'SYNCED' | 'SYNC_PENDING' | 'SYNC_FAILED'>;
  /** The month tab written to, or the one the office still has to create. */
  tab: string | null;
  rowRef: string | null;
  lastSyncedAt: string | null;
  /** Present for anything short of SYNCED — already written for a person. */
  message: string | null;
}

/**
 * A failure the officer can act on.
 *
 * Distinct from a `SYNC_PENDING` / `SYNC_FAILED` result: those are outcomes the
 * server recorded on the record, whereas this is the call itself not landing.
 */
export class SheetSyncError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SheetSyncError';
    this.code = code;
  }
}

const GENERIC_FAILURE =
  'The office register could not be updated. The Visa & Contract record is safe in HajjERP — retry the sync.';

/** Pulls our `{ error: { code, message } }` envelope out of a failed invoke. */
async function readError(error: unknown): Promise<SheetSyncError> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = (await context.json()) as { error?: { code?: string; message?: string } };
        if (body?.error?.message) {
          return new SheetSyncError(body.error.code ?? 'unknown', body.error.message);
        }
      } catch {
        /* Not JSON — a raw response body is not something to show an officer. */
      }
    }
  }
  return new SheetSyncError('unknown', GENERIC_FAILURE);
}

/**
 * Writes a confirmed record to the office register.
 *
 * Safe to call more than once. The server resolves which register row belongs to
 * this record before writing anything, so a repeat call updates that row rather
 * than adding a second one — which is what makes "Retry Sync" safe to press
 * after a failure of unknown outcome.
 *
 * A failure here never affects the HajjERP record: the confirmation and the
 * pilgrim match are untouched by anything that happens at Google.
 */
export async function syncRecordToOfficeRegister(recordId: string): Promise<SheetSyncResult> {
  const { data, error } = await supabase.functions.invoke('visa-contract-sheet-sync', {
    body: { recordId },
  });

  if (error) throw await readError(error);

  const payload = (data ?? {}) as Record<string, unknown>;
  const status = payload.status;
  if (status !== 'SYNCED' && status !== 'SYNC_PENDING' && status !== 'SYNC_FAILED') {
    throw new SheetSyncError('unexpected_response', GENERIC_FAILURE);
  }

  return {
    status,
    tab: typeof payload.tab === 'string' ? payload.tab : null,
    rowRef: typeof payload.rowRef === 'string' ? payload.rowRef : null,
    lastSyncedAt: typeof payload.lastSyncedAt === 'string' ? payload.lastSyncedAt : null,
    message: typeof payload.message === 'string' ? payload.message : null,
  };
}

/**
 * Whether this record can be sent to the office register right now.
 *
 * Only a reviewed and confirmed record is written — the register is the office's
 * working copy of committed liability, not a draft board. Every non-synced state
 * of a confirmed record is offerable, which is what gives the officer a way back
 * from a browser closed mid-sync or a month tab that did not exist yet.
 */
export function canSyncToOfficeRegister(record: VisaContractRecord | null): boolean {
  if (!record) return false;
  if (record.record_status !== 'REVIEWED_CONFIRMED') return false;
  return record.spreadsheet_sync_status !== 'SYNCED';
}

/**
 * What the sync action is called for this record.
 *
 * "Sync now" for a record that has never been sent — including every record
 * confirmed before this feature existed, which is deliberately left for a person
 * to trigger rather than back-filled automatically. "Retry Sync" once an attempt
 * has been made and left something behind.
 */
export function syncActionLabel(record: VisaContractRecord): string {
  return record.spreadsheet_sync_status === 'NOT_SYNCED' ? 'Sync now' : 'Retry Sync';
}

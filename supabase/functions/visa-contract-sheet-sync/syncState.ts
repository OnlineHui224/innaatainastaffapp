/**
 * SYNC STATE PATCHES — pure logic
 * ===============================
 *
 * Every database write this function makes to `visa_contract_records` is built
 * here, and nowhere else.
 *
 * The reason it is a separate module is that one of M2's hard promises is
 * negative: a Google outcome — success, failure, conflict, rate limit — must
 * never reach `record_status` or `pilgrim_match_status`. A promise of that shape
 * cannot be tested by reading the handler and believing it; it can be tested if
 * every patch comes from a function with a closed set of allowed keys and a
 * guard that throws on anything else.
 */

/**
 * The only columns office-register synchronisation may write.
 *
 * `record_status` and `pilgrim_match_status` are absent deliberately. So is
 * every contract field: this function reports on the sheet, it does not edit
 * the liability record.
 */
export const SYNC_STATE_COLUMNS = [
  'spreadsheet_sync_status',
  'spreadsheet_id',
  'spreadsheet_tab',
  'spreadsheet_row_ref',
  'last_synced_at',
  'sync_error',
  /* Attribution for the attempt. Not a contract field. */
  'updated_by',
] as const;

/** Columns a synchronisation must never write, named so the failure is legible. */
export const FORBIDDEN_SYNC_COLUMNS = [
  'record_status',
  'pilgrim_match_status',
  'pilgrim_id',
  'id',
  'client_case_key',
  'entry_source',
  'record_date',
  'extraction_metadata',
] as const;

export type SyncPatch = Record<string, unknown>;

/**
 * Refuses a patch that reaches outside the sync columns.
 *
 * A last line of defence rather than the first one — the builders below cannot
 * produce such a patch — but it is what makes "a Google failure cannot un-confirm
 * a record" a checked property instead of a convention.
 */
export function assertSyncPatch(patch: SyncPatch): SyncPatch {
  const allowed = new Set<string>(SYNC_STATE_COLUMNS);
  const offending = Object.keys(patch).filter((key) => !allowed.has(key));
  if (offending.length > 0) {
    throw new Error(
      `Office register synchronisation may not write: ${offending.join(', ')}`,
    );
  }
  return patch;
}

export interface SyncActorContext {
  actorId: string;
  spreadsheetId?: string | null;
  tab?: string | null;
}

/**
 * Work the office must do before this record can sync — a missing month tab, or
 * a departure date that has not been entered.
 *
 * Deliberately not SYNC_FAILED: nothing went wrong, the register simply is not
 * ready. The record stays REVIEWED_CONFIRMED and the case reappears with a
 * "Retry Sync" action.
 */
export function pendingPatch(
  message: string,
  context: SyncActorContext,
): SyncPatch {
  return assertSyncPatch({
    spreadsheet_sync_status: 'SYNC_PENDING',
    ...(context.spreadsheetId ? { spreadsheet_id: context.spreadsheetId } : {}),
    ...(context.tab ? { spreadsheet_tab: context.tab } : {}),
    sync_error: message,
    updated_by: context.actorId,
  });
}

/** A refusal or an error. Again: only sync columns. */
export function failedPatch(message: string, context: SyncActorContext): SyncPatch {
  return assertSyncPatch({
    spreadsheet_sync_status: 'SYNC_FAILED',
    ...(context.spreadsheetId ? { spreadsheet_id: context.spreadsheetId } : {}),
    ...(context.tab ? { spreadsheet_tab: context.tab } : {}),
    sync_error: message,
    updated_by: context.actorId,
  });
}

/** A completed write, with where it landed. */
export function syncedPatch(
  input: { spreadsheetId: string; tab: string; rowRef: string; syncedAt: string },
  context: { actorId: string },
): SyncPatch {
  return assertSyncPatch({
    spreadsheet_sync_status: 'SYNCED',
    spreadsheet_id: input.spreadsheetId,
    spreadsheet_tab: input.tab,
    spreadsheet_row_ref: input.rowRef,
    last_synced_at: input.syncedAt,
    sync_error: null,
    updated_by: context.actorId,
  });
}

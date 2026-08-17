import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getAccessToken, GoogleAuthError } from "./googleAuth.ts";
import {
  type SheetsClient,
  SheetsError,
  appendRow,
  attachRecordMetadata,
  findRowsByRecordId,
  listTabs,
  preflightDateCells,
  readIdentifierColumns,
  updateRow,
} from "./sheets.ts";
import {
  type SyncableRecord,
  buildRegisterRow,
  findBusinessMatches,
  isProtectedTab,
  monthTabFor,
  resolveRow,
  resolveTabTitle,
  rowRange,
} from "./mapping.ts";
import {
  type SyncPatch,
  assertSyncPatch,
  failedPatch,
  pendingPatch,
  syncedPatch,
} from "./syncState.ts";

/**
 * OFFICE REGISTER SYNCHRONISATION
 * ===============================
 *
 * Writes a confirmed Visa & Contract record to the company's existing Google
 * Sheet. HajjERP remains the system of record; the sheet is a synchronised copy
 * the office already works from.
 *
 * WHAT THE BROWSER MAY SAY
 * ------------------------
 * `{ recordId }`. Nothing else. The spreadsheet id, the target tab, the row, the
 * sync status and the timestamp are all derived or read here — and the database
 * trigger restores those columns for any non-server writer anyway, so a browser
 * could not set them even if it tried.
 *
 * WHAT A GOOGLE FAILURE MUST NEVER DO
 * -----------------------------------
 * Change `record_status` or `pilgrim_match_status`. The liability record is
 * confirmed in HajjERP whether or not the office copy is up to date, and the
 * sync write touches only the six spreadsheet columns.
 *
 * ROW IDENTITY
 * ------------
 * Developer metadata on the row, keyed by the HajjERP record id. The workbook is
 * human-edited and staff insert rows, so a stored row number is a hint, not an
 * identity. See `resolveRow` for the order of resolution.
 */

const ALLOWED_ORIGINS = new Set([
  "https://www.innatainastaff.app",
  "https://innatainastaff.app",
  "http://localhost:5173",
  "http://localhost:5199",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5199",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** Mirrors `can_edit_operational_records()` in migration 019. */
const OPERATIONAL_ROLES = new Set([
  "platform_owner",
  "super_admin",
  "admin",
  "operations_manager",
  "operations_staff",
]);

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceAccountB64 = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON_B64") ?? "";
const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_SPREADSHEET_ID") ?? "";

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RECORD_COLUMNS = `
  id, record_date, traveller_name, passport_number, visa_number, nationality,
  client_source, sub_agent_id, agent_name_snapshot,
  visa_company, planned_departure_date, expected_return_date,
  makkah_hotel_name, madinah_hotel_name, transport_summary, arrival_port,
  record_status, pilgrim_match_status,
  spreadsheet_sync_status, spreadsheet_id, spreadsheet_tab, spreadsheet_row_ref,
  last_synced_at, sync_error, updated_by
`;

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function fail(code: string, message: string, status: number, origin: string | null): Response {
  return json({ error: { code, message } }, status, origin);
}

/**
 * Records the outcome on the record.
 *
 * Only the six spreadsheet columns, ever. `record_status` and
 * `pilgrim_match_status` are deliberately absent from this statement so that no
 * Google outcome can reach them.
 */
async function writeSyncState(
  recordId: string,
  patch: SyncPatch,
): Promise<void> {
  const { error } = await adminClient
    .from("visa_contract_records")
    .update(assertSyncPatch(patch))
    .eq("id", recordId);
  if (error) {
    console.error(
      JSON.stringify({ event: "sheet_sync_state_write_failed", record_id: recordId, code: error.code ?? null }),
    );
  }
}

/** Audit entry for a synchronisation attempt. Never credentials, never rows. */
async function audit(
  action: string,
  record: { id: string; traveller_name: string | null; passport_number: string | null },
  actor: { id: string; name: string },
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await adminClient.from("audit_log").insert({
    action,
    record_type: "visa_contract_record",
    record_id: record.id,
    record_label: record.traveller_name || record.passport_number || "Visa case",
    new_value: detail,
    performed_by: actor.id,
    performed_by_name: actor.name,
  });
  if (error) {
    console.error(
      JSON.stringify({ event: "sheet_sync_audit_failed", record_id: record.id, code: error.code ?? null }),
    );
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const started = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return fail("method_not_allowed", "Unsupported request.", 405, origin);
  }

  /* 1 ── Caller, from the verified JWT and nothing else. */
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return fail("unauthenticated", "Sign in to synchronise the office register.", 401, origin);
  }

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return fail("unauthenticated", "Your session has expired. Sign in again.", 401, origin);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("is_active, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return fail("profile_unavailable", "Your account could not be verified. Try again.", 503, origin);
  }
  if (!profile || profile.is_active === false) {
    return fail("account_inactive", "Your HajjERP account is not active.", 403, origin);
  }
  if (!OPERATIONAL_ROLES.has(String(profile.role))) {
    return fail("forbidden_role", "Your role does not include office register synchronisation.", 403, origin);
  }
  const actor = { id: user.id, name: (profile.full_name as string | null) ?? "" };

  if (!serviceAccountB64 || !spreadsheetId) {
    console.error(JSON.stringify({ event: "sheet_sync_misconfigured" }));
    return fail(
      "not_configured",
      "Office register synchronisation is not configured yet.",
      503,
      origin,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return fail("invalid_request", "No record was specified.", 400, origin);
  }

  const recordId = typeof body.recordId === "string" ? body.recordId : "";
  if (!recordId) {
    return fail("invalid_request", "No record was specified.", 400, origin);
  }

  /* 2 ── The record, read server-side. Its status is not taken on trust from
          whatever the browser believed when it rendered the button. */
  const { data: record, error: recordError } = await adminClient
    .from("visa_contract_records")
    .select(RECORD_COLUMNS)
    .eq("id", recordId)
    .maybeSingle();

  if (recordError) {
    return fail("record_unavailable", "The visa record could not be read. Try again.", 503, origin);
  }
  if (!record) {
    return fail("record_not_found", "That visa record no longer exists.", 404, origin);
  }
  if (record.record_status !== "REVIEWED_CONFIRMED") {
    return fail(
      "not_confirmed",
      "Only a reviewed and confirmed visa record is written to the office register.",
      409,
      origin,
    );
  }

  const syncable = record as unknown as SyncableRecord;
  const preflight = body.mode === "preflight";

  /* 3 ── Target tab, from the planned departure date only. */
  const expectedTab = monthTabFor(syncable.planned_departure_date);
  if (!expectedTab) {
    const message =
      "This visa has no planned departure date, so its office-register month cannot be determined.";
    await writeSyncState(recordId, pendingPatch(message, { actorId: actor.id }));
    return fail("no_departure_date", message, 409, origin);
  }

  try {
    const accessToken = await getAccessToken(serviceAccountB64);
    const client: SheetsClient = { spreadsheetId, accessToken, fetchImpl: fetch };

    const tabs = await listTabs(client);
    const tabTitle = resolveTabTitle(expectedTab, tabs.map((t) => t.title));

    if (!tabTitle) {
      const message = `The ${expectedTab} tab does not exist in the office register. Create it, then retry.`;
      await writeSyncState(
        recordId,
        pendingPatch(message, { actorId: actor.id, spreadsheetId, tab: expectedTab }),
      );
      await audit("visa_contract_sheet_sync_failed", syncable, actor, {
        outcome: "missing_month_tab",
        tab: expectedTab,
      });
      return json({ status: "SYNC_PENDING", tab: expectedTab, message }, 200, origin);
    }

    /* Sheet1 belongs to the office. It is never a month tab, but refusing here
       makes that impossible rather than merely unlikely. */
    if (isProtectedTab(tabTitle)) {
      return fail("protected_tab", "That tab is not a synchronisation target.", 409, origin);
    }

    const sheetId = tabs.find((t) => t.title === tabTitle)?.sheetId ?? -1;

    if (preflight) {
      /* Read-only. Reports how the register currently stores its dates so the
         first live write can be checked before it happens. */
      const sample = await preflightDateCells(client, tabTitle);
      return json({ status: "PREFLIGHT", tab: tabTitle, ...sample }, 200, origin);
    }

    /* 4 ── Which row this record owns. Metadata first, business identity next,
            append only when neither found anything. */
    const metadataRowIndices = await findRowsByRecordId(client, sheetId, syncable.id);
    const businessMatchRowIndices = metadataRowIndices.length > 0
      ? []
      : findBusinessMatches(await readIdentifierColumns(client, tabTitle), syncable);

    const resolution = resolveRow({ metadataRowIndices, businessMatchRowIndices });

    if (resolution.action === "conflict") {
      await writeSyncState(
        recordId,
        failedPatch(resolution.reason, { actorId: actor.id, spreadsheetId, tab: tabTitle }),
      );
      await audit("visa_contract_sheet_sync_failed", syncable, actor, {
        outcome: "conflict",
        tab: tabTitle,
        reason: resolution.reason,
      });
      return json({ status: "SYNC_FAILED", tab: tabTitle, message: resolution.reason }, 200, origin);
    }

    const values = buildRegisterRow(syncable);
    let rowIndex: number;
    let resynced = false;

    if (resolution.action === "update") {
      rowIndex = resolution.rowIndex;
      await updateRow(client, tabTitle, rowIndex, values);
      /* A row adopted by business identity has not been tagged yet. Tagging it
         now is what makes every later corrections cycle unambiguous, including
         one that changes the very identifiers we matched on. */
      if (resolution.source === "business_identity") {
        await attachRecordMetadata(client, sheetId, rowIndex, syncable.id);
      }
      resynced = resolution.source === "metadata";
    } else {
      rowIndex = await appendRow(client, tabTitle, values);
      await attachRecordMetadata(client, sheetId, rowIndex, syncable.id);
    }

    const syncedAt = new Date().toISOString();
    await writeSyncState(
      recordId,
      syncedPatch(
        { spreadsheetId, tab: tabTitle, rowRef: rowRange(tabTitle, rowIndex), syncedAt },
        { actorId: actor.id },
      ),
    );

    await audit(
      resynced ? "visa_contract_sheet_resynced" : "visa_contract_sheet_synced",
      syncable,
      actor,
      {
        outcome: resolution.action,
        source: resolution.action === "update" ? resolution.source : "append",
        tab: tabTitle,
        row_ref: rowRange(tabTitle, rowIndex),
      },
    );

    console.log(
      JSON.stringify({
        event: "sheet_sync",
        record_id: recordId,
        user_id: actor.id,
        tab: tabTitle,
        action: resolution.action,
        duration_ms: Date.now() - started,
      }),
    );

    return json(
      {
        status: "SYNCED",
        tab: tabTitle,
        rowRef: rowRange(tabTitle, rowIndex),
        lastSyncedAt: syncedAt,
      },
      200,
      origin,
    );
  } catch (e) {
    /* Narrowed to a code before anything is logged: a thrown fetch error can
       carry its own request, and these requests carry a signed assertion. */
    const code = e instanceof GoogleAuthError || e instanceof SheetsError ? e.code : "sync_failed";
    const message = e instanceof GoogleAuthError || e instanceof SheetsError
      ? e.message
      : "The office register could not be updated. Try again shortly.";

    console.error(
      JSON.stringify({
        event: "sheet_sync_failed",
        record_id: recordId,
        user_id: actor.id,
        code,
        duration_ms: Date.now() - started,
      }),
    );

    await writeSyncState(recordId, failedPatch(message, { actorId: actor.id, spreadsheetId }));
    await audit("visa_contract_sheet_sync_failed", syncable, actor, { outcome: code });

    return json({ status: "SYNC_FAILED", message }, 200, origin);
  }
});

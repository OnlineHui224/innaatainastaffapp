import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  type ExtractionFields,
  type OperationalDetails,
  type ValidBody,
  FIELD_KEYS,
  isEmptyExtraction,
  isUuid,
  MAX_BODY_BYTES,
  validateBody,
  validateDetails,
  validateFields,
} from "./validation.ts";

/**
 * VISA IDENTITY EXTRACTION + LIABILITY RECORD CREATION
 * ====================================================
 *
 * Reads an uploaded visa document and, in the same operation, creates the Visa
 * & Contract record that carries the company's responsibility for it. This is
 * the ONLY place a Gemini call is made — the browser never talks to Google and
 * never sees the company API key — and the ONLY place a register record is
 * created, because `entry_source` and `created_by` are provenance claims a
 * client must not be able to forge. RLS grants no INSERT to `authenticated`.
 *
 * WHAT IT WRITES
 * --------------
 *   - Exactly one `visa_contract_records` row per visa case, at
 *     PENDING_REVIEW / PENDING_PILGRIM_MATCH / NOT_SYNCED.
 *   - One `audit_log` entry for that creation, attributed to the staff member
 *     resolved from the verified JWT — never to a caller-supplied id.
 *
 * Creation is idempotent on `client_case_key`: a retried extraction returns the
 * existing record untouched and writes no second audit entry, so the liability
 * trail can never be double-counted, reset, or overwritten.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 *   - It never stores the document. One request, one response, discarded — no
 *     Supabase Storage, no Gemini Files API, no document bytes in any column.
 *   - It never touches `pilgrims`. Linking a traveller is a separate, explicit
 *     staff action, and no pilgrim is created here or anywhere in this flow.
 *   - It never decides anything about the identity. Every value it writes is
 *     unreviewed, and the per-field human review remains the only route to a
 *     confirmed record — enforced in the database, not just in the UI.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * It never invents an identifier. A passport or visa number that cannot be read
 * confidently is stored as `null`, because a plausible-looking fabricated
 * passport number in a liability record is far worse than a blank one an officer
 * has to type.
 */

/* ── CORS ─────────────────────────────────────────────────────────────────────
   An explicit allowlist rather than "*". The JWT check below is the real
   control; this narrows the set of pages that can spend company Gemini quota
   with a token they have obtained. */
const ALLOWED_ORIGINS = new Set([
  "https://www.innatainastaff.app",
  "https://innatainastaff.app",
  /* Local development only. */
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
  /* No echo for an unknown origin: the browser then blocks the response, which
     is the intended outcome. */
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const GEMINI_TIMEOUT_MS = 45_000;

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
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
/**
 * Default chosen for parity with the existing OPS PRO extractor, which already
 * reads these documents in production on this model. The first HajjERP
 * deployment matches it, so a migration problem cannot be confused with a model
 * change. `GEMINI_MODEL` stays configurable server-side for testing newer models
 * later — the browser never chooses.
 */
const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

/**
 * Every failure the browser can see.
 *
 * `code` is what the UI switches on; `message` is written for the officer, not
 * for a developer. Provider detail reaches neither.
 */
function fail(
  code: string,
  message: string,
  status: number,
  origin: string | null,
): Response {
  return json({ error: { code, message } }, status, origin);
}

/* ── Structured output contract ───────────────────────────────────────────────
   Given to Gemini as a response schema, so the model is constrained to this
   shape rather than asked politely for JSON. Every `value` is nullable on
   purpose: a model that cannot read a field must be able to say so. */
const VALUE_SCHEMA = {
  type: "OBJECT",
  properties: {
    value: { type: "STRING", nullable: true },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
  },
  required: ["value", "confidence"],
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    travellerName: VALUE_SCHEMA,
    passportNumber: VALUE_SCHEMA,
    visaNumber: VALUE_SCHEMA,
    nationality: VALUE_SCHEMA,
  },
  required: ["travellerName", "passportNumber", "visaNumber", "nationality"],
  propertyOrdering: [
    "travellerName",
    "passportNumber",
    "visaNumber",
    "nationality",
  ],
};

const PROMPT = [
  "You are reading an issued travel visa document.",
  "Extract exactly four values: traveller name, passport number, visa number, nationality.",
  "",
  "Rules:",
  "- Copy identifiers exactly as printed, character for character.",
  "- Do not infer, complete or correct a partially legible number.",
  "- Do not take a value from unrelated text elsewhere on the page.",
  "- Do not re-spell or transliterate a name already written in Latin script.",
  "- If a value is absent, illegible, or you are not confident, return null for it.",
  "",
  "Returning null is always better than guessing. Set confidence to how certain",
  "you are of each value you did read.",
].join("\n");

/* ── Gemini ───────────────────────────────────────────────────────────────── */

type GeminiOutcome =
  | { ok: true; fields: ExtractionFields }
  | {
    ok: false;
    code: string;
    message: string;
    status: number;
    logStatus?: number;
  };

const MANUAL_FALLBACK_UNAVAILABLE =
  "AI extraction is temporarily unavailable. Enter the Visa details manually or try again later.";

async function callGemini(body: ValidBody): Promise<GeminiOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          /* Header rather than a `?key=` query parameter, so the key cannot end
             up in a URL, a proxy log or an error string. */
          "x-goog-api-key": geminiApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: body.mimeType,
                    data: body.dataBase64,
                  },
                },
                { text: PROMPT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!res.ok) {
      /* The provider's body is deliberately never forwarded or logged: it can
         echo request content, and this request contains a visa document. */
      if (res.status === 429) {
        return {
          ok: false,
          code: "provider_quota",
          message:
            "AI usage is temporarily unavailable. Enter the Visa details manually or try again later.",
          status: 503,
          logStatus: res.status,
        };
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        /* Almost always a configuration fault on our side — bad key, model not
           available to the project, API not enabled. The officer does not need
           to know which; the log line carries the status. */
        return {
          ok: false,
          code: "provider_rejected",
          message:
            "AI extraction is not available right now. Enter the Visa details manually.",
          status: 503,
          logStatus: res.status,
        };
      }
      return {
        ok: false,
        code: "provider_unavailable",
        message: MANUAL_FALLBACK_UNAVAILABLE,
        status: 503,
        logStatus: res.status,
      };
    }

    const payload = await res.json();

    /* Safety filters and empty candidate lists both mean "nothing was read". */
    const text: unknown = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      return {
        ok: false,
        code: "unreadable_document",
        message:
          "Nothing could be read from this document. Enter the Visa details manually.",
        status: 422,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        code: "malformed_response",
        message:
          "The document could not be read reliably. Enter the Visa details manually.",
        status: 502,
      };
    }

    const fields = validateFields(parsed);
    if (!fields) {
      return {
        ok: false,
        code: "malformed_response",
        message:
          "The document could not be read reliably. Enter the Visa details manually.",
        status: 502,
      };
    }

    /* All four null means the model saw the document and read nothing from it —
       a different outcome from a provider failure, and worth saying so. */
    if (isEmptyExtraction(fields)) {
      return {
        ok: false,
        code: "unreadable_document",
        message:
          "No visa details could be read from this document. Check it is the right file, or enter the details manually.",
        status: 422,
      };
    }

    return { ok: true, fields };
  } catch (e) {
    /* Narrowed to a code before anything is logged: a thrown fetch error can
       carry the full request, and the request holds the document. */
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "provider_timeout" : "provider_unavailable",
      message: aborted
        ? "AI extraction took too long. Enter the Visa details manually or try again."
        : MANUAL_FALLBACK_UNAVAILABLE,
      status: 503,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ── The liability record ─────────────────────────────────────────────────────
   Creation lives here rather than in the browser for two reasons: it must
   happen the moment a document is read, and `entry_source` / `created_by` are
   provenance claims a client must not be able to forge. RLS grants no INSERT to
   `authenticated`, so this service-role path is the only way a record exists. */

/** Columns the browser is given back. No more than the officer's own case. */
const RECORD_COLUMNS = `
  id, record_date, traveller_name, passport_number, visa_number, nationality,
  client_source, sub_agent_id, agent_name_snapshot, assigned_staff_id,
  visa_company, planned_departure_date, expected_return_date,
  makkah_hotel_id, makkah_hotel_name, madinah_hotel_id, madinah_hotel_name,
  transport_package, transport_summary, arrival_port,
  record_status, entry_source, pilgrim_id, pilgrim_match_status,
  spreadsheet_sync_status, source_filename, source_mime_type,
  extracted_at, extraction_model, extraction_metadata,
  client_case_key, created_by, created_at, updated_by, updated_at
`;

type PersistOutcome =
  | { ok: true; record: Record<string, unknown>; reused: boolean }
  | { ok: false; code: string; message: string };

/**
 * Creates the record for a visa case, exactly once.
 *
 * Idempotent on `client_case_key`: if a record already exists for this case it
 * is returned untouched. That is the whole point — a retried extraction must
 * never reset a reviewed record to pending, overwrite a staff correction, or
 * duplicate the company's liability trail. Nothing here ever UPDATEs.
 */
/**
 * Writes the central Audit History entry for a newly created record.
 *
 * The actor is the staff member resolved from the verified JWT, never anything
 * the caller supplied. Best effort: a failed audit write must not undo a
 * created liability record, but it is logged loudly because a silent gap in the
 * audit trail is its own problem.
 *
 * Nothing sensitive is recorded — no document bytes, no base64, no provider
 * response, no API key. Only what the record already is.
 */
async function auditRecordCreated(
  record: Record<string, unknown>,
  actor: { id: string; name: string },
): Promise<void> {
  const { error } = await adminClient.from("audit_log").insert({
    action: "visa_contract_record_created",
    record_type: "visa_contract_record",
    record_id: record.id,
    record_label: (record.traveller_name as string | null) ||
      (record.source_filename as string | null) ||
      "Visa case",
    previous_value: null,
    new_value: {
      entry_source: record.entry_source,
      record_status: record.record_status,
      pilgrim_match_status: record.pilgrim_match_status,
      client_source: record.client_source,
      sub_agent_id: record.sub_agent_id,
      agent_name_snapshot: record.agent_name_snapshot,
      extraction_model: record.extraction_model,
      source_mime_type: record.source_mime_type,
    },
    performed_by: actor.id,
    performed_by_name: actor.name,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "visa_record_audit_failed",
        record_id: record.id,
        code: error.code ?? null,
      }),
    );
  }
}

async function persistRecord(args: {
  caseKey: string;
  details: OperationalDetails;
  entrySource: "GEMINI" | "MANUAL";
  fields: ExtractionFields | null;
  userId: string;
  userName: string;
  sourceFilename: string | null;
  sourceMimeType: string | null;
  extractedAt: string | null;
  persistedViaRetry: boolean;
}): Promise<PersistOutcome> {
  const existing = await adminClient
    .from("visa_contract_records")
    .select(RECORD_COLUMNS)
    .eq("client_case_key", args.caseKey)
    .maybeSingle();

  if (existing.data) {
    /* Idempotent hit. No audit entry: nothing happened, and a second
       "created" row would misreport the liability trail. */
    return { ok: true, record: existing.data, reused: true };
  }

  const { details, fields } = args;

  /* The machine's original claim, kept beside every later correction so a
     staff edit never erases what was actually read. */
  const extractionMetadata: Record<string, unknown> = {
    entry_source: args.entrySource,
    fields: Object.fromEntries(
      FIELD_KEYS.map((key) => [
        key,
        {
          ai_value: fields ? fields[key].value : null,
          ai_confidence: fields ? fields[key].confidence : null,
          edited: false,
          reviewed: false,
          reviewed_by: null,
          reviewed_by_name: null,
          reviewed_at: null,
        },
      ]),
    ),
  };
  if (args.persistedViaRetry) {
    /* Recorded because these values reached the database from the browser
       after a failed first write, not straight from the extractor. */
    extractionMetadata.persisted_via = "retry";
  }

  const insert = await adminClient
    .from("visa_contract_records")
    .insert({
      traveller_name: fields?.travellerName.value ?? null,
      passport_number: fields?.passportNumber.value ?? null,
      visa_number: fields?.visaNumber.value ?? null,
      nationality: fields?.nationality.value ?? null,

      client_source: details.clientSource,
      sub_agent_id: details.subAgentId,
      agent_name_snapshot: details.agentName,
      assigned_staff_id: details.assignedStaffId,

      visa_company: details.visaCompany,
      planned_departure_date: details.plannedDepartureDate,
      expected_return_date: details.expectedReturnDate,
      makkah_hotel_id: details.makkahHotelId,
      makkah_hotel_name: details.makkahHotelName,
      madinah_hotel_id: details.madinahHotelId,
      madinah_hotel_name: details.madinahHotelName,
      transport_package: details.transportPackage,
      transport_summary: details.transportSummary,
      arrival_port: details.arrivalPort,

      record_status: "PENDING_REVIEW",
      entry_source: args.entrySource,
      pilgrim_match_status: "PENDING_PILGRIM_MATCH",
      spreadsheet_sync_status: "NOT_SYNCED",

      source_filename: args.sourceFilename,
      source_mime_type: args.sourceMimeType,
      extracted_at: args.extractedAt,
      extraction_model: args.entrySource === "GEMINI" ? geminiModel : null,
      extraction_metadata: extractionMetadata,

      client_case_key: args.caseKey,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select(RECORD_COLUMNS)
    .single();

  if (insert.error) {
    /* 23505 — two requests for the same case raced. The other one won, which is
       the correct outcome; return its record rather than reporting a failure. */
    if (insert.error.code === "23505") {
      const raced = await adminClient
        .from("visa_contract_records")
        .select(RECORD_COLUMNS)
        .eq("client_case_key", args.caseKey)
        .maybeSingle();
      if (raced.data) return { ok: true, record: raced.data, reused: true };
    }
    /* 23514 — a CHECK failed, in practice the responsibility constraint. */
    if (insert.error.code === "23514") {
      return {
        ok: false,
        code: "invalid_details",
        message:
          "The responsibility details for this visa are inconsistent. Check the client source and agent.",
      };
    }
    /* 23503 — a referenced agent, hotel or staff member does not exist. */
    if (insert.error.code === "23503") {
      return {
        ok: false,
        code: "invalid_details",
        message:
          "One of the selected records no longer exists. Reload the page and re-select it.",
      };
    }
    return {
      ok: false,
      code: "not_persisted",
      message:
        "This Visa case is not yet saved to HajjERP. Retry saving.",
    };
  }

  await auditRecordCreated(insert.data, { id: args.userId, name: args.userName });
  return { ok: true, record: insert.data, reused: false };
}

/* ── Handler ──────────────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const started = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return fail("method_not_allowed", "Unsupported request.", 405, origin);
  }

  /* 1 ── Identity, resolved from the verified JWT and nothing else. No user_id
          is read from the body, so none can be spoofed. */
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return fail("unauthenticated", "Sign in to use AI extraction.", 401, origin);
  }

  const { data: userData, error: userError } = await adminClient.auth.getUser(
    token,
  );
  const user = userData?.user;
  if (userError || !user) {
    return fail(
      "unauthenticated",
      "Your session has expired. Sign in again.",
      401,
      origin,
    );
  }

  /* 2 ── The HajjERP profile must still be active. A suspended staff member
          holding a token that has not yet expired must not spend company
          quota. */
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("is_active, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return fail(
      "profile_unavailable",
      "Your account could not be verified. Try again.",
      503,
      origin,
    );
  }
  if (!profile || profile.is_active === false) {
    return fail(
      "account_inactive",
      "Your HajjERP account is not active.",
      403,
      origin,
    );
  }
  /* Operational roles only, matching `can_edit_operational_records()` in
     migration 019 and `canEditPilgrims` in the frontend. Viewers browse saved
     records; they do not create liability records. Kept as an allowlist rather
     than a viewer denylist so a role added later is refused by default. */
  if (!OPERATIONAL_ROLES.has(String(profile.role))) {
    return fail(
      "forbidden_role",
      "Your role does not include visa processing.",
      403,
      origin,
    );
  }

  /* The audit trail names a person, not a uuid. Taken from the profile the JWT
     resolved to — never from anything the caller sent. */
  const actorName = (profile.full_name as string | null) ?? "";

  /* 3 ── Body. The declared length is checked first, so an oversized payload is
          refused rather than buffered. */
  const declaredLength = Number(req.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return fail(
      "too_large",
      "The document is larger than 10 MB. Upload a smaller file.",
      413,
      origin,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", "No document was received.", 400, origin);
  }
  const body = (rawBody ?? {}) as Record<string, unknown>;

  /* ── Mode B: create the record without reading a document ──────────────────
     Two callers use this. A manual case, where the officer types the identity
     because extraction is unavailable. And a retry, where extraction already
     succeeded but the database write did not — the point of which is to save
     the values we already have WITHOUT spending another Gemini request. */
  if (body.mode === "persist_only") {
    const entrySource = body.entrySource === "GEMINI" ? "GEMINI" : "MANUAL";

    if (!isUuid(body.caseKey)) {
      return fail(
        "invalid_request",
        "This visa case could not be identified. Reload the page and try again.",
        400,
        origin,
      );
    }
    const details = validateDetails(body.details);
    if (!details.ok) {
      return fail(details.code, details.message, details.status, origin);
    }

    /* Retried values are re-normalised rather than trusted: the same rules that
       turn "N/A" and prose into null on the extraction path apply here too. */
    const fields = entrySource === "GEMINI" ? validateFields(body.fields) : null;

    const persisted = await persistRecord({
      caseKey: body.caseKey,
      details: details.details,
      entrySource,
      fields,
      userId: user.id,
      userName: actorName,
      sourceFilename: typeof body.sourceFilename === "string"
        ? body.sourceFilename.slice(0, 260)
        : null,
      sourceMimeType: typeof body.sourceMimeType === "string"
        ? body.sourceMimeType.slice(0, 100)
        : null,
      extractedAt: entrySource === "GEMINI" && typeof body.extractedAt === "string"
        ? body.extractedAt
        : null,
      persistedViaRetry: entrySource === "GEMINI",
    });

    console.log(
      JSON.stringify({
        event: "visa_record_persist",
        user_id: user.id,
        entry_source: entrySource,
        outcome: persisted.ok ? (persisted.reused ? "reused" : "created") : persisted.code,
        duration_ms: Date.now() - started,
      }),
    );

    if (!persisted.ok) {
      return fail(persisted.code, persisted.message, 503, origin);
    }
    return json({ record: persisted.record, reused: persisted.reused }, 200, origin);
  }

  /* ── Mode A: read a document, then create the record ─────────────────────── */

  /* Reported distinctly so a missing secret is distinguishable from an outage. */
  if (!geminiApiKey) {
    console.error(
      JSON.stringify({
        event: "visa_extract_misconfigured",
        detail: "GEMINI_API_KEY not set",
      }),
    );
    return fail(
      "not_configured",
      "AI extraction is not configured yet. Enter the Visa details manually.",
      503,
      origin,
    );
  }

  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return fail(validated.code, validated.message, validated.status, origin);
  }

  /* 4 ── Extraction. Unchanged from the proven implementation. */
  const outcome = await callGemini(validated.body);

  if (!outcome.ok) {
    console.log(
      JSON.stringify({
        event: "visa_extract",
        user_id: user.id,
        mime_type: validated.body.mimeType,
        bytes: validated.body.byteLength,
        model: geminiModel,
        outcome: outcome.code,
        provider_status: outcome.logStatus ?? null,
        duration_ms: Date.now() - started,
      }),
    );
    return fail(outcome.code, outcome.message, outcome.status, origin);
  }

  /* 5 ── The liability record, created immediately.
          A database failure here does NOT discard the extraction: the officer
          gets the values back with `record: null` and a retry that writes only
          the row. Losing a good read — and a paid request — because a write
          failed would be the worse outcome. What must never happen is the
          system implying responsibility tracking has begun when it has not, and
          `record: null` is how the frontend knows it has not. */
  const extractedAt = new Date().toISOString();
  const persisted = await persistRecord({
    caseKey: validated.body.caseKey,
    details: validated.body.details,
    entrySource: "GEMINI",
    fields: outcome.fields,
    userId: user.id,
    userName: actorName,
    sourceFilename: validated.body.sourceFilename,
    sourceMimeType: validated.body.mimeType,
    extractedAt,
    persistedViaRetry: false,
  });

  /* 6 ── Logging: codes, sizes and timings only.
          Never the document, never the base64, never the extracted identity,
          never the API key, never the provider's response body. */
  console.log(
    JSON.stringify({
      event: "visa_extract",
      user_id: user.id,
      mime_type: validated.body.mimeType,
      bytes: validated.body.byteLength,
      model: geminiModel,
      outcome: "ok",
      provider_status: 200,
      persistence: persisted.ok ? (persisted.reused ? "reused" : "created") : persisted.code,
      duration_ms: Date.now() - started,
    }),
  );

  return json(
    {
      fields: outcome.fields,
      model: geminiModel,
      extractedAt,
      record: persisted.ok ? persisted.record : null,
      reused: persisted.ok ? persisted.reused : false,
      persistenceError: persisted.ok
        ? null
        : { code: persisted.code, message: persisted.message },
    },
    200,
    origin,
  );
});

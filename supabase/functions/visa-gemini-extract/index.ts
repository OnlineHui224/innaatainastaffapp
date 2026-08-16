import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  type ExtractionFields,
  type ValidBody,
  isEmptyExtraction,
  MAX_BODY_BYTES,
  validateBody,
  validateFields,
} from "./validation.ts";

/**
 * VISA IDENTITY EXTRACTION — server-side Gemini
 * =============================================
 *
 * Reads an uploaded visa document and returns four identity values for a staff
 * member to review. This is the ONLY place a Gemini call is made: the browser
 * never talks to Google, and never sees the company API key.
 *
 * WHAT THIS FUNCTION DOES NOT DO
 * ------------------------------
 *   - It writes nothing. Not to `pilgrims`, not anywhere. It is a pure
 *     read-and-return, so a bad extraction cannot corrupt a record.
 *   - It does not store the document. One request, one response, discarded —
 *     no Supabase Storage, no Gemini Files API, no database row.
 *   - It does not decide anything. Every value it returns is unreviewed, and
 *     the existing per-field human review remains the only path to a save.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * It never invents an identifier. A passport or visa number that cannot be read
 * confidently comes back `null`, because a plausible-looking fabricated passport
 * number in an operational record is far worse than a blank one an officer has
 * to type.
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
    .select("is_active, role")
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
  /* Viewers browse saved records; they do not process documents. Mirrors the
     read-only Visa Logger the frontend already gives them. */
  if (profile.role === "viewer") {
    return fail(
      "forbidden_role",
      "Your role does not include visa processing.",
      403,
      origin,
    );
  }

  /* 3 ── Configuration, reported distinctly so a missing secret is
          distinguishable from a Google outage. */
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

  /* 4 ── Document. The declared length is checked before the body is read, so
          an oversized payload is refused rather than buffered. */
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

  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return fail(validated.code, validated.message, validated.status, origin);
  }

  /* 5 ── Extraction. */
  const outcome = await callGemini(validated.body);

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
      outcome: outcome.ok ? "ok" : outcome.code,
      provider_status: outcome.ok ? 200 : outcome.logStatus ?? null,
      duration_ms: Date.now() - started,
    }),
  );

  if (!outcome.ok) {
    return fail(outcome.code, outcome.message, outcome.status, origin);
  }

  return json(
    {
      fields: outcome.fields,
      model: geminiModel,
      extractedAt: new Date().toISOString(),
    },
    200,
    origin,
  );
});

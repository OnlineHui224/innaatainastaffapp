/**
 * VISA EXTRACTION — pure validation
 * =================================
 *
 * Everything here is a pure function of its input: no network, no environment,
 * no Deno.serve. That is deliberate — these are the rules that decide whether a
 * fabricated passport number reaches an operational record, so they are kept
 * where they can be exercised directly by `validation.test.ts`.
 */

export type Confidence = "high" | "medium" | "low";

export interface ExtractedValue {
  value: string | null;
  confidence: Confidence;
}

export interface ExtractionFields {
  travellerName: ExtractedValue;
  passportNumber: ExtractedValue;
  visaNumber: ExtractedValue;
  nationality: ExtractedValue;
}

export const FIELD_KEYS = [
  "travellerName",
  "passportNumber",
  "visaNumber",
  "nationality",
] as const;

/* ── Limits. Mirrors UploadVisaCard so browser and server agree, but these are
      the ones that count — browser validation is a courtesy to the user, not a
      security control. ─────────────────────────────────────────────────────── */
export const MAX_BYTES = 10 * 1024 * 1024;
/** Base64 inflates by 4/3; the JSON envelope adds a little more. */
export const MAX_BODY_BYTES = Math.ceil(MAX_BYTES * 1.4);

export const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

/** Browsers occasionally report this non-standard type for .jpg files, and
    UploadVisaCard accepts it. Normalise rather than reject the officer's file. */
const MIME_ALIASES: Record<string, string> = { "image/jpg": "image/jpeg" };

/** Longest plausible value for any of the four fields. Guards against a model
    returning a paragraph where an identifier belongs. */
export const MAX_FIELD_LENGTH = 120;

/* ── What came back from the model ────────────────────────────────────────────
   A response schema constrains shape, not truth. These checks catch the failure
   modes a schema cannot: a model writing "N/A" into a string field, padding an
   answer with prose, or claiming high confidence on an empty value. */

/** Placeholder strings a model reaches for instead of admitting it cannot read
    a field. Every one of them means null here. */
const NULL_EQUIVALENTS = new Set([
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "not visible",
  "not available",
  "not legible",
  "not found",
  "illegible",
  "-",
  "--",
  "",
]);

export function normaliseValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (NULL_EQUIVALENTS.has(trimmed.toLowerCase())) return null;
  /* Over-long means the model wrote prose, not an identifier. Dropping it to
     null is safer than surfacing a paragraph as a passport number. */
  if (trimmed.length > MAX_FIELD_LENGTH) return null;
  return trimmed;
}

export function normaliseConfidence(raw: unknown, hasValue: boolean): Confidence {
  if (!hasValue) return "low";
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  /* Unrecognised confidence becomes the weakest, never the strongest — the
     officer should be nudged to look harder, not less hard. */
  return "low";
}

export function validateFields(parsed: unknown): ExtractionFields | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const source = parsed as Record<string, unknown>;

  const out = {} as ExtractionFields;
  for (const key of FIELD_KEYS) {
    const entry = source[key];
    const raw = entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : {};
    const value = normaliseValue(raw.value);
    out[key] = {
      value,
      confidence: normaliseConfidence(raw.confidence, value !== null),
    };
  }
  return out;
}

/** True when the model returned nothing usable at all. */
export function isEmptyExtraction(fields: ExtractionFields): boolean {
  return FIELD_KEYS.every((key) => fields[key].value === null);
}

/* ── The request body ─────────────────────────────────────────────────────── */

export interface ValidBody {
  mimeType: string;
  dataBase64: string;
  byteLength: number;
}

export type BodyResult =
  | { ok: true; body: ValidBody }
  | { ok: false; code: string; message: string; status: number };

/** Byte length of base64 without allocating the decoded buffer. */
export function base64ByteLength(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export function validateBody(raw: unknown): BodyResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "No document was received.",
      status: 400,
    };
  }
  const body = raw as Record<string, unknown>;

  const declared = typeof body.mimeType === "string"
    ? body.mimeType.toLowerCase().trim()
    : "";
  const mimeType = MIME_ALIASES[declared] ?? declared;
  if (!ACCEPTED_MIME.has(mimeType)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "Only PDF, JPG and PNG visa documents can be read.",
      status: 415,
    };
  }

  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  if (!dataBase64) {
    return {
      ok: false,
      code: "invalid_request",
      message: "No document was received.",
      status: 400,
    };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "The document could not be read. Try uploading it again.",
      status: 400,
    };
  }

  const byteLength = base64ByteLength(dataBase64);
  if (byteLength > MAX_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: "The document is larger than 10 MB. Upload a smaller file.",
      status: 413,
    };
  }

  return { ok: true, body: { mimeType, dataBase64, byteLength } };
}

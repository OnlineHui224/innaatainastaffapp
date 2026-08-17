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

/**
 * The Step 1 operational details that accompany a document.
 *
 * These become the responsibility half of the liability record, so they are
 * validated as strictly as the document itself. Note what is absent: no
 * `userId` and no `createdBy`. The actor comes from the verified JWT.
 */
export interface OperationalDetails {
  clientSource: "direct" | "sub_agent";
  subAgentId: string | null;
  agentName: string;
  assignedStaffId: string | null;
  visaCompany: string | null;
  plannedDepartureDate: string | null;
  expectedReturnDate: string | null;
  makkahHotelId: string | null;
  makkahHotelName: string | null;
  madinahHotelId: string | null;
  madinahHotelName: string | null;
  transportPackage: string | null;
  transportSummary: string | null;
  arrivalPort: string | null;
}

export interface ValidBody {
  mimeType: string;
  dataBase64: string;
  byteLength: number;
  caseKey: string;
  details: OperationalDetails;
  sourceFilename: string | null;
}

export type BodyResult =
  | { ok: true; body: ValidBody }
  | { ok: false; code: string; message: string; status: number };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TRANSPORT_PACKAGES = new Set([
  "airport_transfers",
  "full_route",
  "no_transport",
]);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Trimmed string, or null. Bounded so a free-text field cannot carry a payload. */
function text(raw: unknown, max = 200): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isoDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw.trim())) return null;
  const value = raw.trim();
  /* Rejects 2026-02-31 and similar, which the regex alone would accept. */
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export type DetailsResult =
  | { ok: true; details: OperationalDetails }
  | { ok: false; code: string; message: string; status: number };

export function validateDetails(raw: unknown): DetailsResult {
  const reject = (message: string): DetailsResult => ({
    ok: false,
    code: "invalid_details",
    message,
    status: 400,
  });

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reject("The operational details for this visa are missing.");
  }
  const d = raw as Record<string, unknown>;

  const clientSource = d.clientSource === "direct" ? "direct" : "sub_agent";
  const subAgentId = isUuid(d.subAgentId) ? d.subAgentId : null;

  /* Mirrors the database CHECK constraint, so a contradictory record is
     refused with a readable message rather than a constraint violation. */
  if (clientSource === "sub_agent" && !subAgentId) {
    return reject("Select the responsible agent, or record this as a direct client.");
  }
  if (clientSource === "direct" && subAgentId) {
    return reject("A direct client cannot also carry a responsible agent.");
  }

  const transportPackage = text(d.transportPackage, 40);
  if (transportPackage && !TRANSPORT_PACKAGES.has(transportPackage)) {
    return reject("Unrecognised transportation package.");
  }

  return {
    ok: true,
    details: {
      clientSource,
      subAgentId,
      agentName: text(d.agentName, 200) ?? "",
      assignedStaffId: isUuid(d.assignedStaffId) ? d.assignedStaffId : null,
      visaCompany: text(d.visaCompany),
      plannedDepartureDate: isoDate(d.plannedDepartureDate),
      expectedReturnDate: isoDate(d.expectedReturnDate),
      makkahHotelId: isUuid(d.makkahHotelId) ? d.makkahHotelId : null,
      makkahHotelName: text(d.makkahHotelName),
      madinahHotelId: isUuid(d.madinahHotelId) ? d.madinahHotelId : null,
      madinahHotelName: text(d.madinahHotelName),
      transportPackage,
      transportSummary: text(d.transportSummary, 400),
      arrivalPort: text(d.arrivalPort, 120),
    },
  };
}

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

  /* The case key is what makes a repeated extraction safe: it identifies the
     visa case, so a retry updates one liability record instead of minting a
     second one. */
  if (!isUuid(body.caseKey)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "This visa case could not be identified. Reload the page and try again.",
      status: 400,
    };
  }

  const details = validateDetails(body.details);
  if (!details.ok) return details;

  return {
    ok: true,
    body: {
      mimeType,
      dataBase64,
      byteLength,
      caseKey: body.caseKey,
      details: details.details,
      sourceFilename: text(body.sourceFilename, 260),
    },
  };
}

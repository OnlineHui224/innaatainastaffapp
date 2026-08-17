import { supabase } from '@/lib/supabase';
import type { VisaContractRecord } from '@/types/visaContract';

/**
 * VISA IDENTITY EXTRACTION — browser client
 * =========================================
 *
 * Sends an uploaded visa document to the `visa-gemini-extract` Edge Function and
 * returns the four identity values it read.
 *
 * The browser never talks to Gemini and never holds the company API key. This
 * module knows one URL — our own function — and the staff member's Supabase
 * session is what authorises the call.
 *
 * Nothing here decides anything. Values come back unreviewed, and the existing
 * per-field review in the Visa Logger remains the only route to a saved record.
 */

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractedValue {
  /** `null` whenever the document could not be read confidently. Never invented. */
  value: string | null;
  confidence: ExtractionConfidence;
}

export interface VisaExtractionFields {
  travellerName: ExtractedValue;
  passportNumber: ExtractedValue;
  visaNumber: ExtractedValue;
  nationality: ExtractedValue;
}

export interface VisaExtractionResponse {
  fields: VisaExtractionFields;
  /** Server-chosen model. Recorded for provenance; the browser never picks it. */
  model: string;
  extractedAt: string;
  /**
   * The liability record created for this case.
   *
   * `null` means extraction succeeded but the database write did not. The
   * values are still usable and must not be thrown away — a paid read is not
   * worth discarding — but responsibility tracking has NOT begun, and the
   * caller must say so rather than imply otherwise.
   */
  record: VisaContractRecord | null;
  /** True when this case already had a record; nothing was overwritten. */
  reused: boolean;
  persistenceError: { code: string; message: string } | null;
}

/**
 * The Step 1 operational details sent with the document.
 *
 * These become the responsibility half of the record. No user id is included —
 * the server takes the actor from the verified session.
 */
export interface VisaCaseSubmission {
  clientSource: 'direct' | 'sub_agent';
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

/**
 * A failure the officer can act on.
 *
 * `code` lets the caller branch (quota exhausted reads differently from an
 * unreadable scan); `message` is already written for a person to read, so a
 * caller can surface it directly.
 */
export class VisaExtractionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VisaExtractionError';
    this.code = code;
  }
}

const GENERIC_FAILURE =
  'AI extraction could not be completed. Enter the Visa details manually or try again.';

/**
 * Reads a File into base64 without the document ever touching a string built by
 * hand — `readAsDataURL` handles chunking, so a 10 MB PDF cannot blow the stack.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new VisaExtractionError('read_failed', 'The file could not be read from your device.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new VisaExtractionError('read_failed', 'The file could not be read from your device.'));
        return;
      }
      /* Strip the `data:<mime>;base64,` prefix — the server wants the payload. */
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Pulls our `{ error: { code, message } }` envelope out of a failed invoke. */
async function readError(error: unknown): Promise<VisaExtractionError> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = (await context.json()) as {
          error?: { code?: string; message?: string };
        };
        if (body?.error?.message) {
          return new VisaExtractionError(body.error.code ?? 'unknown', body.error.message);
        }
      } catch {
        /* Not JSON — fall through to the generic message rather than surfacing
           a raw response body to an officer. */
      }
    }
  }
  return new VisaExtractionError('unknown', GENERIC_FAILURE);
}

function isExtractedValue(raw: unknown): raw is ExtractedValue {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Record<string, unknown>;
  const valueOk = candidate.value === null || typeof candidate.value === 'string';
  const confidenceOk =
    candidate.confidence === 'high' ||
    candidate.confidence === 'medium' ||
    candidate.confidence === 'low';
  return valueOk && confidenceOk;
}

/**
 * The server already validates its own response, so this is a contract check
 * rather than a safety net — it stops a deployment mismatch from quietly
 * putting `undefined` into the review screen.
 */
function isValidResponse(raw: unknown): raw is VisaExtractionResponse {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Record<string, unknown>;
  const fields = candidate.fields;
  if (!fields || typeof fields !== 'object') return false;
  const f = fields as Record<string, unknown>;
  return (
    isExtractedValue(f.travellerName) &&
    isExtractedValue(f.passportNumber) &&
    isExtractedValue(f.visaNumber) &&
    isExtractedValue(f.nationality)
  );
}

/** Every call needs the session token; one place to fail if it has gone. */
async function requireToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new VisaExtractionError(
      'unauthenticated',
      'Your session has expired. Sign in again to continue.',
    );
  }
  return session.access_token;
}

/**
 * Extracts visa identity from an uploaded document and creates the liability
 * record for the case in the same server-side operation.
 *
 * `caseKey` identifies the visa case, not the request. Sending the same key
 * twice returns the existing record untouched rather than creating a second
 * one — so a retried extraction can never duplicate the company's exposure,
 * reset a reviewed record, or overwrite a staff correction.
 *
 * Throws {@link VisaExtractionError} for every failure, so a caller has one
 * thing to catch and always has a message worth showing.
 */
export async function extractVisaIdentity(
  file: File,
  caseKey: string,
  details: VisaCaseSubmission,
): Promise<VisaExtractionResponse> {
  const token = await requireToken();
  const dataBase64 = await fileToBase64(file);

  const { data, error } = await supabase.functions.invoke('visa-gemini-extract', {
    body: {
      mimeType: file.type,
      dataBase64,
      caseKey,
      details,
      sourceFilename: file.name,
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw await readError(error);

  if (!isValidResponse(data)) {
    throw new VisaExtractionError(
      'malformed_response',
      'The extraction result could not be understood. Enter the Visa details manually.',
    );
  }

  return data;
}

/**
 * Creates the record without reading a document.
 *
 * Two callers. A manual case, where the officer types the identity because
 * extraction was unavailable — recorded as `MANUAL`, never dressed up as an
 * extraction. And a retry, where extraction already succeeded but the write did
 * not; that path deliberately does NOT call Gemini again, so a paid read is not
 * spent twice.
 */
export async function persistVisaRecord(args: {
  caseKey: string;
  details: VisaCaseSubmission;
  entrySource: 'GEMINI' | 'MANUAL';
  /** Required for a GEMINI retry: the values the earlier read produced. */
  fields?: VisaExtractionFields;
  extractedAt?: string;
  sourceFilename?: string | null;
  sourceMimeType?: string | null;
}): Promise<{ record: VisaContractRecord; reused: boolean }> {
  const token = await requireToken();

  const { data, error } = await supabase.functions.invoke('visa-gemini-extract', {
    body: { mode: 'persist_only', ...args },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw await readError(error);

  const record = (data as { record?: VisaContractRecord } | null)?.record;
  if (!record?.id) {
    throw new VisaExtractionError(
      'not_persisted',
      'This Visa case is not yet saved to HajjERP. Retry saving.',
    );
  }
  return { record, reused: Boolean((data as { reused?: boolean }).reused) };
}

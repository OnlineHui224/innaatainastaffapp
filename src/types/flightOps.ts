/**
 * FLIGHT DOCUMENT OPS — UI VIEW MODEL
 * ==================================
 *
 * THIS IS A PRESENTATION MODEL, NOT A BACKEND CONTRACT.
 *
 * It exists so the Flight Document Ops screens can accurately represent the
 * *proven* operational workflow — the one the standalone extractor already runs
 * in production — while the permanent domain model stays untouched.
 *
 * The permanent flight domain model lives in `@/types/flight` (`FlightPassenger`,
 * `FlightSegment`, `FlightItineraryData`, …). It is richer than this one, it is
 * already referenced by the `generate-itinerary` Edge Function and the
 * `flight_itineraries` table, and it is deliberately NOT modified, renamed or
 * replaced by this file.
 *
 * The two models will be reconciled during the later backend integration phase.
 * Until then:
 *
 *   - Nothing here is persisted.
 *   - Nothing here is sent to an API.
 *   - Nothing here should be treated as the permanent shape of a flight record.
 *
 * The shape below mirrors the fields the working extractor actually returns:
 * passenger_name, adults, children, pnr, primary_carrier, flights[], ai_confidence —
 * with each leg carrying departure/arrival city, date, times, carrier and flight
 * number.
 */

// ── Source documents ──

/** PDF, JPG and PNG — the formats the proven workflow accepts. */
export const ACCEPTED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
export const ACCEPTED_DOCUMENT_LABEL = 'PDF, JPG or PNG';
export const MAX_DOCUMENT_SIZE_MB = 10;
export const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

export type DocumentStatus = 'ready' | 'unsupported' | 'too_large' | 'failed';

export interface SourceDocument {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  status: DocumentStatus;
  /** Why the document cannot be used. Present only for non-`ready` states. */
  message?: string;
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  ready: 'Ready',
  unsupported: 'Unsupported format',
  too_large: 'Too large',
  failed: 'Could not be read',
};

/**
 * Classifies a picked file against the accepted formats and size ceiling.
 * Pure — it inspects metadata only and never reads the file's contents.
 */
export function classifyDocument(file: File, id: string): SourceDocument {
  const base = { id, name: file.name, sizeBytes: file.size, mimeType: file.type };

  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
    return { ...base, status: 'unsupported', message: `Only ${ACCEPTED_DOCUMENT_LABEL} files can be read.` };
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return { ...base, status: 'too_large', message: `Maximum size is ${MAX_DOCUMENT_SIZE_MB} MB.` };
  }
  return { ...base, status: 'ready' };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Staff review marks ──

/**
 * How far a displayed value has travelled from a machine guess.
 *
 * This follows the same principle the Visa & Contract Logger already enforces:
 * TYPING IS NOT REVIEWING. Editing a value returns it to `ai_extracted`; only an
 * explicit staff action promotes it to `staff_reviewed`.
 */
export type ReviewMark = 'ai_extracted' | 'staff_reviewed';

export const REVIEW_MARK_LABELS: Record<ReviewMark, string> = {
  ai_extracted: 'AI Extracted',
  staff_reviewed: 'Staff Reviewed',
};

export interface ReviewState {
  mark: ReviewMark;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /** True once staff have changed any value the extractor produced. */
  edited: boolean;
}

export function unreviewed(): ReviewState {
  return { mark: 'ai_extracted', reviewedAt: null, reviewedByName: null, edited: false };
}

/**
 * Records an edit. The review mark is cleared — changing a value is not the
 * same as reviewing it. This is the ONLY behaviour an edit may have.
 */
export function markEdited(state: ReviewState): ReviewState {
  return { ...state, mark: 'ai_extracted', reviewedAt: null, reviewedByName: null, edited: true };
}

/** Promotes to Staff Reviewed. This is the ONLY path to `staff_reviewed`. */
export function markReviewed(state: ReviewState, officerName: string, now: string): ReviewState {
  return { ...state, mark: 'staff_reviewed', reviewedAt: now, reviewedByName: officerName };
}

/** Clears a review without changing any value. */
export function clearReview(state: ReviewState): ReviewState {
  return { ...state, mark: 'ai_extracted', reviewedAt: null, reviewedByName: null };
}

// ── Journey ──

/** One flight sector, carrying exactly the fields the proven extractor returns. */
export interface FlightLegView {
  id: string;
  departureCity: string;
  departureAirport: string;
  arrivalCity: string;
  arrivalAirport: string;
  /** As extracted, e.g. "23 JUL". Not normalised here. */
  date: string;
  departureTime: string;
  arrivalTime: string;
  carrier: string;
  flightNumber: string;
  review: ReviewState;
}

/** The fields of a leg an officer may correct on the review screen. */
export type FlightLegField =
  | 'departureCity'
  | 'departureAirport'
  | 'arrivalCity'
  | 'arrivalAirport'
  | 'date'
  | 'departureTime'
  | 'arrivalTime'
  | 'carrier'
  | 'flightNumber';

export interface JourneySummaryView {
  passengerName: string;
  pnr: string;
  primaryCarrier: string;
  adults: number;
  children: number;
  review: ReviewState;
}

export type SummaryField = 'passengerName' | 'pnr' | 'primaryCarrier' | 'adults' | 'children';

export interface JourneyView {
  summary: JourneySummaryView;
  legs: FlightLegView[];
  /** Extractor's own 0–1 confidence for the whole trip, when it reports one. */
  aiConfidence: number | null;
  extractedAt: string;
  sourceFileNames: string[];
}

export function totalPax(summary: JourneySummaryView): number {
  return summary.adults + summary.children;
}

export function emptyJourney(): JourneyView {
  return {
    summary: {
      passengerName: '',
      pnr: '',
      primaryCarrier: '',
      adults: 0,
      children: 0,
      review: unreviewed(),
    },
    legs: [],
    aiConfidence: null,
    extractedAt: '',
    sourceFileNames: [],
  };
}

/** True when every sector and the journey summary carry an explicit staff review. */
export function allReviewed(journey: JourneyView): boolean {
  if (journey.legs.length === 0) return false;
  return (
    journey.summary.review.mark === 'staff_reviewed' &&
    journey.legs.every((leg) => leg.review.mark === 'staff_reviewed')
  );
}

export function countReviewed(journey: JourneyView): number {
  return (
    (journey.summary.review.mark === 'staff_reviewed' ? 1 : 0) +
    journey.legs.filter((leg) => leg.review.mark === 'staff_reviewed').length
  );
}

/** Total number of things requiring an explicit review: the summary plus each sector. */
export function reviewableCount(journey: JourneyView): number {
  return 1 + journey.legs.length;
}

/**
 * Sectors missing a field the itinerary document needs.
 *
 * Reported to staff as something to correct — never silently defaulted, because
 * a blank cell in the generated itinerary is an operational failure.
 */
export function legsMissingFields(journey: JourneyView): Array<{ index: number; missing: string[] }> {
  const REQUIRED: Array<[FlightLegField, string]> = [
    ['departureCity', 'From'],
    ['arrivalCity', 'To'],
    ['date', 'Date'],
    ['departureTime', 'Departure'],
    ['arrivalTime', 'Arrival'],
    ['carrier', 'Carrier'],
    ['flightNumber', 'Flight number'],
  ];

  return journey.legs
    .map((leg, index) => ({
      index,
      missing: REQUIRED.filter(([key]) => !String(leg[key] ?? '').trim()).map(([, label]) => label),
    }))
    .filter((entry) => entry.missing.length > 0);
}

// ── Trip details ──

/**
 * The operational details staff add to an extracted journey.
 *
 * Group name is optional in the proven workflow; the hotels come from the
 * existing HajjERP hotel reference search.
 */
export interface TripDetailsView {
  groupName: string;
  makkahHotelId: string | null;
  makkahHotelName: string;
  madinahHotelId: string | null;
  madinahHotelName: string;
}

export function emptyTripDetails(): TripDetailsView {
  return {
    groupName: '',
    makkahHotelId: null,
    makkahHotelName: '',
    madinahHotelId: null,
    madinahHotelName: '',
  };
}

/**
 * Filename the proven generator produces: group name when given, otherwise the
 * passenger name; non-alphanumerics dropped, spaces become underscores.
 * Mirrored here so the confirmation and success screens can show staff the real
 * name in advance. It does not generate the document.
 */
export function projectedFileName(details: TripDetailsView, summary: JourneySummaryView): string {
  const source = details.groupName.trim() || summary.passengerName.trim();
  const safe = Array.from(source)
    .filter((char) => /[a-zA-Z0-9\s]/.test(char))
    .join('')
    .trim();
  return `${(safe || 'Travel').replace(/\s+/g, '_')}_Itinerary.docx`;
}

// ── Workflow ──

export type FlightOpsStep = 'upload' | 'review' | 'trip_details' | 'confirm' | 'generate' | 'download';

export const FLIGHT_OPS_STEPS: FlightOpsStep[] = [
  'upload',
  'review',
  'trip_details',
  'confirm',
  'generate',
  'download',
];

export const FLIGHT_OPS_STEP_LABELS: Record<FlightOpsStep, string> = {
  upload: 'Upload Documents',
  review: 'Review Extraction',
  trip_details: 'Trip Details',
  confirm: 'Confirm',
  generate: 'Generate',
  download: 'Download',
};

/** Compact labels for narrow viewports, where the full label would wrap badly. */
export const FLIGHT_OPS_STEP_SHORT_LABELS: Record<FlightOpsStep, string> = {
  upload: 'Upload',
  review: 'Review',
  trip_details: 'Trip',
  confirm: 'Confirm',
  generate: 'Generate',
  download: 'Download',
};

// ── Extraction progress ──

/**
 * Named stages, not a percentage.
 *
 * The extractor reports no progress figure, so the interface shows which stage
 * is running rather than inventing a completion percentage.
 */
export type ExtractionStage = 'reading' | 'passenger' | 'sectors' | 'sequence' | 'preparing';

export const EXTRACTION_STAGES: ExtractionStage[] = [
  'reading',
  'passenger',
  'sectors',
  'sequence',
  'preparing',
];

export const EXTRACTION_STAGE_LABELS: Record<ExtractionStage, string> = {
  reading: 'Reading travel documents',
  passenger: 'Extracting passenger information',
  sectors: 'Extracting flight sectors',
  sequence: 'Checking journey sequence',
  preparing: 'Preparing review',
};

// ── Generation progress ──

export type GenerationStage = 'preparing' | 'schedule' | 'accommodation' | 'formatting' | 'finalising';

export const GENERATION_STAGES: GenerationStage[] = [
  'preparing',
  'schedule',
  'accommodation',
  'formatting',
  'finalising',
];

export const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  preparing: 'Preparing itinerary',
  schedule: 'Building flight schedule',
  accommodation: 'Adding accommodation information',
  formatting: 'Formatting document',
  finalising: 'Finalising Word document',
};

// ── Failures ──

/**
 * The operational failures staff can actually hit. Each maps to a title, a
 * plain-language explanation and a next step — never a raw API response.
 */
export type FlightOpsFailure =
  | 'no_document'
  | 'unsupported_document'
  | 'extraction_failed'
  | 'partial_extraction'
  | 'missing_flight_fields'
  | 'ambiguous_journey'
  | 'generation_failed'
  | 'network_interrupted';

export interface FailureCopy {
  title: string;
  detail: string;
  /** What staff can do next. Never blank — an error without a next step is a dead end. */
  nextStep: string;
  tone: 'warning' | 'critical';
}

export const FLIGHT_FAILURE_COPY: Record<FlightOpsFailure, FailureCopy> = {
  no_document: {
    title: 'No travel document added',
    detail: 'At least one ticket document is needed before travel information can be extracted.',
    nextStep: `Add a ${ACCEPTED_DOCUMENT_LABEL} file to continue.`,
    tone: 'warning',
  },
  unsupported_document: {
    title: 'Some files cannot be read',
    detail: `Only ${ACCEPTED_DOCUMENT_LABEL} files up to ${MAX_DOCUMENT_SIZE_MB} MB can be processed.`,
    nextStep: 'Remove the files marked below, or replace them with a supported format.',
    tone: 'warning',
  },
  extraction_failed: {
    title: 'Travel information could not be extracted',
    detail: 'The documents were received but no journey could be read from them.',
    nextStep: 'Try again, or return to the uploads and check the documents are legible.',
    tone: 'critical',
  },
  partial_extraction: {
    title: 'Some documents could not be read',
    detail: 'A journey was extracted, but not every uploaded document contributed to it.',
    nextStep: 'Review the sectors below carefully, or return to the uploads and retry the failed files.',
    tone: 'warning',
  },
  missing_flight_fields: {
    title: 'Some sectors are incomplete',
    detail: 'One or more flight sectors are missing information the itinerary document needs.',
    nextStep: 'Complete the highlighted fields before continuing.',
    tone: 'warning',
  },
  ambiguous_journey: {
    title: 'Journey sequence needs checking',
    detail: 'The flight sectors do not read as one continuous journey in date order.',
    nextStep: 'Check the sector dates and correct any that are out of sequence.',
    tone: 'warning',
  },
  generation_failed: {
    title: 'The itinerary could not be generated',
    detail: 'The document was not produced. Nothing has been saved and no information was lost.',
    nextStep: 'Try generating again, or go back and check the trip details.',
    tone: 'critical',
  },
  network_interrupted: {
    title: 'Connection interrupted',
    detail: 'The connection dropped part-way through. The step did not complete.',
    nextStep: 'Check your connection and try again — your uploads and corrections are still here.',
    tone: 'critical',
  },
};

/**
 * Detects sectors that are out of chronological order.
 *
 * Only reports when dates are genuinely comparable, so an unusual but valid date
 * format never produces a false warning. Returns the indices that break sequence.
 */
export function outOfSequenceLegs(legs: FlightLegView[]): number[] {
  const parsed = legs.map((leg) => {
    const value = Date.parse(leg.date);
    return Number.isNaN(value) ? null : value;
  });

  if (parsed.some((value) => value === null)) return [];

  const broken: number[] = [];
  for (let i = 1; i < parsed.length; i += 1) {
    if ((parsed[i] as number) < (parsed[i - 1] as number)) broken.push(i);
  }
  return broken;
}

/**
 * FLIGHT DOCUMENT OPS — UI VIEW MODEL
 * ==================================
 *
 * THIS IS A PRESENTATION MODEL, NOT A BACKEND CONTRACT.
 *
 * It exists so the Flight Document Ops screens can represent the *proven*
 * operational workflow while the permanent domain model stays untouched.
 *
 * The permanent flight domain model lives in `@/types/flight` (`FlightPassenger`,
 * `FlightSegment`, `FlightItineraryData`, …). It is richer than this one, it is
 * already referenced by the `generate-itinerary` Edge Function and the
 * `flight_itineraries` table, and it is deliberately NOT modified, renamed or
 * replaced by this file. The two are reconciled in the later backend phase.
 *
 * Until then: nothing here is persisted, and nothing here is sent to an API.
 *
 * The shape mirrors what the working extractor returns — passenger_name, adults,
 * children, pnr, primary_carrier, flights[], ai_confidence — with each leg
 * carrying departure/arrival airport and city, date, times, carrier and flight
 * number.
 */

// ── Source documents ──

export const ACCEPTED_DOCUMENT_EXTENSIONS = ['PDF', 'JPG', 'JPEG', 'PNG'];
export const ACCEPTED_DOCUMENT_LABEL = 'PDF, JPG or PNG';

export interface SourceDocument {
  id: string;
  name: string;
  bytes: number;
  ext: string;
}

export function extensionOf(name: string): string {
  const parts = String(name).split('.');
  return (parts.length > 1 ? parts[parts.length - 1] : '?').toUpperCase();
}

export function isReadableExtension(ext: string): boolean {
  return ACCEPTED_DOCUMENT_EXTENSIONS.includes(ext.toUpperCase());
}

export function formatBytes(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/** "Document" for PDFs, "Image" for photographs, "Unreadable" for anything else. */
export function documentKind(ext: string): string {
  if (!isReadableExtension(ext)) return 'Unreadable';
  return ext.toUpperCase() === 'PDF' ? 'Document' : 'Image';
}

// ── Time handling ──

/**
 * Which clock the source ticket printed.
 *
 * Times are stored canonically as `HH:MM` and rendered back in the format the
 * ticket itself used. The itinerary reproduces the ticket's own format — a time
 * is NEVER silently converted between 12- and 24-hour.
 */
export type TimeFormat = '12h' | '24h';

export function minutesOf(time: string): number {
  const [h, m] = String(time).split(':');
  return Number(h) * 60 + Number(m);
}

/** Renders a stored `HH:MM` in the format the source ticket used. */
export function showTime(time: string, format: TimeFormat): string {
  if (!time) return '';
  if (format !== '12h') return String(time);
  const [h, m] = String(time).split(':');
  const hour = Number(h);
  return `${hour % 12 || 12}:${m || '00'} ${hour < 12 ? 'am' : 'pm'}`;
}

export function timeFormatNote(format: TimeFormat): string {
  return format === '12h'
    ? 'Times as printed on ticket · 12-hour'
    : 'Times as printed on ticket · 24-hour';
}

/** Human duration, e.g. "6h 55m". */
export function humanDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '—';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

export function formatSectorDate(iso: string): string {
  if (!iso) return 'Date missing';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][date.getMonth()];
  return `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}`;
}

// ── Journey ──

export interface FlightSector {
  id: string;
  /** Departure airport code, e.g. "KAN". */
  dep: string;
  depCity: string;
  /** Arrival airport code, e.g. "JED". */
  arr: string;
  arrCity: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Canonical `HH:MM`. */
  depT: string;
  /** Canonical `HH:MM`. */
  arrT: string;
  carrier: string;
  flight: string;
  fmt: TimeFormat;
}

export interface JourneySummary {
  passenger: string;
  pnr: string;
  carrier: string;
  adults: number;
  /** `null` when the extractor could not find a child count — never assumed zero. */
  children: number | null;
}

/**
 * How far a block has travelled from a machine guess.
 *
 * - `need`   — a required field is missing; the block cannot be reviewed yet.
 * - `edited` — staff changed a value, so any prior review was cleared.
 * - `ok`     — explicitly marked reviewed by a staff member.
 * - `ai`     — as the extractor produced it, untouched and unreviewed.
 */
export type BlockState = 'ai' | 'edited' | 'ok' | 'need';

export const BLOCK_STATE_LABELS: Record<BlockState, string> = {
  ai: 'AI extracted',
  edited: 'Edited — not yet reviewed',
  ok: 'Staff reviewed',
  need: 'Missing information',
};

/** Required sector fields, in the order the review screen reports them. */
export function missingSectorFields(sector: FlightSector): string[] {
  const missing: string[] = [];
  if (!sector.dep) missing.push('departure airport');
  if (!sector.arr) missing.push('arrival airport');
  if (!sector.date) missing.push('date');
  if (!sector.depT) missing.push('departure time');
  if (!sector.arrT) missing.push('arrival time');
  if (!sector.flight) missing.push('flight number');
  return missing;
}

export function sectorState(
  sector: FlightSector,
  reviewed: boolean,
  edited: boolean,
): BlockState {
  if (missingSectorFields(sector).length > 0) return 'need';
  if (reviewed) return 'ok';
  if (edited) return 'edited';
  return 'ai';
}

export function summaryState(
  summary: JourneySummary | null,
  reviewed: boolean,
  edited: boolean,
): BlockState {
  if (!summary || summary.children === null || !summary.passenger || !summary.pnr) return 'need';
  if (reviewed) return 'ok';
  if (edited) return 'edited';
  return 'ai';
}

export function totalPax(summary: JourneySummary | null): number | null {
  if (!summary || summary.children === null) return null;
  return (Number(summary.adults) || 0) + (Number(summary.children) || 0);
}

/**
 * A date-time for a sector endpoint.
 *
 * An arrival earlier in the clock than its departure is treated as landing the
 * next day, which is how overnight sectors read on a ticket.
 */
export function sectorStamp(sector: FlightSector, which: 'dep' | 'arr'): Date | null {
  const time = which === 'dep' ? sector.depT : sector.arrT;
  if (!time || !sector.date) return null;
  const stamp = new Date(`${sector.date}T${time}:00`);
  if (Number.isNaN(stamp.getTime())) return null;
  if (which === 'arr' && sector.depT && minutesOf(sector.arrT) < minutesOf(sector.depT)) {
    stamp.setDate(stamp.getDate() + 1);
  }
  return stamp;
}

/** True when a sector lands on the day after it departs. */
export function arrivesNextDay(sector: FlightSector): boolean {
  return Boolean(
    sector.depT && sector.arrT && minutesOf(sector.arrT) < minutesOf(sector.depT),
  );
}

export function sectorDurationMinutes(sector: FlightSector): number {
  if (!sector.depT || !sector.arrT) return 0;
  return (minutesOf(sector.arrT) - minutesOf(sector.depT) + 1440) % 1440;
}

/** What sits between two consecutive sectors: a connection, a stay, or a fault. */
export type LinkKind = 'none' | 'connection' | 'ground_stay' | 'break';

export interface SectorLink {
  kind: LinkKind;
  text: string;
}

/**
 * Reads the join between the previous sector and this one.
 *
 * A break is a genuine operational fault — the journey does not join up, or the
 * times overlap — and it blocks generation until staff resolve it.
 */
export function linkBetween(previous: FlightSector | null, sector: FlightSector): SectorLink {
  if (!previous || !previous.arr || !sector.dep) return { kind: 'none', text: '' };

  if (previous.arr !== sector.dep) {
    return {
      kind: 'break',
      text: `Sequence break — the previous sector arrives at ${previous.arr} but this one departs from ${sector.dep}. Reorder, correct or add the missing sector.`,
    };
  }

  const arrivedAt = sectorStamp(previous, 'arr');
  const departsAt = sectorStamp(sector, 'dep');
  if (!arrivedAt || !departsAt) return { kind: 'none', text: '' };

  const gap = Math.round((departsAt.getTime() - arrivedAt.getTime()) / 60000);
  if (gap < 0) {
    return {
      kind: 'break',
      text: 'Times overlap — this sector departs before the previous one arrives.',
    };
  }
  if (gap > 1440) {
    return {
      kind: 'ground_stay',
      text: `Ground stay in ${sector.depCity || sector.dep} · ${Math.round(gap / 1440)} days`,
    };
  }
  return {
    kind: 'connection',
    text: `Connection in ${sector.depCity || sector.dep} · ${humanDuration(gap)}`,
  };
}

/** Number of genuine sequence faults across the whole journey. */
export function countSequenceBreaks(sectors: FlightSector[]): number {
  return sectors.reduce((total, sector, index) => {
    const link = linkBetween(index > 0 ? sectors[index - 1] : null, sector);
    return total + (link.kind === 'break' ? 1 : 0);
  }, 0);
}

/** "KAN → ADD → JED → KAN" */
export function routeLine(sectors: FlightSector[]): string {
  if (sectors.length === 0) return '';
  const codes = sectors.map((s) => s.dep || '···');
  codes.push(sectors[sectors.length - 1].arr || '···');
  return codes.join(' → ');
}

// ── Workflow ──

export type FlightStage =
  | 'upload'
  | 'processing'
  | 'failed'
  | 'review'
  | 'trip'
  | 'confirm'
  | 'generating'
  | 'genfailed'
  | 'done';

export const FLIGHT_STEP_LABELS = [
  'Upload Documents',
  'Review Extraction',
  'Trip Details',
  'Confirm',
  'Generate',
  'Download',
] as const;

/** Which numbered step each stage sits under. */
export const STAGE_STEP_INDEX: Record<FlightStage, number> = {
  upload: 0,
  processing: 0,
  failed: 0,
  review: 1,
  trip: 2,
  confirm: 3,
  generating: 4,
  genfailed: 4,
  done: 5,
};

/** The stage a completed step returns to when its rail entry is selected. */
export const STEP_RETURN_STAGE: Array<FlightStage | null> = [
  'upload',
  'review',
  'trip',
  'confirm',
  null,
  null,
];

export const STAGE_LABELS: Record<FlightStage, string> = {
  upload: 'Upload Documents',
  processing: 'Extracting',
  failed: 'Extraction failed',
  review: 'Review Extraction',
  trip: 'Trip Details',
  confirm: 'Confirm',
  generating: 'Generating',
  genfailed: 'Generation failed',
  done: 'Download',
};

/** Named stages with their sub-notes. No percentage — the extractor reports none. */
export const EXTRACTION_STAGES: Array<[string, string]> = [
  ['Reading travel documents', 'PDF and image pages'],
  ['Extracting passenger information', 'Name, PNR, party size'],
  ['Extracting flight sectors', 'Airports, dates, times'],
  ['Checking journey sequence', 'Continuity between sectors'],
  ['Preparing staff review', ''],
];

export const GENERATION_STAGES: Array<[string, string]> = [
  ['Preparing itinerary', 'Reading the confirmed record'],
  ['Building flight schedule', 'One row per sector, in order'],
  ['Adding accommodation information', 'Makkah and Madinah'],
  ['Formatting Word document', 'Standard Umrah package layout'],
  ['Finalising document', ''],
];

// ── Trip details ──

export interface TripDetails {
  groupName: string;
  makkahHotelId: string | null;
  makkahHotelName: string;
  madinahHotelId: string | null;
  madinahHotelName: string;
}

export function emptyTripDetails(): TripDetails {
  return {
    groupName: '',
    makkahHotelId: null,
    makkahHotelName: '',
    madinahHotelId: null,
    madinahHotelName: '',
  };
}

/**
 * The filename the existing generator produces: the group name when set,
 * otherwise the passenger's surname. Shown to staff in advance so the name is
 * never a surprise. This does not generate anything.
 */
export function plannedFileName(groupName: string, passenger: string): string {
  const surname = String(passenger || 'Traveller').trim().split(/\s+/).pop() || 'Traveller';
  const base = (groupName || surname || 'Itinerary').trim().replace(/\s+/g, '_').toUpperCase();
  return `${base}_Itinerary.docx`;
}

// ── Carrier display ──

/** Display names for the carriers this operation routinely books. */
export const AIRLINE_NAMES: Record<string, string> = {
  ET: 'Ethiopian Airlines',
  SV: 'Saudia',
  MS: 'EgyptAir',
  WY: 'Oman Air',
  QR: 'Qatar Airways',
};

export function carrierLabel(code: string): string {
  if (!code) return 'Carrier not set';
  return `${AIRLINE_NAMES[code] || code} · ${code}`;
}

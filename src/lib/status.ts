/**
 * Central journey-status calculation.
 *
 * CORE PRINCIPLE: Planned dates (from CSV) are NOT actual events.
 * Only manual staff confirmations can set actual arrival/departure.
 *
 * Status priority:
 * 1. actualDepartureDate + departureConfirmedBy  -> departure_confirmed
 * 2. actualArrivalAt exists, no departure        -> in_saudi_arabia / departing_soon / departure_overdue
 * 3. No actual arrival                           -> travel_scheduled / unverified
 */

export type JourneyStatus =
  | 'travel_scheduled'
  | 'unverified'
  | 'in_saudi_arabia'
  | 'departing_soon'
  | 'departure_overdue'
  | 'departure_confirmed';

export type StatusSource = 'MANUAL_CONFIRMATION' | 'SYSTEM_DERIVED' | 'CSV_IMPORT';

export interface JourneyStatusMeta {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  priority: number;
}

export const STATUS_META: Record<JourneyStatus, JourneyStatusMeta> = {
  travel_scheduled: {
    label: 'Travel Scheduled',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    dotColor: 'bg-blue-500',
    priority: 6,
  },
  unverified: {
    label: 'Unverified',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-200',
    dotColor: 'bg-slate-400',
    priority: 7,
  },
  in_saudi_arabia: {
    label: 'In Saudi Arabia',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
    priority: 3,
  },
  departing_soon: {
    label: 'Departing Soon',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
    priority: 2,
  },
  departure_overdue: {
    label: 'Departure Overdue',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    dotColor: 'bg-red-500',
    priority: 1,
  },
  departure_confirmed: {
    label: 'Departure Confirmed',
    color: 'text-brand-700',
    bgColor: 'bg-brand-50',
    borderColor: 'border-brand-200',
    dotColor: 'bg-brand-500',
    priority: 5,
  },
};

export function todayStr(): string {
  return dateToStr(new Date());
}

export function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function strToDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return new Date(y, m, d);
}

export function addDays(dateStr: string, days: number): string {
  const d = strToDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return dateToStr(d);
}

export function compareDates(a: string, b: string): number {
  const da = strToDate(a);
  const db = strToDate(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}

/**
 * Core status calculation. Separates planned dates from actual confirmations.
 *
 * ACTUAL fields (require manual staff confirmation):
 * - actual_arrival_at, arrival_confirmed_at, arrival_confirmed_by
 * - actual_departure_date, departure_confirmed_at, departure_confirmed_by
 *
 * PLANNED fields (from CSV or manual entry — never prove travel happened):
 * - expected_departure_date (scheduled outbound)
 * - expected_return_date (planned return)
 */
export function calculateJourneyStatus(p: {
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
  expected_departure_date?: string | null;
  expected_return_date?: string | null;
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
}): JourneyStatus {
  const {
    actual_arrival_at,
    arrival_date,
    expected_departure_date,
    expected_return_date,
    actual_departure_date,
    departure_confirmed_at,
    departure_confirmed_by,
  } = p;

  // Use actual_arrival_at if available, fall back to arrival_date for legacy compat
  const actualArrival = actual_arrival_at ?? arrival_date;

  // Rule 1: DEPARTURE_CONFIRMED — requires actual departure + confirmation metadata
  if (actual_departure_date && departure_confirmed_at && departure_confirmed_by) {
    return 'departure_confirmed';
  }

  // If actual_departure_date exists but lacks confirmation metadata, treat as no departure
  // (this handles stale data from before the migration)

  const today = todayStr();

  // Rule 2: No actual arrival — pilgrim has NOT been confirmed in Saudi Arabia
  if (!actualArrival) {
    // Has scheduled dates but no confirmed arrival
    if (expected_departure_date || expected_return_date) {
      return 'travel_scheduled';
    }
    return 'unverified';
  }

  // At this point: actual arrival exists and is confirmed, no confirmed departure.
  // Use expected_return_date for departure timing (fall back to expected_departure_date for legacy)
  const returnDate = expected_return_date ?? expected_departure_date;

  if (!returnDate) {
    return 'in_saudi_arabia';
  }

  // Rule 3: expected return is before today -> departure_overdue
  if (compareDates(returnDate, today) < 0) {
    return 'departure_overdue';
  }

  // Rule 4: expected return is today through today + 3 days -> departing_soon
  const threeDaysAhead = addDays(today, 3);
  if (
    compareDates(returnDate, today) >= 0 &&
    compareDates(returnDate, threeDaysAhead) <= 0
  ) {
    return 'departing_soon';
  }

  // Rule 5: arrived, no departure, return date is further out -> in_saudi_arabia
  return 'in_saudi_arabia';
}

/**
 * Dashboard metrics — derived from pilgrim records using the central status rules.
 * Counts are based on ACTUAL confirmations only, never planned dates.
 */
export interface DashboardMetrics {
  total: number;
  inSaudiArabia: number;
  departingIn3Days: number;
  overdue: number;
  unconfirmed: number;
  departureConfirmed: number;
  unverifiedImported: number;
}

/**
 * Physical presence: actual arrival exists and no confirmed departure.
 */
export function isPhysicallyPresent(p: {
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
}): boolean {
  const actualArrival = p.actual_arrival_at ?? p.arrival_date;
  if (!actualArrival) return false;
  // Only count as departed if there's a genuine confirmation
  if (p.actual_departure_date && p.departure_confirmed_at && p.departure_confirmed_by) return false;
  return true;
}

export function isDepartingIn3Days(p: {
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
  expected_return_date?: string | null;
  expected_departure_date?: string | null;
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
}): boolean {
  if (!isPhysicallyPresent(p)) return false;
  const returnDate = p.expected_return_date ?? p.expected_departure_date;
  if (!returnDate) return false;
  const today = todayStr();
  const threeAhead = addDays(today, 3);
  return (
    compareDates(returnDate, today) >= 0 &&
    compareDates(returnDate, threeAhead) <= 0
  );
}

export function isOverdue(p: {
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
  expected_return_date?: string | null;
  expected_departure_date?: string | null;
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
}): boolean {
  if (!isPhysicallyPresent(p)) return false;
  const returnDate = p.expected_return_date ?? p.expected_departure_date;
  if (!returnDate) return false;
  return compareDates(returnDate, todayStr()) < 0;
}

export function isUnconfirmedDeparture(p: {
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
  expected_return_date?: string | null;
  expected_departure_date?: string | null;
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
}): boolean {
  if (!isPhysicallyPresent(p)) return false;
  const returnDate = p.expected_return_date ?? p.expected_departure_date;
  if (!returnDate) return false;
  return compareDates(returnDate, todayStr()) <= 0;
}

export function isDepartureConfirmed(p: {
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
}): boolean {
  return !!(p.actual_departure_date && p.departure_confirmed_at && p.departure_confirmed_by);
}

/**
 * Unverified imported: has import_batch_id but no manual arrival confirmation.
 */
export function isUnverifiedImported(p: {
  import_batch_id?: string | null;
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
}): boolean {
  if (!p.import_batch_id) return false;
  const actualArrival = p.actual_arrival_at ?? p.arrival_date;
  return !actualArrival;
}

export function calculateDashboardMetrics(
  pilgrims: Array<{
    arrival_date: string | null;
    actual_arrival_at?: string | null;
    expected_departure_date: string;
    expected_return_date?: string | null;
    actual_departure_date: string | null;
    departure_confirmed_at?: string | null;
    departure_confirmed_by?: string | null;
    import_batch_id?: string | null;
  }>
): DashboardMetrics {
  let inSaudi = 0;
  let departing = 0;
  let overdue = 0;
  let unconfirmed = 0;
  let departureConfirmed = 0;
  let unverifiedImported = 0;

  for (const p of pilgrims) {
    if (isPhysicallyPresent(p)) inSaudi++;
    if (isDepartingIn3Days(p)) departing++;
    if (isOverdue(p)) overdue++;
    if (isUnconfirmedDeparture(p)) unconfirmed++;
    if (isDepartureConfirmed(p)) departureConfirmed++;
    if (isUnverifiedImported(p)) unverifiedImported++;
  }

  return {
    total: pilgrims.length,
    inSaudiArabia: inSaudi,
    departingIn3Days: departing,
    overdue,
    unconfirmed,
    departureConfirmed,
    unverifiedImported,
  };
}

export function sortPilgrimsByPriority<
  T extends {
    actual_arrival_at?: string | null;
    arrival_date: string | null;
    expected_departure_date: string;
    expected_return_date?: string | null;
    actual_departure_date: string | null;
    departure_confirmed_at?: string | null;
    departure_confirmed_by?: string | null;
  }
>(pilgrims: T[]): T[] {
  return [...pilgrims].sort((a, b) => {
    const sa = calculateJourneyStatus(a);
    const sb = calculateJourneyStatus(b);
    return STATUS_META[sa].priority - STATUS_META[sb].priority;
  });
}

export function getStatusBadgeClasses(status: JourneyStatus): string {
  const meta = STATUS_META[status];
  return `${meta.bgColor} ${meta.color} ${meta.borderColor}`;
}

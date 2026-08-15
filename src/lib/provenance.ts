/**
 * GLOBAL PROVENANCE RULE
 * ----------------------
 * SOLID treatment  = genuinely human-confirmed operational state
 * OUTLINE treatment = system-derived / planned / calculated state
 *
 * Provenance is derived from the ACTUAL RECORD EVIDENCE — never from a colour,
 * a label, or a `status_source` string alone. A state only earns the confirmed
 * treatment when the record itself carries the confirmation columns that only a
 * staff confirmation workflow can write.
 *
 * This module reads records. It never changes journey-status calculations
 * (see `@/lib/status`), which remain the single source of truth for WHICH state
 * a record is in. This module only answers HOW WE KNOW.
 */

import type { JourneyStatus } from './status';

export type Provenance = 'confirmed' | 'derived';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  confirmed: 'Confirmed',
  derived: 'Derived',
};

export const PROVENANCE_DESCRIPTION: Record<Provenance, string> = {
  confirmed: 'Recorded by a staff member through a confirmation workflow.',
  derived: 'Calculated by the system from planned or imported dates. Not a confirmation.',
};

/** The confirmation evidence a record must carry for an arrival to count as human-confirmed. */
export interface ArrivalEvidence {
  arrival_confirmed_at?: string | null;
  arrival_confirmed_by?: string | null;
}

/** The confirmation evidence a record must carry for a departure to count as human-confirmed. */
export interface DepartureEvidence {
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
  actual_departure_date?: string | null;
}

/**
 * True only when the record carries genuine staff arrival-confirmation evidence.
 *
 * A legacy/planned `arrival_date` (or an `actual_arrival_at` written without
 * confirmation metadata) is NOT evidence — such a record stays derived.
 */
export function hasConfirmedArrivalEvidence(p: ArrivalEvidence): boolean {
  return Boolean(p.arrival_confirmed_at && p.arrival_confirmed_by);
}

/** True only when the record carries genuine staff departure-confirmation evidence. */
export function hasConfirmedDepartureEvidence(p: DepartureEvidence): boolean {
  return Boolean(p.actual_departure_date && p.departure_confirmed_at && p.departure_confirmed_by);
}

/**
 * Provenance of a pilgrim's current journey status.
 *
 * - `departure_confirmed` — solid, backed by departure confirmation evidence.
 * - `in_saudi_arabia`     — solid ONLY with genuine arrival confirmation evidence.
 *                           If the state exists only because of a legacy/planned
 *                           arrival field, it remains derived.
 * - `departing_soon` / `departure_overdue` — always derived: what they assert is
 *                           calculated from planned/expected dates.
 * - `travel_scheduled` / `unverified` — always derived.
 */
export function journeyStatusProvenance(
  status: JourneyStatus,
  record: ArrivalEvidence & DepartureEvidence,
): Provenance {
  switch (status) {
    case 'departure_confirmed':
      return hasConfirmedDepartureEvidence(record) ? 'confirmed' : 'derived';
    case 'in_saudi_arabia':
      return hasConfirmedArrivalEvidence(record) ? 'confirmed' : 'derived';
    case 'departing_soon':
    case 'departure_overdue':
    case 'travel_scheduled':
    case 'unverified':
    default:
      return 'derived';
  }
}

/**
 * Plain-language explanation of why a status carries its provenance.
 * Used as accessible helper text so the treatment is never colour-only.
 */
export function provenanceReason(
  status: JourneyStatus,
  record: ArrivalEvidence & DepartureEvidence,
): string {
  const provenance = journeyStatusProvenance(status, record);

  if (status === 'departure_confirmed') {
    return provenance === 'confirmed'
      ? 'A staff member recorded this departure, with officer and timestamp on the record.'
      : 'Departure confirmation evidence is incomplete on this record.';
  }

  if (status === 'in_saudi_arabia') {
    return provenance === 'confirmed'
      ? 'A staff member confirmed this arrival, with officer and timestamp on the record.'
      : 'Presence is inferred from an arrival field that carries no staff confirmation.';
  }

  if (status === 'departing_soon') {
    return 'Calculated from the expected return date. No departure has been confirmed.';
  }

  if (status === 'departure_overdue') {
    return 'Calculated from the expected return date. This is an operational flag — it does not itself confirm a legal overstay.';
  }

  if (status === 'travel_scheduled') {
    return 'Based on planned travel dates only. No movement has been confirmed.';
  }

  return 'No planned dates and no confirmations are recorded against this pilgrim.';
}

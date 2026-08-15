/**
 * Explains WHY a record sits where it does in a priority list.
 *
 * Every sentence produced here is built from values that are actually present on
 * the record. Nothing is inferred, rounded up, or invented: if the record does
 * not carry the evidence, the reason says so plainly.
 */

import { calculateJourneyStatus, strToDate, todayStr, type JourneyStatus } from './status';
import { hasConfirmedArrivalEvidence, hasConfirmedDepartureEvidence } from './provenance';

export interface PriorityRecord {
  actual_arrival_at?: string | null;
  arrival_date?: string | null;
  arrival_confirmed_at?: string | null;
  arrival_confirmed_by?: string | null;
  expected_departure_date?: string | null;
  expected_return_date?: string | null;
  actual_departure_date?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
  import_batch_id?: string | null;
}

/** Whole days from `from` to `to`. Positive means `to` is later. */
export function daysBetween(from: string, to: string): number | null {
  const a = strToDate(from);
  const b = strToDate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function formatDayCount(days: number): string {
  const magnitude = Math.abs(days);
  return `${magnitude} ${magnitude === 1 ? 'day' : 'days'}`;
}

/** Human-readable date. Ordinary dates stay in the normal typeface, never monospace. */
export function formatDate(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = strToDate(value);
  if (!date) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

export interface PriorityReason {
  /** Short sentence explaining the record's position, drawn only from its own values. */
  text: string;
  /** True when the reason describes a calculated state rather than a confirmed one. */
  derived: boolean;
}

export function priorityReason(record: PriorityRecord, status?: JourneyStatus): PriorityReason {
  const state = status ?? calculateJourneyStatus(record);
  const today = todayStr();
  const returnDate = record.expected_return_date ?? record.expected_departure_date ?? null;

  switch (state) {
    case 'departure_overdue': {
      const overdueBy = returnDate ? daysBetween(returnDate, today) : null;
      return {
        derived: true,
        text: returnDate
          ? `Expected return ${formatDate(returnDate)}${
              overdueBy != null && overdueBy > 0 ? ` — ${formatDayCount(overdueBy)} past` : ''
            }, with no confirmed departure.`
          : 'Past the expected return date with no confirmed departure.',
      };
    }

    case 'departing_soon': {
      const dueIn = returnDate ? daysBetween(today, returnDate) : null;
      return {
        derived: true,
        text: returnDate
          ? `Expected return ${formatDate(returnDate)}${
              dueIn != null ? (dueIn === 0 ? ' — due today' : ` — in ${formatDayCount(dueIn)}`) : ''
            }.`
          : 'Return expected within the next three days.',
      };
    }

    case 'in_saudi_arabia': {
      if (!hasConfirmedArrivalEvidence(record)) {
        return {
          derived: true,
          text: 'Presence is inferred from an arrival field that carries no staff confirmation.',
        };
      }
      const arrival = record.actual_arrival_at ?? record.arrival_date;
      return {
        derived: false,
        text: returnDate
          ? `Arrival confirmed ${formatDate(arrival)}; expected return ${formatDate(returnDate)}.`
          : `Arrival confirmed ${formatDate(arrival)}; no expected return date on record.`,
      };
    }

    case 'departure_confirmed':
      return {
        derived: !hasConfirmedDepartureEvidence(record),
        text: `Departure confirmed ${formatDate(record.actual_departure_date)}.`,
      };

    case 'travel_scheduled':
      return {
        derived: true,
        text: record.import_batch_id
          ? `Imported record. Scheduled outbound ${formatDate(record.expected_departure_date)}; arrival not confirmed.`
          : `Scheduled outbound ${formatDate(record.expected_departure_date)}; no movement confirmed.`,
      };

    case 'unverified':
    default:
      return {
        derived: true,
        text: 'No planned dates and no confirmations are recorded against this pilgrim.',
      };
  }
}

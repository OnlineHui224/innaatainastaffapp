/**
 * FLIGHT DOCUMENT OPS — DEMONSTRATION FIXTURES
 * ============================================
 *
 * Local, deterministic data used to exercise the Flight Document Ops interface
 * while the extraction backend is not wired.
 *
 * SAFETY CONTRACT — every one of these holds:
 *
 *   - No real pilgrim, passenger, staff or booking data. Every name, reference
 *     and ticket number below is invented for demonstration and is labelled as
 *     specimen data in the interface.
 *   - No Supabase read or write.
 *   - No Google or Gemini call.
 *   - No network request of any kind.
 *   - Nothing here is ever persisted.
 *
 * This file is imported ONLY by the Flight Document Ops screens. When the real
 * extractor is connected in a later phase, the page swaps its source and this
 * file is deleted.
 */

import {
  unreviewed,
  type FlightLegView,
  type JourneyView,
} from '@/types/flightOps';

function leg(
  id: string,
  values: Omit<FlightLegView, 'id' | 'review'>,
): FlightLegView {
  return { id, ...values, review: unreviewed() };
}

/**
 * A complete four-sector Umrah journey: Kano → Addis Ababa → Jeddah, returning
 * by the same routing. Mirrors the IATA-code style the proven extractor emits.
 */
export const DEMO_JOURNEY: JourneyView = {
  summary: {
    passengerName: 'SPECIMEN / DEMO PASSENGER',
    pnr: 'XQ7T2M',
    primaryCarrier: 'ET',
    adults: 3,
    children: 1,
    review: unreviewed(),
  },
  legs: [
    leg('demo-leg-1', {
      departureCity: 'KAN',
      departureAirport: 'Mallam Aminu Kano International',
      arrivalCity: 'ADD',
      arrivalAirport: 'Addis Ababa Bole International',
      date: '2026-09-14',
      departureTime: '14:35',
      arrivalTime: '21:10',
      carrier: 'ET',
      flightNumber: 'ET0940',
    }),
    leg('demo-leg-2', {
      departureCity: 'ADD',
      departureAirport: 'Addis Ababa Bole International',
      arrivalCity: 'JED',
      arrivalAirport: 'King Abdulaziz International',
      date: '2026-09-15',
      departureTime: '02:20',
      arrivalTime: '05:45',
      carrier: 'ET',
      flightNumber: 'ET0322',
    }),
    leg('demo-leg-3', {
      departureCity: 'JED',
      departureAirport: 'King Abdulaziz International',
      arrivalCity: 'ADD',
      arrivalAirport: 'Addis Ababa Bole International',
      date: '2026-09-28',
      departureTime: '07:15',
      arrivalTime: '11:40',
      carrier: 'ET',
      flightNumber: 'ET0323',
    }),
    leg('demo-leg-4', {
      departureCity: 'ADD',
      departureAirport: 'Addis Ababa Bole International',
      arrivalCity: 'KAN',
      arrivalAirport: 'Mallam Aminu Kano International',
      date: '2026-09-28',
      departureTime: '20:05',
      arrivalTime: '23:55',
      carrier: 'ET',
      flightNumber: 'ET0941',
    }),
  ],
  aiConfidence: 0.94,
  extractedAt: '',
  sourceFileNames: [],
};

/**
 * The same journey with gaps the extractor could not fill — used to demonstrate
 * the incomplete-sector state, where staff must complete a field before the
 * itinerary can be generated.
 */
export const DEMO_JOURNEY_INCOMPLETE: JourneyView = {
  ...DEMO_JOURNEY,
  summary: { ...DEMO_JOURNEY.summary, pnr: '', review: unreviewed() },
  legs: DEMO_JOURNEY.legs.map((entry, index) =>
    index === 2
      ? { ...entry, arrivalTime: '', flightNumber: '', review: unreviewed() }
      : { ...entry, review: unreviewed() },
  ),
  aiConfidence: 0.61,
};

/** Sectors that do not read as one continuous journey — demonstrates the sequence warning. */
export const DEMO_JOURNEY_OUT_OF_SEQUENCE: JourneyView = {
  ...DEMO_JOURNEY,
  legs: [
    DEMO_JOURNEY.legs[0],
    { ...DEMO_JOURNEY.legs[1], date: '2026-09-11' },
    DEMO_JOURNEY.legs[2],
    DEMO_JOURNEY.legs[3],
  ].map((entry) => ({ ...entry, review: unreviewed() })),
  aiConfidence: 0.72,
};

/**
 * Which demonstration outcome the next extraction should produce.
 *
 * Exposed in the interface as a small development-only control so every state —
 * including the failure states — can be reviewed without a backend.
 */
export type DemoOutcome =
  | 'complete'
  | 'incomplete'
  | 'out_of_sequence'
  | 'partial_failure'
  | 'extraction_failure'
  | 'network_failure';

export const DEMO_OUTCOME_LABELS: Record<DemoOutcome, string> = {
  complete: 'Complete journey',
  incomplete: 'Missing sector fields',
  out_of_sequence: 'Journey out of sequence',
  partial_failure: 'One document unreadable',
  extraction_failure: 'Extraction fails',
  network_failure: 'Connection interrupted',
};

export const DEMO_OUTCOMES: DemoOutcome[] = [
  'complete',
  'incomplete',
  'out_of_sequence',
  'partial_failure',
  'extraction_failure',
  'network_failure',
];

/** Returns a fresh, unreviewed copy so review marks never leak between runs. */
export function demoJourneyFor(outcome: DemoOutcome): JourneyView {
  const base =
    outcome === 'incomplete'
      ? DEMO_JOURNEY_INCOMPLETE
      : outcome === 'out_of_sequence'
        ? DEMO_JOURNEY_OUT_OF_SEQUENCE
        : DEMO_JOURNEY;

  return {
    ...base,
    summary: { ...base.summary, review: unreviewed() },
    legs: base.legs.map((entry) => ({ ...entry, review: unreviewed() })),
  };
}

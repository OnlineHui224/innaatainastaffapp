/**
 * FLIGHT DOCUMENT OPS — DEMONSTRATION FIXTURES
 * ============================================
 *
 * Local, deterministic data that lets the Flight Document Ops interface be
 * exercised end to end while the extraction backend is not wired.
 *
 * SAFETY CONTRACT — every one of these holds:
 *
 *   - No real pilgrim, passenger, staff or booking data.
 *   - No Supabase read or write.
 *   - No Google or Gemini call.
 *   - No network request of any kind.
 *   - Nothing here is ever persisted.
 *
 * NOTE ON HOTELS: there are deliberately no hotel fixtures in this file. Makkah
 * and Madinah hotels come from the real HajjERP hotel reference through
 * `useHotelSearch` — the read-only `hotel_references` search is the single
 * source of truth, and demonstration hotel names must never become application
 * data.
 *
 * When the real extractor is connected, the page swaps its source and this file
 * is deleted.
 */

import type { FlightSector, JourneySummary, SourceDocument } from '@/types/flightOps';

/** Ticket documents a staff member would typically upload for one journey. */
export const SAMPLE_DOCUMENTS: SourceDocument[] = [
  { id: 'f1', name: 'Ticket-Zainab-KAN-ADD-JED.pdf', bytes: 565248, ext: 'PDF' },
  { id: 'f2', name: 'Return-Sector-JED-ADD-KAN.pdf', bytes: 325632, ext: 'PDF' },
  { id: 'f3', name: 'Ticket-Page-2-Photo.jpg', bytes: 1418752, ext: 'JPG' },
];

/**
 * The sector pool a demonstration journey is built from.
 *
 * Note the mixed `fmt`: the outbound ticket prints 12-hour times and the
 * internal Saudi sectors print 24-hour. That mix is deliberate — it exercises
 * the rule that each sector keeps the format its own ticket used.
 */
const SECTOR_POOL: FlightSector[] = [
  { id: 's1', dep: 'KAN', depCity: 'Kano', arr: 'ADD', arrCity: 'Addis Ababa', date: '2026-09-11', depT: '13:35', arrT: '20:30', carrier: 'ET', flight: 'ET 0940', fmt: '12h' },
  { id: 's2', dep: 'ADD', depCity: 'Addis Ababa', arr: 'JED', arrCity: 'Jeddah', date: '2026-09-12', depT: '00:10', arrT: '02:40', carrier: 'ET', flight: 'ET 0402', fmt: '12h' },
  { id: 's3', dep: 'JED', depCity: 'Jeddah', arr: 'MED', arrCity: 'Madinah', date: '2026-09-20', depT: '09:15', arrT: '10:35', carrier: 'SV', flight: 'SV 1451', fmt: '24h' },
  { id: 's4', dep: 'MED', depCity: 'Madinah', arr: 'JED', arrCity: 'Jeddah', date: '2026-09-25', depT: '18:40', arrT: '19:55', carrier: 'SV', flight: 'SV 1462', fmt: '24h' },
  { id: 's5', dep: 'JED', depCity: 'Jeddah', arr: 'ADD', arrCity: 'Addis Ababa', date: '2026-09-26', depT: '03:30', arrT: '07:10', carrier: 'ET', flight: 'ET 0403', fmt: '12h' },
  { id: 's6', dep: 'ADD', depCity: 'Addis Ababa', arr: 'KAN', arrCity: 'Kano', date: '2026-09-26', depT: '09:20', arrT: '12:05', carrier: 'ET', flight: 'ET 0941', fmt: '12h' },
];

/** Which sectors make a coherent journey at each length. */
const JOURNEY_SHAPES: Record<number, number[]> = {
  1: [0],
  2: [0, 1],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

/** What the demonstration extraction should produce. */
export type DemoScenario =
  | 'clean'
  | 'partial'
  | 'extraction_failed'
  | 'generation_failed';

export const DEMO_SCENARIO_LABELS: Record<DemoScenario, string> = {
  clean: 'Clean extraction',
  partial: 'Partial extraction',
  extraction_failed: 'Extraction fails',
  generation_failed: 'Generation fails',
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  'clean',
  'partial',
  'extraction_failed',
  'generation_failed',
];

export interface DemoExtraction {
  sectors: FlightSector[];
  summary: JourneySummary;
}

/**
 * Builds a fresh journey.
 *
 * The `partial` scenario drops an arrival time and the child count, so the
 * "missing information" states — which block review and generation — can be
 * exercised exactly as they would occur in practice.
 */
export function buildDemoExtraction(scenario: DemoScenario, sectorCount: number): DemoExtraction {
  const count = Math.max(1, Math.min(6, Math.round(sectorCount)));
  const sectors = JOURNEY_SHAPES[count].map((index) => ({ ...SECTOR_POOL[index] }));

  const partial = scenario === 'partial';
  if (partial) {
    const target = Math.min(2, sectors.length - 1);
    sectors[target] = { ...sectors[target], arrT: '' };
  }

  return {
    sectors,
    summary: {
      passenger: 'Zainab Tukur Muhammad',
      pnr: 'OCWYCC',
      carrier: 'ET',
      adults: 1,
      children: partial ? null : 0,
    },
  };
}

export function demoConfidenceLabel(scenario: DemoScenario): string {
  return scenario === 'partial'
    ? 'Extraction confidence: medium — one field missing'
    : 'Extraction confidence: high — all fields found in source';
}

/**
 * OFFICE REGISTER MAPPING — pure logic
 * ====================================
 *
 * Everything here is a pure function of its input: no network, no environment,
 * no Deno APIs. These are the rules that decide which tab a visa lands in, what
 * the twelve cells contain, and — most consequentially — whether a synchronise
 * appends a new row, updates an existing one, or refuses.
 *
 * The office register is a human-edited workbook that predates HajjERP. Nothing
 * here writes headers, creates tabs, or touches a row it has not positively
 * identified.
 */

/** The register's twelve columns, in order. Legacy spelling preserved. */
export const OFFICE_REGISTER_COLUMNS = [
  'DATE',
  'AGENT NAME',
  'VISA NUMBER',
  'PASSPORT NUMBER',
  'NAME',
  'DEPARTURE DATE',
  'ARRIVAL DATE',
  'MAKKAH HOTEL',
  'MEDINAH HOTEL',
  'TRANSPORTATION',
  'VISA COMPANY',
  'ARIVAL PORT',
] as const;

/** Column letters for the two identifiers the business-identity scan reads. */
export const VISA_NUMBER_COLUMN = 'C';
export const PASSPORT_NUMBER_COLUMN = 'D';

/** The metadata key that ties a register row to a HajjERP record. */
export const ROW_METADATA_KEY = 'hajjerp_record_id';

/**
 * Month tab names as the workbook actually spells them.
 *
 * September is SEPT, not SEP. Resolution is still done case-insensitively
 * against the titles the spreadsheet reports, so the workbook's own spelling
 * wins over this list if they ever differ.
 */
export const MONTH_TABS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC',
] as const;

/** Anything the register may be asked to write. Only these fields are read. */
export interface SyncableRecord {
  id: string;
  record_date: string | null;
  agent_name_snapshot: string;
  client_source: 'direct' | 'sub_agent';
  visa_number: string | null;
  passport_number: string | null;
  traveller_name: string | null;
  planned_departure_date: string | null;
  expected_return_date: string | null;
  makkah_hotel_name: string | null;
  madinah_hotel_name: string | null;
  transport_summary: string | null;
  visa_company: string | null;
  arrival_port: string | null;
}

/** The label a direct company client carries in the AGENT NAME column. */
export const DIRECT_CLIENT_LABEL = 'Inna Ataina (direct client)';

/**
 * The month tab a visa belongs to.
 *
 * Derived from the PLANNED DEPARTURE DATE and nothing else. `record_date` is
 * when the case was logged in HajjERP and only ever fills the DATE cell — using
 * it here would file an August departure logged in July under JUL.
 */
export function monthTabFor(plannedDepartureDate: string | null): string | null {
  if (!plannedDepartureDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plannedDepartureDate.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return MONTH_TABS[month - 1];
}

/**
 * Matches our expected tab name against the titles the workbook really has.
 *
 * Case-insensitive so a workbook using "Sept" or "aug" still resolves, and it
 * returns the workbook's own title so every later call addresses the tab by the
 * name it actually has.
 */
export function resolveTabTitle(expected: string, existingTitles: string[]): string | null {
  const wanted = expected.trim().toUpperCase();
  return existingTitles.find((title) => title.trim().toUpperCase() === wanted) ?? null;
}

/** Never a target. Reserved by the office for its own use. */
export function isProtectedTab(title: string): boolean {
  return title.trim().toUpperCase() === 'SHEET1';
}

/**
 * A cell value for the sheet.
 *
 * Dates are written as ISO `YYYY-MM-DD` with `USER_ENTERED`, which Sheets parses
 * into a real date value regardless of the workbook's locale — so the rows sort
 * and filter with the historical ones instead of sitting beside them as text.
 */
function dateCell(value: string | null): string {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : '';
}

function textCell(value: string | null): string {
  return (value ?? '').toString().trim();
}

/** Who carries responsibility, as the register spells it. */
export function agentNameFor(record: SyncableRecord): string {
  if (record.client_source === 'direct') return DIRECT_CLIENT_LABEL;
  return textCell(record.agent_name_snapshot);
}

/**
 * The twelve values, in register order.
 *
 * Exactly twelve, always — a short row would shift later columns, and an extra
 * one would write into a thirteenth column the office never asked for.
 */
export function buildRegisterRow(record: SyncableRecord): string[] {
  return [
    dateCell(record.record_date),
    agentNameFor(record),
    textCell(record.visa_number),
    textCell(record.passport_number),
    textCell(record.traveller_name),
    dateCell(record.planned_departure_date),
    /* The legacy office-register return date. NOT actual arrival into Saudi
       Arabia — that stays exclusively with the Journey Timeline. */
    dateCell(record.expected_return_date),
    textCell(record.makkah_hotel_name),
    textCell(record.madinah_hotel_name),
    textCell(record.transport_summary),
    textCell(record.visa_company),
    textCell(record.arrival_port),
  ];
}

/** Comparison form for identifiers: case and spacing are not meaningful. */
export function normaliseIdentifier(value: string | null | undefined): string {
  return (value ?? '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Rows whose VISA NUMBER and PASSPORT NUMBER both match this record.
 *
 * Both must match. Either alone is too weak: passports repeat across a family's
 * paperwork errors, and visa numbers have been reused in the historical sheet.
 *
 * @param rows Column C and D values, row-aligned, starting at `firstRowIndex`.
 * @returns zero-based row indices.
 */
export function findBusinessMatches(
  rows: string[][],
  record: { visa_number: string | null; passport_number: string | null },
  firstRowIndex = 0,
): number[] {
  const visa = normaliseIdentifier(record.visa_number);
  const passport = normaliseIdentifier(record.passport_number);
  /* With no identifiers there is nothing to match on, and returning "no match"
     would send an unidentifiable record straight to append. */
  if (!visa || !passport) return [];

  const matches: number[] = [];
  rows.forEach((row, offset) => {
    if (
      normaliseIdentifier(row?.[0]) === visa &&
      normaliseIdentifier(row?.[1]) === passport
    ) {
      matches.push(firstRowIndex + offset);
    }
  });
  return matches;
}

/* ── Row resolution ─────────────────────────────────────────────────────────
   The decision that keeps one HajjERP record to at most one register row. */

export type RowResolution =
  | { action: 'update'; rowIndex: number; source: 'metadata' | 'business_identity' }
  | { action: 'append' }
  | { action: 'conflict'; reason: string };

/**
 * Which row this record owns, if any.
 *
 * Order matters and is deliberate:
 *
 *   1. Developer metadata. Once a row carries this record's id it belongs to
 *      this record permanently, and it keeps belonging to it after staff insert
 *      or delete rows above — which a stored row number cannot survive. This is
 *      also why a corrected visa or passport number does NOT become a conflict:
 *      ownership was established before the identifiers changed.
 *   2. Business identity, for a first sync or for recovering from an append
 *      that reached Google but whose result never reached HajjERP.
 *   3. Append, only when neither found anything.
 *
 * Anything ambiguous refuses rather than guesses. Overwriting the wrong row in a
 * live office register is worse than a synchronisation that waits for a person.
 */
export function resolveRow(input: {
  metadataRowIndices: number[];
  businessMatchRowIndices: number[];
}): RowResolution {
  const { metadataRowIndices, businessMatchRowIndices } = input;

  if (metadataRowIndices.length === 1) {
    return { action: 'update', rowIndex: metadataRowIndices[0], source: 'metadata' };
  }
  if (metadataRowIndices.length > 1) {
    return {
      action: 'conflict',
      reason:
        'More than one register row is tagged with this visa record. Resolve the duplicate in the office register, then retry.',
    };
  }
  if (businessMatchRowIndices.length === 1) {
    return {
      action: 'update',
      rowIndex: businessMatchRowIndices[0],
      source: 'business_identity',
    };
  }
  if (businessMatchRowIndices.length > 1) {
    return {
      action: 'conflict',
      reason:
        'More than one register row already carries this visa and passport number. Resolve the duplicate in the office register, then retry.',
    };
  }
  return { action: 'append' };
}

/** A1 range for one full register row. Zero-based index in, 1-based A1 out. */
export function rowRange(tabTitle: string, rowIndex: number): string {
  return `${quoteTab(tabTitle)}!A${rowIndex + 1}:L${rowIndex + 1}`;
}

/** Sheets requires quoting for titles that are not plain words. */
export function quoteTab(title: string): string {
  return /^[A-Za-z0-9_]+$/.test(title) ? title : `'${title.replace(/'/g, "''")}'`;
}

/**
 * The row index inside an append response's `updates.updatedRange`.
 *
 * The API answers with an A1 range such as `AUG!A57:L57`; the row it chose is
 * the only reliable way to learn where the data landed.
 */
export function rowIndexFromRange(updatedRange: string | null | undefined): number | null {
  if (!updatedRange) return null;
  const match = /![A-Z]+(\d+)(?::[A-Z]+(\d+))?$/.exec(updatedRange.trim());
  if (!match) return null;
  const first = Number(match[1]);
  if (!Number.isFinite(first) || first < 1) return null;
  return first - 1;
}

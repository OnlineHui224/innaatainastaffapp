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

/**
 * What a direct company client is called in the register's AGENT NAME column.
 *
 * Deliberately the office's own established spelling, NOT the HajjERP screen
 * label "Inna Ataina (direct client)". The register is filtered and reported on
 * by agent name, so introducing a second spelling would split one responsibility
 * group into two and quietly break the office's own totals.
 */
export const DIRECT_CLIENT_SHEET_LABEL = 'Inna-Ataina';

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
 * Dates go out as ISO `YYYY-MM-DD` with `USER_ENTERED`, so Sheets stores a real
 * date value and the rows sort and filter with the historical ones instead of
 * sitting beside them as text.
 *
 * `USER_ENTERED` parses exactly as typing into the Sheets UI does, which means it
 * follows the workbook's locale — this is NOT locale-independent. ISO is the form
 * least likely to be misread, but the only way to know how this workbook treats
 * it is to look: run the read-only preflight, then verify the first live row.
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
  if (record.client_source === 'direct') return DIRECT_CLIENT_SHEET_LABEL;
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

/** Where a `hajjerp_record_id` tag was found in the workbook. */
export interface MetadataRowLocation {
  sheetId: number;
  /** The tab's title, when it resolved against the workbook's own tab list. */
  tabTitle: string | null;
  rowIndex: number;
}

/**
 * Which row this record owns, if any.
 *
 * Order matters and is deliberate:
 *
 *   1. Developer metadata, resolved across the WHOLE workbook — not just the tab
 *      we are about to write. Once a row carries this record's id it belongs to
 *      this record permanently, and it keeps belonging to it after staff insert
 *      or delete rows above, which a stored row number cannot survive. This is
 *      also why a corrected visa or passport number does NOT become a conflict:
 *      ownership was established before the identifiers changed.
 *   2. Business identity, for a first sync or for recovering from an append
 *      that reached Google but whose result never reached HajjERP.
 *   3. Append, only when neither found anything.
 *
 * Searching the whole workbook at step 1 is what stops a corrected departure
 * month from duplicating a traveller. A record synced to AUG whose departure
 * moves to SEPT has no business-identity match in SEPT, so a search scoped to the
 * target tab would find nothing, append, and leave the company holding two
 * register rows for one visa. Instead its AUG row is found and the month change
 * is refused for a person to resolve.
 *
 * Anything ambiguous refuses rather than guesses. Overwriting — or duplicating —
 * a row in a live office register is worse than a sync that waits for a person.
 * Moving a row between tabs is deliberately NOT automated in M2.
 */
export function resolveRow(input: {
  targetSheetId: number;
  targetTabTitle: string;
  metadataRows: MetadataRowLocation[];
  businessMatchRowIndices: number[];
}): RowResolution {
  const { targetSheetId, targetTabTitle, metadataRows, businessMatchRowIndices } = input;

  /* Checked before anything else: two tags anywhere in the workbook means the
     register already disagrees with itself, and nothing should be written until
     that is settled. */
  if (metadataRows.length > 1) {
    return {
      action: 'conflict',
      reason:
        'More than one register row is tagged with this visa record. Resolve the duplicate in the office register, then retry.',
    };
  }

  if (metadataRows.length === 1) {
    const owned = metadataRows[0];
    if (owned.sheetId === targetSheetId) {
      return { action: 'update', rowIndex: owned.rowIndex, source: 'metadata' };
    }
    /* The record owns a row on another month's tab. Neither appending here nor
       writing there is safe, so this stops and says exactly what changed. */
    return {
      action: 'conflict',
      reason: owned.tabTitle
        ? `This Visa Contract is already linked to the ${owned.tabTitle} office-register row, but its confirmed departure date now belongs to ${targetTabTitle}. Resolve the month change before retrying.`
        : `This Visa Contract is already linked to an office-register row on another tab, but its confirmed departure date now belongs to ${targetTabTitle}. Resolve the month change before retrying.`,
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

/* ── Preflight classification ───────────────────────────────────────────────
   Pure reading of what the register already holds. Writes nothing, decides
   nothing — it exists so a person can look before the first live write. */

/** The three date columns of the register, by position in a row. */
export const DATE_SAMPLE_COLUMNS = [
  { index: 0, column: 'A', header: 'DATE' },
  { index: 5, column: 'F', header: 'DEPARTURE DATE' },
  { index: 6, column: 'G', header: 'ARRIVAL DATE' },
] as const;

/**
 * What one cell actually holds, read with `UNFORMATTED_VALUE`.
 *
 * This is the whole point of the preflight: under that render option a real date
 * comes back as a serial number and a date-shaped string comes back as a string,
 * so the two are finally distinguishable.
 */
export type CellKind = 'date_value' | 'text' | 'empty' | 'other';

export function classifyCell(value: unknown): CellKind {
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'number') return Number.isFinite(value) ? 'date_value' : 'other';
  if (typeof value === 'string') return 'text';
  return 'other';
}

export interface DateColumnReport {
  column: string;
  expectedHeader: string;
  /** The header the workbook actually has there, so a mismatch is visible. */
  actualHeader: string | null;
  kinds: CellKind[];
  samples: unknown[];
  verdict: 'date_values' | 'text' | 'mixed' | 'no_data';
}

/**
 * How the register currently stores each of its three date columns.
 *
 * `text` is the answer that matters. It means the historical rows are date-shaped
 * strings, so a row written as a real date value would sort and filter
 * differently from every row above it. That is a decision about the register, not
 * something to resolve in code.
 *
 * @param sample rows from `A1:G…`, where the first row is the header row.
 */
export function describeDateCells(sample: unknown[][]): DateColumnReport[] {
  const header = sample[0] ?? [];
  const dataRows = sample.slice(1);

  return DATE_SAMPLE_COLUMNS.map(({ index, column, header: expectedHeader }) => {
    const samples = dataRows.map((row) => row?.[index] ?? null);
    const kinds = samples.map(classifyCell);
    const present = kinds.filter((kind) => kind !== 'empty');
    const actual = header[index];

    return {
      column,
      expectedHeader,
      actualHeader: typeof actual === 'string' ? actual : actual == null ? null : String(actual),
      kinds,
      samples,
      verdict:
        present.length === 0
          ? 'no_data'
          : present.every((kind) => kind === 'date_value')
            ? 'date_values'
            : present.every((kind) => kind === 'text')
              ? 'text'
              : 'mixed',
    };
  });
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

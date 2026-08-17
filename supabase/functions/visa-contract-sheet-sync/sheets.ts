/**
 * GOOGLE SHEETS OPERATIONS
 * ========================
 *
 * A thin, explicit layer over the five Sheets calls this integration makes.
 * `fetch` is injected so the whole surface can be exercised against a mock —
 * the office register is a live business document, and the request shapes that
 * write to it deserve tests that do not depend on reaching Google.
 *
 * Nothing here decides anything. Which row to write is decided in `mapping.ts`;
 * this module only carries it out.
 */

import {
  PASSPORT_NUMBER_COLUMN,
  ROW_METADATA_KEY,
  VISA_NUMBER_COLUMN,
  quoteTab,
  rowIndexFromRange,
  rowRange,
} from './mapping.ts';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class SheetsError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'SheetsError';
    this.code = code;
    this.status = status;
  }
}

export interface SheetsClient {
  spreadsheetId: string;
  accessToken: string;
  fetchImpl: FetchLike;
}

async function call(
  client: SheetsClient,
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await client.fetchImpl(`${SHEETS_BASE}/${client.spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    /* Google's error bodies are not forwarded: they can echo the request, and
       these requests carry traveller identifiers. */
    const code = response.status === 403 || response.status === 404
      ? 'register_unreachable'
      : response.status === 429
        ? 'register_rate_limited'
        : 'register_error';
    throw new SheetsError(
      code,
      'The office register could not be updated. Try again shortly.',
      response.status,
    );
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export interface WorkbookTab {
  title: string;
  sheetId: number;
}

export interface Workbook {
  /** The workbook's locale, e.g. `en_GB`. Governs how USER_ENTERED parses. */
  locale: string | null;
  timeZone: string | null;
  tabs: WorkbookTab[];
}

/**
 * The workbook's tabs and its parsing settings, in one call.
 *
 * The locale is fetched alongside the tabs rather than only for the preflight,
 * because it is what decides how `USER_ENTERED` reads a date — and one request is
 * cheaper than two.
 */
export async function readWorkbook(client: SheetsClient): Promise<Workbook> {
  const payload = await call(
    client,
    '?fields=properties(locale,timeZone),sheets.properties(title,sheetId)',
    { method: 'GET' },
  );

  const properties = (payload.properties ?? {}) as { locale?: string; timeZone?: string };
  const sheets = (payload.sheets ?? []) as { properties?: { title?: string; sheetId?: number } }[];

  return {
    locale: properties.locale ?? null,
    timeZone: properties.timeZone ?? null,
    tabs: sheets
      .map((sheet) => ({
        title: sheet.properties?.title ?? '',
        sheetId: Number(sheet.properties?.sheetId ?? -1),
      }))
      .filter((sheet) => sheet.title !== '' && sheet.sheetId >= 0),
  };
}

/**
 * Every row in the workbook whose developer metadata carries this record's id.
 *
 * This is the authoritative row identity. Sheets keeps developer metadata attached
 * to the row itself, so it survives staff inserting or deleting rows above — which
 * a stored row number does not.
 *
 * Deliberately NOT scoped to the tab about to be written. A record whose departure
 * month was corrected still owns its old row, and a search that could not see it
 * would append a duplicate. The caller decides what to do about a row on another
 * tab; this function's job is to find it.
 *
 * @returns the sheet id and zero-based row index of each tagged row.
 */
export async function findMetadataRows(
  client: SheetsClient,
  recordId: string,
): Promise<{ sheetId: number; rowIndex: number }[]> {
  const payload = await call(client, '/developerMetadata:search', {
    method: 'POST',
    body: JSON.stringify({
      dataFilters: [
        {
          developerMetadataLookup: {
            metadataKey: ROW_METADATA_KEY,
            metadataValue: recordId,
            visibility: 'DOCUMENT',
          },
        },
      ],
    }),
  });

  const matched = (payload.matchedDeveloperMetadata ?? []) as {
    developerMetadata?: {
      location?: {
        dimensionRange?: {
          sheetId?: number;
          dimension?: string;
          startIndex?: number;
        };
      };
    };
  }[];

  return matched
    .map((entry) => entry.developerMetadata?.location?.dimensionRange)
    .filter(
      (range): range is { sheetId: number; dimension: string; startIndex: number } =>
        Boolean(range) &&
        range?.dimension === 'ROWS' &&
        Number.isFinite(Number(range?.sheetId)) &&
        Number.isFinite(Number(range?.startIndex)),
    )
    .map((range) => ({ sheetId: Number(range.sheetId), rowIndex: Number(range.startIndex) }));
}

/** The two identifier columns of a tab, for the business-identity scan. */
export async function readIdentifierColumns(
  client: SheetsClient,
  tabTitle: string,
): Promise<string[][]> {
  const range = `${quoteTab(tabTitle)}!${VISA_NUMBER_COLUMN}:${PASSPORT_NUMBER_COLUMN}`;
  const payload = await call(
    client,
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
    { method: 'GET' },
  );
  return (payload.values ?? []) as string[][];
}

/** One full register row, for verifying what is actually there. */
export async function readRow(
  client: SheetsClient,
  tabTitle: string,
  rowIndex: number,
): Promise<string[]> {
  const payload = await call(
    client,
    `/values/${encodeURIComponent(rowRange(tabTitle, rowIndex))}`,
    { method: 'GET' },
  );
  const values = (payload.values ?? []) as string[][];
  return values[0] ?? [];
}

/**
 * Appends one register row.
 *
 * `INSERT_ROWS` matters: it inserts rather than writing over whatever sits below
 * the detected table, so an append can never overwrite a historical row.
 * `USER_ENTERED` matters too — it lets Sheets parse the ISO dates into real date
 * values, so the new row sorts and filters with the existing ones. It parses by
 * the same rules as typing into the Sheets UI, so it follows the workbook's
 * locale; the preflight reports that locale, and the first live row must be
 * verified rather than assumed.
 */
export async function appendRow(
  client: SheetsClient,
  tabTitle: string,
  values: string[],
): Promise<number> {
  const range = `${quoteTab(tabTitle)}!A:L`;
  const payload = await call(
    client,
    `/values/${encodeURIComponent(range)}:append` +
      '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS' +
      '&includeValuesInResponse=false',
    { method: 'POST', body: JSON.stringify({ values: [values] }) },
  );

  const updates = payload.updates as { updatedRange?: string } | undefined;
  const rowIndex = rowIndexFromRange(updates?.updatedRange);
  if (rowIndex === null) {
    /* Without knowing where the row landed we cannot tag it, and an untagged
       row would be re-appended by the next retry. */
    throw new SheetsError(
      'append_location_unknown',
      'The office register accepted the row but did not report its location. Retry to reconcile it.',
    );
  }
  return rowIndex;
}

/** Overwrites the twelve cells of a row that has already been identified. */
export async function updateRow(
  client: SheetsClient,
  tabTitle: string,
  rowIndex: number,
  values: string[],
): Promise<void> {
  await call(
    client,
    `/values/${encodeURIComponent(rowRange(tabTitle, rowIndex))}` +
      '?valueInputOption=USER_ENTERED',
    { method: 'PUT', body: JSON.stringify({ values: [values] }) },
  );
}

/**
 * Tags a row as belonging to this HajjERP record.
 *
 * DOCUMENT visibility, so it is readable by anything with access to the file
 * and invisible in the grid: no column is added and no header changes.
 */
export async function attachRecordMetadata(
  client: SheetsClient,
  sheetId: number,
  rowIndex: number,
  recordId: string,
): Promise<void> {
  await call(client, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          createDeveloperMetadata: {
            developerMetadata: {
              metadataKey: ROW_METADATA_KEY,
              metadataValue: recordId,
              visibility: 'DOCUMENT',
              location: {
                dimensionRange: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          },
        },
      ],
    }),
  });
}

/**
 * Read-only inspection of how the register currently stores its dates.
 *
 * Run before the first live write. `UNFORMATTED_VALUE` returns a serial number
 * for a real date and a string for text, which is exactly the distinction that
 * decides whether our rows will sort alongside the historical ones.
 *
 * A GET, and the only Sheets call the preflight makes besides reading the
 * workbook properties. Nothing on this path writes.
 */
export async function preflightDateCells(
  client: SheetsClient,
  tabTitle: string,
  sampleRows = 5,
): Promise<{ range: string; sample: unknown[][] }> {
  const range = `${quoteTab(tabTitle)}!A1:G${sampleRows + 1}`;
  const payload = await call(
    client,
    `/values/${encodeURIComponent(range)}` +
      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER',
    { method: 'GET' },
  );
  return { range, sample: (payload.values ?? []) as unknown[][] };
}

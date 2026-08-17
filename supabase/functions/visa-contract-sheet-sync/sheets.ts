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

/** Tab titles and their sheet ids. Used to decide whether a month tab exists. */
export async function listTabs(
  client: SheetsClient,
): Promise<{ title: string; sheetId: number }[]> {
  const payload = await call(
    client,
    '?fields=sheets.properties(title,sheetId)',
    { method: 'GET' },
  );
  const sheets = (payload.sheets ?? []) as { properties?: { title?: string; sheetId?: number } }[];
  return sheets
    .map((sheet) => ({
      title: sheet.properties?.title ?? '',
      sheetId: Number(sheet.properties?.sheetId ?? -1),
    }))
    .filter((sheet) => sheet.title !== '' && sheet.sheetId >= 0);
}

/**
 * Rows in a tab whose developer metadata carries this record's id.
 *
 * This is the authoritative row identity. Sheets keeps developer metadata
 * attached to the row itself, so it survives staff inserting or deleting rows
 * above it — which a stored row number does not.
 *
 * @returns zero-based row indices within the given tab.
 */
export async function findRowsByRecordId(
  client: SheetsClient,
  sheetId: number,
  recordId: string,
): Promise<number[]> {
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
        Number(range?.sheetId) === sheetId &&
        Number.isFinite(Number(range?.startIndex)),
    )
    .map((range) => Number(range.startIndex));
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
 * values, so the new row sorts and filters with the existing ones.
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

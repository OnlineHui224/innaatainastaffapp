/**
 * GOOGLE SHEETS REQUESTS — checks against a mock
 * ==============================================
 *
 * `fetch` is injected into every Sheets call, so this file exercises the real
 * request-building code without reaching Google. That matters more here than in
 * most integrations: the target is a live business document with years of real
 * cases in it, and a wrong `valueInputOption` or a missing `insertDataOption`
 * would not fail loudly — it would quietly write over historical rows.
 *
 * These checks assert the wire shapes, the row bookkeeping that keeps one record
 * to one row, and the rule that no Google error body is ever passed on.
 */

import {
  type SheetsClient,
  SheetsError,
  appendRow,
  attachRecordMetadata,
  findMetadataRows,
  preflightDateCells,
  readIdentifierColumns,
  readRow,
  readWorkbook,
  updateRow,
} from './sheets.ts';
import { GoogleAuthError, parseServiceAccount } from './googleAuth.ts';
import {
  OFFICE_REGISTER_COLUMNS,
  ROW_METADATA_KEY,
  buildRegisterRow,
  describeDateCells,
} from './mapping.ts';
import type { SyncableRecord } from './mapping.ts';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(label);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function rejects(label: string, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    failures.push(`${label} — expected a refusal, none thrown`);
    return null;
  } catch (e) {
    passed += 1;
    return e;
  }
}

/* ── Mock ──────────────────────────────────────────────────────────────────── */

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mock(handler: (url: string, init: RequestInit) => { status?: number; body?: unknown }) {
  const calls: Recorded[] = [];
  const fetchImpl = (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: String(init.method ?? 'GET'),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null,
    });
    const { status = 200, body = {} } = handler(url, init);
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), { status }),
    );
  };
  return { calls, fetchImpl: fetchImpl as SheetsClient['fetchImpl'] };
}

const SPREADSHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
const RECORD_ID = '9c3b2f10-77aa-4c1e-9c53-4f7d0d51a111';
const AUG_SHEET_ID = 812345;
const SEPT_SHEET_ID = 998877;

function clientWith(fetchImpl: SheetsClient['fetchImpl']): SheetsClient {
  return { spreadsheetId: SPREADSHEET_ID, accessToken: 'ya29.mock-access-token', fetchImpl };
}

const RECORD: SyncableRecord = {
  id: RECORD_ID,
  record_date: '2026-08-17',
  agent_name_snapshot: 'Al Bushra Travels',
  client_source: 'sub_agent',
  visa_number: 'V-8891023',
  passport_number: 'A01234567',
  traveller_name: 'Fatima Yusuf',
  planned_departure_date: '2026-08-21',
  expected_return_date: '2026-09-04',
  makkah_hotel_name: 'Dar Al Eiman Grand',
  madinah_hotel_name: 'Al Haram Hotel',
  transport_summary: 'Full route',
  visa_company: 'Al Muhandis Visa Services',
  arrival_port: 'Jeddah',
};

/* ── Authorisation and addressing ──────────────────────────────────────────── */

{
  const { calls, fetchImpl } = mock(() => ({
    body: {
      properties: { locale: 'en_GB', timeZone: 'Africa/Lagos' },
      sheets: [{ properties: { title: 'Sheet1', sheetId: 0 } }, { properties: { title: 'AUG', sheetId: AUG_SHEET_ID } }],
    },
  }));
  const workbook = await readWorkbook(clientWith(fetchImpl));

  eq('the tab list comes back with titles and ids', workbook.tabs, [
    { title: 'Sheet1', sheetId: 0 },
    { title: 'AUG', sheetId: AUG_SHEET_ID },
  ]);
  /* The locale is read because USER_ENTERED parses by the same rules as the
     Sheets UI, so it decides how our ISO dates are interpreted. */
  eq('the workbook locale is read', workbook.locale, 'en_GB');
  eq('and its time zone', workbook.timeZone, 'Africa/Lagos');
  check('every request carries the bearer token', calls[0].headers.Authorization === 'Bearer ya29.mock-access-token');
  check('every request targets the configured spreadsheet', calls[0].url.includes(SPREADSHEET_ID));
  check('the workbook read is a GET', calls[0].method === 'GET');
  check(
    'only the properties needed are requested',
    calls[0].url.includes('fields=properties(locale,timeZone),sheets.properties(title,sheetId)'),
  );
  check('one request, not two, for tabs and settings', calls.length === 1);
  check('the spreadsheet id never appears in a request body', calls.every((call) => !JSON.stringify(call.body ?? {}).includes(SPREADSHEET_ID)));
}

{
  const { fetchImpl } = mock(() => ({ body: { sheets: [{ properties: { title: '', sheetId: 5 } }, {}] } }));
  const workbook = await readWorkbook(clientWith(fetchImpl));
  eq('malformed tab entries are dropped rather than addressed', workbook.tabs, []);
  eq('an absent locale is reported as unknown, not guessed', workbook.locale, null);
  eq('and so is an absent time zone', workbook.timeZone, null);
}

/* ── Developer metadata: the row identity ──────────────────────────────────── */

{
  const { calls, fetchImpl } = mock(() => ({
    body: {
      matchedDeveloperMetadata: [
        {
          developerMetadata: {
            metadataKey: ROW_METADATA_KEY,
            metadataValue: RECORD_ID,
            location: { dimensionRange: { sheetId: AUG_SHEET_ID, dimension: 'ROWS', startIndex: 56, endIndex: 57 } },
          },
        },
      ],
    },
  }));
  const rows = await findMetadataRows(clientWith(fetchImpl), RECORD_ID);

  eq('a tagged row is found by the record id', rows, [{ sheetId: AUG_SHEET_ID, rowIndex: 56 }]);
  check('the search is a POST to developerMetadata:search', calls[0].method === 'POST' && calls[0].url.endsWith('/developerMetadata:search'));
  const lookup = (calls[0].body as { dataFilters: { developerMetadataLookup: Record<string, string> }[] })
    .dataFilters[0].developerMetadataLookup;
  eq('it looks up the agreed key', lookup.metadataKey, ROW_METADATA_KEY);
  eq('scoped to this record only', lookup.metadataValue, RECORD_ID);
  eq('at document visibility', lookup.visibility, 'DOCUMENT');
}

{
  /*
   * The search covers the WHOLE workbook, and a hit on another month's tab must
   * reach the caller rather than be filtered away. This is the correction that
   * stops a corrected departure month from duplicating a traveller: scoped to the
   * target tab, the old row would be invisible and the sync would append.
   */
  const { fetchImpl } = mock(() => ({
    body: {
      matchedDeveloperMetadata: [
        { developerMetadata: { location: { dimensionRange: { sheetId: SEPT_SHEET_ID, dimension: 'ROWS', startIndex: 3 } } } },
      ],
    },
  }));
  eq(
    'a tagged row on a different tab is reported, not discarded',
    await findMetadataRows(clientWith(fetchImpl), RECORD_ID),
    [{ sheetId: SEPT_SHEET_ID, rowIndex: 3 }],
  );
}

{
  const { calls, fetchImpl } = mock(() => ({ body: {} }));
  await findMetadataRows(clientWith(fetchImpl), RECORD_ID);
  const filter = (calls[0].body as { dataFilters: { developerMetadataLookup: Record<string, unknown> }[] })
    .dataFilters[0].developerMetadataLookup;
  check(
    'the search is not scoped to a sheet, so nothing is hidden from the caller',
    !('locationType' in filter) && !JSON.stringify(calls[0].body).includes('sheetId'),
  );
}

{
  /* Tags on two different tabs must both surface, so the caller can tell a
     duplicate apart from a month change. */
  const { fetchImpl } = mock(() => ({
    body: {
      matchedDeveloperMetadata: [
        { developerMetadata: { location: { dimensionRange: { sheetId: AUG_SHEET_ID, dimension: 'ROWS', startIndex: 56 } } } },
        { developerMetadata: { location: { dimensionRange: { sheetId: SEPT_SHEET_ID, dimension: 'ROWS', startIndex: 4 } } } },
      ],
    },
  }));
  eq(
    'tags across two tabs are both reported',
    await findMetadataRows(clientWith(fetchImpl), RECORD_ID),
    [{ sheetId: AUG_SHEET_ID, rowIndex: 56 }, { sheetId: SEPT_SHEET_ID, rowIndex: 4 }],
  );
}

{
  const { fetchImpl } = mock(() => ({
    body: {
      matchedDeveloperMetadata: [
        { developerMetadata: { location: { dimensionRange: { sheetId: AUG_SHEET_ID, dimension: 'COLUMNS', startIndex: 2 } } } },
        { developerMetadata: { location: { spreadsheet: true } } },
      ],
    },
  }));
  eq(
    'metadata that is not attached to a row is ignored',
    await findMetadataRows(clientWith(fetchImpl), RECORD_ID),
    [],
  );
}

{
  const { fetchImpl } = mock(() => ({ body: {} }));
  eq(
    'an untagged record finds nothing, which is what sends it to identity matching',
    await findMetadataRows(clientWith(fetchImpl), RECORD_ID),
    [],
  );
}

{
  /* Two tagged rows must reach the resolver as two, so it can refuse. Silently
     taking the first would overwrite a row without knowing which is correct. */
  const { fetchImpl } = mock(() => ({
    body: {
      matchedDeveloperMetadata: [
        { developerMetadata: { location: { dimensionRange: { sheetId: AUG_SHEET_ID, dimension: 'ROWS', startIndex: 56 } } } },
        { developerMetadata: { location: { dimensionRange: { sheetId: AUG_SHEET_ID, dimension: 'ROWS', startIndex: 71 } } } },
      ],
    },
  }));
  eq(
    'duplicate tagged rows are both reported so the caller can refuse',
    await findMetadataRows(clientWith(fetchImpl), RECORD_ID),
    [{ sheetId: AUG_SHEET_ID, rowIndex: 56 }, { sheetId: AUG_SHEET_ID, rowIndex: 71 }],
  );
}

/* ── 16. Tagging adds no visible column ────────────────────────────────────── */

{
  const { calls, fetchImpl } = mock(() => ({ body: { replies: [{ createDeveloperMetadata: {} }] } }));
  await attachRecordMetadata(clientWith(fetchImpl), AUG_SHEET_ID, 56, RECORD_ID);

  const request = (calls[0].body as { requests: { createDeveloperMetadata: { developerMetadata: Record<string, unknown> } }[] })
    .requests[0].createDeveloperMetadata.developerMetadata;
  check('tagging is a batchUpdate', calls[0].url.endsWith(':batchUpdate') && calls[0].method === 'POST');
  eq('tagged with the agreed key', request.metadataKey, ROW_METADATA_KEY);
  eq('carrying the HajjERP record id', request.metadataValue, RECORD_ID);
  eq('at document visibility', request.visibility, 'DOCUMENT');
  eq('attached to exactly one row', request.location, {
    dimensionRange: { sheetId: AUG_SHEET_ID, dimension: 'ROWS', startIndex: 56, endIndex: 57 },
  });

  const wire = JSON.stringify(calls[0].body);
  check('16. tagging writes no cell values at all', !wire.includes('"values"'));
  check('16. tagging adds no column', !wire.includes('insertDimension') && !wire.includes('appendDimension'));
  check('16. tagging changes no header', !wire.includes('updateCells') && !OFFICE_REGISTER_COLUMNS.some((column) => wire.includes(column)));
  check('16. tagging does not recolour anything', !/format|backgroundColor|textFormat/i.test(wire));
  check('16. tagging renames nothing', !/updateSheetProperties|addSheet|deleteSheet/i.test(wire));
}

/* ── The identity scan reads only the two identifier columns ───────────────── */

{
  const { calls, fetchImpl } = mock(() => ({ body: { values: [['VISA NUMBER', 'PASSPORT NUMBER'], ['V-1', 'A-1']] } }));
  const rows = await readIdentifierColumns(clientWith(fetchImpl), 'AUG');

  eq('the identifier columns come back row-aligned', rows, [['VISA NUMBER', 'PASSPORT NUMBER'], ['V-1', 'A-1']]);
  check('it reads C:D and nothing else', decodeURIComponent(calls[0].url).includes('AUG!C:D'));
  check('the identity scan is a read', calls[0].method === 'GET');
  check('no traveller name is fetched for matching', !decodeURIComponent(calls[0].url).includes('!A'));
}

{
  const { calls, fetchImpl } = mock(() => ({ body: { values: [buildRegisterRow(RECORD)] } }));
  const readBack = await readRow(clientWith(fetchImpl), 'AUG', 56);
  eq('a row read back has twelve values', readBack.length, 12);
  check('a row is addressed as A:L on its own line', decodeURIComponent(calls[0].url).includes('AUG!A57:L57'));
}

{
  const { fetchImpl } = mock(() => ({ body: {} }));
  eq('an empty row reads as empty rather than undefined', await readRow(clientWith(fetchImpl), 'AUG', 4), []);
}

/* ── 3, 19. Append ─────────────────────────────────────────────────────────── */

{
  const { calls, fetchImpl } = mock(() => ({
    body: { updates: { updatedRange: 'AUG!A57:L57', updatedRows: 1, updatedColumns: 12 } },
  }));
  const values = buildRegisterRow(RECORD);
  const rowIndex = await appendRow(clientWith(fetchImpl), 'AUG', values);

  eq('3. the append reports where the row landed', rowIndex, 56);
  check('3. the append is a POST', calls[0].method === 'POST');
  const url = decodeURIComponent(calls[0].url);
  check('3. appended to the month tab', url.includes('AUG!A:L:append'));

  /* 19. USER_ENTERED, so the ISO dates become real date values and the new row
     sorts and filters alongside the historical ones. RAW would leave them as
     text sitting next to real dates. */
  check('19. values are sent as USER_ENTERED', url.includes('valueInputOption=USER_ENTERED'));
  check('19. never as RAW', !url.includes('valueInputOption=RAW'));

  /* INSERT_ROWS, so an append inserts rather than writing over whatever sits
     below the detected table. This is what makes it impossible for an append to
     overwrite a historical row. */
  check('3. rows are inserted, never written over', url.includes('insertDataOption=INSERT_ROWS'));
  check('3. the appended row is not echoed back', url.includes('includeValuesInResponse=false'));
  eq('3. exactly one row of twelve values is sent', calls[0].body, { values: [values] });
  eq('3. and it is twelve values', (calls[0].body as { values: string[][] }).values[0].length, 12);
  check('3. the append writes no header row', !OFFICE_REGISTER_COLUMNS.every((column) => values.includes(column)));
  eq('19. the dates go out as ISO text for Sheets to parse', values[0], '2026-08-17');
}

{
  /* An append that lands somewhere we cannot identify is worse than one that
     fails: the row exists, cannot be tagged, and the next retry would append a
     second copy. Refusing here is what makes the retry reconcile instead. */
  const { fetchImpl } = mock(() => ({ body: { updates: {} } }));
  const error = await rejects('an append that does not report its location is refused', () =>
    appendRow(clientWith(fetchImpl), 'AUG', buildRegisterRow(RECORD)),
  );
  check('and is reported as a location problem', error instanceof SheetsError && error.code === 'append_location_unknown');
  check(
    'and tells the officer a retry will reconcile it',
    error instanceof SheetsError && /retry/i.test(error.message),
  );
}

/* ── Update ────────────────────────────────────────────────────────────────── */

{
  const { calls, fetchImpl } = mock(() => ({ body: { updatedCells: 12 } }));
  const values = buildRegisterRow({ ...RECORD, visa_number: 'V-8891099' });
  await updateRow(clientWith(fetchImpl), 'AUG', 56, values);

  check('an update is a PUT', calls[0].method === 'PUT');
  const url = decodeURIComponent(calls[0].url);
  check('an update addresses exactly one row', url.includes('AUG!A57:L57'));
  check('19. an update also uses USER_ENTERED', url.includes('valueInputOption=USER_ENTERED'));
  check('an update never appends', !url.includes(':append'));
  eq('an update writes twelve values', (calls[0].body as { values: string[][] }).values[0].length, 12);
  eq('a corrected visa number reaches the register', (calls[0].body as { values: string[][] }).values[0][2], 'V-8891099');
  check(
    'an update touches no column past L',
    /A\d+:L\d+/.test(url) && !/:[M-Z]\d+/.test(url),
  );
}

{
  /* Row 1 is the header. An update is only ever issued for a row the resolver
     positively identified, and the resolver's indices come from Google. */
  const { calls, fetchImpl } = mock(() => ({ body: {} }));
  await updateRow(clientWith(fetchImpl), 'AUG', 0, buildRegisterRow(RECORD));
  check('row indices are translated to 1-based A1 without an off-by-one', decodeURIComponent(calls[0].url).includes('AUG!A1:L1'));
}

{
  const { calls, fetchImpl } = mock(() => ({ body: {} }));
  await updateRow(clientWith(fetchImpl), 'AUG 2026', 3, buildRegisterRow(RECORD));
  check('a tab title with a space is quoted on the wire', decodeURIComponent(calls[0].url).includes("'AUG 2026'!A4:L4"));
}

/* ── Preflight ─────────────────────────────────────────────────────────────── */

{
  const HEADERS = ['DATE', 'AGENT NAME', 'VISA NUMBER', 'PASSPORT NUMBER', 'NAME', 'DEPARTURE DATE', 'ARRIVAL DATE'];
  const { calls, fetchImpl } = mock(() => ({
    body: { values: [HEADERS, [46256, 'Al Bushra', 'V-1', 'A-1', 'Someone', 46260, '04/09/2026']] },
  }));
  const result = await preflightDateCells(clientWith(fetchImpl), 'AUG', 3);

  check('the preflight is a read', calls[0].method === 'GET');
  const url = decodeURIComponent(calls[0].url);
  check('it renders values unformatted so text and dates are distinguishable', url.includes('valueRenderOption=UNFORMATTED_VALUE'));
  check('and dates as serial numbers', url.includes('dateTimeRenderOption=SERIAL_NUMBER'));
  check('it writes nothing', calls.every((call) => call.method === 'GET' && call.body === null));
  check('it issues no append', calls.every((call) => !call.url.includes(':append')));
  check('and no batchUpdate', calls.every((call) => !call.url.includes(':batchUpdate')));
  eq('it reports the range it sampled', result.range, 'AUG!A1:G4');
  eq('a real date comes back as a serial number', result.sample[1][0], 46256);

  /* The sample is only useful once it is read: the report says, per column,
     whether the register holds real dates or date-shaped text. */
  const report = describeDateCells(result.sample);
  eq('DATE is reported as real dates', report[0].verdict, 'date_values');
  eq('DEPARTURE DATE too', report[1].verdict, 'date_values');
  eq('and ARRIVAL DATE is caught as text', report[2].verdict, 'text');
  eq('with the header the workbook actually has', report[2].actualHeader, 'ARRIVAL DATE');
}

{
  /* The whole preflight surface — workbook read plus one values read — must be
     GETs. Anything else here would make "read-only" a claim rather than a fact. */
  const { calls, fetchImpl } = mock((url) => ({
    body: url.includes('/values/')
      ? { values: [['DATE'], [46256]] }
      : { properties: { locale: 'en_GB', timeZone: 'Africa/Lagos' }, sheets: [{ properties: { title: 'AUG', sheetId: AUG_SHEET_ID } }] },
  }));
  const client = clientWith(fetchImpl);
  await readWorkbook(client);
  await preflightDateCells(client, 'AUG');

  eq('the preflight makes exactly two Google calls', calls.length, 2);
  check('both are reads', calls.every((call) => call.method === 'GET'));
  check('neither carries a body', calls.every((call) => call.body === null));
  check(
    'and neither is a mutating endpoint',
    calls.every((call) => !/:append|:batchUpdate/.test(call.url)),
  );
}

/* ── Failures are narrowed, never forwarded ────────────────────────────────── */

{
  const leaky = {
    error: {
      code: 403,
      status: 'PERMISSION_DENIED',
      message: 'Caller does not have permission',
      details: [{ traveller: 'Fatima Yusuf', passport: 'A01234567' }],
    },
  };
  const { fetchImpl } = mock(() => ({ status: 403, body: leaky }));
  const error = await rejects('a permission failure is refused', () => readWorkbook(clientWith(fetchImpl)));

  check('reported as unreachable', error instanceof SheetsError && error.code === 'register_unreachable');
  check("Google's message is not forwarded", error instanceof Error && !error.message.includes('PERMISSION_DENIED'));
  check(
    'and neither is anything the error body echoed back',
    error instanceof Error && !error.message.includes('A01234567') && !error.message.includes('Fatima Yusuf'),
  );
  check('the officer is told what to do instead', error instanceof Error && /try again/i.test(error.message));
  check('the status is kept for the log', error instanceof SheetsError && error.status === 403);
}

{
  const { fetchImpl } = mock(() => ({ status: 404, body: { error: { message: 'Requested entity was not found.' } } }));
  const error = await rejects('a missing spreadsheet is refused', () => readWorkbook(clientWith(fetchImpl)));
  check('also reported as unreachable', error instanceof SheetsError && error.code === 'register_unreachable');
}

{
  const { fetchImpl } = mock(() => ({ status: 429, body: {} }));
  const error = await rejects('a rate limit is refused', () => readWorkbook(clientWith(fetchImpl)));
  check('reported distinctly, because retrying later will work', error instanceof SheetsError && error.code === 'register_rate_limited');
}

{
  const { fetchImpl } = mock(() => ({ status: 500, body: {} }));
  const error = await rejects('a Google server error is refused', () => readWorkbook(clientWith(fetchImpl)));
  check('reported as a generic register error', error instanceof SheetsError && error.code === 'register_error');
}

{
  /* A failed append must not report a row. Returning one would tag an arbitrary
     row and hand the record an owner it does not have. */
  const { fetchImpl } = mock(() => ({ status: 500, body: {} }));
  await rejects('a failed append yields no row index', () => appendRow(clientWith(fetchImpl), 'AUG', buildRegisterRow(RECORD)));
}

/* ── Credentials ───────────────────────────────────────────────────────────── */

{
  const error = (() => {
    try {
      parseServiceAccount('not-base64-json!!!');
      return null;
    } catch (e) {
      passed += 1;
      return e;
    }
  })();
  check('a malformed credential is refused', error instanceof GoogleAuthError);
  check('without quoting what was read', error instanceof Error && !error.message.includes('not-base64-json'));
}

{
  const key = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\n';
  const json = JSON.stringify({ client_email: 'sync@hajjerp.iam.gserviceaccount.com', private_key: key });
  const encoded = btoa(json);
  const account = parseServiceAccount(encoded);
  eq('a valid credential yields the service account address', account.client_email, 'sync@hajjerp.iam.gserviceaccount.com');
  check('and the key, which stays inside this module', account.private_key === key);

  const incomplete = btoa(JSON.stringify({ client_email: 'sync@hajjerp.iam.gserviceaccount.com' }));
  try {
    parseServiceAccount(incomplete);
    failures.push('a credential without a private key is refused');
  } catch (e) {
    passed += 1;
    check('and the refusal names no secret', e instanceof Error && !e.message.includes('private_key'));
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  throw new Error(`Google Sheets request checks failed:\n  - ${failures.join('\n  - ')}`);
}

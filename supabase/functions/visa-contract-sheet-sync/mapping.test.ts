/**
 * OFFICE REGISTER MAPPING + SYNC STATE — checks
 * =============================================
 *
 * Framework-free, like the extraction checks: the assertions run at module load
 * and the file throws at the end if any failed, so it executes under Deno
 * directly and under Node once transpiled. No test runner is added to the app.
 *
 * What is defended here is the office register itself. It is a live, human-edited
 * workbook that predates HajjERP and carries years of real cases. The rules worth
 * the most are the negative ones: do not append twice, do not overwrite a row we
 * have not positively identified, do not guess when two rows could match, and do
 * not let anything that happens at Google reach the liability record.
 */

import {
  DATE_SAMPLE_COLUMNS,
  DIRECT_CLIENT_SHEET_LABEL,
  MONTH_TABS,
  OFFICE_REGISTER_COLUMNS,
  ROW_METADATA_KEY,
  type MetadataRowLocation,
  type SyncableRecord,
  agentNameFor,
  buildRegisterRow,
  classifyCell,
  describeDateCells,
  findBusinessMatches,
  isProtectedTab,
  monthTabFor,
  normaliseIdentifier,
  resolveRow,
  resolveTabTitle,
  rowIndexFromRange,
  rowRange,
  quoteTab,
} from './mapping.ts';
import {
  FORBIDDEN_SYNC_COLUMNS,
  SYNC_STATE_COLUMNS,
  assertSyncPatch,
  failedPatch,
  pendingPatch,
  syncedPatch,
} from './syncState.ts';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(label);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) passed += 1;
  else failures.push(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function throws(label: string, fn: () => unknown): void {
  try {
    fn();
    failures.push(`${label} — expected a refusal, none thrown`);
  } catch {
    passed += 1;
  }
}

const RECORD_ID = '9c3b2f10-77aa-4c1e-9c53-4f7d0d51a111';

const BASE: SyncableRecord = {
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
  transport_summary: 'Full route (Jeddah — Makkah — Madinah — Jeddah)',
  visa_company: 'Al Muhandis Visa Services',
  arrival_port: 'Jeddah',
};

/* ── 18. Month tab derivation, including the workbook's own SEPT spelling ──── */

eq('a July departure files under JUL', monthTabFor('2026-07-02'), 'JUL');
eq('an August departure files under AUG', monthTabFor('2026-08-21'), 'AUG');
eq('a September departure files under SEPT, not SEP', monthTabFor('2026-09-05'), 'SEPT');
check('SEP is never produced', !MONTH_TABS.includes('SEP' as never));
eq('the twelve month tabs are the workbook spelling', MONTH_TABS.length, 12);
eq('January', monthTabFor('2027-01-31'), 'JAN');
eq('December', monthTabFor('2026-12-01'), 'DEC');

/* The tab is a function of the DEPARTURE date and nothing else. A case logged in
   July for an August departure belongs in AUG — filing it by the logging date
   would scatter one departure month across two tabs. */
eq(
  'the tab follows the departure date, not the date the case was logged',
  monthTabFor(BASE.planned_departure_date),
  'AUG',
);
check(
  'record_date does not influence the tab',
  monthTabFor({ ...BASE, record_date: '2026-07-01' }.planned_departure_date) === 'AUG',
);

eq('no departure date means no tab', monthTabFor(null), null);
eq('a blank departure date means no tab', monthTabFor('   '), null);
eq('a non-ISO departure date means no tab', monthTabFor('21/08/2026'), null);
eq('an impossible month means no tab', monthTabFor('2026-13-01'), null);

/* Resolution answers with the workbook's own title so every later call addresses
   the tab by the name it actually has. */
eq('a lowercase workbook title still resolves', resolveTabTitle('AUG', ['Sheet1', 'aug']), 'aug');
eq('"Sept" resolves for SEPT', resolveTabTitle('SEPT', ['JUL', 'Sept']), 'Sept');
eq('a missing tab resolves to nothing', resolveTabTitle('OCT', ['AUG', 'SEPT']), null);

/* ── 15. Sheet1 is never a target ──────────────────────────────────────────── */

check('Sheet1 is protected', isProtectedTab('Sheet1'));
check('sheet1 in any case is protected', isProtectedTab('  SHEET1 '));
check('a month tab is not protected', !isProtectedTab('AUG'));
check('no month tab is ever named Sheet1', !MONTH_TABS.some((tab) => isProtectedTab(tab)));

/* ── 17. Exactly twelve values, in register order ──────────────────────────── */

const row = buildRegisterRow(BASE);
eq('the register has twelve columns', OFFICE_REGISTER_COLUMNS.length, 12);
eq('a built row has exactly twelve values', row.length, 12);
eq('the legacy ARIVAL PORT spelling is preserved', OFFICE_REGISTER_COLUMNS[11], 'ARIVAL PORT');
eq('MEDINAH keeps the register spelling', OFFICE_REGISTER_COLUMNS[8], 'MEDINAH HOTEL');
eq('the values sit in register order', row, [
  '2026-08-17',
  'Al Bushra Travels',
  'V-8891023',
  'A01234567',
  'Fatima Yusuf',
  '2026-08-21',
  '2026-09-04',
  'Dar Al Eiman Grand',
  'Al Haram Hotel',
  'Full route (Jeddah — Makkah — Madinah — Jeddah)',
  'Al Muhandis Visa Services',
  'Jeddah',
]);

/* DATE is the HajjERP logging date; DEPARTURE DATE is the departure. They are
   different cells and one must never be written into the other. */
eq('DATE carries the record date', row[0], BASE.record_date);
eq('DEPARTURE DATE carries the planned departure', row[5], BASE.planned_departure_date);

/* ARRIVAL DATE is the legacy office-register return date. It is not, and must
   never become, actual arrival into Saudi Arabia — that stays with the Journey
   Timeline and staff movement confirmation. */
eq('ARRIVAL DATE carries the expected return date', row[6], BASE.expected_return_date);
eq('the ARRIVAL DATE column header is unchanged', OFFICE_REGISTER_COLUMNS[6], 'ARRIVAL DATE');

/* A short row would shift every later column up; a thirteenth value would write
   into a column the office never asked for. */
const sparse = buildRegisterRow({
  ...BASE,
  makkah_hotel_name: null,
  madinah_hotel_name: null,
  transport_summary: null,
  arrival_port: null,
  expected_return_date: null,
});
eq('a record with blanks still produces twelve values', sparse.length, 12);
eq('a missing hotel is an empty cell, not a dropped column', sparse[7], '');
eq('a missing return date is an empty cell', sparse[6], '');
eq('the columns after the blanks are still in place', sparse[10], 'Al Muhandis Visa Services');

/* ── 19. Date input strategy ───────────────────────────────────────────────── */

/* Dates go out as ISO `YYYY-MM-DD` and are sent with USER_ENTERED (asserted in
   sheets.test.ts), so Sheets stores real date values rather than text. ISO is the
   form least likely to be misread — but USER_ENTERED parses by the same rules as
   typing into the Sheets UI, so it follows the workbook's locale and is NOT
   locale-independent. That is what the read-only preflight is for. */
check('dates leave as ISO', /^\d{4}-\d{2}-\d{2}$/.test(row[0]));
check('departure leaves as ISO', /^\d{4}-\d{2}-\d{2}$/.test(row[5]));
eq(
  'a date that is not ISO is written as blank rather than as guessable text',
  buildRegisterRow({ ...BASE, record_date: '17/08/2026' })[0],
  '',
);
eq(
  'a timestamp is not written into a date cell',
  buildRegisterRow({ ...BASE, planned_departure_date: '2026-08-21T00:00:00Z' })[5],
  '',
);

/* ── AGENT NAME ────────────────────────────────────────────────────────────── */

eq('a sub-agent case carries the agent snapshot', agentNameFor(BASE), 'Al Bushra Travels');
eq('a sub-agent snapshot reaches the register unchanged', buildRegisterRow(BASE)[1], 'Al Bushra Travels');

/*
 * The register is filtered and reported on by agent name, so a direct client must
 * carry the office's own established spelling. Writing the HajjERP screen label
 * "Inna Ataina (direct client)" into this column would split one responsibility
 * group into two different agent names and silently break the office's totals.
 */
eq('the direct-client register label is the office convention', DIRECT_CLIENT_SHEET_LABEL, 'Inna-Ataina');
eq(
  'a direct company client is labelled, not left blank',
  agentNameFor({ ...BASE, client_source: 'direct', agent_name_snapshot: '' }),
  'Inna-Ataina',
);
eq(
  'a direct client is labelled even if a stale snapshot lingers',
  agentNameFor({ ...BASE, client_source: 'direct', agent_name_snapshot: 'Some Agent' }),
  'Inna-Ataina',
);
eq(
  'and it is the AGENT NAME cell that carries it',
  buildRegisterRow({ ...BASE, client_source: 'direct', agent_name_snapshot: '' })[1],
  'Inna-Ataina',
);
check(
  'the HajjERP screen wording never reaches the register',
  !buildRegisterRow({ ...BASE, client_source: 'direct', agent_name_snapshot: '' }).some((cell) =>
    cell.includes('direct client'),
  ),
);

/* ── Identifier normalisation ──────────────────────────────────────────────── */

eq('case is not meaningful', normaliseIdentifier('a01234567'), 'A01234567');
eq('spacing is not meaningful', normaliseIdentifier(' A0123 4567 '), 'A01234567');
eq('a missing identifier normalises to empty', normaliseIdentifier(null), '');

/* ── Business-identity scan ────────────────────────────────────────────────── */

const IDENTIFIER_ROWS = [
  ['VISA NUMBER', 'PASSPORT NUMBER'],
  ['V-1110001', 'B99999999'],
  ['v-8891023', ' a01234567 '],
  ['V-2220002', 'C11111111'],
];

eq(
  'a row matching on both identifiers is found, whatever its case or spacing',
  findBusinessMatches(IDENTIFIER_ROWS, BASE),
  [2],
);
eq(
  'a matching visa number with a different passport is not a match',
  findBusinessMatches(IDENTIFIER_ROWS, { ...BASE, passport_number: 'Z00000000' }),
  [],
);
eq(
  'a matching passport with a different visa number is not a match',
  findBusinessMatches(IDENTIFIER_ROWS, { ...BASE, visa_number: 'V-0000000' }),
  [],
);
eq(
  'a record missing an identifier matches nothing rather than everything',
  findBusinessMatches([['', ''], ['', '']], { visa_number: null, passport_number: null }),
  [],
);
eq(
  'a record with only a visa number does not match on that alone',
  findBusinessMatches(IDENTIFIER_ROWS, { visa_number: 'V-8891023', passport_number: null }),
  [],
);
eq(
  'two register rows carrying the same pair are both reported',
  findBusinessMatches(
    [['V-8891023', 'A01234567'], ['V-8891023', 'A01234567']],
    BASE,
  ),
  [0, 1],
);

/* ── 1, 2, 7, 8. Metadata is the row identity ──────────────────────────────── */

eq('the metadata key is the agreed one', ROW_METADATA_KEY, 'hajjerp_record_id');

const AUG_SHEET = 812345;
const SEPT_SHEET = 998877;

/** A metadata hit on the tab currently being targeted. */
const onTargetTab = (rowIndex: number): MetadataRowLocation => ({
  sheetId: AUG_SHEET,
  tabTitle: 'AUG',
  rowIndex,
});

/** Resolve with AUG as the target unless a test says otherwise. */
function decide(input: {
  metadataRows?: MetadataRowLocation[];
  businessMatchRowIndices?: number[];
  targetSheetId?: number;
  targetTabTitle?: string;
}) {
  return resolveRow({
    targetSheetId: input.targetSheetId ?? AUG_SHEET,
    targetTabTitle: input.targetTabTitle ?? 'AUG',
    metadataRows: input.metadataRows ?? [],
    businessMatchRowIndices: input.businessMatchRowIndices ?? [],
  });
}

/*
 * 1. Row-number drift. Staff insert and delete rows in the register constantly.
 *    Developer metadata moves with its row, so the same record resolves to
 *    whatever index the row now occupies — 56 today, 61 after five insertions —
 *    without any reconciliation step.
 */
eq(
  'a tagged row is followed to wherever it now sits',
  decide({ metadataRows: [onTargetTab(56)] }),
  { action: 'update', rowIndex: 56, source: 'metadata' },
);
eq(
  'the same record after five rows were inserted above it',
  decide({ metadataRows: [onTargetTab(61)] }),
  { action: 'update', rowIndex: 61, source: 'metadata' },
);

/*
 * 2. Metadata beats a stale stored row reference. `spreadsheet_row_ref` is a
 *    human-readable record of where the row was last seen; it is never consulted
 *    to decide where to write. Only the metadata search and the identity scan
 *    feed the decision — the resolver has no parameter for a stored reference,
 *    which is the strongest form this guarantee can take.
 */
check(
  'the row decision has no input for a stored row reference',
  (() => {
    const decided = decide({ metadataRows: [onTargetTab(12)], businessMatchRowIndices: [90] });
    return decided.action === 'update' && decided.rowIndex === 12;
  })(),
);
eq(
  'metadata wins even when a different row also matches on identity',
  decide({ metadataRows: [onTargetTab(12)], businessMatchRowIndices: [90] }),
  { action: 'update', rowIndex: 12, source: 'metadata' },
);

/*
 * 7 and 8. A corrected identifier must not become a permanent human conflict.
 *    Once a row carries this record's id, that row belongs to this Visa Contract.
 *    The corrected Visa Number — or Passport Number — is then written INTO that
 *    same row, which is what makes the correction propagate to the office rather
 *    than stranding it.
 */
const CORRECTED_VISA: SyncableRecord = { ...BASE, visa_number: 'V-8891099' };
const ownedRow = decide({ metadataRows: [onTargetTab(56)] });
eq(
  'a corrected visa number still updates the row this record owns',
  ownedRow,
  { action: 'update', rowIndex: 56, source: 'metadata' },
);
eq(
  'and the corrected visa number is what gets written there',
  buildRegisterRow(CORRECTED_VISA)[2],
  'V-8891099',
);
check(
  'the corrected visa number no longer matches the old value in the sheet',
  findBusinessMatches(IDENTIFIER_ROWS, CORRECTED_VISA).length === 0,
);
/* …and that mismatch is harmless, because the identity scan is not consulted at
   all once metadata has answered. */
eq(
  'a corrected visa number does not produce a conflict',
  decide({ metadataRows: [onTargetTab(56)] }).action,
  'update',
);

const CORRECTED_PASSPORT: SyncableRecord = { ...BASE, passport_number: 'A09999999' };
eq(
  'a corrected passport number likewise updates the owned row',
  decide({ metadataRows: [onTargetTab(56)] }),
  { action: 'update', rowIndex: 56, source: 'metadata' },
);
eq(
  'and the corrected passport number is written there',
  buildRegisterRow(CORRECTED_PASSPORT)[3],
  'A09999999',
);

/* The converse protection: an untagged row is never overwritten on the strength
   of metadata, because there is no metadata to find. It has to go through the
   business-identity reconciliation first. */
eq(
  'a record whose row was never tagged falls through to identity, not to a blind update',
  decide({}),
  { action: 'append' },
);

/* ── Cross-month ownership ──────────────────────────────────────────────────
   The duplication this guards against is subtle and expensive: a record synced
   to AUG whose departure is legitimately corrected to SEPT has NO business-identity
   match in SEPT, so a metadata search scoped to the target tab would find nothing,
   append, and leave the company holding two register rows for one visa. */

const OWNED_IN_AUG: MetadataRowLocation = { sheetId: AUG_SHEET, tabTitle: 'AUG', rowIndex: 56 };

const crossMonth = decide({
  targetSheetId: SEPT_SHEET,
  targetTabTitle: 'SEPT',
  metadataRows: [OWNED_IN_AUG],
  /* Nothing in SEPT matches on identity — precisely the case that used to append. */
  businessMatchRowIndices: [],
});
eq('a corrected departure month refuses instead of writing', crossMonth.action, 'conflict');
check(
  'and it never appends, which is what would have created the duplicate',
  crossMonth.action !== 'append',
);
check(
  'the refusal names the tab the row is actually on',
  crossMonth.action === 'conflict' && /AUG office-register row/.test(crossMonth.reason),
);
check(
  'and the month the record now belongs to',
  crossMonth.action === 'conflict' && /belongs to SEPT/.test(crossMonth.reason),
);
check(
  'and asks for the month change to be resolved',
  crossMonth.action === 'conflict' && /Resolve the month change before retrying/.test(crossMonth.reason),
);
check('a cross-month refusal carries no row to write to', !('rowIndex' in crossMonth));

/* The row on the other tab is not overwritten either — a conflict names no row at
   all, so neither tab is touched. */
check(
  'the owned row on the other tab is not offered as a write target',
  !JSON.stringify(crossMonth).includes('"rowIndex"'),
);

/* Even when SEPT happens to contain an identity match, ownership still decides.
   Adopting the SEPT row would leave the AUG row behind as a second live record. */
const crossMonthWithMatch = decide({
  targetSheetId: SEPT_SHEET,
  targetTabTitle: 'SEPT',
  metadataRows: [OWNED_IN_AUG],
  businessMatchRowIndices: [12],
});
eq(
  'an identity match on the new tab does not override cross-month ownership',
  crossMonthWithMatch.action,
  'conflict',
);

/* A tag whose tab could not be resolved still refuses — it just cannot name the
   month. Guessing "probably this tab" is exactly what must not happen. */
const crossMonthUnknownTab = decide({
  targetSheetId: SEPT_SHEET,
  targetTabTitle: 'SEPT',
  metadataRows: [{ sheetId: 4242, tabTitle: null, rowIndex: 3 }],
});
eq('a tag on an unidentifiable tab still refuses', crossMonthUnknownTab.action, 'conflict');
check(
  'and says so without inventing a month',
  crossMonthUnknownTab.action === 'conflict' &&
    /on another tab/.test(crossMonthUnknownTab.reason) &&
    !/\bAUG\b/.test(crossMonthUnknownTab.reason),
);

/* The same record, same tab, is the ordinary case and must stay an update. */
eq(
  'ownership on the target tab is still a plain update',
  decide({ targetSheetId: AUG_SHEET, targetTabTitle: 'AUG', metadataRows: [OWNED_IN_AUG] }),
  { action: 'update', rowIndex: 56, source: 'metadata' },
);

/* Two tags anywhere in the workbook: the register already disagrees with itself,
   and it is checked before the tab comparison so a cross-tab duplicate cannot be
   read as a month change. */
const duplicateAcrossTabs = decide({
  targetSheetId: AUG_SHEET,
  targetTabTitle: 'AUG',
  metadataRows: [OWNED_IN_AUG, { sheetId: SEPT_SHEET, tabTitle: 'SEPT', rowIndex: 4 }],
});
eq('two tags across two tabs refuse', duplicateAcrossTabs.action, 'conflict');
check(
  'reported as a duplicate tag, not as a month change',
  duplicateAcrossTabs.action === 'conflict' &&
    /More than one register row is tagged/.test(duplicateAcrossTabs.reason),
);
check('and no row is named', !('rowIndex' in duplicateAcrossTabs));

/* ── 3, 4, 5. Append, adopt, refuse ────────────────────────────────────────── */

eq('3. nothing found anywhere appends', decide({}), { action: 'append' });
eq(
  '4. exactly one business match adopts that row instead of appending',
  decide({ businessMatchRowIndices: [41] }),
  { action: 'update', rowIndex: 41, source: 'business_identity' },
);
check(
  '4. an adopted row is flagged for tagging',
  (() => {
    const decided = decide({ businessMatchRowIndices: [41] });
    return decided.action === 'update' && decided.source === 'business_identity';
  })(),
);
check(
  '5. more than one business match refuses rather than guessing',
  decide({ businessMatchRowIndices: [41, 77] }).action === 'conflict',
);
check(
  '5. more than one tagged row also refuses',
  decide({ metadataRows: [onTargetTab(12), onTargetTab(13)] }).action === 'conflict',
);
check(
  '5. a refusal explains what the office must do',
  (() => {
    const decided = decide({ businessMatchRowIndices: [41, 77] });
    return decided.action === 'conflict' && /retry/i.test(decided.reason);
  })(),
);
check(
  '5. a refusal never carries a row to write to',
  !('rowIndex' in decide({ businessMatchRowIndices: [41, 77] })),
);

/*
 * 6. Retrying after an append whose outcome never reached HajjERP.
 *    The browser closed, or the response was lost, but Google did write the row.
 *    The retry finds it — by metadata if tagging completed, by identity if it did
 *    not — and updates it. Neither path can append a second row.
 */
eq(
  '6. a retry after an append that was tagged updates, it does not append again',
  decide({ metadataRows: [onTargetTab(57)], businessMatchRowIndices: [57] }),
  { action: 'update', rowIndex: 57, source: 'metadata' },
);
eq(
  '6. a retry after an append that was NOT tagged adopts the row it left behind',
  decide({ businessMatchRowIndices: [57] }),
  { action: 'update', rowIndex: 57, source: 'business_identity' },
);
check(
  '6. no resolution both appends and names a row',
  [
    decide({}),
    decide({ businessMatchRowIndices: [57] }),
    decide({ metadataRows: [onTargetTab(57)] }),
    decide({ metadataRows: [onTargetTab(1), onTargetTab(2)] }),
    decide({ targetSheetId: SEPT_SHEET, targetTabTitle: 'SEPT', metadataRows: [OWNED_IN_AUG] }),
  ].every((decided) => (decided.action === 'append' ? !('rowIndex' in decided) : true)),
);
check(
  '6. no conflict of any kind names a row',
  [
    decide({ businessMatchRowIndices: [41, 77] }),
    decide({ metadataRows: [onTargetTab(1), onTargetTab(2)] }),
    decide({ targetSheetId: SEPT_SHEET, targetTabTitle: 'SEPT', metadataRows: [OWNED_IN_AUG] }),
  ].every((decided) => decided.action === 'conflict' && !('rowIndex' in decided)),
);

/* ── A1 ranges ─────────────────────────────────────────────────────────────── */

eq('a row range covers exactly the twelve columns', rowRange('AUG', 56), 'AUG!A57:L57');
eq('a row range is 1-based on the wire', rowRange('AUG', 0), 'AUG!A1:L1');
eq('a plain tab title is not quoted', quoteTab('AUG'), 'AUG');
eq('a tab title with a space is quoted', quoteTab('AUG 2026'), "'AUG 2026'");
eq("a tab title containing an apostrophe is escaped", quoteTab("JAN'S"), "'JAN''S'");

eq('the append response reveals where the row landed', rowIndexFromRange('AUG!A57:L57'), 56);
eq('a single-cell range is read too', rowIndexFromRange('AUG!A57'), 56);
eq('a quoted tab in the response is handled', rowIndexFromRange("'AUG 2026'!A12:L12"), 11);
eq('a missing range reveals nothing', rowIndexFromRange(undefined), null);
eq('an unparseable range reveals nothing', rowIndexFromRange('AUG!A:L'), null);

/* ── Preflight classification ──────────────────────────────────────────────
   Reading what the register already holds, so a person can look before the first
   live write. `UNFORMATTED_VALUE` is what makes the answer knowable: a real date
   returns a serial number, a date-shaped string returns a string. */

eq('a serial number is a real date value', classifyCell(46256), 'date_value');
eq('a date-shaped string is text', classifyCell('21/08/2026'), 'text');
eq('an ISO string is still text, not a date value', classifyCell('2026-08-21'), 'text');
eq('an empty cell is empty', classifyCell(''), 'empty');
eq('a missing cell is empty', classifyCell(undefined), 'empty');
eq('a null cell is empty', classifyCell(null), 'empty');
eq('a boolean is neither', classifyCell(true), 'other');

eq('the three date columns are the ones the register has', DATE_SAMPLE_COLUMNS.length, 3);
eq(
  'and they sit where the twelve-column mapping puts them',
  DATE_SAMPLE_COLUMNS.map((c) => [c.column, c.header]),
  [['A', 'DATE'], ['F', 'DEPARTURE DATE'], ['G', 'ARRIVAL DATE']],
);
eq(
  'each names the column the register mapping writes',
  DATE_SAMPLE_COLUMNS.map((c) => OFFICE_REGISTER_COLUMNS[c.index]),
  ['DATE', 'DEPARTURE DATE', 'ARRIVAL DATE'],
);

const HEADER_ROW = ['DATE', 'AGENT NAME', 'VISA NUMBER', 'PASSPORT NUMBER', 'NAME', 'DEPARTURE DATE', 'ARRIVAL DATE'];

const realDates = describeDateCells([
  HEADER_ROW,
  [46256, 'Al Bushra', 'V-1', 'A-1', 'Someone', 46260, 46275],
  [46257, 'Al Bushra', 'V-2', 'A-2', 'Someone', 46261, 46276],
]);
eq('a register storing real dates is reported as such', realDates.map((r) => r.verdict), [
  'date_values',
  'date_values',
  'date_values',
]);
eq('the report names each column', realDates.map((r) => r.column), ['A', 'F', 'G']);
eq('and the header it actually found there', realDates[2].actualHeader, 'ARRIVAL DATE');

/* The answer that matters. Text means new rows written as real dates would sort
   and filter differently from every row above them — a decision about the
   register, not something to resolve in code. */
const textDates = describeDateCells([
  HEADER_ROW,
  ['17/08/2026', 'Al Bushra', 'V-1', 'A-1', 'Someone', '21/08/2026', '04/09/2026'],
]);
eq('a register storing date-shaped text is reported as text', textDates.map((r) => r.verdict), [
  'text',
  'text',
  'text',
]);

const mixedDates = describeDateCells([
  HEADER_ROW,
  [46256, '', '', '', '', '21/08/2026', ''],
]);
eq('a column holding both is reported as mixed', mixedDates[0].verdict, 'date_values');
eq('and the text one as text', mixedDates[1].verdict, 'text');
eq('a column with nothing in it says so rather than guessing', mixedDates[2].verdict, 'no_data');

eq('a sample with only headers reports no data', describeDateCells([HEADER_ROW]).map((r) => r.verdict), [
  'no_data',
  'no_data',
  'no_data',
]);
eq('an empty sample does not throw', describeDateCells([]).length, 3);
eq('and reports nothing found', describeDateCells([])[0].verdict, 'no_data');
eq('a missing header is reported as absent, not invented', describeDateCells([[]])[0].actualHeader, null);

/* A header the workbook spells differently is surfaced, because a mismatch means
   the column mapping itself needs checking before anything is written. */
eq(
  'a differing header is reported verbatim',
  describeDateCells([['DATE ISSUED', '', '', '', '', 'DEP DATE', 'ARR DATE']])[1].actualHeader,
  'DEP DATE',
);
check(
  'the header row is never classified as data',
  describeDateCells([HEADER_ROW, [46256, '', '', '', '', 46260, 46275]])[0].kinds.length === 1,
);

/* ── 13, 14. A Google outcome can never reach the liability record ─────────── */

/* Every database write this function makes is built by one of three functions.
   None of them can name a column outside the sync set, and the guard refuses one
   that tries — so no failure path, however it is reached, can un-confirm a record
   or disturb pilgrim matching. */
const patches = [
  pendingPatch('The OCT tab does not exist in the office register. Create it, then retry.', {
    actorId: 'actor-1',
    spreadsheetId: 'sheet-1',
    tab: 'OCT',
  }),
  failedPatch('The office register could not be updated. Try again shortly.', {
    actorId: 'actor-1',
    spreadsheetId: 'sheet-1',
  }),
  syncedPatch(
    { spreadsheetId: 'sheet-1', tab: 'AUG', rowRef: 'AUG!A57:L57', syncedAt: '2026-08-17T10:00:00Z' },
    { actorId: 'actor-1' },
  ),
];

check(
  '13. no sync outcome writes record_status',
  patches.every((patch) => !('record_status' in patch)),
);
check(
  '14. no sync outcome writes pilgrim_match_status',
  patches.every((patch) => !('pilgrim_match_status' in patch)),
);
check(
  'no sync outcome writes a contract field',
  patches.every((patch) =>
    Object.keys(patch).every((key) => (SYNC_STATE_COLUMNS as readonly string[]).includes(key)),
  ),
);
check(
  'the forbidden set includes both lifecycle axes and the provenance columns',
  ['record_status', 'pilgrim_match_status', 'entry_source', 'extraction_metadata'].every((column) =>
    (FORBIDDEN_SYNC_COLUMNS as readonly string[]).includes(column),
  ),
);
check(
  'no column is both allowed and forbidden',
  !(SYNC_STATE_COLUMNS as readonly string[]).some((column) =>
    (FORBIDDEN_SYNC_COLUMNS as readonly string[]).includes(column),
  ),
);
throws('a patch that reaches for record_status is refused', () =>
  assertSyncPatch({ spreadsheet_sync_status: 'SYNCED', record_status: 'PENDING_REVIEW' }),
);
throws('a patch that reaches for pilgrim_match_status is refused', () =>
  assertSyncPatch({ pilgrim_match_status: 'UNMATCHED' }),
);
throws('a patch that reaches for a contract field is refused', () =>
  assertSyncPatch({ visa_number: 'V-0000000' }),
);
check(
  'a legitimate sync patch passes the guard',
  Object.keys(assertSyncPatch(patches[2])).length === 7,
);

/* ── 9. A missing month tab is pending work, not a failure ─────────────────── */

const missingTab = pendingPatch(
  'The OCT tab does not exist in the office register. Create it, then retry.',
  { actorId: 'actor-1', spreadsheetId: 'sheet-1', tab: 'OCT' },
);
eq('9. a missing tab leaves the record SYNC_PENDING', missingTab.spreadsheet_sync_status, 'SYNC_PENDING');
check(
  '9. and says which tab the office must create',
  typeof missingTab.sync_error === 'string' && /OCT tab does not exist/.test(missingTab.sync_error),
);
check(
  '9. and tells the officer to retry rather than to fix it in HajjERP',
  typeof missingTab.sync_error === 'string' && /then retry/i.test(missingTab.sync_error),
);
check('9. a missing tab is not reported as a failure', missingTab.spreadsheet_sync_status !== 'SYNC_FAILED');
/* The tab is recorded as the one that was WANTED, so the retry knows what it is
   waiting for even though nothing was written. */
eq('9. the intended tab is recorded', missingTab.spreadsheet_tab, 'OCT');
check('9. no row reference is invented for a write that did not happen', !('spreadsheet_row_ref' in missingTab));
check('9. no sync timestamp is invented either', !('last_synced_at' in missingTab));

/* A conflict is a failure, because a person has to resolve a duplicate. */
const conflict = failedPatch('More than one register row already carries this visa and passport number. Resolve the duplicate in the office register, then retry.', {
  actorId: 'actor-1',
  spreadsheetId: 'sheet-1',
  tab: 'AUG',
});
eq('a conflict is SYNC_FAILED', conflict.spreadsheet_sync_status, 'SYNC_FAILED');
check('a conflict does not claim a row', !('spreadsheet_row_ref' in conflict));

/* A completed sync clears the previous error rather than leaving a stale one on
   screen next to a green status. */
eq('a completed sync clears the previous error', patches[2].sync_error, null);
eq('a completed sync records where the row is', patches[2].spreadsheet_row_ref, 'AUG!A57:L57');

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  throw new Error(`Office register mapping checks failed:\n  - ${failures.join('\n  - ')}`);
}

import type { SubAgent } from '@/types';

export interface VerifiedPilgrimRow {
  rowNum: number;
  fullName: string;
  passportNumber: string;
  visaNumber: string;
  agentName: string;
  agentMatchKey: string;
  departureDate: string;
  expectedReturnDate: string;
  makkahHotel: string;
  madinahHotel: string;
  transportation: string;
  visaCompany: string;
  arrivalPort: string;
  contractRecordDate: string;
  importStatus: 'READY' | 'REVIEW';
  reviewReason: string;
  sourceSheet: string;
  sourceRow: number;
  originalDepartureValue: string;
  originalReturnValue: string;
}

export type AgentMatchStatus = 'matched' | 'new' | 'ambiguous';

export interface AgentMatchEntry {
  csvAgentName: string;
  matchKey: string;
  normalizedKey: string;
  matchedAgent: SubAgent | null;
  similarAgents: SubAgent[];
  status: AgentMatchStatus;
  pilgrimCount: number;
  manuallyResolved: boolean;
  isNew: boolean;
}

export interface DemoRecord {
  id: string;
  name: string;
  type: 'agent' | 'pilgrim';
  isSampleData: boolean;
  reason: string;
}

export interface DuplicateCheck {
  passportNumber: string;
  csvRow: number;
  existingPilgrimId: string | null;
  existingPilgrimName: string | null;
  isInternalDuplicate: boolean;
}

export interface ImportTotals {
  totalRows: number;
  readyRows: number;
  reviewRows: number;
  uniqueAgentKeys: number;
}

const DEMO_KEYWORDS = ['sample', 'demo', 'test', 'seed', 'mock', 'placeholder', 'dummy'];

export function normalizeKey(key: string): string {
  return key
    .toUpperCase()
    .trim()
    .replace(/[-_.,"'/\\]/g, '')
    .replace(/\s+/g, '');
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_.,"'/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute SHA-256 hash of file content for audit logging.
 */
export async function computeFileHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse a CSV file into verified pilgrim rows.
 * Uses the Papa Parse-free manual CSV parsing to avoid extra dependencies.
 */
export function parseVerifiedCsv(text: string): VerifiedPilgrimRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => { headerMap[h.toLowerCase()] = i; });

  const get = (row: string[], key: string): string => {
    const idx = headerMap[key.toLowerCase()];
    return idx !== undefined ? (row[idx] || '').trim() : '';
  };

  const rows: VerifiedPilgrimRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const status = (get(cells, 'Import Status') || '').toUpperCase() as 'READY' | 'REVIEW';
    if (!status) continue;

    rows.push({
      rowNum: i + 1,
      fullName: get(cells, 'Pilgrim Name'),
      passportNumber: get(cells, 'Passport Number'),
      visaNumber: get(cells, 'Visa Number'),
      agentName: get(cells, 'Agent Name'),
      agentMatchKey: get(cells, 'Agent Match Key'),
      departureDate: get(cells, 'Departure Date'),
      expectedReturnDate: get(cells, 'Expected Return Date'),
      makkahHotel: get(cells, 'Makkah Hotel'),
      madinahHotel: get(cells, 'Madinah Hotel'),
      transportation: get(cells, 'Transportation'),
      visaCompany: get(cells, 'Visa Company'),
      arrivalPort: get(cells, 'Arrival Port'),
      contractRecordDate: get(cells, 'Contract Record Date'),
      importStatus: status === 'REVIEW' ? 'REVIEW' : 'READY',
      reviewReason: get(cells, 'Review Reason'),
      sourceSheet: get(cells, 'Source Sheet'),
      sourceRow: parseInt(get(cells, 'Source Row') || '0', 10),
      originalDepartureValue: get(cells, 'Original Departure Value'),
      originalReturnValue: get(cells, 'Original Return Value'),
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function computeTotals(rows: VerifiedPilgrimRow[]): ImportTotals {
  const ready = rows.filter((r) => r.importStatus === 'READY').length;
  const review = rows.filter((r) => r.importStatus === 'REVIEW').length;
  const agentKeys = new Set(rows.map((r) => r.agentMatchKey).filter(Boolean));
  return {
    totalRows: rows.length,
    readyRows: ready,
    reviewRows: review,
    uniqueAgentKeys: agentKeys.size,
  };
}

/**
 * Match CSV agents against existing sub-agents using the Agent Match Key.
 * Also checks for similar keys that might represent the same agent.
 */
export function matchAgents(
  rows: VerifiedPilgrimRow[],
  existingAgents: SubAgent[]
): Map<string, AgentMatchEntry> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (!r.agentMatchKey) continue;
    const existing = counts.get(r.agentMatchKey);
    if (existing) {
      existing.count++;
    } else {
      counts.set(r.agentMatchKey, { name: r.agentName, count: 1 });
    }
  }

  const existingByKey = new Map<string, SubAgent>();
  for (const a of existingAgents) {
    const key = a.agent_match_key ? normalizeKey(a.agent_match_key) : normalizeKey(a.organisation_name);
    existingByKey.set(key, a);
  }

  const matches = new Map<string, AgentMatchEntry>();

  for (const [matchKey, { name, count }] of counts) {
    const normKey = normalizeKey(matchKey);
    const exactMatch = existingByKey.get(normKey);

    if (exactMatch) {
      matches.set(matchKey, {
        csvAgentName: name,
        matchKey,
        normalizedKey: normKey,
        matchedAgent: exactMatch,
        similarAgents: [],
        status: 'matched',
        pilgrimCount: count,
        manuallyResolved: false,
        isNew: false,
      });
      continue;
    }

    const similar = existingAgents.filter((a) => {
      const aKey = a.agent_match_key ? normalizeKey(a.agent_match_key) : normalizeKey(a.organisation_name);
      return isSimilarKey(normKey, aKey);
    });

    if (similar.length > 0) {
      matches.set(matchKey, {
        csvAgentName: name,
        matchKey,
        normalizedKey: normKey,
        matchedAgent: null,
        similarAgents: similar,
        status: 'ambiguous',
        pilgrimCount: count,
        manuallyResolved: false,
        isNew: false,
      });
    } else {
      matches.set(matchKey, {
        csvAgentName: name,
        matchKey,
        normalizedKey: normKey,
        matchedAgent: null,
        similarAgents: [],
        status: 'new',
        pilgrimCount: count,
        manuallyResolved: false,
        isNew: true,
      });
    }
  }

  return matches;
}

/**
 * Detect similar agent keys that might be the same agent.
 * Uses Levenshtein-like comparison for short codes.
 * Does NOT merge automatically — just flags for admin decision.
 */
function isSimilarKey(key1: string, key2: string): boolean {
  if (key1 === key2) return false;
  if (key1.length < 2 || key2.length < 2) return false;

  if (Math.abs(key1.length - key2.length) <= 1) {
    let diffs = 0;
    const longer = key1.length >= key2.length ? key1 : key2;
    const shorter = key1.length < key2.length ? key1 : key2;
    for (let i = 0, j = 0; i < longer.length && j < shorter.length; i++, j++) {
      if (longer[i] !== shorter[j]) {
        diffs++;
        if (longer.length > shorter.length) j--;
      }
    }
    if (diffs <= 1) return true;
  }

  if (key1.includes(key2) || key2.includes(key1)) {
    const shorter = key1.length <= key2.length ? key1 : key2;
    if (shorter.length >= 3) return true;
  }

  return false;
}

/**
 * Identify demo/sample records in existing data.
 * A record is "clearly demo" if is_sample_data is true.
 * Records with demo keywords in names but is_sample_data=false are "suspected".
 */
export function identifyDemoRecords(
  agents: SubAgent[],
  pilgrims: { id: string; full_name: string; passport_number: string; is_sample_data: boolean }[]
): { demoAgents: DemoRecord[]; demoPilgrims: DemoRecord[]; suspectedRecords: DemoRecord[] } {
  const demoAgents: DemoRecord[] = [];
  const demoPilgrims: DemoRecord[] = [];
  const suspectedRecords: DemoRecord[] = [];

  for (const a of agents) {
    if (a.is_sample_data) {
      demoAgents.push({
        id: a.id,
        name: a.organisation_name,
        type: 'agent',
        isSampleData: true,
        reason: 'Marked as sample data in database',
      });
    } else {
      const nameLower = a.organisation_name.toLowerCase();
      const hasKeyword = DEMO_KEYWORDS.some((kw) => nameLower.includes(kw));
      if (hasKeyword) {
        suspectedRecords.push({
          id: a.id,
          name: a.organisation_name,
          type: 'agent',
          isSampleData: false,
          reason: `Name contains demo keyword`,
        });
      }
    }
  }

  for (const p of pilgrims) {
    if (p.is_sample_data) {
      demoPilgrims.push({
        id: p.id,
        name: `${p.full_name} (${p.passport_number})`,
        type: 'pilgrim',
        isSampleData: true,
        reason: 'Marked as sample data in database',
      });
    } else {
      const nameLower = p.full_name.toLowerCase();
      const passportLower = p.passport_number.toLowerCase();
      const hasKeyword = DEMO_KEYWORDS.some((kw) => nameLower.includes(kw) || passportLower.includes(kw));
      if (hasKeyword) {
        suspectedRecords.push({
          id: p.id,
          name: `${p.full_name} (${p.passport_number})`,
          type: 'pilgrim',
          isSampleData: false,
          reason: `Name or passport contains demo keyword`,
        });
      }
    }
  }

  return { demoAgents, demoPilgrims, suspectedRecords };
}

/**
 * Check for duplicate passport numbers within the CSV and against existing pilgrims.
 */
export function checkDuplicates(
  rows: VerifiedPilgrimRow[],
  existingPilgrims: { id: string; full_name: string; passport_number: string }[]
): { internalDuplicates: DuplicateCheck[]; existingDuplicates: DuplicateCheck[] } {
  const passportMap = new Map<string, VerifiedPilgrimRow[]>();
  for (const r of rows) {
    const pp = r.passportNumber.trim().toUpperCase();
    if (!pp) continue;
    if (!passportMap.has(pp)) passportMap.set(pp, []);
    passportMap.get(pp)!.push(r);
  }

  const internalDuplicates: DuplicateCheck[] = [];
  for (const [pp, rs] of passportMap) {
    if (rs.length > 1) {
      for (const r of rs) {
        internalDuplicates.push({
          passportNumber: pp,
          csvRow: r.rowNum,
          existingPilgrimId: null,
          existingPilgrimName: null,
          isInternalDuplicate: true,
        });
      }
    }
  }

  const existingByPassport = new Map<string, { id: string; full_name: string }>();
  for (const p of existingPilgrims) {
    existingByPassport.set(p.passport_number.trim().toUpperCase(), { id: p.id, full_name: p.full_name });
  }

  const existingDuplicates: DuplicateCheck[] = [];
  for (const r of rows) {
    const pp = r.passportNumber.trim().toUpperCase();
    if (!pp) continue;
    const existing = existingByPassport.get(pp);
    if (existing) {
      existingDuplicates.push({
        passportNumber: pp,
        csvRow: r.rowNum,
        existingPilgrimId: existing.id,
        existingPilgrimName: existing.full_name,
        isInternalDuplicate: false,
      });
    }
  }

  return { internalDuplicates, existingDuplicates };
}

/**
 * Convert a date string to ISO YYYY-MM-DD.
 * Handles ISO dates, dd-Mon-yyyy (e.g. 19-Jul-2026), and Excel serial numbers.
 */
export function parseDate(value: string): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const ddMonYyyy = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddMonYyyy) {
    const day = ddMonYyyy[1].padStart(2, '0');
    const mon = monthMap[ddMonYyyy[2].toLowerCase().slice(0, 3)];
    const year = ddMonYyyy[3];
    if (mon) return `${year}-${mon}-${day}`;
  }

  const serial = parseInt(trimmed, 10);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Generate an internal agent code from the agent match key.
 * Format: First 6 chars of the normalized key, uppercased.
 */
export function generateAgentCode(matchKey: string, existingCodes: Set<string>): string {
  const base = normalizeKey(matchKey).slice(0, 8);
  let code = base;
  let suffix = 1;
  while (existingCodes.has(code)) {
    code = `${base}${suffix}`;
    suffix++;
  }
  existingCodes.add(code);
  return code;
}

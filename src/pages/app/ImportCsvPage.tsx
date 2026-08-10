import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Copy,
  FileCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import { compareDates } from '@/lib/status';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ============================================================
// Types
// ============================================================

interface ParsedRow {
  rowIndex: number;
  fullName: string;
  passportNumber: string;
  visaNumber: string;
  agentName: string;
  scheduledOutbound: string;
  expectedReturn: string;
  visaCompany: string;
  arrivalPort: string;
  notes: string;
  status: 'valid' | 'review' | 'duplicate';
  errors: string[];
}

interface AgentMatch {
  csvName: string;
  normalized: string;
  existingAgent: SubAgent | null;
  candidates: SubAgent[];
  isNew: boolean;
  isAmbiguous: boolean;
}

interface ImportSummary {
  totalRows: number;
  validRows: number;
  reviewRows: number;
  duplicateRows: number;
  existingAgentsMatched: number;
  newAgents: number;
  ambiguousAgents: number;
}

// ============================================================
// CSV Template
// ============================================================

const TEMPLATE_COLUMNS = [
  'Pilgrim Name',
  'Passport Number',
  'Visa Number',
  'Agent Name',
  'Scheduled Outbound Date',
  'Expected Return Date',
  'Visa Company',
  'Arrival Port',
  'Notes',
];

function downloadTemplate() {
  const header = TEMPLATE_COLUMNS.join(',');
  const example1 = 'AHMED IBRAHIM,B12345678,V1234567890,SAHEED TRAVELS,2026-06-15,2026-07-05,LYN,Jeddah,Group leader';
  const example2 = 'FATIMAH BELLO,B87654321,V0987654321,NOKBAH TRAVELS,2026-06-20,2026-07-10,LYN,Jeddah,';
  const csv = `${header}\n${example1}\n${example2}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pilgrim_import_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// CSV Parsing & Validation
// ============================================================

function normalizeAgentName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .toUpperCase();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDateFlexible(value: string): string | null {
  if (!value.trim()) return null;
  // Try YYYY-MM-DD
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Try DD/MM/YYYY
  const dmy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  // Try MM/DD/YYYY
  const mdy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0');
    const day = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${month}-${day}`;
  }
  return null;
}

function parseCSV(text: string, existingAgents: SubAgent[], existingPassports: Set<string>): {
  rows: ParsedRow[];
  agentMatches: AgentMatch[];
  summary: ImportSummary;
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], agentMatches: [], summary: { totalRows: 0, validRows: 0, reviewRows: 0, duplicateRows: 0, existingAgentsMatched: 0, newAgents: 0, ambiguousAgents: 0 } };
  }

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const colMap: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h.includes('name') && !h.includes('agent') && !h.includes('visa') && !colMap.name) colMap.name = i;
    else if (h.includes('passport')) colMap.passport = i;
    else if (h.includes('visa') && h.includes('number')) colMap.visa = i;
    else if (h.includes('agent') || h.includes('sub-agent') || h.includes('sub agent')) colMap.agent = i;
    else if (h.includes('outbound') || (h.includes('departure') && h.includes('date'))) colMap.outbound = i;
    else if (h.includes('return') || (h.includes('expected') && h.includes('return'))) colMap.return = i;
    else if (h.includes('visa') && h.includes('company')) colMap.visaCompany = i;
    else if (h.includes('arrival') && h.includes('port')) colMap.arrivalPort = i;
    else if (h.includes('notes')) colMap.notes = i;
  });

  const rows: ParsedRow[] = [];
  const csvAgentNames = new Map<string, AgentMatch>();
  const passportSet = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const fullName = cols[colMap.name ?? 0] ?? '';
    const passportNumber = (cols[colMap.passport ?? 1] ?? '').toUpperCase().trim();
    const visaNumber = cols[colMap.visa ?? 2] ?? '';
    const agentName = cols[colMap.agent ?? 3] ?? '';
    const rawOutbound = cols[colMap.outbound ?? 4] ?? '';
    const rawReturn = cols[colMap.return ?? 5] ?? '';
    const visaCompany = cols[colMap.visaCompany ?? 6] ?? '';
    const arrivalPort = cols[colMap.arrivalPort ?? 7] ?? '';
    const notes = cols[colMap.notes ?? 8] ?? '';

    const scheduledOutbound = parseDateFlexible(rawOutbound) ?? '';
    const expectedReturn = parseDateFlexible(rawReturn) ?? '';

    const errors: string[] = [];

    if (!fullName.trim()) errors.push('Pilgrim name is required.');
    if (!passportNumber) errors.push('Passport number is required.');
    if (!agentName.trim()) errors.push('Agent name is required.');
    if (!scheduledOutbound) errors.push('Scheduled outbound date is missing or invalid.');
    if (!expectedReturn) errors.push('Expected return date is missing or invalid.');

    if (scheduledOutbound && expectedReturn && compareDates(expectedReturn, scheduledOutbound) < 0) {
      errors.push('Expected return date is before scheduled outbound date.');
    }

    // Check duplicate passport within CSV
    if (passportNumber && passportSet.has(passportNumber)) {
      errors.push('Duplicate passport number within this CSV.');
    }
    if (passportNumber) passportSet.add(passportNumber);

    // Check duplicate against existing database
    const isDuplicate = passportNumber && existingPassports.has(passportNumber);

    const status: ParsedRow['status'] = isDuplicate ? 'duplicate' : errors.length > 0 ? 'review' : 'valid';
    rows.push({
      rowIndex: i + 1,
      fullName,
      passportNumber,
      visaNumber,
      agentName,
      scheduledOutbound,
      expectedReturn,
      visaCompany,
      arrivalPort,
      notes,
      status,
      errors,
    });

    // Track agent names
    if (agentName.trim()) {
      const normalized = normalizeAgentName(agentName);
      if (!csvAgentNames.has(normalized)) {
        const exact = existingAgents.find((a) => normalizeAgentName(a.organisation_name) === normalized);
        const internalCodeMatch = existingAgents.find(
          (a) => a.internal_code && a.internal_code.toUpperCase() === normalized
        );
        const candidates = existingAgents.filter((a) => {
          const agentNorm = normalizeAgentName(a.organisation_name);
          return agentNorm.includes(normalized) || normalized.includes(agentNorm);
        });
        const matched = exact ?? internalCodeMatch ?? null;
        csvAgentNames.set(normalized, {
          csvName: agentName.trim(),
          normalized,
          existingAgent: matched,
          candidates: matched ? [] : candidates.slice(0, 3),
          isNew: !matched,
          isAmbiguous: !matched && candidates.length > 1,
        });
      }
    }
  }

  const agentMatches = Array.from(csvAgentNames.values());
  const summary: ImportSummary = {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === 'valid').length,
    reviewRows: rows.filter((r) => r.status === 'review').length,
    duplicateRows: rows.filter((r) => r.status === 'duplicate').length,
    existingAgentsMatched: agentMatches.filter((a) => a.existingAgent).length,
    newAgents: agentMatches.filter((a) => a.isNew && !a.isAmbiguous).length,
    ambiguousAgents: agentMatches.filter((a) => a.isAmbiguous).length,
  };

  return { rows, agentMatches, summary };
}

async function computeFileHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================
// Component
// ============================================================

type Phase = 'upload' | 'preview' | 'importing' | 'done';

export default function ImportCsvPage() {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [agentMatches, setAgentMatches] = useState<AgentMatch[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [, setExistingAgents] = useState<SubAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; review: number; duplicates: number; agentsCreated: number; agentsMatched: number } | null>(null);
  const [ambiguousResolutions, setAmbiguousResolutions] = useState<Record<string, string>>({});

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }
    setPhase('upload');
    setFileName(file.name);

    try {
      const text = await file.text();
      const hash = await computeFileHash(text);

      // Fetch existing agents and passports
      const [{ data: agents }, { data: pilgrims }] = await Promise.all([
        supabase.from('sub_agents').select('*').order('organisation_name'),
        supabase.from('pilgrims').select('passport_number'),
      ]);

      const existingPassports = new Set(
        (pilgrims ?? []).map((p) => (p as { passport_number: string }).passport_number.toUpperCase())
      );

      const { rows, agentMatches, summary } = parseCSV(
        text,
        (agents ?? []) as SubAgent[],
        existingPassports
      );

      setRows(rows);
      setAgentMatches(agentMatches);
      setSummary(summary);
      setFileHash(hash);
      setExistingAgents((agents ?? []) as SubAgent[]);
      setPhase('preview');
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function resetAll() {
    setPhase('upload');
    setFileName('');
    setFileHash('');
    setRows([]);
    setAgentMatches([]);
    setSummary(null);
    setError(null);
    setImportResult(null);
    setAmbiguousResolutions({});
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleConfirmImport() {
    setPhase('importing');
    setConfirmOpen(false);
    setError(null);

    try {
      const batchId = crypto.randomUUID();
      const validRows = rows.filter((r) => r.status === 'valid');
      const reviewRows = rows.filter((r) => r.status === 'review');
      const duplicateRows = rows.filter((r) => r.status === 'duplicate');

      // Resolve agents: create new ones, use matched ones, resolve ambiguous
      const agentIdMap = new Map<string, string>();
      let agentsCreated = 0;
      let agentsMatched = 0;

      for (const match of agentMatches) {
        if (match.existingAgent) {
          agentIdMap.set(match.normalized, match.existingAgent.id);
          agentsMatched++;
        } else if (match.isAmbiguous) {
          const resolvedId = ambiguousResolutions[match.normalized];
          if (resolvedId && resolvedId !== 'new') {
            agentIdMap.set(match.normalized, resolvedId);
            agentsMatched++;
          } else {
            // Create new agent
            const { data, error: createErr } = await supabase
              .from('sub_agents')
              .insert({
                organisation_name: match.csvName,
                contact_person: 'To be updated',
                country: 'Nigeria',
                is_sample_data: false,
                active_status: true,
              })
              .select('id')
              .maybeSingle();
            if (createErr) throw createErr;
            if (data) {
              agentIdMap.set(match.normalized, data.id);
              agentsCreated++;
            }
          }
        } else if (match.isNew) {
          const { data, error: createErr } = await supabase
            .from('sub_agents')
            .insert({
              organisation_name: match.csvName,
              contact_person: 'To be updated',
              country: 'Nigeria',
              is_sample_data: false,
              active_status: true,
            })
            .select('id')
            .maybeSingle();
          if (createErr) throw createErr;
          if (data) {
            agentIdMap.set(match.normalized, data.id);
            agentsCreated++;
          }
        }
      }

      // Insert valid pilgrims
      let created = 0;
      for (const row of validRows) {
        const agentNorm = normalizeAgentName(row.agentName);
        const subAgentId = agentIdMap.get(agentNorm) ?? null;
        const { error: insertErr } = await supabase.from('pilgrims').insert({
          full_name: row.fullName,
          passport_number: row.passportNumber,
          nationality: 'Nigeria',
          sub_agent_id: subAgentId,
          expected_departure_date: row.scheduledOutbound,
          expected_return_date: row.expectedReturn,
          visa_number: row.visaNumber || null,
          visa_company: row.visaCompany || null,
          arrival_port: row.arrivalPort || null,
          operational_notes: row.notes || null,
          source_sheet: fileName,
          source_row: row.rowIndex,
          import_batch_id: batchId,
          is_sample_data: false,
          actual_departure_date: null,
          actual_arrival_at: null,
          arrival_confirmed_at: null,
          arrival_confirmed_by: null,
          departure_confirmed_at: null,
          departure_confirmed_by: null,
          status_source: 'CSV_IMPORT',
          created_by: profile?.id ?? null,
          updated_by: profile?.id ?? null,
        });
        if (insertErr) {
          if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
            // Skip duplicate
          } else {
            throw insertErr;
          }
        } else {
          created++;
        }
      }

      // Queue review rows
      let reviewQueued = 0;
      for (const row of reviewRows) {
        const { error: queueErr } = await supabase.from('import_review_queue').insert({
          batch_id: batchId,
          full_name: row.fullName || 'UNKNOWN',
          passport_number: row.passportNumber || 'UNKNOWN',
          visa_number: row.visaNumber || null,
          agent_name: row.agentName || null,
          agent_match_key: normalizeAgentName(row.agentName),
          departure_date: row.scheduledOutbound || null,
          expected_return_date: row.expectedReturn || null,
          visa_company: row.visaCompany || null,
          arrival_port: row.arrivalPort || null,
          review_reason: row.errors.join('; '),
          source_sheet: fileName,
          source_row: row.rowIndex,
          original_departure_value: row.scheduledOutbound,
          original_return_value: row.expectedReturn,
          status: 'pending',
        });
        if (!queueErr) reviewQueued++;
      }

      // Record batch
      await supabase.from('import_batches').insert({
        id: batchId,
        file_name: fileName,
        file_hash: fileHash,
        performed_by: profile?.id ?? null,
        performed_by_name: profile?.full_name ?? '',
        total_rows: summary!.totalRows,
        ready_rows: validRows.length,
        review_rows: reviewRows.length,
        pilgrims_created: created,
        agents_created: agentsCreated,
        agents_matched: agentsMatched,
        duplicates_skipped: duplicateRows.length,
        review_queued: reviewQueued,
        demo_agents_removed: 0,
        demo_pilgrims_removed: 0,
      });

      // Audit log
      await logAudit({
        action: 'csv_import_completed',
        recordType: 'pilgrim',
        recordLabel: `CSV import: ${fileName} — ${created} created, ${reviewQueued} review, ${duplicateRows.length} duplicates`,
        newValue: {
          batch_id: batchId,
          file_name: fileName,
          file_hash: fileHash,
          total_rows: summary!.totalRows,
          created,
          review_queued: reviewQueued,
          duplicates: duplicateRows.length,
          agents_created: agentsCreated,
          agents_matched: agentsMatched,
        },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });

      setImportResult({ created, review: reviewQueued, duplicates: duplicateRows.length, agentsCreated, agentsMatched });
      setPhase('done');
    } catch (err) {
      setError(friendlyError(err));
      setPhase('preview');
    }
  }

  // ============================================================
  // Render
  // ============================================================

  if (phase === 'done' && importResult) {
    return (
      <div>
        <Link to="/app/pilgrims" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Pilgrims
        </Link>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">Import Complete</h2>
          <p className="mt-2 text-sm text-slate-600">File: {fileName}</p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
            <ResultStat label="Pilgrims Created" value={importResult.created} color="text-emerald-700" />
            <ResultStat label="Review Queue" value={importResult.review} color="text-orange-600" />
            <ResultStat label="Duplicates Skipped" value={importResult.duplicates} color="text-slate-600" />
            <ResultStat label="New Agents" value={importResult.agentsCreated} color="text-brand-600" />
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/app/pilgrims/review-queue" className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-all">
              Go to Review Queue
            </Link>
            <button onClick={resetAll} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
              Import Another File
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/app/pilgrims" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Pilgrims
      </Link>

      <PageHeader
        title="Import Pilgrims from CSV"
        subtitle="Upload a CSV file to bulk-import pilgrim records. All imported records start as Travel Scheduled — no arrival or departure is confirmed."
        icon={<Upload className="h-6 w-6" />}
        actions={
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Download className="h-4 w-4" /> Download Template
          </button>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Upload phase */}
      {phase === 'upload' && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center hover:border-brand-300 hover:bg-brand-50/20 transition-all cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <Upload className="h-8 w-8 text-brand-500" />
          </div>
          <p className="mt-4 font-display font-bold text-base text-slate-900">Drop your CSV file here or click to browse</p>
          <p className="mt-1 text-sm text-slate-500">Supports any row count. Use the template for the correct column format.</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} className="hidden" />
        </div>
      )}

      {/* Preview phase */}
      {(phase === 'preview' || phase === 'importing') && summary && (
        <div className="space-y-6">
          {phase === 'importing' && (
            <div className="rounded-xl bg-brand-50 border border-brand-200 p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              <p className="text-sm font-semibold text-brand-800">Importing pilgrims... Please do not close this page.</p>
            </div>
          )}

          {/* File info */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-slate-400" />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{fileName}</p>
                <p className="text-xs text-slate-400 font-mono">{fileHash.substring(0, 16)}...</p>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <SummaryCard icon={FileText} label="Total Rows" value={summary.totalRows} color="text-slate-700" bg="bg-slate-50" />
            <SummaryCard icon={CheckCircle2} label="Valid" value={summary.validRows} color="text-emerald-700" bg="bg-emerald-50" />
            <SummaryCard icon={AlertTriangle} label="Review" value={summary.reviewRows} color="text-orange-600" bg="bg-orange-50" />
            <SummaryCard icon={Copy} label="Duplicates" value={summary.duplicateRows} color="text-slate-500" bg="bg-slate-100" />
            <SummaryCard icon={Building2} label="Agents Matched" value={summary.existingAgentsMatched} color="text-brand-600" bg="bg-brand-50" />
            <SummaryCard icon={Sparkles} label="New Agents" value={summary.newAgents} color="text-blue-600" bg="bg-blue-50" />
            <SummaryCard icon={AlertTriangle} label="Ambiguous" value={summary.ambiguousAgents} color="text-amber-600" bg="bg-amber-50" />
          </div>

          {/* Safety notice */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold">Import Safety</p>
              <p className="mt-1">All imported pilgrims will start as <strong>Travel Scheduled</strong>. No arrival or departure will be confirmed. Planned dates are stored separately from actual confirmation data.</p>
            </div>
          </div>

          {/* Agent matching */}
          {agentMatches.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-400" /> Agent Matching
                </h3>
                <p className="text-sm text-slate-500 mt-1">Review agent matches before importing. Resolve ambiguous agents by selecting the correct existing agent or choosing to create a new one.</p>
              </div>
              <div className="divide-y divide-slate-50">
                {agentMatches.map((match) => (
                  <div key={match.normalized} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${match.existingAgent ? 'bg-emerald-50' : match.isAmbiguous ? 'bg-amber-50' : 'bg-blue-50'}`}>
                        {match.existingAgent ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : match.isAmbiguous ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{match.csvName}</p>
                        {match.existingAgent ? (
                          <p className="text-xs text-emerald-600">Matched: {match.existingAgent.organisation_name}</p>
                        ) : match.isAmbiguous ? (
                          <p className="text-xs text-amber-600">Ambiguous — {match.candidates.length} possible matches</p>
                        ) : (
                          <p className="text-xs text-blue-600">New agent — will be created</p>
                        )}
                      </div>
                    </div>
                    {match.isAmbiguous && (
                      <select
                        value={ambiguousResolutions[match.normalized] ?? ''}
                        onChange={(e) => setAmbiguousResolutions((prev) => ({ ...prev, [match.normalized]: e.target.value }))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                      >
                        <option value="">Select action...</option>
                        {match.candidates.map((c) => (
                          <option key={c.id} value={c.id}>Use: {c.organisation_name}</option>
                        ))}
                        <option value="new">Create new agent</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicate pilgrims */}
          {summary.duplicateRows > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <Copy className="h-5 w-5 text-slate-400" /> Duplicate Pilgrims ({summary.duplicateRows})
              </h3>
              <p className="text-sm text-slate-500 mt-1">These passports already exist in the database. They will be skipped.</p>
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {rows.filter((r) => r.status === 'duplicate').map((r) => (
                  <div key={r.rowIndex} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-slate-700">{r.fullName}</span>
                    <span className="font-mono text-xs text-slate-500">{r.passportNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review rows */}
          {summary.reviewRows > 0 && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" /> Rows Requiring Review ({summary.reviewRows})
              </h3>
              <p className="text-sm text-slate-500 mt-1">These rows have validation errors and will be queued for manual review after import.</p>
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {rows.filter((r) => r.status === 'review').map((r) => (
                  <div key={r.rowIndex} className="rounded-lg bg-white px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">{r.fullName || '(missing name)'}</span>
                      <span className="text-xs text-slate-400">Row {r.rowIndex}</span>
                    </div>
                    <p className="text-xs text-orange-600 mt-1">{r.errors.join('; ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid rows preview */}
          {summary.validRows > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Valid Pilgrims to Import ({summary.validRows})
                </h3>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/60 sticky top-0">
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-2 text-left font-semibold text-slate-600">Name</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-600">Passport</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-600 hidden sm:table-cell">Agent</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-600 hidden md:table-cell">Outbound</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-600 hidden md:table-cell">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((r) => r.status === 'valid').map((r) => (
                      <tr key={r.rowIndex} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2 font-medium text-slate-900">{r.fullName}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.passportNumber}</td>
                        <td className="px-4 py-2 text-slate-600 hidden sm:table-cell">{r.agentName}</td>
                        <td className="px-4 py-2 text-slate-600 hidden md:table-cell">{r.scheduledOutbound}</td>
                        <td className="px-4 py-2 text-slate-600 hidden md:table-cell">{r.expectedReturn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Final confirmation */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-display font-bold text-base text-slate-900">Ready to Import</p>
                <p className="text-sm text-slate-500 mt-1">
                  {summary.validRows} new pilgrims will be created. {summary.reviewRows} will be queued for review. {summary.duplicateRows} duplicates will be skipped.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={resetAll} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={phase === 'importing' || summary.validRows === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  <FileCheck className="h-4 w-4" /> Confirm Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm CSV Import"
        message={`This will create ${summary?.validRows ?? 0} pilgrim records, queue ${summary?.reviewRows ?? 0} for review, and skip ${summary?.duplicateRows ?? 0} duplicates. All imported pilgrims will start as Travel Scheduled. This action is recorded in the audit log.`}
        confirmLabel="Confirm and Import"
        onConfirm={handleConfirmImport}
        onCancel={() => setConfirmOpen(false)}
        loading={phase === 'importing'}
      />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="mt-2 text-2xl font-display font-extrabold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-100 p-4">
      <p className={`text-2xl font-display font-extrabold ${color} tabular-nums`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

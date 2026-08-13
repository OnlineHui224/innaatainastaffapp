import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileCheck,
  FileText,
  Upload,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import { compareDates } from '@/lib/status';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Identifier, Select } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';
import { ImportStages, OutcomeTile } from '@/components/imports/ImportStages';
import { cn } from '@/lib/utils';

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
  pilgrimCount: number;
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

/** Explicit decision for an ambiguous agent. Defaults to the safe option. */
const LEAVE_FOR_REVIEW = 'review';
const CREATE_NEW = 'new';

// ============================================================
// CSV template
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
  const example1 =
    'AHMED IBRAHIM,B12345678,V1234567890,SAHEED TRAVELS,2026-06-15,2026-07-05,LYN,Jeddah,Group leader';
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
// CSV parsing & validation — semantics unchanged by the redesign
// ============================================================

function normalizeAgentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/[.,]/g, '').toUpperCase();
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
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  const mdy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0');
    const day = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${month}-${day}`;
  }
  return null;
}

function parseCSV(
  text: string,
  existingAgents: SubAgent[],
  existingPassports: Set<string>,
): { rows: ParsedRow[]; agentMatches: AgentMatch[]; summary: ImportSummary } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      rows: [],
      agentMatches: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        reviewRows: 0,
        duplicateRows: 0,
        existingAgentsMatched: 0,
        newAgents: 0,
        ambiguousAgents: 0,
      },
    };
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
    if (passportNumber && passportSet.has(passportNumber)) {
      errors.push('Duplicate passport number within this CSV.');
    }
    if (passportNumber) passportSet.add(passportNumber);

    const isDuplicate = Boolean(passportNumber) && existingPassports.has(passportNumber);
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

    if (agentName.trim()) {
      const normalized = normalizeAgentName(agentName);
      const existing = csvAgentNames.get(normalized);
      if (existing) {
        existing.pilgrimCount += 1;
      } else {
        const exact = existingAgents.find((a) => normalizeAgentName(a.organisation_name) === normalized);
        const internalCodeMatch = existingAgents.find(
          (a) => a.internal_code && a.internal_code.toUpperCase() === normalized,
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
          pilgrimCount: 1,
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

type Phase = 'upload' | 'analysing' | 'preview' | 'importing' | 'done';

const STAGES = [
  { key: 'upload', label: 'Upload file' },
  { key: 'analyse', label: 'Analyse rows' },
  { key: 'agents', label: 'Resolve agents' },
  { key: 'confirm', label: 'Confirm & import' },
  { key: 'result', label: 'Result' },
];

export default function ImportCsvPage() {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [agentMatches, setAgentMatches] = useState<AgentMatch[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    review: number;
    duplicates: number;
    agentsCreated: number;
    agentsMatched: number;
    deferredAgents: number;
    failed: number;
  } | null>(null);
  /**
   * Ambiguous agents default to LEAVE_FOR_REVIEW. Staff are never nudged into a
   * guess: rows under an unresolved ambiguous agent go to the Review Queue with
   * the ambiguity recorded, instead of silently creating or picking an agent.
   */
  const [ambiguousResolutions, setAmbiguousResolutions] = useState<Record<string, string>>({});

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(
        `"${file.name}" is not a CSV file. This import accepts a .csv file only — export your spreadsheet as CSV and try again.`,
      );
      setPhase('upload');
      return;
    }

    setFileName(file.name);
    setPhase('analysing');

    try {
      const text = await file.text();
      const hash = await computeFileHash(text);

      const [{ data: agents }, { data: pilgrims }] = await Promise.all([
        supabase.from('sub_agents').select('*').order('organisation_name'),
        supabase.from('pilgrims').select('passport_number'),
      ]);

      const existingPassports = new Set(
        (pilgrims ?? []).map((p) => (p as { passport_number: string }).passport_number.toUpperCase()),
      );

      const parsed = parseCSV(text, (agents ?? []) as SubAgent[], existingPassports);

      if (parsed.summary.totalRows === 0) {
        setError(
          'No pilgrim rows were found in this file. Check that it has a header row followed by at least one data row, then try again.',
        );
        setPhase('upload');
        return;
      }

      setRows(parsed.rows);
      setAgentMatches(parsed.agentMatches);
      setSummary(parsed.summary);
      setFileHash(hash);
      setAmbiguousResolutions(
        Object.fromEntries(
          parsed.agentMatches.filter((m) => m.isAmbiguous).map((m) => [m.normalized, LEAVE_FOR_REVIEW]),
        ),
      );
      setPhase('preview');
    } catch (err) {
      setError(friendlyError(err));
      setPhase('upload');
    }
  }, []);

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

  /** Agent keys deferred to the Review Queue rather than guessed at. */
  const deferredAgentKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const match of agentMatches) {
      if (match.isAmbiguous && (ambiguousResolutions[match.normalized] ?? LEAVE_FOR_REVIEW) === LEAVE_FOR_REVIEW) {
        keys.add(match.normalized);
      }
    }
    return keys;
  }, [agentMatches, ambiguousResolutions]);

  /** Valid rows whose agent decision was deferred move to the Review Queue. */
  const plan = useMemo(() => {
    const valid = rows.filter((r) => r.status === 'valid');
    const deferred = valid.filter((r) => deferredAgentKeys.has(normalizeAgentName(r.agentName)));
    const ready = valid.filter((r) => !deferredAgentKeys.has(normalizeAgentName(r.agentName)));
    const review = rows.filter((r) => r.status === 'review');
    const duplicates = rows.filter((r) => r.status === 'duplicate');
    return { ready, deferred, review, duplicates };
  }, [rows, deferredAgentKeys]);

  async function handleConfirmImport() {
    if (!summary) return;
    setPhase('importing');
    setConfirmOpen(false);
    setError(null);

    try {
      const batchId = crypto.randomUUID();
      const agentIdMap = new Map<string, string>();
      let agentsCreated = 0;
      let agentsMatched = 0;

      async function createAgent(match: AgentMatch) {
        const { data, error: createErr } = await supabase
          .from('sub_agents')
          .insert({
            organisation_name: match.csvName,
            // Placeholder contract retained deliberately — see deferred issues.
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

      for (const match of agentMatches) {
        if (match.existingAgent) {
          agentIdMap.set(match.normalized, match.existingAgent.id);
          agentsMatched++;
        } else if (match.isAmbiguous) {
          const decision = ambiguousResolutions[match.normalized] ?? LEAVE_FOR_REVIEW;
          if (decision === LEAVE_FOR_REVIEW) {
            // No agent is created or guessed; the affected rows go to review.
            continue;
          }
          if (decision === CREATE_NEW) {
            await createAgent(match);
          } else {
            agentIdMap.set(match.normalized, decision);
            agentsMatched++;
          }
        } else if (match.isNew) {
          await createAgent(match);
        }
      }

      let created = 0;
      let failed = 0;
      for (const row of plan.ready) {
        const subAgentId = agentIdMap.get(normalizeAgentName(row.agentName)) ?? null;
        const { error: insertErr } = await supabase.from('pilgrims').insert({
          full_name: row.fullName,
          passport_number: row.passportNumber,
          // Known limitation: the normal importer has no nationality source.
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
            failed++;
          } else {
            throw insertErr;
          }
        } else {
          created++;
        }
      }

      let reviewQueued = 0;
      const toQueue = [
        ...plan.review.map((row) => ({ row, extraReason: '' })),
        ...plan.deferred.map((row) => ({
          row,
          extraReason: `Agent "${row.agentName}" matched more than one existing sub-agent and was left for review.`,
        })),
      ];

      for (const { row, extraReason } of toQueue) {
        const reason = [row.errors.join('; '), extraReason].filter(Boolean).join(' ');
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
          review_reason: reason,
          source_sheet: fileName,
          source_row: row.rowIndex,
          original_departure_value: row.scheduledOutbound,
          original_return_value: row.expectedReturn,
          status: 'pending',
        });
        if (!queueErr) reviewQueued++;
      }

      await supabase.from('import_batches').insert({
        id: batchId,
        file_name: fileName,
        file_hash: fileHash,
        performed_by: profile?.id ?? null,
        performed_by_name: profile?.full_name ?? '',
        total_rows: summary.totalRows,
        ready_rows: plan.ready.length,
        review_rows: toQueue.length,
        pilgrims_created: created,
        agents_created: agentsCreated,
        agents_matched: agentsMatched,
        duplicates_skipped: plan.duplicates.length,
        review_queued: reviewQueued,
        demo_agents_removed: 0,
        demo_pilgrims_removed: 0,
      });

      await logAudit({
        action: 'csv_import_completed',
        recordType: 'pilgrim',
        recordLabel: `CSV import: ${fileName} — ${created} created, ${reviewQueued} review, ${plan.duplicates.length} duplicates`,
        newValue: {
          batch_id: batchId,
          file_name: fileName,
          file_hash: fileHash,
          total_rows: summary.totalRows,
          created,
          review_queued: reviewQueued,
          duplicates: plan.duplicates.length,
          agents_created: agentsCreated,
          agents_matched: agentsMatched,
          agents_deferred_to_review: deferredAgentKeys.size,
        },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });

      setImportResult({
        created,
        review: reviewQueued,
        duplicates: plan.duplicates.length,
        agentsCreated,
        agentsMatched,
        deferredAgents: deferredAgentKeys.size,
        failed,
      });
      setPhase('done');
    } catch (err) {
      setError(friendlyError(err));
      setPhase('preview');
    }
  }

  const stageIndex =
    phase === 'upload' ? 0 : phase === 'analysing' ? 1 : phase === 'preview' ? 2 : phase === 'importing' ? 3 : 4;

  // ---------------------------------------------------------- result
  if (phase === 'done' && importResult) {
    const partial = importResult.failed > 0 || importResult.review > 0 || importResult.duplicates > 0;
    return (
      <div>
        <PageHeader eyebrow="Pilgrims" title="Import CSV" subtitle={`Result for ${fileName}`} />
        <ImportStages stages={STAGES} currentIndex={4} className="mb-6" />

        <Alert
          tone={partial ? 'warning' : 'success'}
          title={
            partial
              ? 'Import finished — some rows need attention'
              : `Import complete — ${importResult.created} pilgrims created`
          }
          className="mb-6"
        >
          {partial
            ? 'Records that could be created were created. Everything else is listed below, with nothing silently discarded.'
            : 'Every row in this file was imported as an active pilgrim record.'}
        </Alert>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OutcomeTile label="Pilgrims created" value={importResult.created} tone="ready" description="Now active records" />
          <OutcomeTile
            label="Sent to review queue"
            value={importResult.review}
            tone="review"
            description="Awaiting a human decision"
          />
          <OutcomeTile
            label="Duplicates skipped"
            value={importResult.duplicates}
            tone="blocked"
            description="Passport already on the platform"
          />
          <OutcomeTile
            label="Rejected on insert"
            value={importResult.failed}
            tone="blocked"
            description="Blocked by the database"
          />
          <OutcomeTile label="Existing agents matched" value={importResult.agentsMatched} tone="info" />
          <OutcomeTile label="New agents created" value={importResult.agentsCreated} tone="info" />
          <OutcomeTile
            label="Agents left for review"
            value={importResult.deferredAgents}
            tone="review"
            description="Ambiguous, not guessed"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {importResult.review > 0 && (
            <ButtonLink
              to="/app/pilgrims/review-queue"
              icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
            >
              Open Review Queue ({importResult.review})
            </ButtonLink>
          )}
          <ButtonLink to="/app/pilgrims" variant="secondary">
            View pilgrims
          </ButtonLink>
          <Button variant="secondary" onClick={resetAll} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------- workflow
  return (
    <div>
      <PageHeader
        eyebrow="Pilgrims"
        title="Import CSV"
        subtitle="Bulk-import pilgrim records from a CSV file. Every imported record starts as planned travel only — no arrival or departure is confirmed by an import."
        actions={
          <Button
            variant="secondary"
            onClick={downloadTemplate}
            icon={<Download className="h-4 w-4" aria-hidden="true" />}
          >
            Download template
          </Button>
        }
      />

      <ImportStages stages={STAGES} currentIndex={stageIndex} className="mb-6" />

      {error && (
        <Alert tone="critical" title="This file could not be used" className="mb-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stage 1 — upload */}
      {phase === 'upload' && (
        <div className="space-y-5">
          <div
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-10 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/30"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-slate-300 bg-slate-50 text-slate-500">
              <UploadCloud className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-4 font-display text-sm font-bold text-navy-900">
              Drop a CSV file here, or choose one to begin
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              Any row count is supported. Use the template for the expected column names.
            </p>
            <Button className="mt-5" onClick={() => fileRef.current?.click()}>
              Choose CSV file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="sr-only"
              aria-label="Choose a CSV file to import"
            />
          </div>

          <Panel title="What this import does" description="So there are no surprises before you upload.">
            <ul className="space-y-2 text-sm leading-relaxed text-slate-700">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                Valid rows become pilgrim records with planned travel dates only.
              </li>
              <li className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                Rows with problems, and rows whose agent is ambiguous, go to the Review Queue for a human
                decision.
              </li>
              <li className="flex gap-2">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                Rows whose passport already exists are blocked and skipped.
              </li>
            </ul>
          </Panel>
        </div>
      )}

      {/* Stage 2 — analysing */}
      {phase === 'analysing' && <LoadingBlock label={`Analysing ${fileName}…`} />}

      {/* Stages 3–4 — preview, resolve, confirm */}
      {(phase === 'preview' || phase === 'importing') && summary && (
        <div className="space-y-6">
          {phase === 'importing' && (
            <Alert tone="info" title="Importing — please keep this page open">
              Creating pilgrim records and queueing rows for review. This can take a moment for large files.
            </Alert>
          )}

          <Panel
            title="File"
            actions={
              phase === 'preview' ? (
                <Button size="sm" variant="ghost" onClick={resetAll}>
                  Choose a different file
                </Button>
              ) : undefined
            }
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{fileName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  SHA-256 <Identifier value={`${fileHash.slice(0, 16)}…`} />
                </p>
              </div>
            </div>
          </Panel>

          {/* Row outcomes */}
          <section aria-labelledby="row-outcomes">
            <h2
              id="row-outcomes"
              className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
            >
              Row outcomes
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OutcomeTile label="Total rows" value={summary.totalRows} tone="neutral" description="Found in the file" />
              <OutcomeTile label="Valid / ready" value={plan.ready.length} tone="ready" />
              <OutcomeTile
                label="Review"
                value={plan.review.length + plan.deferred.length}
                tone="review"
                description="Includes rows with an ambiguous agent"
              />
              <OutcomeTile
                label="Duplicate / blocked"
                value={plan.duplicates.length}
                tone="blocked"
                description="Passport already on the platform"
              />
            </div>
          </section>

          {/* Agent resolution */}
          <section aria-labelledby="agent-outcomes">
            <h2
              id="agent-outcomes"
              className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
            >
              Agent resolution
            </h2>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <OutcomeTile
                label="Existing agents matched"
                value={summary.existingAgentsMatched}
                tone="ready"
                description="Linked to a sub-agent already on the platform"
              />
              <OutcomeTile
                label="New agents"
                value={summary.newAgents}
                tone="info"
                description="Will be created on import"
              />
              <OutcomeTile
                label="Ambiguous agents"
                value={summary.ambiguousAgents}
                tone="review"
                description="Need a human decision"
              />
            </div>

            {agentMatches.length > 0 && (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
                {agentMatches.map((match) => (
                  <AgentResolutionRow
                    key={match.normalized}
                    match={match}
                    decision={ambiguousResolutions[match.normalized] ?? LEAVE_FOR_REVIEW}
                    onDecide={(value) =>
                      setAmbiguousResolutions((prev) => ({ ...prev, [match.normalized]: value }))
                    }
                    disabled={phase === 'importing'}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Exceptions — the mobile-safe summary of what needs attention */}
          {(plan.review.length > 0 || plan.duplicates.length > 0) && (
            <section aria-labelledby="exceptions">
              <h2
                id="exceptions"
                className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
              >
                Exceptions
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {plan.review.length > 0 && (
                  <Panel
                    edge="caution"
                    title={
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
                        Rows needing review ({plan.review.length})
                      </span>
                    }
                    description="These are queued for correction and approval after the import — nothing is discarded."
                  >
                    <ReasonSummary
                      items={plan.review.map((row) => ({
                        key: `${row.rowIndex}`,
                        label: row.fullName || '(name missing)',
                        detail: row.errors.join('; '),
                        row: row.rowIndex,
                      }))}
                    />
                  </Panel>
                )}

                {plan.duplicates.length > 0 && (
                  <Panel
                    edge="critical"
                    title={
                      <span className="flex items-center gap-2">
                        <Copy className="h-4 w-4 text-red-700" aria-hidden="true" />
                        Blocked duplicates ({plan.duplicates.length})
                      </span>
                    }
                    description="These passports already exist on the platform and will be skipped."
                  >
                    <ReasonSummary
                      items={plan.duplicates.map((row) => ({
                        key: `${row.rowIndex}`,
                        label: row.fullName || '(name missing)',
                        detail: row.passportNumber,
                        row: row.rowIndex,
                        identifier: true,
                      }))}
                    />
                  </Panel>
                )}
              </div>
            </section>
          )}

          {/* Ready rows — full table on large screens only */}
          {plan.ready.length > 0 && (
            <section aria-labelledby="ready-rows">
              <h2
                id="ready-rows"
                className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
              >
                Ready to import ({plan.ready.length})
              </h2>

              {/* Hundreds of CSV rows are never rendered on a phone — small screens
                  get the decision summary above and this count instead. */}
              <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-700 lg:hidden">
                <span className="font-semibold tabular-nums text-emerald-900">{plan.ready.length}</span> rows are
                ready to create as pilgrim records. Open this page on a larger screen to inspect the full row
                list before importing.
              </p>

              <div className="hidden lg:block">
                <TableFrame caption="Rows that will be imported as pilgrim records">
                  <THead>
                    <tr>
                      <TH numeric>Row</TH>
                      <TH>Name</TH>
                      <TH>Passport</TH>
                      <TH>Agent</TH>
                      <TH numeric>Outbound</TH>
                      <TH numeric>Return</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {plan.ready.slice(0, 100).map((row) => (
                      <TR key={row.rowIndex}>
                        <TD numeric className="text-xs text-slate-500">
                          {row.rowIndex}
                        </TD>
                        <TD className="font-medium text-slate-900">{row.fullName}</TD>
                        <TD>
                          <Identifier value={row.passportNumber} />
                        </TD>
                        <TD>{row.agentName}</TD>
                        <TD numeric>{row.scheduledOutbound}</TD>
                        <TD numeric>{row.expectedReturn}</TD>
                      </TR>
                    ))}
                  </TBody>
                </TableFrame>
                {plan.ready.length > 100 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing the first 100 of {plan.ready.length} ready rows. All {plan.ready.length} will be
                    imported.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Confirm */}
          <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-lg border border-slate-300 bg-white/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-slate-700">
              <span className="font-bold tabular-nums text-emerald-900">{plan.ready.length}</span> created ·{' '}
              <span className="font-bold tabular-nums text-amber-900">
                {plan.review.length + plan.deferred.length}
              </span>{' '}
              to review ·{' '}
              <span className="font-bold tabular-nums text-red-900">{plan.duplicates.length}</span> skipped
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={resetAll} disabled={phase === 'importing'}>
                Cancel
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                loading={phase === 'importing'}
                disabled={plan.ready.length === 0 && plan.review.length + plan.deferred.length === 0}
                icon={<FileCheck className="h-4 w-4" aria-hidden="true" />}
              >
                Confirm import
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm CSV import"
        confirmLabel={`Import ${plan.ready.length} ${plan.ready.length === 1 ? 'Pilgrim' : 'Pilgrims'}`}
        loading={phase === 'importing'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmImport}
        message={
          <>
            This will create <strong className="tabular-nums">{plan.ready.length}</strong> pilgrim records, queue{' '}
            <strong className="tabular-nums">{plan.review.length + plan.deferred.length}</strong> rows for review
            and skip <strong className="tabular-nums">{plan.duplicates.length}</strong> duplicates. Every
            imported pilgrim starts as planned travel only — no arrival or departure is confirmed. The action is
            recorded in the audit history.
          </>
        }
      />
    </div>
  );
}

/** Compact, scrollable exception list — safe on any screen size. */
function ReasonSummary({
  items,
}: {
  items: Array<{ key: string; label: string; detail: string; row: number; identifier?: boolean }>;
}) {
  return (
    <ul className="max-h-56 space-y-2 overflow-y-auto scrollbar-thin">
      {items.map((item) => (
        <li key={item.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-slate-900">{item.label}</span>
            <span className="shrink-0 text-2xs tabular-nums text-slate-500">Row {item.row}</span>
          </div>
          {item.detail && (
            <p className={cn('mt-0.5 text-xs text-slate-600', item.identifier && 'identifier')}>{item.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * One CSV agent name and its resolution state.
 *
 * Three explicit states: Matched, New, Ambiguous. An ambiguous agent shows its
 * candidates and defaults to leaving the decision for the Review Queue.
 */
function AgentResolutionRow({
  match,
  decision,
  onDecide,
  disabled,
}: {
  match: AgentMatch;
  decision: string;
  onDecide: (value: string) => void;
  disabled: boolean;
}) {
  const state = match.existingAgent ? 'matched' : match.isAmbiguous ? 'ambiguous' : 'new';

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{match.csvName}</p>
            <span className="text-xs tabular-nums text-slate-500">
              {match.pilgrimCount} {match.pilgrimCount === 1 ? 'row' : 'rows'}
            </span>
          </div>

          {state === 'matched' && (
            <p className="mt-1 text-sm text-slate-600">
              Matched to{' '}
              <Link
                to={`/app/sub-agents/${match.existingAgent?.id}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {match.existingAgent?.organisation_name}
              </Link>
              {match.existingAgent?.country ? ` · ${match.existingAgent.country}` : ''}
              {match.existingAgent && !match.existingAgent.active_status ? ' · currently inactive' : ''}
            </p>
          )}

          {state === 'new' && (
            <p className="mt-1 text-sm text-slate-600">
              No existing sub-agent matches this name. It will be created as an active sub-agent, with the
              contact person left as “To be updated” for an Administrator to complete.
            </p>
          )}

          {state === 'ambiguous' && (
            <div className="mt-1">
              <p className="text-sm text-slate-600">
                This name partially matches more than one existing sub-agent. Choosing between them is a
                judgement call, so it is not made automatically.
              </p>
              <ul className="mt-2 space-y-1">
                {match.candidates.map((candidate) => (
                  <li key={candidate.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <Building2 className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                    <Link
                      to={`/app/sub-agents/${candidate.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {candidate.organisation_name}
                    </Link>
                    <span>· {candidate.country || 'No country recorded'}</span>
                    <span>· {candidate.active_status ? 'Active' : 'Inactive'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {state === 'matched' && (
            <Badge tone="positive" treatment="solid">
              Matched
            </Badge>
          )}
          {state === 'new' && <Badge tone="info">New</Badge>}
          {state === 'ambiguous' && (
            <>
              <Badge tone="caution">Ambiguous</Badge>
              <label className="sr-only" htmlFor={`agent-decision-${match.normalized}`}>
                Decision for agent {match.csvName}
              </label>
              <Select
                id={`agent-decision-${match.normalized}`}
                value={decision}
                onChange={(e) => onDecide(e.target.value)}
                disabled={disabled}
                className="w-full sm:w-72"
              >
                <option value={LEAVE_FOR_REVIEW}>Leave for Review Queue (recommended)</option>
                {match.candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    Use existing: {candidate.organisation_name}
                  </option>
                ))}
                <option value={CREATE_NEW}>Create a new sub-agent: {match.csvName}</option>
              </Select>
              {decision === LEAVE_FOR_REVIEW && (
                <p className="flex items-center gap-1 text-2xs text-slate-500 sm:justify-end">
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  {match.pilgrimCount} {match.pilgrimCount === 1 ? 'row goes' : 'rows go'} to the Review Queue
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

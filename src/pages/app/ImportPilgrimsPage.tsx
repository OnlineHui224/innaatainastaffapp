import { useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Identifier, Select } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { ImportStages, OutcomeTile } from '@/components/imports/ImportStages';
import {
  parseVerifiedCsv,
  computeTotals,
  computeFileHash,
  matchAgents,
  identifyDemoRecords,
  checkDuplicates,
  parseDate,
  generateAgentCode,
  normalizeKey,
  type VerifiedPilgrimRow,
  type AgentMatchEntry,
  type DemoRecord,
  type DuplicateCheck,
} from '@/lib/verifiedImport';

type Phase = 'upload' | 'analyzing' | 'preview' | 'executing' | 'complete';

const VERIFIED_STAGES = [
  { key: 'upload', label: 'Verify file' },
  { key: 'analyse', label: 'Analyse' },
  { key: 'plan', label: 'Execution plan' },
  { key: 'execute', label: 'Execute' },
  { key: 'result', label: 'Result' },
];

interface ExistingPilgrimLite {
  id: string;
  full_name: string;
  passport_number: string;
  is_sample_data: boolean;
}

interface ImportResult {
  demoAgentsRemoved: number;
  demoPilgrimsRemoved: number;
  agentsMatched: number;
  agentsCreated: number;
  pilgrimsCreated: number;
  duplicatesSkipped: number;
  reviewQueued: number;
  failedRows: { row: number; name: string; reason: string }[];
  batchId: string | null;
}

export default function ImportPilgrimsPage() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [rows, setRows] = useState<VerifiedPilgrimRow[]>([]);
  const [totals, setTotals] = useState({ totalRows: 0, readyRows: 0, reviewRows: 0, uniqueAgentKeys: 0 });
  const [agentMatches, setAgentMatches] = useState<Map<string, AgentMatchEntry>>(new Map());
  const [existingAgents, setExistingAgents] = useState<SubAgent[]>([]);
  const [, setExistingPilgrims] = useState<ExistingPilgrimLite[]>([]);
  const [demoAgents, setDemoAgents] = useState<DemoRecord[]>([]);
  const [demoPilgrims, setDemoPilgrims] = useState<DemoRecord[]>([]);
  const [suspectedRecords, setSuspectedRecords] = useState<DemoRecord[]>([]);
  const [suspectedRemovals, setSuspectedRemovals] = useState<Set<string>>(new Set());
  const [internalDups, setInternalDups] = useState<DuplicateCheck[]>([]);
  const [existingDups, setExistingDups] = useState<DuplicateCheck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    setPhase('analyzing');

    try {
      const text = await file.text();
      const buffer = new TextEncoder().encode(text).buffer;
      const hash = await computeFileHash(buffer);
      setFileHash(hash);

      const parsedRows = parseVerifiedCsv(text);
      if (parsedRows.length === 0) {
        setError('No pilgrim rows found in the CSV. Please check the file format.');
        setPhase('upload');
        return;
      }

      const computedTotals = computeTotals(parsedRows);
      setRows(parsedRows);
      setTotals(computedTotals);

      const expectedTotal = 493;
      const expectedReady = 468;
      const expectedReview = 25;
      const expectedKeys = 48;

      if (
        computedTotals.totalRows !== expectedTotal ||
        computedTotals.readyRows !== expectedReady ||
        computedTotals.reviewRows !== expectedReview ||
        computedTotals.uniqueAgentKeys !== expectedKeys
      ) {
        setError(
          `File totals do not match expected values.\n` +
          `Expected: ${expectedTotal} rows, ${expectedReady} READY, ${expectedReview} REVIEW, ${expectedKeys} agent keys.\n` +
          `Found: ${computedTotals.totalRows} rows, ${computedTotals.readyRows} READY, ${computedTotals.reviewRows} REVIEW, ${computedTotals.uniqueAgentKeys} agent keys.\n` +
          `Import has been stopped. Please verify the file and try again.`
        );
        setPhase('upload');
        return;
      }

      const [{ data: agents }, { data: pilgrims }] = await Promise.all([
        supabase.from('sub_agents').select('*').order('organisation_name'),
        supabase.from('pilgrims').select('id, full_name, passport_number, is_sample_data').order('created_at'),
      ]);

      const agentsList = (agents ?? []) as SubAgent[];
      const pilgrimsList = (pilgrims ?? []) as ExistingPilgrimLite[];
      setExistingAgents(agentsList);
      setExistingPilgrims(pilgrimsList);

      const matches = matchAgents(parsedRows, agentsList);
      setAgentMatches(matches);

      const { demoAgents: dA, demoPilgrims: dP, suspectedRecords: sR } = identifyDemoRecords(agentsList, pilgrimsList);
      setDemoAgents(dA);
      setDemoPilgrims(dP);
      setSuspectedRecords(sR);

      const { internalDuplicates, existingDuplicates } = checkDuplicates(parsedRows, pilgrimsList);
      setInternalDups(internalDuplicates);
      setExistingDups(existingDuplicates);

      setPhase('preview');
    } catch (err) {
      setError(`Failed to process file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPhase('upload');
    }
  }, []);

  function resolveAgent(matchKey: string, agentId: string | 'new') {
    setAgentMatches((prev) => {
      const next = new Map(prev);
      const m = next.get(matchKey);
      if (!m) return prev;
      if (agentId === 'new') {
        next.set(matchKey, { ...m, matchedAgent: null, status: 'new', isNew: true, manuallyResolved: true, similarAgents: [] });
      } else {
        const agent = existingAgents.find((a) => a.id === agentId) ?? null;
        next.set(matchKey, { ...m, matchedAgent: agent, status: 'matched', isNew: false, manuallyResolved: true, similarAgents: [] });
      }
      return next;
    });
  }

  function toggleSuspectedRemoval(id: string) {
    setSuspectedRemovals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const previewSummary = useMemo(() => {
    let matched = 0, newAgents = 0, ambiguous = 0;
    for (const m of agentMatches.values()) {
      if (m.status === 'matched' && !m.manuallyResolved) matched++;
      else if (m.status === 'matched' && m.manuallyResolved) matched++;
      else if (m.status === 'new') newAgents++;
      else if (m.status === 'ambiguous') ambiguous++;
    }

    const passportsToSkip = new Set<string>();
    for (const d of internalDups) passportsToSkip.add(d.passportNumber);
    for (const d of existingDups) passportsToSkip.add(d.passportNumber);

    const readyToImport = rows.filter(
      (r) => r.importStatus === 'READY' &&
      !passportsToSkip.has(r.passportNumber.trim().toUpperCase()) &&
      agentMatches.get(r.agentMatchKey)?.matchedAgent
    ).length;

    const reviewQueue = rows.filter((r) => r.importStatus === 'REVIEW').length;
    const duplicatesSkipped = rows.filter(
      (r) => r.importStatus === 'READY' && passportsToSkip.has(r.passportNumber.trim().toUpperCase())
    ).length;

    return { matched, newAgents, ambiguous, readyToImport, reviewQueue, duplicatesSkipped };
  }, [agentMatches, rows, internalDups, existingDups]);

  const hasAmbiguous = previewSummary.ambiguous > 0;
  const demoAgentIds = new Set([...demoAgents.map((d) => d.id), ...suspectedRemovals]);
  const demoPilgrimIds = new Set(demoPilgrims.map((d) => d.id));

  async function executeImport() {
    setPhase('executing');
    const importResult: ImportResult = {
      demoAgentsRemoved: 0,
      demoPilgrimsRemoved: 0,
      agentsMatched: 0,
      agentsCreated: 0,
      pilgrimsCreated: 0,
      duplicatesSkipped: 0,
      reviewQueued: 0,
      failedRows: [],
      batchId: null,
    };

    try {
      // 1. Create import batch record
      const { data: batch, error: batchErr } = await supabase
        .from('import_batches')
        .insert({
          file_name: fileName,
          file_hash: fileHash,
          performed_by: profile?.id ?? null,
          performed_by_name: profile?.full_name ?? '',
          total_rows: totals.totalRows,
          ready_rows: totals.readyRows,
          review_rows: totals.reviewRows,
        })
        .select('id')
        .maybeSingle();

      if (batchErr || !batch) {
        importResult.failedRows.push({ row: 0, name: 'System', reason: `Failed to create import batch: ${batchErr?.message ?? 'unknown'}` });
        setResult(importResult);
        setPhase('complete');
        return;
      }
      const batchId = (batch as { id: string }).id;
      importResult.batchId = batchId;

      // 2. Remove demo pilgrims (clearly marked is_sample_data=true + admin-confirmed suspected)
      const pilgrimsToRemove = [...demoPilgrimIds];
      for (const d of suspectedRecords) {
        if (d.type === 'pilgrim' && suspectedRemovals.has(d.id)) {
          pilgrimsToRemove.push(d.id);
        }
      }
      if (pilgrimsToRemove.length > 0) {
        const { error: delPilgrimErr } = await supabase
          .from('pilgrims')
          .delete()
          .in('id', pilgrimsToRemove);
        if (!delPilgrimErr) {
          importResult.demoPilgrimsRemoved = pilgrimsToRemove.length;
        }
      }

      // 3. Remove demo agents (clearly marked + admin-confirmed suspected)
      const agentsToRemove = [...demoAgentIds].filter((id) => demoAgentIds.has(id));
      const suspectedAgentRemovals = suspectedRecords
        .filter((d) => d.type === 'agent' && suspectedRemovals.has(d.id))
        .map((d) => d.id);
      const allAgentsToRemove = [...agentsToRemove, ...suspectedAgentRemovals];
      if (allAgentsToRemove.length > 0) {
        const { error: delAgentErr } = await supabase
          .from('sub_agents')
          .delete()
          .in('id', allAgentsToRemove);
        if (!delAgentErr) {
          importResult.demoAgentsRemoved = allAgentsToRemove.length;
        }
      }

      // 4. Create new agents
      const existingCodes = new Set(
        existingAgents
          .filter((a) => !allAgentsToRemove.includes(a.id))
          .map((a) => a.internal_code || normalizeKey(a.organisation_name).slice(0, 8))
          .filter(Boolean)
      );

      const newAgentEntries: AgentMatchEntry[] = [];
      for (const m of agentMatches.values()) {
        if (m.status === 'new' || (m.isNew && m.manuallyResolved)) {
          newAgentEntries.push(m);
        }
      }

      const agentIdMap = new Map<string, string>();
      for (const m of agentMatches.values()) {
        if (m.matchedAgent && !allAgentsToRemove.includes(m.matchedAgent.id)) {
          agentIdMap.set(m.matchKey, m.matchedAgent.id);
          importResult.agentsMatched++;
        }
      }

      for (const m of newAgentEntries) {
        const code = generateAgentCode(m.matchKey, existingCodes);
        const { data: newAgent, error: createErr } = await supabase
          .from('sub_agents')
          .insert({
            organisation_name: m.csvAgentName,
            contact_person: '',
            country: '',
            active_status: true,
            is_sample_data: false,
            internal_code: code,
            agent_match_key: m.matchKey,
            created_by: profile?.id ?? null,
            updated_by: profile?.id ?? null,
          })
          .select('id')
          .maybeSingle();

        if (createErr || !newAgent) {
          importResult.failedRows.push({ row: 0, name: m.csvAgentName, reason: `Failed to create agent: ${createErr?.message ?? 'unknown'}` });
          continue;
        }
        const newAgentId = (newAgent as { id: string }).id;
        agentIdMap.set(m.matchKey, newAgentId);
        importResult.agentsCreated++;
      }

      // 5. Import READY rows (skip duplicates)
      const passportsToSkip = new Set<string>();
      for (const d of internalDups) passportsToSkip.add(d.passportNumber);
      for (const d of existingDups) passportsToSkip.add(d.passportNumber);

      const reviewRows: VerifiedPilgrimRow[] = [];

      for (const row of rows) {
        if (row.importStatus === 'REVIEW') {
          reviewRows.push(row);
          continue;
        }

        const passportUpper = row.passportNumber.trim().toUpperCase();
        if (passportsToSkip.has(passportUpper)) {
          importResult.duplicatesSkipped++;
          continue;
        }

        const agentId = agentIdMap.get(row.agentMatchKey);
        if (!agentId) {
          importResult.failedRows.push({ row: row.rowNum, name: row.fullName, reason: 'No agent mapping found' });
          continue;
        }

        if (!row.fullName.trim()) {
          importResult.failedRows.push({ row: row.rowNum, name: '(missing)', reason: 'Missing pilgrim name' });
          continue;
        }

        const departureDate = parseDate(row.departureDate);
        if (!departureDate) {
          importResult.failedRows.push({ row: row.rowNum, name: row.fullName, reason: 'Invalid departure date' });
          continue;
        }

        const returnDate = parseDate(row.expectedReturnDate);
        const contractDate = parseDate(row.contractRecordDate);

        const insertData: Record<string, unknown> = {
          full_name: row.fullName,
          passport_number: row.passportNumber,
          nationality: 'Nigeria',
          sub_agent_id: agentId,
          expected_departure_date: departureDate,
          actual_departure_date: returnDate,
          arrival_date: null,
          operational_notes: null,
          visa_number: row.visaNumber || null,
          makkah_hotel: row.makkahHotel || null,
          madinah_hotel: row.madinahHotel || null,
          transportation: row.transportation || null,
          visa_company: row.visaCompany || null,
          arrival_port: row.arrivalPort || null,
          contract_record_date: contractDate,
          source_sheet: row.sourceSheet || null,
          source_row: row.sourceRow || null,
          import_batch_id: batchId,
          is_sample_data: false,
          created_by: profile?.id ?? null,
          updated_by: profile?.id ?? null,
        };

        const { error: insertErr } = await supabase
          .from('pilgrims')
          .insert(insertData);

        if (insertErr) {
          if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
            importResult.duplicatesSkipped++;
          } else {
            importResult.failedRows.push({ row: row.rowNum, name: row.fullName, reason: friendlyError(insertErr) });
          }
        } else {
          importResult.pilgrimsCreated++;
        }
      }

      // 6. Insert REVIEW rows into review queue
      if (reviewRows.length > 0) {
        const reviewInserts = reviewRows.map((r) => ({
          batch_id: batchId,
          full_name: r.fullName,
          passport_number: r.passportNumber,
          visa_number: r.visaNumber || null,
          agent_name: r.agentName || null,
          agent_match_key: r.agentMatchKey || null,
          departure_date: r.departureDate || null,
          expected_return_date: r.expectedReturnDate || null,
          makkah_hotel: r.makkahHotel || null,
          madinah_hotel: r.madinahHotel || null,
          transportation: r.transportation || null,
          visa_company: r.visaCompany || null,
          arrival_port: r.arrivalPort || null,
          contract_record_date: r.contractRecordDate || null,
          review_reason: r.reviewReason || null,
          source_sheet: r.sourceSheet || null,
          source_row: r.sourceRow || null,
          original_departure_value: r.originalDepartureValue || null,
          original_return_value: r.originalReturnValue || null,
          status: 'pending',
        }));

        const { error: reviewErr } = await supabase
          .from('import_review_queue')
          .insert(reviewInserts);

        if (!reviewErr) {
          importResult.reviewQueued = reviewRows.length;
        }
      }

      // 7. Update batch record with final counts
      await supabase
        .from('import_batches')
        .update({
          pilgrims_created: importResult.pilgrimsCreated,
          agents_created: importResult.agentsCreated,
          agents_matched: importResult.agentsMatched,
          duplicates_skipped: importResult.duplicatesSkipped,
          review_queued: importResult.reviewQueued,
          demo_agents_removed: importResult.demoAgentsRemoved,
          demo_pilgrims_removed: importResult.demoPilgrimsRemoved,
        })
        .eq('id', batchId);

      // 8. Audit log
      await logAudit({
        action: 'verified_pilgrim_import',
        recordType: 'pilgrim',
        recordId: batchId,
        recordLabel: `Verified import: ${fileName}`,
        newValue: {
          file_name: fileName,
          file_hash: fileHash,
          performed_by: profile?.full_name,
          batch_id: batchId,
          total_rows: totals.totalRows,
          pilgrims_created: importResult.pilgrimsCreated,
          agents_created: importResult.agentsCreated,
          agents_matched: importResult.agentsMatched,
          duplicates_skipped: importResult.duplicatesSkipped,
          review_queued: importResult.reviewQueued,
          demo_agents_removed: importResult.demoAgentsRemoved,
          demo_pilgrims_removed: importResult.demoPilgrimsRemoved,
          failed_rows: importResult.failedRows.length,
        },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });

      setResult(importResult);
      setPhase('complete');
    } catch (err) {
      importResult.failedRows.push({ row: 0, name: 'System', reason: friendlyError(err) });
      setResult(importResult);
      setPhase('complete');
    }
  }

  function reset() {
    setPhase('upload');
    setFileName('');
    setFileHash('');
    setRows([]);
    setAgentMatches(new Map());
    setExistingAgents([]);
    setExistingPilgrims([]);
    setDemoAgents([]);
    setDemoPilgrims([]);
    setSuspectedRecords([]);
    setSuspectedRemovals(new Set());
    setInternalDups([]);
    setExistingDups([]);
    setError(null);
    setResult(null);
    setConfirmExecute(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }


  const stageIndex =
    phase === 'upload'
      ? 0
      : phase === 'analyzing'
        ? 1
        : phase === 'preview'
          ? 2
          : phase === 'executing'
            ? 3
            : 4;

  return (
    <div>
      <PageHeader
        eyebrow="Specialised execution"
        title="Verified Pilgrim Import"
        subtitle="A one-time, file-verified execution of a prepared pilgrim dataset. This is not the routine CSV import — it checks the file against expected totals, removes demo data and executes in a single pass."
      />

      {/* This module stays deliberately separate from the routine Import CSV
          workflow. It is reachable by URL only and is never placed in the
          sidebar navigation. */}
      <Alert tone="warning" title="Specialised execution module" className="mb-6">
        This screen executes a prepared, pre-verified dataset. For day-to-day intake use{' '}
        <Link to="/app/pilgrims/import-csv" className="font-semibold underline">
          Import CSV
        </Link>{' '}
        instead, which reviews each row before anything is written.
      </Alert>

      <ImportStages stages={VERIFIED_STAGES} currentIndex={stageIndex} className="mb-6" />

      {error && (
        <Alert tone="critical" title="Execution halted" className="mb-6">
          <span className="whitespace-pre-line">{error}</span>
        </Alert>
      )}

      {/* ── Stage 1 — file verification ─────────────────────────────── */}
      {phase === 'upload' && (
        <div className="space-y-5">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-10 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/30"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-slate-300 bg-slate-50 text-slate-500">
              <Upload className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-4 font-display text-sm font-bold text-navy-900">
              Upload the verified pilgrims CSV file
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              The file is checked against the expected totals before any processing occurs.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="sr-only"
              aria-label="Upload the verified pilgrims CSV file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <Panel
            edge="caution"
            title="Expected file totals"
            description="If the uploaded file does not match these totals exactly, execution stops immediately and no data is changed."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <OutcomeTile label="Total rows" value={493} tone="neutral" description="Expected in the file" />
              <OutcomeTile label="READY" value={468} tone="ready" description="Execute directly" />
              <OutcomeTile label="REVIEW" value={25} tone="review" description="To the review queue" />
              <OutcomeTile label="Agent keys" value={48} tone="info" description="Unique agent keys" />
            </div>
          </Panel>
        </div>
      )}

      {/* ── Stage 2 — analysing ─────────────────────────────────────── */}
      {phase === 'analyzing' && <LoadingBlock label="Verifying totals, matching agents and detecting duplicates…" />}

      {/* ── Stage 3 — execution plan ────────────────────────────────── */}
      {phase === 'preview' && (
        <div className="space-y-6">
          <Alert tone="success" title="File verified">
            {fileName} — {totals.totalRows} rows, {totals.readyRows} READY, {totals.reviewRows} REVIEW,{' '}
            {totals.uniqueAgentKeys} agent keys.
            <span className="mt-1 block text-xs">
              SHA-256 <Identifier value={`${fileHash.slice(0, 16)}…`} />
            </span>
          </Alert>

          <section aria-labelledby="verified-plan">
            <h2
              id="verified-plan"
              className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
            >
              Execution plan
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <OutcomeTile label="Total CSV rows" value={totals.totalRows} tone="neutral" />
              <OutcomeTile label="READY" value={previewSummary.readyToImport} tone="ready" description="Execute directly" />
              <OutcomeTile label="REVIEW" value={previewSummary.reviewQueue} tone="review" description="To the review queue" />
              <OutcomeTile
                label="Duplicates skipped"
                value={previewSummary.duplicatesSkipped}
                tone="blocked"
                description="Passport already present"
              />
              <OutcomeTile label="Agents matched" value={previewSummary.matched} tone="ready" />
              <OutcomeTile label="New agents" value={previewSummary.newAgents} tone="info" />
            </div>
          </section>

          {hasAmbiguous && (
            <Alert
              tone="warning"
              title={`${previewSummary.ambiguous} agent${previewSummary.ambiguous === 1 ? '' : 's'} require your decision`}
            >
              These CSV agent names partially match existing sub-agents. Execution stays disabled until each one
              is resolved — the system will not choose on your behalf.
            </Alert>
          )}

          {/* Demo data removal */}
          {(demoAgents.length > 0 || demoPilgrims.length > 0 || suspectedRecords.length > 0) && (
            <Panel
              edge="critical"
              title={
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-700" aria-hidden="true" />
                  Demo data removal
                </span>
              }
              description="Executed before the import so demo records cannot be confused with verified operational data."
            >
              <div className="space-y-5">
                {demoAgents.length > 0 && (
                  <DemoGroup
                    title={`Demo or sample agents — removed automatically (${demoAgents.length})`}
                    records={demoAgents}
                  />
                )}
                {demoPilgrims.length > 0 && (
                  <DemoGroup
                    title={`Demo or sample pilgrims — removed automatically (${demoPilgrims.length})`}
                    records={demoPilgrims}
                  />
                )}
                {suspectedRecords.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      Suspected demo records — confirm each removal ({suspectedRecords.length})
                    </p>
                    <ul className="space-y-1.5">
                      {suspectedRecords.map((d) => (
                        <li key={d.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 transition-colors hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={suspectedRemovals.has(d.id)}
                              onChange={() => toggleSuspectedRemoval(d.id)}
                              className="h-4 w-4 shrink-0 rounded border-slate-400"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                              {d.name}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">{d.reason}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Agent mapping */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Agent mapping ({agentMatches.size} unique agents)
              </span>
            }
            description="Matched, new and ambiguous agents. Ambiguous entries must be resolved before execution."
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone="positive" treatment="solid">
                {previewSummary.matched} matched
              </Badge>
              <Badge tone="info">{previewSummary.newAgents} new</Badge>
              <Badge tone="caution">{previewSummary.ambiguous} ambiguous</Badge>
            </div>

            <div className="max-h-[36rem] space-y-2 overflow-y-auto scrollbar-thin">
              {Array.from(agentMatches.values())
                .sort((a, b) => {
                  const order = { ambiguous: 0, new: 1, matched: 2 };
                  return order[a.status] - order[b.status] || b.pilgrimCount - a.pilgrimCount;
                })
                .map((m) => (
                  <AgentMatchRow
                    key={m.matchKey}
                    entry={m}
                    existingAgents={existingAgents.filter((a) => !demoAgentIds.has(a.id))}
                    onResolve={(agentId) => resolveAgent(m.matchKey, agentId)}
                  />
                ))}
            </div>
          </Panel>

          {/* Duplicates */}
          {(internalDups.length > 0 || existingDups.length > 0) && (
            <Panel
              edge="critical"
              title={
                <span className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-700" aria-hidden="true" />
                  Duplicate detection
                </span>
              }
              description="Blocked rows. These passports will not be executed."
            >
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {existingDups.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      Already present in HajjERP — skipped ({existingDups.length})
                    </p>
                    <ul className="max-h-44 space-y-1.5 overflow-y-auto scrollbar-thin">
                      {existingDups.map((d, i) => (
                        <li
                          key={`${d.passportNumber}-${i}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <Identifier value={d.passportNumber} />
                          <span className="text-xs text-slate-500">Row {d.csvRow}</span>
                          <span className="ml-auto text-xs text-slate-600">
                            Existing: {d.existingPilgrimName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {internalDups.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      Duplicated within this CSV — skipped ({internalDups.length})
                    </p>
                    <ul className="max-h-44 space-y-1.5 overflow-y-auto scrollbar-thin">
                      {internalDups.map((d, i) => (
                        <li
                          key={`${d.passportNumber}-${i}`}
                          className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <Identifier value={d.passportNumber} />
                          <span className="text-xs text-slate-500">Row {d.csvRow}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {totals.reviewRows > 0 && (
            <Alert tone="warning" title={`${totals.reviewRows} rows will be placed in the Import Review Queue`}>
              These rows carry a REVIEW reason — an invalid date, a missing name, a duplicate visa. They are
              stored with all their original values for correction and approval later. Nothing is discarded and
              no re-upload is needed.
            </Alert>
          )}

          {/* Execute */}
          <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-lg border border-slate-300 bg-white/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-slate-700">
              {hasAmbiguous ? (
                <span className="flex items-center gap-2 font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Resolve {previewSummary.ambiguous} ambiguous agent
                  {previewSummary.ambiguous === 1 ? '' : 's'} before executing
                </span>
              ) : (
                <>
                  <span className="font-bold tabular-nums text-emerald-900">
                    {previewSummary.readyToImport}
                  </span>{' '}
                  READY ·{' '}
                  <span className="font-bold tabular-nums text-brand-900">{previewSummary.newAgents}</span> new
                  agents ·{' '}
                  <span className="font-bold tabular-nums text-amber-900">{totals.reviewRows}</span> to review
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={reset}>
                Cancel
              </Button>
              <Button
                variant="critical"
                onClick={() => setConfirmExecute(true)}
                disabled={hasAmbiguous}
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              >
                Remove demo data and execute import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage 4 — executing ─────────────────────────────────────── */}
      {phase === 'executing' && (
        <div>
          <LoadingBlock label="Executing import — do not close this page…" />
          <p className="text-center text-sm text-slate-600">
            Removing demo data, creating agents and importing pilgrim records.
          </p>
        </div>
      )}

      {/* ── Stage 5 — result ────────────────────────────────────────── */}
      {phase === 'complete' && result && (
        <div className="space-y-6">
          <Alert
            tone={result.failedRows.length > 0 ? 'warning' : 'success'}
            title={
              result.failedRows.length > 0
                ? 'Execution finished with failures'
                : `Execution complete — ${result.pilgrimsCreated} pilgrims imported`
            }
          >
            {result.pilgrimsCreated} pilgrims imported, {result.reviewQueued} queued for review
            {result.failedRows.length > 0 ? `, ${result.failedRows.length} rows failed.` : '.'}
          </Alert>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OutcomeTile label="Pilgrims created" value={result.pilgrimsCreated} tone="ready" />
            <OutcomeTile label="New agents created" value={result.agentsCreated} tone="info" />
            <OutcomeTile label="Agents matched" value={result.agentsMatched} tone="ready" />
            <OutcomeTile label="Duplicates skipped" value={result.duplicatesSkipped} tone="blocked" />
            <OutcomeTile label="Review queue" value={result.reviewQueued} tone="review" />
            <OutcomeTile label="Demo agents removed" value={result.demoAgentsRemoved} tone="blocked" />
            <OutcomeTile label="Demo pilgrims removed" value={result.demoPilgrimsRemoved} tone="blocked" />
            <OutcomeTile label="Failed rows" value={result.failedRows.length} tone="blocked" />
          </div>

          {result.failedRows.length > 0 && (
            <Panel
              edge="critical"
              title={`Failed rows (${result.failedRows.length})`}
              description="These rows were not imported. Nothing about them was silently discarded — each failure is listed here and in the audit history."
            >
              <ul className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
                {result.failedRows.map((f, i) => (
                  <li
                    key={`${f.row}-${i}`}
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
                  >
                    <span className="font-medium">Row {f.row}</span> ({f.name}): {f.reason}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/app/pilgrims" icon={<Users className="h-4 w-4" aria-hidden="true" />}>
              View all pilgrims
            </ButtonLink>
            {result.reviewQueued > 0 && (
              <ButtonLink to="/app/pilgrims/review-queue" variant="secondary">
                Open Review Queue ({result.reviewQueued})
              </ButtonLink>
            )}
            <Button variant="secondary" onClick={reset} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
              Import another file
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmExecute}
        critical
        title="Execute verified import"
        confirmLabel={`Execute for ${previewSummary.readyToImport} READY Rows`}
        loading={phase === 'executing'}
        onCancel={() => setConfirmExecute(false)}
        onConfirm={() => {
          setConfirmExecute(false);
          executeImport();
        }}
        message={
          <>
            This removes the demo records listed above, creates{' '}
            <strong className="tabular-nums">{previewSummary.newAgents}</strong> new agents, imports{' '}
            <strong className="tabular-nums">{previewSummary.readyToImport}</strong> READY rows and queues{' '}
            <strong className="tabular-nums">{totals.reviewRows}</strong> REVIEW rows. Demo-record deletion
            cannot be undone. The whole execution is recorded in the audit history.
          </>
        }
      />
    </div>
  );
}

function DemoGroup({ title, records }: { title: string; records: DemoRecord[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p>
      <ul className="max-h-44 space-y-1.5 overflow-y-auto scrollbar-thin">
        {records.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm"
          >
            <XCircle className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{d.name}</span>
            <span className="shrink-0 text-xs text-slate-600">{d.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One agent key in the verified execution plan.
 * Ambiguous entries block execution until an officer decides.
 */
function AgentMatchRow({
  entry,
  existingAgents,
  onResolve,
}: {
  entry: AgentMatchEntry;
  existingAgents: SubAgent[];
  onResolve: (agentId: string | 'new') => void;
}) {
  const tone =
    entry.status === 'matched' ? 'border-emerald-300' : entry.status === 'new' ? 'border-brand-300' : 'border-amber-400';

  return (
    <div className={`rounded-md border bg-white p-3.5 ${tone}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{entry.csvAgentName}</p>
            <Identifier value={entry.matchKey} />
            <span className="text-xs tabular-nums text-slate-500">
              {entry.pilgrimCount} {entry.pilgrimCount === 1 ? 'pilgrim' : 'pilgrims'}
            </span>
          </div>
          {entry.matchedAgent && (
            <p className="mt-1 text-sm text-slate-600">
              Maps to {entry.matchedAgent.organisation_name}
              {entry.matchedAgent.country ? ` · ${entry.matchedAgent.country}` : ' · no country recorded'}
            </p>
          )}
          {entry.status === 'ambiguous' && entry.similarAgents.length > 0 && (
            <p className="mt-1 text-sm text-amber-900">
              Similar existing agents: {entry.similarAgents.map((a) => a.organisation_name).join(', ')}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {entry.status === 'matched' && (
            <Badge tone="positive" treatment="solid">
              Matched
            </Badge>
          )}
          {entry.status === 'new' && <Badge tone="info">New agent</Badge>}
          {entry.status === 'ambiguous' && <Badge tone="caution">Ambiguous</Badge>}
        </div>
      </div>

      {entry.status !== 'matched' && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <label
            htmlFor={`verified-agent-${entry.matchKey}`}
            className="mb-1.5 block text-xs font-medium text-slate-600"
          >
            {entry.status === 'ambiguous'
              ? 'Select the correct existing agent, or confirm this is genuinely new:'
              : 'This agent will be created as ACTIVE. Confirm, or map it to an existing agent instead:'}
          </label>
          <Select
            id={`verified-agent-${entry.matchKey}`}
            value={entry.matchedAgent?.id ?? (entry.isNew ? 'new' : '')}
            onChange={(e) => onResolve(e.target.value)}
          >
            <option value="">— Select an existing agent —</option>
            <option value="new">Create as a new agent: “{entry.csvAgentName}”</option>
            {existingAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.organisation_name} · {a.country || 'No country'}
              </option>
            ))}
          </Select>
        </div>
      )}

      {entry.status === 'matched' && entry.manuallyResolved && (
        <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
          Resolved manually.{' '}
          <button
            type="button"
            onClick={() => onResolve('new')}
            className="font-medium text-brand-700 hover:underline"
          >
            Create as a new agent instead
          </button>
        </p>
      )}
    </div>
  );
}

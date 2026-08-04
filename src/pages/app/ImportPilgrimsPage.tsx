import { useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  XCircle,
  Building2,
  Trash2,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import type { SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <Link to="/app/pilgrims" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Pilgrims
      </Link>

      <PageHeader
        title="Verified Pilgrim Import"
        subtitle="One-time import of verified pilgrim data from CSV"
        icon={<ShieldCheck className="h-6 w-6" />}
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-5">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Upload Phase */}
      {phase === 'upload' && (
        <div className="space-y-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center hover:border-brand-400 hover:bg-brand-50/40 transition-all"
          >
            <Upload className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="font-display font-bold text-base text-slate-700">
              Upload the verified pilgrims CSV file
            </p>
            <p className="mt-2 text-sm text-slate-400">
              The file will be verified against expected totals before any processing occurs
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h3 className="font-display font-bold text-sm text-amber-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Expected File Totals
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-display font-extrabold text-amber-700">493</p>
                <p className="text-xs text-amber-600">Total Rows</p>
              </div>
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-display font-extrabold text-emerald-700">468</p>
                <p className="text-xs text-emerald-600">READY</p>
              </div>
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-display font-extrabold text-orange-700">25</p>
                <p className="text-xs text-orange-600">REVIEW</p>
              </div>
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-display font-extrabold text-brand-700">48</p>
                <p className="text-xs text-brand-600">Agent Keys</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-700/80">
              If the file totals do not match, the import will stop immediately. No data will be changed.
            </p>
          </div>
        </div>
      )}

      {/* Analyzing Phase */}
      {phase === 'analyzing' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="mt-4 font-display font-bold text-base text-slate-700">Analyzing file...</p>
          <p className="mt-1 text-sm text-slate-400">Verifying totals, matching agents, detecting duplicates</p>
        </div>
      )}

      {/* Preview Phase */}
      {phase === 'preview' && (
        <div className="space-y-6">
          {/* File verification banner */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-display font-bold text-sm text-emerald-900">File Verified</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {fileName} — {totals.totalRows} rows, {totals.readyRows} READY, {totals.reviewRows} REVIEW, {totals.uniqueAgentKeys} agent keys
                </p>
                <p className="text-xs text-emerald-600/60 mt-0.5 font-mono">SHA-256: {fileHash.slice(0, 16)}...</p>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total CSV Rows" value={totals.totalRows} icon={FileSpreadsheet} color="text-slate-600 bg-slate-50" />
            <StatCard label="READY to Import" value={previewSummary.readyToImport} icon={CheckCircle2} color="text-emerald-600 bg-emerald-50" />
            <StatCard label="REVIEW Queue" value={previewSummary.reviewQueue} icon={AlertTriangle} color="text-orange-600 bg-orange-50" />
            <StatCard label="Duplicates Skipped" value={previewSummary.duplicatesSkipped} icon={XCircle} color="text-amber-600 bg-amber-50" />
            <StatCard label="Agents Matched" value={previewSummary.matched} icon={Building2} color="text-brand-600 bg-brand-50" />
            <StatCard label="New Agents" value={previewSummary.newAgents} icon={Plus} color="text-indigo-600 bg-indigo-50" />
          </div>

          {/* Ambiguous agents warning */}
          {hasAmbiguous && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-display font-bold text-sm text-amber-900">
                    {previewSummary.ambiguous} agent(s) require your decision
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    These CSV agents have similar existing agent names. You must decide whether they are the same agent or genuinely new.
                    The import button will be disabled until all ambiguous agents are resolved.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Demo Data Removal Section */}
          {(demoAgents.length > 0 || demoPilgrims.length > 0 || suspectedRecords.length > 0) && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                Demo Data Removal
              </h3>

              {demoAgents.length > 0 && (
                <div className="mb-5">
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Demo/sample agents — will be removed automatically ({demoAgents.length})
                  </p>
                  <div className="space-y-2">
                    {demoAgents.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-2.5">
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-sm font-medium text-slate-900">{d.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">{d.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {demoPilgrims.length > 0 && (
                <div className="mb-5">
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Demo/sample pilgrims — will be removed automatically ({demoPilgrims.length})
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {demoPilgrims.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-2.5">
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-sm font-medium text-slate-900">{d.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">{d.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {suspectedRecords.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Suspected demo records — confirm removal for each ({suspectedRecords.length})
                  </p>
                  <div className="space-y-2">
                    {suspectedRecords.map((d) => (
                      <label key={d.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={suspectedRemovals.has(d.id)}
                          onChange={() => toggleSuspectedRemoval(d.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                        />
                        <span className="text-sm font-medium text-slate-900">{d.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">{d.reason}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agent Mapping Section */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-500" />
              Agent Mapping ({agentMatches.size} unique agents)
            </h3>

            <div className="flex flex-wrap gap-3 mb-5">
              <StatusChip label="Matched" count={previewSummary.matched} color="emerald" />
              <StatusChip label="New Agents" count={previewSummary.newAgents} color="indigo" />
              <StatusChip label="Ambiguous" count={previewSummary.ambiguous} color="amber" />
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
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
          </div>

          {/* Duplicate Detection Section */}
          {(internalDups.length > 0 || existingDups.length > 0) && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-amber-500" />
                Duplicate Detection
              </h3>

              {existingDups.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Passport numbers already in HajjERP — will be skipped ({existingDups.length})
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {existingDups.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-slate-600">{d.passportNumber}</span>
                        <span className="text-slate-500">Row {d.csvRow}</span>
                        <span className="text-slate-400 ml-auto">Existing: {d.existingPilgrimName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {internalDups.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Duplicate passports within CSV — will be skipped ({internalDups.length})
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {internalDups.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-orange-50 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-slate-600">{d.passportNumber}</span>
                        <span className="text-slate-500">Row {d.csvRow}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Review Queue Section */}
          {totals.reviewRows > 0 && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-display font-bold text-sm text-orange-900">
                    {totals.reviewRows} rows will be placed in the Import Review Queue
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    These rows have review reasons (invalid dates, missing names, duplicate visas, etc.) and will not be imported as active pilgrim records.
                    They will be stored with all original values for correction and approval later — no re-upload needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-4 shadow-lg">
            <div className="text-sm text-slate-500">
              {hasAmbiguous ? (
                <span className="flex items-center gap-2 text-amber-600 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Resolve {previewSummary.ambiguous} ambiguous agent(s) first
                </span>
              ) : (
                <span>
                  Ready: <strong className="text-slate-900">{previewSummary.readyToImport}</strong> pilgrims,
                  {' '}<strong className="text-slate-900">{previewSummary.newAgents}</strong> new agents,
                  {' '}<strong className="text-slate-900">{totals.reviewRows}</strong> to review queue
                </span>
              )}
            </div>
            <button
              onClick={executeImport}
              disabled={hasAmbiguous}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="h-4 w-4" />
              Remove Demo Data and Import Verified Pilgrims
            </button>
          </div>
        </div>
      )}

      {/* Executing Phase */}
      {phase === 'executing' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="mt-4 font-display font-bold text-base text-slate-700">Executing import...</p>
          <p className="mt-1 text-sm text-slate-400">Removing demo data, creating agents, importing pilgrims. Do not close this page.</p>
        </div>
      )}

      {/* Complete Phase */}
      {phase === 'complete' && result && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="mt-5 font-display font-bold text-xl text-slate-900">Import Complete</h3>
            <p className="mt-2 text-sm text-slate-500">
              {result.pilgrimsCreated} pilgrims imported, {result.reviewQueued} queued for review
            </p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <ResultCard label="Pilgrims Created" value={result.pilgrimsCreated} color="emerald" />
              <ResultCard label="New Agents Created" value={result.agentsCreated} color="indigo" />
              <ResultCard label="Agents Matched" value={result.agentsMatched} color="brand" />
              <ResultCard label="Duplicates Skipped" value={result.duplicatesSkipped} color="amber" />
              <ResultCard label="Review Queue" value={result.reviewQueued} color="orange" />
              <ResultCard label="Demo Agents Removed" value={result.demoAgentsRemoved} color="red" />
              <ResultCard label="Demo Pilgrims Removed" value={result.demoPilgrimsRemoved} color="red" />
              <ResultCard label="Failed Rows" value={result.failedRows.length} color="red" />
            </div>
          </div>

          {result.failedRows.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-display font-bold text-sm text-red-900 mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Failed Rows ({result.failedRows.length})
              </h3>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {result.failedRows.map((f, i) => (
                  <p key={i} className="text-sm text-red-700">
                    Row {f.row} ({f.name}): {f.reason}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Upload className="h-4 w-4" /> Import Another File
            </button>
            <Link
              to="/app/pilgrims"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all"
            >
              <Users className="h-4 w-4" /> View All Pilgrims
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-2xl font-display font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function StatusChip({ label, count, color }: { label: string; count: number; color: 'emerald' | 'indigo' | 'amber' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${colors[color]}`}>
      <span className="text-sm font-semibold">{count}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function ResultCard({ label, value, color }: { label: string; value: number; color: 'emerald' | 'indigo' | 'brand' | 'amber' | 'orange' | 'red' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <p className="text-3xl font-display font-extrabold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

function AgentMatchRow({
  entry,
  existingAgents,
  onResolve,
}: {
  entry: AgentMatchEntry;
  existingAgents: SubAgent[];
  onResolve: (agentId: string | 'new') => void;
}) {
  const statusConfig = {
    matched: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Matched' },
    new: { icon: Plus, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'New Agent' },
    ambiguous: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Ambiguous' },
  };
  const cfg = statusConfig[entry.status];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900">{entry.csvAgentName}</p>
            <span className="text-xs font-mono text-slate-400 rounded bg-white/60 px-1.5 py-0.5">{entry.matchKey}</span>
            <span className="text-xs font-medium text-slate-400">({entry.pilgrimCount} pilgrims)</span>
          </div>
          {entry.matchedAgent && (
            <p className="text-xs text-slate-600 mt-1">
              → {entry.matchedAgent.organisation_name} · {entry.matchedAgent.country || 'No country'}
            </p>
          )}
          {entry.status === 'ambiguous' && entry.similarAgents.length > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Similar existing: {entry.similarAgents.map((a) => a.organisation_name).join(', ')}
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 ${cfg.color}`}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-semibold hidden sm:inline">{cfg.label}</span>
        </div>
      </div>

      {entry.status !== 'matched' && (
        <div className="mt-3 pt-3 border-t border-slate-200/60">
          <p className="text-xs font-medium text-slate-500 mb-2">
            {entry.status === 'ambiguous'
              ? 'Select the correct existing agent, or confirm this is a genuinely new agent:'
              : 'This agent will be created with ACTIVE status. Confirm or select an existing agent instead:'}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={entry.matchedAgent?.id ?? (entry.isNew ? 'new' : '')}
              onChange={(e) => onResolve(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
            >
              <option value="">— Select an existing agent —</option>
              <option value="new">+ Create as new agent: "{entry.csvAgentName}"</option>
              {existingAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.organisation_name} · {a.country || 'No country'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {entry.status === 'matched' && entry.manuallyResolved && (
        <div className="mt-2 pt-2 border-t border-slate-200/60">
          <p className="text-xs text-slate-500">
            You can change this mapping:{' '}
            <button
              onClick={() => onResolve('new')}
              className="text-brand-600 hover:text-brand-700 font-medium"
            >
              Create as new agent instead
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

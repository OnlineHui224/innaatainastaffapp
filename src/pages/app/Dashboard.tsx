import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  calculateDashboardMetrics,
  calculateJourneyStatus,
  isOverdue,
  isPhysicallyPresent,
  sortPilgrimsByPriority,
  type DashboardMetrics,
} from '@/lib/status';
import { journeyStatusProvenance } from '@/lib/provenance';
import { formatDate, priorityReason } from '@/lib/priority';
import { friendlyError } from '@/lib/validation';
import type { Pilgrim, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { BootstrapBanner } from '@/components/BootstrapBanner';
import { MetricLine, MetricTile } from '@/components/MetricTile';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { SectionHeading } from '@/components/ui/Panel';
import { RecordCard, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';

interface PilgrimRow extends Pilgrim {
  sub_agents: SubAgent | null;
}

const EMPTY_METRICS: DashboardMetrics = {
  total: 0,
  inSaudiArabia: 0,
  departingIn3Days: 0,
  overdue: 0,
  unconfirmed: 0,
  departureConfirmed: 0,
  unverifiedImported: 0,
};

export default function Dashboard() {
  const [pilgrims, setPilgrims] = useState<PilgrimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('pilgrims')
        .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      const rows = (data || []) as unknown as PilgrimRow[];
      setPilgrims(rows);
      // Metric calculations are untouched — the redesign only changes presentation.
      setMetrics(calculateDashboardMetrics(rows));
    } catch (e) {
      console.error('Dashboard fetch error:', e);
      setError(friendlyError(e));
      setPilgrims([]);
      setMetrics(EMPTY_METRICS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const priorityPilgrims = useMemo(() => sortPilgrimsByPriority(pilgrims).slice(0, 8), [pilgrims]);

  /** Secondary context for confirmed presence — computed from the rows already loaded. */
  const inSaudiAgentCount = useMemo(() => {
    const agentIds = new Set<string>();
    let unassigned = 0;
    for (const p of pilgrims) {
      if (!isPhysicallyPresent(p)) continue;
      if (p.sub_agent_id) agentIds.add(p.sub_agent_id);
      else unassigned += 1;
    }
    return { agents: agentIds.size, unassigned };
  }, [pilgrims]);

  const overdueAgentCount = useMemo(() => {
    const agentIds = new Set<string>();
    for (const p of pilgrims) {
      if (isOverdue(p) && p.sub_agent_id) agentIds.add(p.sub_agent_id);
    }
    return agentIds.size;
  }, [pilgrims]);

  const today = formatDate(new Date().toISOString().slice(0, 10));

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Operations Dashboard"
        subtitle={`Live operational position as at ${today}. Every figure below states whether it is confirmed by a staff member or derived by the system from planned dates.`}
        actions={
          <Button
            variant="secondary"
            onClick={fetchData}
            loading={loading}
            icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          >
            Refresh
          </Button>
        }
      />

      <BootstrapBanner />

      {error && (
        <Alert
          tone="critical"
          title="The dashboard could not be loaded"
          className="mb-6"
          actions={
            <Button size="sm" variant="secondary" onClick={fetchData}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-5">
          {/* ── Tier 1 — Critical ───────────────────────────────────────── */}
          <section aria-labelledby="tier-critical">
            <SectionHeading>Tier 1 — Critical</SectionHeading>
            <h2 id="tier-critical" className="sr-only">
              Critical operational risk
            </h2>
            {/* Urgency carried by the red rule, the count and the icon — not by
                vertical space. The overstay caveat stays verbatim, on one line. */}
            {metrics.overdue > 0 ? (
              <div className="overflow-hidden rounded-lg border border-red-400 bg-white">
                <div className="h-0.5 bg-red-600" aria-hidden="true" />
                <div className="flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center lg:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-red-300 bg-red-50"
                      aria-hidden="true"
                    >
                      <AlertTriangle className="h-5 w-5 text-red-700" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-extrabold leading-tight text-red-900">
                        <span className="text-lg tabular-nums">{metrics.overdue}</span>{' '}
                        {metrics.overdue === 1 ? 'pilgrim has' : 'pilgrims have'} passed the expected return
                        date without a confirmed departure
                        {overdueAgentCount > 0 && (
                          <span className="whitespace-nowrap font-semibold text-red-900/70">
                            {' · '}across {overdueAgentCount}{' '}
                            {overdueAgentCount === 1 ? 'sub-agent' : 'sub-agents'}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-snug text-red-900/80">
                        This is an operational flag — it does not confirm a legal overstay. No staff member has
                        yet recorded a departure for these records.
                      </p>
                    </div>
                  </div>
                  <ButtonLink
                    to="/app/pilgrims?status=departure_overdue"
                    variant="critical"
                    size="sm"
                    className="shrink-0"
                    icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Review overdue
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50/50 px-3.5 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <p className="text-[0.8125rem] leading-snug text-emerald-900">
                  <span className="font-bold">No overdue departures on record.</span> No pilgrim currently sits
                  past their expected return date without a confirmed departure.
                </p>
              </div>
            )}
          </section>

          {/* ── Tier 2 — Requires follow-up ─────────────────────────────── */}
          <section aria-labelledby="tier-followup">
            <SectionHeading description="Records where the plan says movement should have happened, but no staff member has confirmed it.">
              Tier 2 — Requires follow-up
            </SectionHeading>
            <h2 id="tier-followup" className="sr-only">
              Records requiring follow-up
            </h2>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <MetricTile
                label="Unconfirmed departures"
                value={metrics.unconfirmed}
                provenance="derived"
                emphasis="caution"
                description="Pilgrims whose expected return date has been reached or passed with no confirmed departure."
                subset={{
                  label: 'are already past the expected return date',
                  value: metrics.overdue,
                  of: metrics.unconfirmed,
                  emphasis: 'critical',
                  to: '/app/pilgrims?status=departure_overdue',
                }}
                to="/app/pilgrims?status=departure_overdue"
                linkLabel="Open follow-up list"
              />
              <MetricTile
                label="Departing within 3 days"
                value={metrics.departingIn3Days}
                provenance="derived"
                emphasis="caution"
                description="Return expected today or within the next three days. Records due today also appear under unconfirmed departures above."
                to="/app/pilgrims?status=departing_soon"
                linkLabel="Open departing-soon list"
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* ── Tier 3 — Confirmed presence ─────────────────────────────── */}
          <section aria-labelledby="tier-presence">
            <SectionHeading description="Pilgrims recorded as physically present in Saudi Arabia, with no confirmed departure.">
              Tier 3 — Confirmed presence
            </SectionHeading>
            <h2 id="tier-presence" className="sr-only">
              Confirmed presence
            </h2>
            <div className="grid grid-cols-1 gap-3.5">
              <MetricTile
                label="In Saudi Arabia"
                value={metrics.inSaudiArabia}
                provenance="confirmed"
                emphasis="confirmed"
                context={
                  <>
                    <p>
                      Across{' '}
                      <span className="font-semibold tabular-nums text-slate-800">
                        {inSaudiAgentCount.agents}
                      </span>{' '}
                      {inSaudiAgentCount.agents === 1 ? 'sub-agent' : 'sub-agents'}
                      {inSaudiAgentCount.unassigned > 0 && (
                        <>
                          , plus{' '}
                          <span className="font-semibold tabular-nums text-slate-800">
                            {inSaudiAgentCount.unassigned}
                          </span>{' '}
                          unassigned
                        </>
                      )}
                      .
                    </p>
                    <p className="mt-1 text-slate-500">
                      Individual records show whether their presence is staff-confirmed or inferred from an
                      unconfirmed arrival field.
                    </p>
                  </>
                }
                to="/app/pilgrims?status=in_saudi_arabia"
                linkLabel="View pilgrims in Saudi Arabia"
              />
            </div>
          </section>

          {/* ── Tier 4 — General operational information ────────────────── */}
          <section aria-labelledby="tier-general">
            <SectionHeading>Tier 4 — General operational information</SectionHeading>
            <h2 id="tier-general" className="sr-only">
              General operational information
            </h2>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-300 bg-slate-300 sm:grid-cols-3 xl:grid-cols-1">
              <MetricLine
                label="Total pilgrims"
                value={metrics.total}
                provenance="derived"
                description="All registered records"
                to="/app/pilgrims"
              />
              <MetricLine
                label="Departure confirmed"
                value={metrics.departureConfirmed}
                provenance="confirmed"
                description="Recorded by a named officer"
                to="/app/pilgrims?status=departure_confirmed"
              />
              <MetricLine
                label="Imported, arrival unverified"
                value={metrics.unverifiedImported}
                provenance="derived"
                description="From a CSV batch, no arrival confirmation"
                to="/app/pilgrims"
              />
            </div>
          </section>

          </div>

          {/* ── Priority records ────────────────────────────────────────── */}
          <PriorityRecords rows={priorityPilgrims} />
        </div>
      )}
    </div>
  );
}

function PriorityRecords({ rows }: { rows: PilgrimRow[] }) {
  return (
    <section aria-labelledby="priority-records">
      <SectionHeading
        description="Ordered by operational urgency. The reason column is drawn only from what each record actually holds."
        actions={
          <ButtonLink
            to="/app/pilgrims"
            variant="secondary"
            size="sm"
            icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            View all pilgrims
          </ButtonLink>
        }
      >
        <span id="priority-records">Priority records</span>
      </SectionHeading>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title="No pilgrim records yet"
          description="Once pilgrims are registered or imported, the records needing attention first will be listed here."
          action={<ButtonLink to="/app/pilgrims/new">Add the first pilgrim</ButtonLink>}
        />
      ) : (
        <>
          {/* Desktop and laptop */}
          <div className="hidden lg:block">
            <TableFrame caption="Pilgrim records ordered by operational urgency">
              <THead>
                <tr>
                  <TH nowrap>Name</TH>
                  <TH className="hidden xl:table-cell">Nationality</TH>
                  {/* Header labels wrap by design — a nowrap label inflates the
                      table's min-content width and pushes a scrollbar onto the page. */}
                  <TH numeric>Sched. out / return</TH>
                  <TH nowrap>Status</TH>
                  <TH className="hidden xl:table-cell">Sub-agent</TH>
                  <TH className="hidden 2xl:table-cell">Why it is first</TH>
                  <TH align="right" nowrap>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((p) => {
                  const status = calculateJourneyStatus(p);
                  const reason = priorityReason(p, status);
                  return (
                    <TR key={p.id}>
                      <TD>
                        <Link
                          to={`/app/pilgrims/${p.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {p.full_name}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-500 xl:hidden">
                          {p.nationality}
                          {p.sub_agents ? ` · ${p.sub_agents.organisation_name}` : ' · Unassigned'}
                        </span>
                        {/* Below 2xl the reason becomes secondary record text rather
                            than being forced into a column that will not fit. */}
                        <span className="mt-0.5 block max-w-md text-xs leading-snug text-slate-600 2xl:hidden">
                          {reason.text}
                        </span>
                      </TD>
                      <TD className="hidden xl:table-cell">{p.nationality}</TD>
                      <TD numeric className="whitespace-nowrap">
                        <span className="block">{formatDate(p.expected_departure_date, 'Not set')}</span>
                        {p.expected_return_date && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {formatDate(p.expected_return_date)}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={status} record={p} />
                      </TD>
                      <TD className="hidden xl:table-cell">
                        {p.sub_agents ? (
                          <Link
                            to={`/app/sub-agents/${p.sub_agents.id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {p.sub_agents.organisation_name}
                          </Link>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                      </TD>
                      <TD className="hidden max-w-xs text-xs leading-snug text-slate-600 2xl:table-cell">
                        {reason.text}
                      </TD>
                      <TD align="right">
                        <Link
                          to={`/app/pilgrims/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                        >
                          View
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableFrame>
          </div>

          {/* Tablet and mobile — the reason becomes secondary record text rather
              than being forced into another column. */}
          <div className="space-y-3 lg:hidden">
            {rows.map((p) => {
              const status = calculateJourneyStatus(p);
              const reason = priorityReason(p, status);
              const provenance = journeyStatusProvenance(status, p);
              return (
                <RecordCard
                  key={p.id}
                  accent={
                    status === 'departure_overdue'
                      ? 'critical'
                      : status === 'departing_soon'
                        ? 'caution'
                        : 'none'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/app/pilgrims/${p.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {p.full_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {p.nationality}
                        {p.sub_agents ? ` · ${p.sub_agents.organisation_name}` : ' · Unassigned'}
                      </p>
                    </div>
                    <StatusBadge status={status} record={p} className="shrink-0" />
                  </div>
                  <p className="mt-3 border-t border-slate-200 pt-2.5 text-xs leading-relaxed text-slate-600">
                    {reason.text}
                  </p>
                  <p className="mt-1 text-2xs uppercase tracking-wide text-slate-400">
                    {provenance === 'confirmed' ? 'Confirmed by staff' : 'Derived by the system'}
                  </p>
                </RecordCard>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <TableSkeleton rows={6} columns={6} />
      <p className="sr-only" role="status">
        Loading the operations dashboard.
      </p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { isDepartingIn3Days, isOverdue, isPhysicallyPresent } from '@/lib/status';
import { logAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/validation';
import type { Pilgrim, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ReadOnlyNotice, TableSkeleton } from '@/components/ui/Feedback';
import { SearchInput } from '@/components/ui/Field';
import { RecordCard, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';
import { NestedCount, type AgentPopulation } from '@/components/subagents/PopulationBreakdown';
import { isPlaceholderContact } from '@/lib/subAgents';

interface SubAgentWithPopulation extends SubAgent {
  population: AgentPopulation;
}

export default function SubAgentsPage() {
  const { profile, canEditPilgrims, canDeleteRecords } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgentWithPopulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SubAgentWithPopulation | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: agentsError } = await supabase
        .from('sub_agents')
        .select('*')
        .order('organisation_name');
      if (agentsError) throw agentsError;
      const agents = (data || []) as SubAgent[];

      const { data: pilgrimData } = await supabase.from('pilgrims').select('*');
      const pilgrims = (pilgrimData || []) as Pilgrim[];

      setSubAgents(
        agents.map((agent) => {
          const assigned = pilgrims.filter((p) => p.sub_agent_id === agent.id);
          return {
            ...agent,
            population: {
              assigned: assigned.length,
              inSaudi: assigned.filter(isPhysicallyPresent).length,
              departingSoon: assigned.filter(isDepartingIn3Days).length,
              overdue: assigned.filter(isOverdue).length,
            },
          };
        }),
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Risk-first ordering.
   *
   * The directory is an operational surface, so the organisations needing
   * attention sort to the top rather than whichever happens to start with "A".
   * Order of precedence, each descending:
   *
   *   overdue → departing soon → in Saudi Arabia → assigned → name (A–Z)
   *
   * The alphabetical query order is only the stable tie-break: agents carrying
   * no operational risk fall to the bottom in a predictable A–Z sequence.
   *
   * This sorts the rows the metrics produce. It does not change how any metric
   * is calculated.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = q
      ? subAgents.filter(
          (agent) =>
            agent.organisation_name.toLowerCase().includes(q) ||
            agent.contact_person.toLowerCase().includes(q) ||
            agent.country.toLowerCase().includes(q),
        )
      : subAgents;

    return [...matching].sort((a, b) => {
      const pa = a.population;
      const pb = b.population;
      return (
        pb.overdue - pa.overdue ||
        pb.departingSoon - pa.departingSoon ||
        pb.inSaudi - pa.inSaudi ||
        pb.assigned - pa.assigned ||
        a.organisation_name.localeCompare(b.organisation_name)
      );
    });
  }, [subAgents, search]);

  /** True once every remaining row carries no risk — used to explain the ordering honestly. */
  const hasAnyRisk = useMemo(
    () => filtered.some((agent) => agent.population.overdue > 0 || agent.population.departingSoon > 0),
    [filtered],
  );

  const totalOverdue = useMemo(
    () => subAgents.reduce((sum, agent) => sum + agent.population.overdue, 0),
    [subAgents],
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const { count } = await supabase
        .from('pilgrims')
        .select('id', { count: 'exact', head: true })
        .eq('sub_agent_id', deleteTarget.id);
      if (count && count > 0) {
        setDeleteError(
          `${deleteTarget.organisation_name} still has ${count} assigned pilgrim${
            count === 1 ? '' : 's'
          }. Reassign them before deleting this sub-agent.`,
        );
        setDeleteLoading(false);
        return;
      }
      const { error: deleteFailure } = await supabase.from('sub_agents').delete().eq('id', deleteTarget.id);
      if (deleteFailure) throw deleteFailure;
      await logAudit({
        action: 'sub_agent_deleted',
        recordType: 'sub_agent',
        recordId: deleteTarget.id,
        recordLabel: deleteTarget.organisation_name,
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });
      setDeleteTarget(null);
      await fetchData();
    } catch (e) {
      setDeleteError(friendlyError(e));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Sub-Agents"
        subtitle={`${subAgents.length} ${subAgents.length === 1 ? 'organisation' : 'organisations'} carry responsibility for pilgrims on the platform.`}
        actions={
          canEditPilgrims ? (
            <ButtonLink to="/app/sub-agents/new" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Add Sub-Agent
            </ButtonLink>
          ) : undefined
        }
      />

      {!canEditPilgrims && (
        <ReadOnlyNotice className="mb-5">
          You have Viewer access. The sub-agent directory is read-only for your role.
        </ReadOnlyNotice>
      )}

      {totalOverdue > 0 && !loading && (
        <Alert tone="warning" title="Overdue departures are spread across the directory" className="mb-5">
          <span className="tabular-nums font-semibold">{totalOverdue}</span> pilgrims sit past their expected
          return date without a confirmed departure. Each is counted inside its sub-agent&rsquo;s in-country
          population below, never as a separate group.
        </Alert>
      )}

      <div className="mb-5 rounded-lg border border-slate-300 bg-white p-3">
        <SearchInput
          label="Search sub-agents"
          value={search}
          onValueChange={setSearch}
          placeholder="Search by organisation, contact person or country…"
        />
      </div>

      {/* The ordering is stated plainly so an alphabetical list is never assumed. */}
      {!loading && !error && filtered.length > 0 && (
        <p className="mb-3 text-xs text-slate-600">
          {hasAnyRisk
            ? 'Ordered by operational risk: overdue first, then departing soon, then in-country population. Organisations carrying no risk follow in alphabetical order.'
            : 'No organisation currently carries overdue or departing-soon pilgrims, so the directory is listed by in-country population, then alphabetically.'}
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={6} columns={7} />
      ) : error ? (
        <Alert tone="critical" title="The sub-agent directory could not be loaded">
          {error}
        </Alert>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
          title={search ? 'No sub-agents match this search' : 'No sub-agents yet'}
          description={
            search
              ? 'Clear the search to see the full directory.'
              : 'Sub-agents are created here, or automatically during an import when an unknown agent name appears.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : canEditPilgrims ? (
              <ButtonLink to="/app/sub-agents/new">Add Sub-Agent</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Compact operational directory — a table, not oversized sparse cards */}
          <div className="hidden lg:block">
            <TableFrame caption="Sub-agent operational directory">
              <THead>
                <tr>
                  <TH>Organisation</TH>
                  <TH>Contact</TH>
                  <TH>Country</TH>
                  <TH>Status</TH>
                  <TH align="right">Assigned</TH>
                  <TH align="right">↳ In KSA</TH>
                  <TH align="right">↳ Soon</TH>
                  <TH align="right">↳ Overdue</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {filtered.map((agent) => {
                  const { population } = agent;
                  return (
                    <TR key={agent.id}>
                      <TD>
                        <Link
                          to={`/app/sub-agents/${agent.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {agent.organisation_name}
                        </Link>
                      </TD>
                      <TD>
                        {isPlaceholderContact(agent.contact_person) ? (
                          /* The stored value stays untouched — it is only presented
                             as incomplete rather than as verified contact detail. */
                          <Badge tone="caution" title="Placeholder value from an automatic import">
                            Not yet provided
                          </Badge>
                        ) : (
                          <span>{agent.contact_person || '—'}</span>
                        )}
                      </TD>
                      <TD>{agent.country || <span className="text-slate-400">Not recorded</span>}</TD>
                      <TD>
                        {agent.active_status ? (
                          <Badge tone="positive" treatment="solid">
                            Active
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Inactive</Badge>
                        )}
                      </TD>
                      <TD align="right">
                        <NestedCount value={population.assigned} />
                      </TD>
                      <TD align="right">
                        <NestedCount
                          value={population.inSaudi}
                          of={population.assigned}
                          emphasis="positive"
                          indent
                        />
                      </TD>
                      <TD align="right">
                        <NestedCount
                          value={population.departingSoon}
                          of={population.inSaudi}
                          emphasis="caution"
                          indent
                        />
                      </TD>
                      <TD align="right">
                        <NestedCount
                          value={population.overdue}
                          of={population.inSaudi}
                          emphasis="critical"
                          indent
                        />
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/app/sub-agents/${agent.id}`}
                            aria-label={`View ${agent.organisation_name}`}
                            title="View details"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Link>
                          {canEditPilgrims && (
                            <Link
                              to={`/app/sub-agents/${agent.id}/edit`}
                              aria-label={`Edit ${agent.organisation_name}`}
                              title="Edit sub-agent"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          )}
                          {canDeleteRecords && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(agent);
                              }}
                              aria-label={`Delete ${agent.organisation_name}`}
                              title="Delete sub-agent"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableFrame>
            <p className="mt-2 text-xs text-slate-500">
              The indented columns are nested subsets: In KSA is part of Assigned, and Soon and Overdue are both
              part of In KSA. They never add up to a larger total.
            </p>
          </div>

          {/* Compact record cards below the table breakpoint */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((agent) => {
              const { population } = agent;
              return (
                <RecordCard key={agent.id} accent={population.overdue > 0 ? 'critical' : 'none'}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/app/sub-agents/${agent.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {agent.organisation_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {isPlaceholderContact(agent.contact_person) ? (
                          <span className="text-amber-800">Contact not yet provided</span>
                        ) : (
                          agent.contact_person || 'No contact recorded'
                        )}
                        {agent.country ? ` · ${agent.country}` : ''}
                      </p>
                    </div>
                    {agent.active_status ? (
                      <Badge tone="positive" treatment="solid" className="shrink-0">
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="shrink-0">
                        Inactive
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 border-t border-slate-200 pt-2.5 text-xs">
                    <p className="flex items-baseline gap-2">
                      <NestedCount value={population.assigned} />
                      <span className="text-slate-600">assigned pilgrims</span>
                    </p>
                    <p className="flex items-baseline gap-2 pl-3">
                      <NestedCount
                        value={population.inSaudi}
                        of={population.assigned}
                        emphasis="positive"
                        indent
                      />
                      <span className="text-slate-600">in Saudi Arabia</span>
                    </p>
                    <p className="flex items-baseline gap-2 pl-7">
                      <NestedCount
                        value={population.departingSoon}
                        of={population.inSaudi}
                        emphasis="caution"
                        indent
                      />
                      <span className="text-slate-600">departing soon</span>
                    </p>
                    <p className="flex items-baseline gap-2 pl-7">
                      <NestedCount
                        value={population.overdue}
                        of={population.inSaudi}
                        emphasis="critical"
                        indent
                      />
                      <span className="text-slate-600">overdue</span>
                    </p>
                  </div>
                </RecordCard>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="Delete sub-agent"
        confirmLabel={deleteError ? 'Close' : 'Delete sub-agent'}
        loading={deleteLoading}
        onConfirm={
          deleteError
            ? () => {
                setDeleteError(null);
                setDeleteTarget(null);
              }
            : handleDelete
        }
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        message={
          deleteError ? (
            <span className="font-medium text-red-800">{deleteError}</span>
          ) : (
            <>
              Delete <strong>{deleteTarget?.organisation_name}</strong>? This cannot be undone. Sub-agents with
              assigned pilgrims cannot be deleted.
            </>
          )
        }
      />
    </div>
  );
}

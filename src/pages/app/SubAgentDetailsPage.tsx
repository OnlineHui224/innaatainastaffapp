import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pencil, StickyNote, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  calculateJourneyStatus,
  isDepartingIn3Days,
  isOverdue,
  isPhysicallyPresent,
} from '@/lib/status';
import { formatDate } from '@/lib/priority';
import type { Pilgrim, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { Identifier } from '@/components/ui/Field';
import { DataGrid, DataRow, Panel } from '@/components/ui/Panel';
import { RecordCard, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';
import { PopulationBreakdown, type AgentPopulation } from '@/components/subagents/PopulationBreakdown';
import { isPlaceholderContact } from '@/lib/subAgents';

export default function SubAgentDetailsPage() {
  const { id } = useParams();
  const { canEditPilgrims } = useAuth();
  const [subAgent, setSubAgent] = useState<SubAgent | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('sub_agents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (queryError || !data) {
      setError('This sub-agent could not be found.');
      setLoading(false);
      return;
    }
    setSubAgent(data as SubAgent);
    const { data: pilgrimData } = await supabase
      .from('pilgrims')
      .select('*')
      .eq('sub_agent_id', id)
      .order('full_name');
    setPilgrims((pilgrimData || []) as Pilgrim[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading sub-agent record…" />;

  if (error || !subAgent) {
    return (
      <div>
        <Alert tone="critical" title="Record unavailable">
          {error || 'This sub-agent could not be found.'}
        </Alert>
        <ButtonLink
          to="/app/sub-agents"
          variant="secondary"
          className="mt-4"
          icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Back to sub-agents
        </ButtonLink>
      </div>
    );
  }

  const population: AgentPopulation = {
    assigned: pilgrims.length,
    inSaudi: pilgrims.filter(isPhysicallyPresent).length,
    departingSoon: pilgrims.filter(isDepartingIn3Days).length,
    overdue: pilgrims.filter(isOverdue).length,
  };

  const contactIsPlaceholder = isPlaceholderContact(subAgent.contact_person);
  const filterBase = `/app/pilgrims?subAgent=${subAgent.id}`;

  return (
    <div>
      <PageHeader
        eyebrow="Sub-agent record"
        title={subAgent.organisation_name}
        subtitle={
          contactIsPlaceholder
            ? 'Contact details for this organisation have not been provided yet.'
            : subAgent.contact_person
        }
        actions={
          canEditPilgrims ? (
            <ButtonLink
              to={`/app/sub-agents/${id}/edit`}
              variant="secondary"
              icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            >
              Edit sub-agent
            </ButtonLink>
          ) : undefined
        }
      />

      {contactIsPlaceholder && (
        <Alert tone="warning" title="Contact information is incomplete" className="mb-5">
          This organisation was created automatically during an import, and its contact person is still the
          placeholder value <span className="identifier">&ldquo;To be updated&rdquo;</span>. Treat it as
          unverified until a real contact is recorded.
          {canEditPilgrims && (
            <span className="mt-2 block">
              <Link to={`/app/sub-agents/${id}/edit`} className="font-semibold underline">
                Complete the contact details
              </Link>
            </span>
          )}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Panel title="Organisation">
            <DataGrid columns={2}>
              <DataRow label="Organisation" className="sm:col-span-2">
                {subAgent.organisation_name}
              </DataRow>
              <DataRow label="Contact person" className="sm:col-span-2">
                {contactIsPlaceholder ? (
                  <Badge tone="caution">Not yet provided</Badge>
                ) : (
                  subAgent.contact_person || '—'
                )}
              </DataRow>
              <DataRow label="Country">{subAgent.country || '—'}</DataRow>
              <DataRow label="Status">
                {subAgent.active_status ? (
                  <Badge tone="positive" treatment="solid">
                    Active
                  </Badge>
                ) : (
                  <Badge tone="neutral">Inactive</Badge>
                )}
              </DataRow>
              <DataRow label="Email">
                {subAgent.email ? (
                  <a href={`mailto:${subAgent.email}`} className="break-all text-brand-700 hover:underline">
                    {subAgent.email}
                  </a>
                ) : (
                  '—'
                )}
              </DataRow>
              <DataRow label="Phone">{subAgent.phone_number || '—'}</DataRow>
              <DataRow label="Internal code" identifier className="sm:col-span-2">
                {subAgent.internal_code || '—'}
              </DataRow>
            </DataGrid>
          </Panel>

          <Panel
            title="Operational summary"
            description="How this organisation's pilgrims are currently distributed."
          >
            <PopulationBreakdown population={population} />

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
              <FilterLink to={filterBase} label="All assigned pilgrims" count={population.assigned} />
              <FilterLink
                to={`${filterBase}&status=in_saudi_arabia`}
                label="In Saudi Arabia"
                count={population.inSaudi}
              />
              <FilterLink
                to={`${filterBase}&status=departing_soon`}
                label="Departing within 3 days"
                count={population.departingSoon}
              />
              <FilterLink
                to={`${filterBase}&status=departure_overdue`}
                label="Past the expected return date"
                count={population.overdue}
                critical
              />
            </div>
          </Panel>

          {subAgent.notes && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Notes
                </span>
              }
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{subAgent.notes}</p>
            </Panel>
          )}
        </div>

        <div className="xl:col-span-2">
          <Panel
            title={`Assigned pilgrims (${pilgrims.length})`}
            description="Every pilgrim whose responsibility is traced to this organisation."
            bodyClassName="p-0"
            actions={
              pilgrims.length > 0 ? (
                <ButtonLink
                  to={filterBase}
                  variant="secondary"
                  size="sm"
                  icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Open in directory
                </ButtonLink>
              ) : undefined
            }
          >
            {pilgrims.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Users className="h-5 w-5" aria-hidden="true" />}
                  title="No pilgrims assigned"
                  description="No pilgrim record currently names this organisation as responsible."
                />
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <TableFrame
                    caption={`Pilgrims assigned to ${subAgent.organisation_name}`}
                    className="rounded-none border-0"
                  >
                    <THead>
                      <tr>
                        <TH>Name</TH>
                        <TH className="hidden lg:table-cell">Nationality</TH>
                        <TH className="hidden xl:table-cell">Passport</TH>
                        <TH numeric>Sched. return</TH>
                        <TH>Status</TH>
                        <TH align="right">
                          <span className="sr-only">Actions</span>
                        </TH>
                      </tr>
                    </THead>
                    <TBody>
                      {pilgrims.map((p) => (
                        <TR key={p.id}>
                          <TD>
                            <Link
                              to={`/app/pilgrims/${p.id}`}
                              className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                            >
                              {p.full_name}
                            </Link>
                          </TD>
                          <TD className="hidden lg:table-cell">{p.nationality}</TD>
                          <TD className="hidden xl:table-cell">
                            <Identifier value={p.passport_number} />
                          </TD>
                          <TD numeric className="whitespace-nowrap">
                            {formatDate(p.expected_return_date, 'Not set')}
                          </TD>
                          <TD>
                            <StatusBadge status={calculateJourneyStatus(p)} record={p} />
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
                      ))}
                    </TBody>
                  </TableFrame>
                </div>

                <div className="space-y-3 p-4 md:hidden">
                  {pilgrims.map((p) => (
                    <RecordCard key={p.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/app/pilgrims/${p.id}`}
                            className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {p.full_name}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {p.nationality} · <Identifier value={p.passport_number} />
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Sched. return {formatDate(p.expected_return_date, 'not set')}
                          </p>
                        </div>
                        <StatusBadge
                          status={calculateJourneyStatus(p)}
                          record={p}
                          className="shrink-0"
                        />
                      </div>
                    </RecordCard>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Direct link into the filtered pilgrim directory. Quiet when the count is zero. */
function FilterLink({
  to,
  label,
  count,
  critical,
}: {
  to: string;
  label: string;
  count: number;
  critical?: boolean;
}) {
  if (count === 0) {
    return (
      <p className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums">0</span>
      </p>
    );
  }

  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
        critical
          ? 'border-red-300 text-red-900 hover:bg-red-50'
          : 'border-slate-300 text-slate-800 hover:bg-slate-50'
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-bold tabular-nums">{count}</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

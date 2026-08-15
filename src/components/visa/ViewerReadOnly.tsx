import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/priority';
import { friendlyError } from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, ReadOnlyNotice, TableSkeleton } from '@/components/ui/Feedback';
import { Identifier, SearchInput } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { RecordCard, TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';

interface VisaLogRow {
  id: string;
  pilgrim_name: string;
  visa_number: string | null;
  passport_number: string;
  agent_name: string | null;
  visa_company: string | null;
  created_at: string;
}

/**
 * Viewer surface for the Visa & Contract Logger.
 *
 * Viewers get a finished read-only browser of the visa records that exist —
 * deliberately not the processing workflow with every control disabled.
 */
export function ViewerReadOnly() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<VisaLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let request = supabase
        .from('pilgrims')
        .select(
          'id, full_name, visa_number, passport_number, visa_company, created_at, sub_agents(organisation_name)',
        )
        .not('visa_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (debouncedQuery.trim()) {
        const q = debouncedQuery.trim();
        request = request.or(
          `full_name.ilike.%${q}%,passport_number.ilike.%${q}%,visa_number.ilike.%${q}%`,
        );
      }

      const { data, error: queryError } = await request;
      if (queryError) throw queryError;

      setRecords(
        (data || []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          pilgrim_name: r.full_name as string,
          visa_number: r.visa_number as string | null,
          passport_number: r.passport_number as string,
          agent_name: (r.sub_agents as { organisation_name: string } | null)?.organisation_name ?? null,
          visa_company: r.visa_company as string | null,
          created_at: r.created_at as string,
        })),
      );
    } catch (e) {
      setError(friendlyError(e));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="space-y-5">
      <ReadOnlyNotice>
        You have Viewer access. You can browse every saved visa record here, but uploading documents, extracting
        values, verifying them and saving are not available for your role. Contact an Administrator if you need
        processing access.
      </ReadOnlyNotice>

      <div className="rounded-lg border border-slate-300 bg-white p-2.5">
        <SearchInput
          label="Search visa records"
          value={query}
          onValueChange={setQuery}
          placeholder="Search by pilgrim name, passport or visa number…"
          className="max-w-xl"
        />
      </div>

      {error && (
        <Alert tone="critical" title="Visa records could not be loaded">
          {error}
        </Alert>
      )}

      <Panel
        title="Saved visa records"
        description={`Showing the ${records.length} most recent ${records.length === 1 ? 'record' : 'records'} with a visa number on file.`}
        bodyClassName="p-0"
      >
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={6} columns={5} />
          </div>
        ) : records.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title={query ? 'No visa records match this search' : 'No visa records yet'}
              description={
                query
                  ? 'Clear the search to see all saved visa records.'
                  : 'Visa records appear here once an operations officer has reviewed and saved one.'
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <TableFrame caption="Saved visa records" className="rounded-none border-0">
                <THead>
                  <tr>
                    <TH nowrap>Pilgrim</TH>
                    <TH nowrap>Passport</TH>
                    <TH nowrap>Visa number</TH>
                    <TH className="hidden lg:table-cell" nowrap>Agent</TH>
                    <TH className="hidden lg:table-cell" nowrap>Visa company</TH>
                    <TH numeric nowrap>Recorded</TH>
                  </tr>
                </THead>
                <TBody>
                  {records.map((row) => (
                    <TR key={row.id}>
                      <TD className="font-semibold text-slate-900">{row.pilgrim_name}</TD>
                      <TD>
                        <Identifier value={row.passport_number} />
                      </TD>
                      <TD>
                        <Identifier value={row.visa_number} />
                      </TD>
                      <TD className="hidden lg:table-cell">{row.agent_name || 'Unassigned'}</TD>
                      <TD className="hidden lg:table-cell">{row.visa_company || '—'}</TD>
                      <TD numeric className="whitespace-nowrap">
                        {formatDate(row.created_at.slice(0, 10))}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableFrame>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {records.map((row) => (
                <RecordCard key={row.id}>
                  <p className="font-semibold text-slate-900">{row.pilgrim_name}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-2xs uppercase tracking-wide text-slate-500">Passport</dt>
                      <dd>
                        <Identifier value={row.passport_number} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-2xs uppercase tracking-wide text-slate-500">Visa number</dt>
                      <dd>
                        <Identifier value={row.visa_number} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-2xs uppercase tracking-wide text-slate-500">Agent</dt>
                      <dd className="text-slate-800">{row.agent_name || 'Unassigned'}</dd>
                    </div>
                    <div>
                      <dt className="text-2xs uppercase tracking-wide text-slate-500">Recorded</dt>
                      <dd className="text-slate-800">{formatDate(row.created_at.slice(0, 10))}</dd>
                    </div>
                  </dl>
                </RecordCard>
              ))}
            </div>
          </>
        )}
      </Panel>

      <p className="text-xs text-slate-500">Signed in as {profile?.full_name || 'Viewer'}.</p>
    </div>
  );
}

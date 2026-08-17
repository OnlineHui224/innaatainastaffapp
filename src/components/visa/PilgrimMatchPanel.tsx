import { AlertCircle, Check, Link2, Search, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';

export interface MatchCandidate {
  id: string;
  full_name: string;
  passport_number: string;
  visa_number: string | null;
  agent_name: string | null;
}

export type MatchPhase = 'idle' | 'searching' | 'exact' | 'multiple' | 'none' | 'error';

interface PilgrimMatchPanelProps {
  phase: MatchPhase;
  /** The reviewed passport number the search was run with. */
  passport: string;
  /** The reviewed traveller name, shown when it differs from a candidate. */
  travellerName: string;
  candidates: MatchCandidate[];
  /** The pilgrim the officer has explicitly confirmed, if any. */
  confirmedId: string | null;
  errorMessage?: string | null;
  onSearch: () => void;
  onConfirm: (candidate: MatchCandidate) => void;
  onClear: () => void;
  disabled?: boolean;
}

function CandidateRow({
  candidate,
  travellerName,
  confirmed,
  onConfirm,
  disabled,
}: {
  candidate: MatchCandidate;
  travellerName: string;
  confirmed: boolean;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  /* The reviewed identity is never overwritten by a database record. When the
     names differ the officer is shown both and decides. */
  const nameDiffers =
    Boolean(travellerName.trim()) &&
    candidate.full_name.trim().toLowerCase() !== travellerName.trim().toLowerCase();

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3.5',
        confirmed ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy-900">{candidate.full_name}</p>
          <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            <div>
              <dt className="inline text-2xs font-bold uppercase tracking-wide text-slate-500">
                Passport{' '}
              </dt>
              <dd className="inline">
                <Identifier value={candidate.passport_number} />
              </dd>
            </div>
            <div>
              <dt className="inline text-2xs font-bold uppercase tracking-wide text-slate-500">
                Agent{' '}
              </dt>
              <dd className="inline text-xs text-slate-700">
                {candidate.agent_name || 'Unassigned'}
              </dd>
            </div>
            {candidate.visa_number && (
              <div>
                <dt className="inline text-2xs font-bold uppercase tracking-wide text-slate-500">
                  Visa on file{' '}
                </dt>
                <dd className="inline">
                  <Identifier value={candidate.visa_number} />
                </dd>
              </div>
            )}
          </dl>
        </div>

        {confirmed ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-emerald-300 bg-white px-2 py-1 text-2xs font-bold uppercase tracking-wide text-emerald-800">
            <Check className="h-3 w-3" aria-hidden="true" />
            Matched to HajjERP
          </span>
        ) : (
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={disabled}
            className="shrink-0 border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
          >
            Match this pilgrim
          </Button>
        )}
      </div>

      {nameDiffers && (
        <p className="mt-2.5 flex items-start gap-2 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            The reviewed visa name is <strong className="font-bold">{travellerName}</strong>, which
            differs from this record. The passport number is the match; check the difference is
            expected before confirming.
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Matching a reviewed visa identity to an existing HajjERP pilgrim.
 *
 * Order matters here. The identity is entered and reviewed FIRST, and only then
 * is the reviewed passport number used to search `pilgrims`. A pilgrim is never
 * chosen up front and then described as a match.
 *
 * Passport number is the matching key. A name is supporting context only, and a
 * candidate is never selected automatically — the officer sees exactly which
 * record will be updated and confirms it.
 */
export function PilgrimMatchPanel({
  phase,
  passport,
  travellerName,
  candidates,
  confirmedId,
  errorMessage,
  onSearch,
  onConfirm,
  onClear,
  disabled = false,
}: PilgrimMatchPanelProps) {
  const confirmed = candidates.find((c) => c.id === confirmedId) ?? null;

  return (
    <Panel
      title="Match to HajjERP"
      description="The reviewed passport number is used to find the pilgrim this visa belongs to. Linking is optional — a visa record is valid without it, and stays Pending Pilgrim Match until one is chosen."
      edge={confirmedId ? 'confirmed' : 'default'}
      actions={
        confirmedId ? (
          <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
            Change match
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={onSearch}
            disabled={disabled || !passport.trim() || phase === 'searching'}
          >
            {phase === 'idle' ? 'Find pilgrim' : 'Search again'}
          </Button>
        )
      }
    >
      {phase === 'idle' && (
        <p className="text-[0.8125rem] leading-relaxed text-slate-700">
          {passport.trim() ? (
            <>
              Search HajjERP for the pilgrim holding passport{' '}
              <Identifier value={passport} />.
            </>
          ) : (
            'Review the passport number above first — it is the key this search uses.'
          )}
        </p>
      )}

      {phase === 'searching' && (
        <p className="flex items-center gap-2.5 text-[0.8125rem] text-slate-700">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-600" aria-hidden="true" />
          Searching HajjERP for passport <Identifier value={passport} />…
        </p>
      )}

      {phase === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-700 bg-white px-4 py-3.5">
          <p className="text-sm font-bold text-navy-900">Pilgrim search could not be completed</p>
          <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-600">
            {errorMessage || 'The search did not complete. Nothing you have entered has been lost.'}
          </p>
          <Button variant="secondary" size="sm" onClick={onSearch}>
            Try again
          </Button>
        </div>
      )}

      {(phase === 'exact' || phase === 'multiple') && (
        <div className="flex flex-col gap-3">
          {phase === 'multiple' && !confirmedId && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {candidates.length} records could correspond to this visa. Nothing is selected
                automatically — choose the correct pilgrim.
              </span>
            </p>
          )}

          {(confirmed ? [confirmed] : candidates).map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              travellerName={travellerName}
              confirmed={candidate.id === confirmedId}
              onConfirm={() => onConfirm(candidate)}
              disabled={disabled}
            />
          ))}

          {confirmedId && (
            <p className="flex items-center gap-2 text-xs text-emerald-800">
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              This visa record will be saved against the pilgrim above.
            </p>
          )}
        </div>
      )}

      {phase === 'none' && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <UserX className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            Pending Pilgrim Match
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-amber-900">
            No HajjERP pilgrim holds passport <Identifier value={passport} />.{' '}
            <strong className="font-bold">This does not block the visa record.</strong> Inna Ataina
            issued the visa and carries responsibility for it whether or not the traveller has been
            entered into Pilgrims yet, so the record can be reviewed and confirmed now.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
            The record stays Pending Pilgrim Match until somebody links it. No pilgrim is created
            automatically, and a visa is never linked to an arbitrary one.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <ButtonLink to="/app/pilgrims" variant="secondary" size="sm">
              Go to Pilgrims
            </ButtonLink>
            <Button variant="secondary" size="sm" onClick={onSearch} disabled={disabled}>
              Search again
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

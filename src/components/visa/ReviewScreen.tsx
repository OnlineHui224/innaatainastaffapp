import { useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Bot,
  Bus,
  CheckCircle2,
  FileText,
  Flag,
  Hotel,
  Lock,
  ShieldCheck,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/priority';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Identifier, Input } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { TransportSummary } from './TransportSummary';
import type {
  ExtractedField,
  ExtractedFieldKey,
  MatchStatus,
  PilgrimMatchResult,
  VisaCaseDetails,
  VisaExtractionResult,
} from '@/types/visa';
import { MATCH_STATUS_LABELS } from '@/types/visa';

interface ReviewScreenProps {
  extraction: VisaExtractionResult;
  match: PilgrimMatchResult;
  details: VisaCaseDetails;
  /** Officer edit — clears any existing verification for that field. */
  onFieldEdit: (key: ExtractedFieldKey, value: string) => void;
  /** Explicit verification — the ONLY route to a verified field. */
  onFieldVerify: (key: ExtractedFieldKey) => void;
  /** Explicit un-verification, so an officer can withdraw a review. */
  onFieldUnverify: (key: ExtractedFieldKey) => void;
  /** Local preview URL for the uploaded document, when previewable. */
  documentPreviewUrl: string | null;
  documentName: string | null;
}

interface FieldSpec {
  key: ExtractedFieldKey;
  label: string;
  icon: typeof User;
  placeholder: string;
  /** Genuine operational identifier — rendered monospace. */
  identifier?: boolean;
  help?: string;
}

const FIELDS: FieldSpec[] = [
  { key: 'passengerName', label: 'Passenger full name', icon: User, placeholder: 'Name as printed on the visa' },
  {
    key: 'passportNumber',
    label: 'Passport number',
    icon: Bookmark,
    placeholder: 'Passport number as printed',
    identifier: true,
  },
  {
    key: 'visaNumber',
    label: 'Visa number',
    icon: FileText,
    placeholder: 'Visa number as printed',
    identifier: true,
  },
  {
    key: 'nationality',
    label: 'Nationality',
    icon: Flag,
    placeholder: 'Nationality as printed on the visa',
    // Nationality is surfaced deliberately: it must never reach a saved record unseen.
    help: 'Extracted from the visa document. Confirm it against the document before continuing.',
  },
];

/** Every field an officer must explicitly verify before the case may proceed. */
export const REQUIRED_VERIFICATION_KEYS: ExtractedFieldKey[] = FIELDS.map((f) => f.key);

export function countVerified(extraction: VisaExtractionResult): number {
  return REQUIRED_VERIFICATION_KEYS.filter((key) => extraction[key].verified).length;
}

export function allRequiredVerified(extraction: VisaExtractionResult): boolean {
  return countVerified(extraction) === REQUIRED_VERIFICATION_KEYS.length;
}

function matchStyle(status: MatchStatus) {
  switch (status) {
    case 'exact_passport_match':
      return { tone: 'positive' as const, Icon: CheckCircle2, wrap: 'border-emerald-400 bg-emerald-50' };
    case 'possible_name_match':
    case 'multiple_matches':
      return { tone: 'caution' as const, Icon: AlertTriangle, wrap: 'border-amber-500 bg-amber-50' };
    case 'no_match':
      return { tone: 'neutral' as const, Icon: Users, wrap: 'border-slate-400 bg-slate-50' };
    default:
      return { tone: 'critical' as const, Icon: XCircle, wrap: 'border-red-400 bg-red-50' };
  }
}

const MATCH_GUIDANCE: Record<MatchStatus, string> = {
  exact_passport_match:
    'The passport number on this document matches exactly one pilgrim record. This is a direct identity match.',
  possible_name_match:
    'Not a match until verified. Names alone are not identity — confirm the passport number against the document before proceeding.',
  no_match:
    'No pilgrim on the platform matches this document. A visa can only be logged against an existing pilgrim record.',
  passport_mismatch:
    'The passport number on this document conflicts with the passport held on the selected pilgrim record. This must be resolved before saving.',
  duplicate_visa:
    'This visa number is already recorded against a pilgrim. Saving again would create a duplicate visa record.',
  multiple_matches:
    'Not a match until verified. More than one pilgrim record could correspond to this document — identify the correct one before proceeding.',
};

export function ReviewScreen({
  extraction,
  match,
  details,
  onFieldEdit,
  onFieldVerify,
  onFieldUnverify,
  documentPreviewUrl,
  documentName,
}: ReviewScreenProps) {
  const style = matchStyle(match.status);
  const MatchIcon = style.Icon;
  const verifiedCount = countVerified(extraction);
  const total = REQUIRED_VERIFICATION_KEYS.length;

  return (
    <div className="space-y-6">
      <Panel
        title="Extracted visa information"
        description="Each value below was produced by the extractor. Editing a value does not review it — every field must be verified explicitly."
        actions={
          <Badge tone={verifiedCount === total ? 'positive' : 'caution'} treatment={verifiedCount === total ? 'solid' : 'outline'}>
            {verifiedCount} of {total} verified
          </Badge>
        }
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-1 xl:grid-cols-5">
          {/* Fields */}
          <div className="space-y-5 border-b border-slate-200 p-5 xl:col-span-3 xl:border-b-0 xl:border-r">
            {verifiedCount < total && (
              <Alert tone="warning" title="Verification required">
                {total - verifiedCount} {total - verifiedCount === 1 ? 'field has' : 'fields have'} not been
                verified. Continuing stays disabled until every field has been explicitly confirmed against the
                document.
              </Alert>
            )}

            {FIELDS.map((spec) => (
              <ExtractedFieldRow
                key={spec.key}
                spec={spec}
                field={extraction[spec.key]}
                onEdit={(value) => onFieldEdit(spec.key, value)}
                onVerify={() => onFieldVerify(spec.key)}
                onUnverify={() => onFieldUnverify(spec.key)}
              />
            ))}
          </div>

          {/* Document preview beside the fields where desktop space permits */}
          <div className="p-5 xl:col-span-2">
            <DocumentPreview url={documentPreviewUrl} name={documentName} />
          </div>
        </div>
      </Panel>

      {/* Matching */}
      <Panel
        title="HajjERP match"
        description="How this document relates to the pilgrim records already on the platform."
      >
        <div className={cn('flex items-start gap-3 rounded-md border p-4', style.wrap)}>
          <MatchIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-navy-900">
              {MATCH_STATUS_LABELS[match.status]}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{MATCH_GUIDANCE[match.status]}</p>
            {(match.status === 'possible_name_match' || match.status === 'multiple_matches') && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded border border-amber-600 bg-white px-2 py-1 text-2xs font-bold uppercase tracking-wide text-amber-900">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Not a match until verified
              </p>
            )}
          </div>
        </div>

        {match.pilgrim && (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-slate-300 bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Existing pilgrim</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{match.pilgrim.full_name}</dd>
            </div>
            <div>
              <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Existing passport</dt>
              <dd className="mt-0.5 text-sm">
                <Identifier value={match.pilgrim.passport_number} />
              </dd>
            </div>
            <div>
              <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Existing agent</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{match.pilgrim.agent_name || 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                Existing visa number
              </dt>
              <dd className="mt-0.5 text-sm">
                {match.pilgrim.visa_number ? (
                  <Identifier value={match.pilgrim.visa_number} />
                ) : (
                  <span className="text-slate-500">None on file</span>
                )}
              </dd>
            </div>
          </dl>
        )}

        {match.conflicts.length > 0 && (
          <div className="mt-4 space-y-2">
            {match.conflicts.map((conflict, index) => (
              <Alert key={index} tone="critical" title="Extraction conflict">
                {conflict}
              </Alert>
            ))}
          </div>
        )}

        {match.alternatives.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-600">
              Other possible matches — none of these is accepted automatically
            </p>
            <ul className="space-y-1.5">
              {match.alternatives.map((alt) => (
                <li
                  key={alt.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="font-medium text-slate-900">{alt.full_name}</span>
                  <Identifier value={alt.passport_number} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* Operational details confirmation */}
      <Panel
        title="Operational details"
        description="The case information that will be saved alongside the reviewed visa values."
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <SummaryRow icon={Users} label="Responsible agent" value={details.agentName} />
          <SummaryRow icon={FileText} label="Visa company" value={details.visaCompany} />
          <SummaryRow icon={Hotel} label="Makkah hotel" value={details.makkahHotelName} />
          <SummaryRow icon={Hotel} label="Madinah hotel" value={details.madinahHotelName} />
          <SummaryRow icon={ShieldCheck} label="Planned outbound" value={details.plannedOutboundDate} />
          <SummaryRow icon={ShieldCheck} label="Expected return" value={details.expectedReturnDate} />
        </dl>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-wide text-slate-600">
            <Bus className="h-3.5 w-3.5" aria-hidden="true" />
            Ground transportation
          </p>
          {/* Bound to the current structured transport model — the obsolete
              single-string "transportation package" field is not used. */}
          <TransportSummary transport={details.transport} />
        </div>
      </Panel>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-900">
          {value || <span className="text-slate-400">Not selected</span>}
        </dd>
      </div>
    </div>
  );
}

/**
 * One extracted value with its verification control.
 *
 * The sequence enforced here is the approved one:
 *   1. the extractor produces a value;
 *   2. a value requiring review stays unverified;
 *   3. the officer may edit it;
 *   4. editing does NOT verify it;
 *   5. only "Verify this value" promotes it;
 *   6. the officer and timestamp are recorded from the authenticated session;
 *   7. editing an already-verified value unverifies it again.
 */
function ExtractedFieldRow({
  spec,
  field,
  onEdit,
  onVerify,
  onUnverify,
}: {
  spec: FieldSpec;
  field: ExtractedField;
  onEdit: (value: string) => void;
  onVerify: () => void;
  onUnverify: () => void;
}) {
  const Icon = spec.icon;
  const inputId = `extracted-${spec.key}`;
  const hasValue = Boolean((field.value ?? '').trim());

  return (
    <div
      className={cn(
        'rounded-md border p-3.5',
        field.verified ? 'border-slate-700 bg-slate-50' : 'border-dashed border-amber-500 bg-amber-50/40',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          {spec.label}
        </label>

        {field.verified ? (
          <Badge tone="neutral" treatment="solid" icon={<CheckCircle2 className="h-3 w-3" aria-hidden="true" />}>
            Human reviewed
          </Badge>
        ) : (
          <Badge tone="caution" icon={<Bot className="h-3 w-3" aria-hidden="true" />}>
            {field.confidence ? `AI extracted · ${field.confidence} confidence` : 'AI extracted'}
          </Badge>
        )}
      </div>

      <Input
        id={inputId}
        value={field.value ?? ''}
        onChange={(e) => onEdit(e.target.value)}
        placeholder={spec.placeholder}
        identifier={spec.identifier}
        aria-describedby={`${inputId}-state`}
      />

      <div id={`${inputId}-state`} className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-2xs leading-relaxed text-slate-600">
          {field.verified ? (
            <>
              Verified by{' '}
              <span className="font-semibold text-slate-800">{field.verifiedByName ?? 'an officer'}</span>
              {field.verifiedAt ? ` · ${formatDateTime(field.verifiedAt)}` : ''}
              {field.edited && ' · value was edited before verification'}
            </>
          ) : (
            <>
              {field.edited
                ? 'Edited but not yet verified. Editing a value is not the same as reviewing it.'
                : spec.help ?? 'Not yet verified. Confirm this value against the document.'}
              {field.sourcePage ? ` Source: page ${field.sourcePage}.` : ''}
            </>
          )}
        </p>

        {field.verified ? (
          <Button size="sm" variant="ghost" onClick={onUnverify}>
            Withdraw verification
          </Button>
        ) : (
          <Button
            size="sm"
            variant="confirm"
            onClick={onVerify}
            disabled={!hasValue}
            title={hasValue ? undefined : 'Enter a value before verifying it'}
            icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Verify this value
          </Button>
        )}
      </div>
    </div>
  );
}

function DocumentPreview({ url, name }: { url: string | null; name: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="lg:sticky lg:top-6">
      <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-600">Source document</p>
      {url && !failed ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={url}
            alt={name ? `Preview of ${name}` : 'Uploaded visa document'}
            onError={() => setFailed(true)}
            className="max-h-[28rem] w-full rounded-md border border-slate-300 object-contain"
          />
          <span className="mt-1.5 block text-2xs text-brand-700 underline">Open full size in a new tab</span>
        </a>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <FileText className="h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-700">{name ?? 'No document preview'}</p>
          <p className="text-xs text-slate-500">
            This document cannot be previewed inline. Open the original file to check each value against it.
          </p>
        </div>
      )}
    </div>
  );
}

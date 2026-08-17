import { useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Bus,
  FileText,
  Flag,
  Hotel,
  PenLine,
  Plane,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/priority';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { BlockStateBadge } from '@/components/ReviewStateBadge';
import type { BlockState } from '@/types/flightOps';
import type {
  ExtractedField,
  ExtractedFieldKey,
  VisaCaseDetails,
  VisaExtractionResult,
} from '@/types/visa';
import { transportPackageSummary } from '@/types/visa';

interface ReviewScreenProps {
  extraction: VisaExtractionResult;
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
  /**
   * Attach a document for local comparison only.
   *
   * Offered when a case is picked up from the register: the visa bytes were
   * never stored, so a second officer who wants the original beside the values
   * re-selects it themselves. Nothing is uploaded, no extraction runs, and no
   * record is written.
   */
  onAttachDocument?: (file: File | null) => void;
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



export function ReviewScreen({
  extraction,
  details,
  onFieldEdit,
  onFieldVerify,
  onFieldUnverify,
  documentPreviewUrl,
  documentName,
  onAttachDocument,
}: ReviewScreenProps) {
  const verifiedCount = countVerified(extraction);
  const total = REQUIRED_VERIFICATION_KEYS.length;

  return (
    <div className="space-y-6">
      <Panel
        title="C · Extracted identity"
        description="Traveller name, passport number and visa number as read from the visa document. Each one must be reviewed individually before the record can be saved."
        actions={
          <Badge tone={verifiedCount === total ? 'positive' : 'caution'} treatment={verifiedCount === total ? 'solid' : 'outline'}>
            {verifiedCount} of {total} reviewed
          </Badge>
        }
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-1 xl:grid-cols-5">
          {/* Fields */}
          <div className="border-b border-slate-200 xl:col-span-3 xl:border-b-0 xl:border-r">
            {/* The rule this whole section exists to enforce. */}
            <p className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-4.5 py-3 text-xs text-slate-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              Typing a value does not verify it. Each field must be marked reviewed on its own.
            </p>

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

            {/* No bulk action here by design. Each extracted value must be
                accepted on its own, so the provenance trail shows an officer
                individually confirmed every one of them against the document. */}
            <p className="bg-slate-50 px-4.5 py-3 text-xs text-slate-600">
              {verifiedCount === total
                ? 'Every value has been reviewed individually against the document.'
                : `${total - verifiedCount} ${total - verifiedCount === 1 ? 'value still needs' : 'values still need'} review before this record can be saved. Each one is reviewed on its own.`}
            </p>
          </div>

          {/* Document preview beside the fields where desktop space permits */}
          <div className="p-5 xl:col-span-2">
            <DocumentPreview
              url={documentPreviewUrl}
              name={documentName}
              onAttach={onAttachDocument}
            />
          </div>
        </div>
      </Panel>

      {/* Matching lives in `PilgrimMatchPanel`, rendered by the page after this
          review. It runs on the reviewed passport number rather than on a
          pilgrim chosen before the visa was ever read. */}

      {/* Operational details confirmation */}
      <Panel
        title="Operational details"
        description="The case information that will be saved alongside the reviewed visa values."
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {/* A direct client has no Sub-Agent, so "Responsible agent — Not
              selected" would read as a gap in the record rather than the
              deliberate absence it is. */}
          {details.clientSource === 'direct' ? (
            <SummaryRow
              icon={Users}
              label="Responsibility"
              value="Inna Ataina (direct client)"
            />
          ) : (
            <SummaryRow icon={Users} label="Responsible agent" value={details.agentName} />
          )}
          <SummaryRow icon={FileText} label="Visa company" value={details.visaCompany} />
          <SummaryRow icon={Hotel} label="Makkah hotel" value={details.makkahHotelName} />
          <SummaryRow icon={Hotel} label="Madinah hotel" value={details.madinahHotelName} />
          <SummaryRow icon={ShieldCheck} label="Planned outbound" value={details.plannedOutboundDate} />
          <SummaryRow icon={ShieldCheck} label="Expected return" value={details.expectedReturnDate} />
          {/* A contract field the officer should see before confirming. */}
          <SummaryRow icon={Plane} label="Arrival port" value={details.arrivalPort} />
        </dl>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-wide text-slate-600">
            <Bus className="h-3.5 w-3.5" aria-hidden="true" />
            Transportation
          </p>
          {/* Business-level entitlement. Route, vehicle, provider and pricing
              are transport CONTRACT concerns and are not collected here. */}
          <p className="text-sm text-slate-900">
            {details.transportPackage
              ? transportPackageSummary(details.transportPackage)
              : <span className="text-slate-500">Not selected</span>}
          </p>
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
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-900">
          {value || <span className="text-slate-500">Not selected</span>}
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const inputId = `extracted-${spec.key}`;
  const value = (field.value ?? '').trim();
  const hasValue = Boolean(value);

  /**
   * The committed state of the value, from the record itself. `need` (nothing
   * extracted) blocks verification outright — an officer cannot review a value
   * that is not there.
   */
  const state: BlockState = !hasValue
    ? 'need'
    : field.verified
      ? 'ok'
      : field.edited
        ? 'edited'
        : 'ai';

  /**
   * True while the officer is actively changing the value in correction mode.
   *
   * The draft is local and nothing is committed until "Save value" is pressed,
   * but the reviewed mark must not survive on screen while the value beneath it
   * is being changed. A green "Staff reviewed" badge sitting above a field the
   * officer is midway through rewriting asserts something that is no longer
   * true.
   */
  const dirty = editing && draft !== (field.value ?? '');

  /** What the badge and rail actually show. A pending change always reads as edited. */
  const displayState: BlockState = dirty ? 'edited' : state;

  const rail =
    displayState === 'ok'
      ? 'border-l-emerald-700'
      : displayState === 'ai'
        ? 'border-l-brand-600'
        : 'border-l-amber-400';

  function beginEdit() {
    setDraft(field.value ?? '');
    setEditing(true);
  }

  /**
   * Commits the edit.
   *
   * `onEdit` runs the platform's `editFieldValue`, which stores the value and
   * clears any verification. Editing is deliberately a discrete action rather
   * than per-keystroke, so an officer sees exactly when a review was withdrawn.
   */
  function commitEdit() {
    onEdit(draft);
    setEditing(false);
  }

  return (
    <div className={cn('border-b border-l-[3px] border-slate-100 px-4.5 py-4', rail)}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xs font-bold uppercase tracking-[0.13em] text-slate-500">
          {spec.label}
        </span>
        <BlockStateBadge
          state={displayState}
          label={displayState === 'need' ? 'Not found' : undefined}
        />
      </div>

      {editing ? (
        <div>
          <label htmlFor={inputId} className="mb-1.5 block text-xs text-slate-600">
            {spec.help ?? `Type the ${spec.label.toLowerCase()} exactly as printed on the visa.`}
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={spec.placeholder}
            identifier={spec.identifier}
            className="max-w-sm"
            autoFocus
          />
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button
              size="sm"
              onClick={commitEdit}
              className="border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
            >
              Save value
            </Button>
            {/* Cancel discards the local draft only. Nothing was committed, so the
                value and any review it already carried are left exactly as they were. */}
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <span className="text-xs text-slate-600">
              {dirty && field.verified
                ? 'This value is no longer marked reviewed. Saving keeps it unverified until you review it again.'
                : 'Saving leaves this field unverified until you mark it reviewed.'}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3.5">
            <p
              className={cn(
                'min-w-0 break-words text-lg font-extrabold',
                spec.identifier && 'identifier tracking-wider',
                hasValue ? 'text-navy-900' : 'text-amber-700',
              )}
            >
              {hasValue ? value : 'Not found'}
            </p>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<PenLine className="h-3 w-3" aria-hidden="true" />}
                onClick={beginEdit}
              >
                Correct
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={field.verified ? onUnverify : onVerify}
                disabled={!hasValue}
                title={hasValue ? undefined : 'Enter a value before reviewing it'}
                className={cn(
                  field.verified &&
                    'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
                  !field.verified && hasValue && 'border-navy-800 text-navy-900',
                )}
              >
                {field.verified ? 'Reviewed' : 'Mark reviewed'}
              </Button>
            </div>
          </div>

          <p className="mt-2 text-2xs leading-relaxed text-slate-600">
            {field.verified ? (
              <>
                Reviewed by{' '}
                <span className="font-semibold text-slate-800">{field.verifiedByName ?? 'an officer'}</span>
                {field.verifiedAt ? ` · ${formatDateTime(field.verifiedAt)}` : ''}
                {field.edited && ' · value was corrected before review'}
              </>
            ) : (
              <>
                {field.edited
                  ? 'Corrected but not yet reviewed. Editing a value is not the same as reviewing it.'
                  : spec.help ?? 'Not yet reviewed. Confirm this value against the document.'}
                {field.sourcePage ? ` Source: page ${field.sourcePage}.` : ''}
              </>
            )}
          </p>

          {state === 'need' && (
            <p className="mt-2.5 rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
              This value was not found in the document. Enter it manually before it can be marked
              reviewed — the record cannot be saved without it.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function DocumentPreview({
  url,
  name,
  onAttach,
}: {
  url: string | null;
  name: string | null;
  onAttach?: (file: File | null) => void;
}) {
  const [failed, setFailed] = useState(false);
  const attachId = 'review-attach-document';

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
          <FileText className="h-6 w-6 text-slate-500" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-700">{name ?? 'No document preview'}</p>
          <p className="text-xs text-slate-500">
            {name
              ? 'This document cannot be previewed inline. Open the original file to check each value against it.'
              : 'The visa document is never stored. Attach it again if you want it beside the values while you check them.'}
          </p>
          {onAttach && (
            <>
              <label
                htmlFor={attachId}
                className="mt-1 inline-flex min-h-[44px] cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:min-h-0"
              >
                Attach visa for comparison
              </label>
              <input
                id={attachId}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => onAttach(e.target.files?.[0] ?? null)}
              />
              <p className="text-2xs text-slate-500">
                Stays on this device. Nothing is uploaded and no extraction runs.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

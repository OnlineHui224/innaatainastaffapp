import {
  Bookmark,
  Building2,
  Calendar,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Link2Off,
  RotateCcw,
  User,
} from 'lucide-react';
import {
  PILGRIM_MATCH_LABELS,
  responsibilityLabel,
  type VisaContractRecord,
} from '@/types/visaContract';

/**
 * What was actually recorded, read from the confirmed record itself.
 *
 * Everything shown here comes from `visa_contract_records`, not from the
 * browser's working copy of the case: this screen is the officer's receipt, and
 * a receipt that describes something other than what the database holds is
 * worse than no receipt.
 *
 * In particular, a visa is confirmed whether or not a pilgrim has been linked.
 * When none is linked the screen says so plainly rather than presenting the
 * traveller's extracted name as though it were a linked HajjERP pilgrim.
 */
interface SuccessScreenProps {
  record: VisaContractRecord;
  /** The officer who performed the confirmation. */
  savedBy: string;
  savedAt: string;
  onViewPilgrim: () => void;
  onProcessAnother: () => void;
  onViewHistory: () => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof User;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p
          className={
            muted
              ? 'truncate text-sm font-medium text-amber-800'
              : 'truncate text-sm font-medium text-slate-800'
          }
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function SuccessScreen({
  record,
  savedBy,
  savedAt,
  onViewPilgrim,
  onProcessAnother,
  onViewHistory,
}: SuccessScreenProps) {
  const matched = record.pilgrim_match_status === 'MATCHED' && Boolean(record.pilgrim_id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-700 text-white">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold text-navy-900">
            Visa &amp; Contract Record Confirmed
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {matched
              ? 'The Visa & Contract record has been confirmed in HajjERP and linked to the pilgrim.'
              : 'The Visa & Contract record has been confirmed in HajjERP. Pilgrim linking can be completed later.'}
          </p>
        </div>

        <div className="space-y-3 px-6 py-6">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {/* Traveller, not "Linked Pilgrim": this is the reviewed identity on
                the visa, which is a different fact from a HajjERP pilgrim. */}
            <Detail icon={User} label="Traveller" value={record.traveller_name || '—'} />
            <Detail
              icon={Building2}
              label="Responsibility"
              value={responsibilityLabel(record)}
            />
            <Detail icon={FileText} label="Visa Number" value={record.visa_number || '—'} />
            <Detail
              icon={Bookmark}
              label="Passport Number"
              value={record.passport_number || '—'}
            />
            <Detail icon={User} label="Confirmed By" value={savedBy} />
            <Detail icon={Calendar} label="Date and Time" value={formatDateTime(savedAt)} />
            <Detail
              icon={matched ? Eye : Link2Off}
              label={matched ? 'Linked Pilgrim' : 'Pilgrim Status'}
              value={
                matched
                  ? record.traveller_name || 'Linked'
                  : PILGRIM_MATCH_LABELS.PENDING_PILGRIM_MATCH
              }
              muted={!matched}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row">
          {/* Offered only when there is a pilgrim to view. */}
          {matched && (
            <button
              onClick={onViewPilgrim}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <Eye className="h-4 w-4" aria-hidden="true" /> View Pilgrim
            </button>
          )}
          <button
            onClick={onProcessAnother}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Process Another Visa
          </button>
          <button
            onClick={onViewHistory}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <History className="h-4 w-4" aria-hidden="true" /> View Audit History
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-slate-600">
          Journey arrival and departure statuses were not changed. This confirmation updates the
          Visa &amp; Contract Register only.
        </p>
      </div>
    </div>
  );
}

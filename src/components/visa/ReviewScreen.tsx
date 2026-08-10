import {
  User,
  Bookmark,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  Package,
  Hotel,
  Calendar,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisaExtractionResult, PilgrimMatchResult, MatchStatus } from '@/types/visa';
import { MATCH_STATUS_LABELS } from '@/types/visa';
import type { VisaCaseDetails } from '@/types/visa';

interface ReviewScreenProps {
  extraction: VisaExtractionResult;
  match: PilgrimMatchResult;
  details: VisaCaseDetails;
  onExtractionChange: (updates: Partial<VisaExtractionResult>) => void;
  onDetailsChange: (updates: Partial<VisaCaseDetails>) => void;
}

function confidenceStyle(conf: 'high' | 'medium' | 'low' | null) {
  if (conf === 'high') return { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle2 };
  if (conf === 'medium' || conf === 'low') return { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle };
  return { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: FileText };
}

function matchStatusStyle(status: MatchStatus) {
  if (status === 'exact_passport_match') return { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle2 };
  if (status === 'possible_name_match' || status === 'multiple_matches') return { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle };
  if (status === 'no_match') return { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: User };
  return { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle };
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm text-slate-800 font-medium truncate">{value || 'Not selected'}</p>
      </div>
    </div>
  );
}

export function ReviewScreen({
  extraction,
  match,
  details,
  onExtractionChange,
}: ReviewScreenProps) {
  const fields: { key: keyof VisaExtractionResult; label: string; icon: typeof User; placeholder: string }[] = [
    { key: 'passengerName', label: 'Passenger Full Name', icon: User, placeholder: 'Passenger name from document' },
    { key: 'passportNumber', label: 'Passport Number', icon: Bookmark, placeholder: 'Passport number from document' },
    { key: 'visaNumber', label: 'Visa Number', icon: FileText, placeholder: 'Visa number from document' },
  ];

  const matchStyle = matchStatusStyle(match.status);
  const MatchIcon = matchStyle.icon;

  return (
    <div className="space-y-6">
      {/* Card A — Extracted Visa Information */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-navy-900">Extracted Visa Information</h3>
              <p className="text-xs text-slate-500">Review and edit extracted values before confirming</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          {fields.map(({ key, label, icon: Icon, placeholder }) => {
            const field = extraction[key];
            const style = confidenceStyle(field.confidence);
            const StatusIcon = style.icon;

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    {label}
                  </label>
                  <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', style.bg, style.color, style.border)}>
                    <StatusIcon className="h-3 w-3" />
                    {field.needsReview ? 'Review required' : field.confidence === 'high' ? 'High confidence' : 'Extracted'}
                  </div>
                </div>
                <input
                  type="text"
                  value={field.value || ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    onExtractionChange({
                      [key]: { ...field, value: newValue, needsReview: false },
                    } as Partial<VisaExtractionResult>);
                  }}
                  placeholder={placeholder}
                  className={cn(
                    'w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all',
                    field.needsReview ? 'border-amber-300' : 'border-slate-200',
                  )}
                />
                {field.sourcePage && (
                  <p className="mt-1 text-xs text-slate-400">Source: page {field.sourcePage}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card B — HajjERP Match */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-navy-900">HajjERP Match</h3>
              <p className="text-xs text-slate-500">Checking extracted data against existing pilgrims</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Match status badge */}
          <div className={cn('flex items-center gap-2.5 rounded-xl border px-4 py-3', matchStyle.bg, matchStyle.border)}>
            <MatchIcon className={cn('h-5 w-5 shrink-0', matchStyle.color)} />
            <div>
              <p className={cn('text-sm font-semibold', matchStyle.color)}>
                {MATCH_STATUS_LABELS[match.status]}
              </p>
              {match.status === 'possible_name_match' && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Similar-name matches are never automatically accepted — review required
                </p>
              )}
            </div>
          </div>

          {/* Match details */}
          {match.pilgrim && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Existing Pilgrim</p>
                  <p className="text-slate-800 font-medium">{match.pilgrim.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Existing Passport</p>
                  <p className="text-slate-800 font-medium">{match.pilgrim.passport_number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Existing Agent</p>
                  <p className="text-slate-800 font-medium">{match.pilgrim.agent_name || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Existing Visa Number</p>
                  <p className="text-slate-800 font-medium">{match.pilgrim.visa_number || 'None on file'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Conflicts */}
          {match.conflicts.length > 0 && (
            <div className="space-y-2">
              {match.conflicts.map((conflict, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{conflict}</p>
                </div>
              ))}
            </div>
          )}

          {/* Alternatives */}
          {match.alternatives.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Other possible matches:</p>
              <div className="space-y-1.5">
                {match.alternatives.map((alt) => (
                  <div key={alt.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-700 font-medium">{alt.full_name}</span>
                    <span className="text-slate-400">— {alt.passport_number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card C — Operational Details */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-navy-900">Operational Details</h3>
              <p className="text-xs text-slate-500">Confirm the selected operational information</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <SummaryRow icon={Building2} label="Agent" value={details.agentName} />
          <SummaryRow icon={Package} label="Transportation Package" value={details.transportationPackage} />
          <SummaryRow icon={FileText} label="Visa Company" value={details.visaCompany} />
          <SummaryRow icon={Hotel} label="Makkah Hotel" value={details.makkahHotelName} />
          <SummaryRow icon={Hotel} label="Madinah Hotel" value={details.madinahHotelName} />
          <SummaryRow icon={Calendar} label="Planned Outbound" value={details.plannedOutboundDate || ''} />
          <SummaryRow icon={Calendar} label="Expected Return" value={details.expectedReturnDate || ''} />
        </div>
      </div>
    </div>
  );
}

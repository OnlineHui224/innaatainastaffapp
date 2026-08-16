import {
  CheckCircle2,
  User,
  Bookmark,
  Building2,
  FileText,
  Eye,
  RotateCcw,
  History,
  Calendar,
} from 'lucide-react';
import type { VisaExtractionResult, VisaCaseDetails } from '@/types/visa';

interface SuccessScreenProps {
  extraction: VisaExtractionResult;
  details: VisaCaseDetails;
  savedBy: string;
  savedAt: string;
  onViewPilgrim: () => void;
  onProcessAnother: () => void;
  onViewHistory: () => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function SuccessScreen({
  extraction,
  details,
  savedBy,
  savedAt,
  onViewPilgrim,
  onProcessAnother,
  onViewHistory,
}: SuccessScreenProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-lg border border-slate-300 bg-white overflow-hidden">
        {/* Success header */}
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-50 px-6 py-8 text-center border-b border-emerald-200">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-700 text-white shadow-raised shadow-none">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h3 className="mt-4 font-display font-bold text-xl text-navy-900">
            Visa Information Saved
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            The visa record has been securely saved and linked to the selected pilgrim
          </p>
        </div>

        {/* Saved details */}
        <div className="px-6 py-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">Linked Pilgrim</p>
                <p className="text-sm text-slate-800 font-medium truncate">{details.pilgrimName || extraction.passengerName.value || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">Agent</p>
                <p className="text-sm text-slate-800 font-medium truncate">{details.agentName || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">Visa Number</p>
                <p className="text-sm text-slate-800 font-medium truncate">{extraction.visaNumber.value || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Bookmark className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">Passport Number</p>
                <p className="text-sm text-slate-800 font-medium truncate">{extraction.passportNumber.value || details.passportNumber || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">Saved By</p>
                <p className="text-sm text-slate-800 font-medium truncate">{savedBy}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">Date and Time</p>
                <p className="text-sm text-slate-800 font-medium truncate">{formatDateTime(savedAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onViewPilgrim}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Eye className="h-4 w-4" /> View Pilgrim
          </button>
          <button
            onClick={onProcessAnother}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="h-4 w-4" /> Process Another Visa
          </button>
          <button
            onClick={onViewHistory}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <History className="h-4 w-4" /> View Automation History
          </button>
        </div>
      </div>

      {/* Journey status notice */}
      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-blue-50 border border-blue-100 px-4 py-3">
        <Calendar className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Journey arrival and departure statuses were not changed. Only visa information was saved to the pilgrim record.
        </p>
      </div>
    </div>
  );
}

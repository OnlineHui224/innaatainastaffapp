import { Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface GeneratedItineraryProps {
  rows: Array<{ k: string; v: string }>;
  downloaded: boolean;
  onDownload: () => void;
  onGenerateAnother: () => void;
}

/**
 * Step 6 — the itinerary is ready.
 *
 * Reports what was produced in full, so staff can confirm the right document
 * before sending it to a traveller.
 */
export function GeneratedItinerary({
  rows,
  downloaded,
  onDownload,
  onGenerateAnother,
}: GeneratedItineraryProps) {
  return (
    <div className="rounded-lg border border-t-[3px] border-emerald-300 border-t-emerald-700 bg-white">
      <div className="flex gap-3.5 px-5 pb-4 pt-5">
        <span
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700"
          aria-hidden="true"
        >
          <Check className="h-[19px] w-[19px]" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-navy-900">
            Itinerary generated successfully
          </h2>
          <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-slate-600">
            The document is ready to download and send to the traveller.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(152px,100%),1fr))] border-t border-slate-200">
        {rows.map((row) => (
          <div key={row.k} className="min-w-0 border-b border-r border-slate-100 px-4.5 py-3">
            <dt className="text-2xs font-bold uppercase tracking-[0.13em] text-slate-500">{row.k}</dt>
            <dd className="mt-1 break-words text-sm font-bold leading-snug text-navy-900">{row.v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-3 px-4.5 py-4">
        <Button
          size="lg"
          icon={<Download className="h-4 w-4" aria-hidden="true" />}
          onClick={onDownload}
          className="min-h-[46px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
        >
          Download Word Itinerary
        </Button>
        <Button variant="secondary" onClick={onGenerateAnother} className="min-h-[44px]">
          Generate Another
        </Button>
        {downloaded && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Downloaded
          </span>
        )}
      </div>
    </div>
  );
}

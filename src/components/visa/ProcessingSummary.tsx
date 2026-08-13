import {
  User,
  Building2,
  Bus,
  FileText,
  Hotel,
  Calendar,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Package,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisaCaseDetails, WorkflowStep } from '@/types/visa';

interface ProcessingSummaryProps {
  details: VisaCaseDetails;
  file: File | null;
  aiRequestsRemaining: number;
  aiRequestsTotal: number;
  currentStep: WorkflowStep;
  isReady: boolean;
  missingFields: string[];
}

interface RowProps {
  icon: typeof User;
  label: string;
  value: string;
  isSet: boolean;
  isCustom?: boolean;
}

function Row({ icon: Icon, label, value, isSet, isCustom }: RowProps) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
        isSet ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-300',
      )}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-400 font-medium leading-tight">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className={cn(
            'text-xs font-medium truncate leading-tight',
            isSet ? 'text-slate-800' : 'text-slate-300 italic',
          )}>
            {isSet ? value : 'Not selected'}
          </p>
          {isCustom && isSet && (
            <span className="inline-flex items-center gap-0.5 rounded bg-brand-100 text-brand-700 text-[9px] font-semibold px-1 py-0.5 shrink-0">
              <Tag className="h-2 w-2" /> CUSTOM
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="pt-3 pb-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{children}</p>
    </div>
  );
}

export function ProcessingSummary({
  details,
  file,
  aiRequestsRemaining,
  aiRequestsTotal,
  currentStep,
  isReady,
  missingFields,
}: ProcessingSummaryProps) {
  const usagePercent = ((aiRequestsTotal - aiRequestsRemaining) / aiRequestsTotal) * 100;

  const transport = details.transport;
  const effectivePrice = transport.hasPriceOverride && transport.agreedPrice != null
    ? transport.agreedPrice
    : transport.referencePrice;
  const transportTotal = effectivePrice != null ? `SAR ${(effectivePrice * transport.numberOfVehicles).toFixed(0)}` : '';

  return (
    <div className="rounded-lg border border-slate-300 bg-white lg:sticky lg:top-6">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-display font-bold text-base text-navy-900">Processing Summary</h3>
        <p className="mt-0.5 text-xs text-slate-500">Current case overview</p>
      </div>

      <div className="px-5 py-3 max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-thin">
        {/* Responsibility */}
        <SectionLabel>Responsibility</SectionLabel>
        <Row icon={User} label="Selected Pilgrim" value={details.pilgrimName} isSet={!!details.pilgrimName} />
        <Row
          icon={Building2}
          label={details.agentIsProposed ? 'Proposed Agent' : 'Responsible Agent'}
          value={details.agentName}
          isSet={!!details.agentName}
          isCustom={details.agentIsProposed}
        />

        {/* Ground Transportation */}
        <SectionLabel>Ground Transportation</SectionLabel>
        <Row icon={Bus} label="Route" value={transport.routeName} isSet={!!transport.routeName} isCustom={transport.isCustomRoute} />
        <Row icon={Package} label="Vehicle Type" value={transport.vehicleTypeName} isSet={!!transport.vehicleTypeName} />
        {transport.referencePrice != null && (
          <>
            <Row icon={FileText} label="Reference Rate" value={`SAR ${transport.referencePrice.toFixed(0)}`} isSet={true} />
            {transport.hasPriceOverride && transport.agreedPrice != null && (
              <Row icon={FileText} label="Agreed Rate (Override)" value={`SAR ${transport.agreedPrice.toFixed(0)}`} isSet={true} isCustom />
            )}
            <Row icon={Bus} label="Number of Vehicles" value={`${transport.numberOfVehicles}`} isSet={true} />
            <Row icon={Package} label="Total Amount" value={transportTotal} isSet={!!transportTotal} />
          </>
        )}

        {/* Hotels */}
        <SectionLabel>Hotels</SectionLabel>
        <Row
          icon={Hotel}
          label="Makkah Hotel"
          value={details.makkahHotelName}
          isSet={!!details.makkahHotelName}
          isCustom={details.makkahHotelIsCustom}
        />
        <Row
          icon={Hotel}
          label="Madinah Hotel"
          value={details.madinahHotelName}
          isSet={!!details.madinahHotelName}
          isCustom={details.madinahHotelIsCustom}
        />

        {/* Dates */}
        <SectionLabel>Schedule</SectionLabel>
        <Row icon={Calendar} label="Planned Outbound" value={details.plannedOutboundDate} isSet={!!details.plannedOutboundDate} />
        <Row icon={Calendar} label="Expected Return" value={details.expectedReturnDate} isSet={!!details.expectedReturnDate} />
        <Row icon={Upload} label="Uploaded File" value={file?.name || ''} isSet={!!file} />

        {/* AI Usage */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" />
              <span className="text-xs font-semibold text-slate-600">AI Requests</span>
            </div>
            <span className="text-xs font-bold text-slate-700">
              {aiRequestsRemaining} of {aiRequestsTotal} left
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-colors',
                usagePercent > 80 ? 'bg-amber-500' : 'bg-brand-600',
              )}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ready indicator */}
      <div className="px-5 py-4 border-t border-slate-200">
        {currentStep === 'confirm_save' || currentStep === 'review_extraction' ? (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Ready for confirmation
          </div>
        ) : isReady ? (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Ready for extraction
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertCircle className="h-4 w-4" /> Complete the highlighted fields
            </div>
            {missingFields.length > 0 && (
              <ul className="text-xs text-amber-600 space-y-0.5 pl-6">
                {missingFields.slice(0, 5).map((field) => (
                  <li key={field}>{field}</li>
                ))}
                {missingFields.length > 5 && (
                  <li className="text-slate-400">+{missingFields.length - 5} more</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

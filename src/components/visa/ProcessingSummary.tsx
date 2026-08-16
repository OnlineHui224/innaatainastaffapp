import {
  User,
  Building2,
  Bus,
  Hotel,
  Calendar,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRANSPORT_PACKAGE_LABELS } from '@/types/visa';
import type { VisaCaseDetails, WorkflowStep } from '@/types/visa';

interface ProcessingSummaryProps {
  details: VisaCaseDetails;
  file: File | null;
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
        <p className="text-[11px] text-slate-500 font-medium leading-tight">{label}</p>
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
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{children}</p>
    </div>
  );
}

export function ProcessingSummary({
  details,
  file,
  currentStep,
  isReady,
  missingFields,
}: ProcessingSummaryProps) {


  return (
    <div className="rounded-lg border border-slate-300 bg-white lg:sticky lg:top-6">
      <div className="px-5 py-4 border-b border-slate-200">
        <h2 className="font-display font-bold text-base text-navy-900">Processing Summary</h2>
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

        {/* Transportation — entitlement only */}
        <SectionLabel>Transportation</SectionLabel>
        <Row
          icon={Bus}
          label="Package"
          value={details.transportPackage ? TRANSPORT_PACKAGE_LABELS[details.transportPackage] : ''}
          isSet={!!details.transportPackage}
        />

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

        {/* AI extraction.
            Deliberately no status light and no usage meter. Whether extraction
            will succeed is not known until it is attempted, and a green dot
            claiming otherwise would assert something this screen cannot know. */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-xs font-semibold text-slate-600">AI extraction</span>
          </div>
          <p className="mt-1.5 text-2xs leading-snug text-slate-500">
            Provided securely through HajjERP. Documents are read on the server and are not stored.
          </p>
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
                  <li className="text-slate-500">+{missingFields.length - 5} more</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { WorkflowStep } from '@/types/visa';

interface StepperProps {
  currentStep: WorkflowStep;
  completedSteps: Set<WorkflowStep>;
}

const STEPS: { key: WorkflowStep; label: string; number: number }[] = [
  { key: 'case_details', label: 'Case Details', number: 1 },
  { key: 'upload_visa', label: 'Upload Visa', number: 2 },
  { key: 'review_extraction', label: 'Review Extraction', number: 3 },
  { key: 'confirm_save', label: 'Confirm & Save', number: 4 },
];

export function WorkflowStepper({ currentStep, completedSteps }: StepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <nav aria-label="Workflow steps" className="w-full">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step, index) => {
          const isComplete = completedSteps.has(step.key);
          const isCurrent = step.key === currentStep;
          const isUpcoming = !isComplete && !isCurrent;

          return (
            <li key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div
                  className={cn(
                    'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-colors',
                    isComplete && 'bg-emerald-700 text-white',
                    isCurrent && 'bg-brand-600 text-white ring-2 ring-brand-200',
                    isUpcoming && 'bg-slate-100 text-slate-400',
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : step.number}
                </div>
                <div className="hidden sm:block min-w-0">
                  <p
                    className={cn(
                      'text-xs font-semibold truncate transition-colors',
                      isComplete && 'text-emerald-800',
                      isCurrent && 'text-brand-700',
                      isUpcoming && 'text-slate-400',
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1 sm:mx-2 transition-colors',
                    index < currentIndex ? 'bg-emerald-700' : 'bg-slate-200',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

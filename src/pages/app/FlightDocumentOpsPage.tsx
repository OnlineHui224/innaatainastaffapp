import { useCallback, useState } from 'react';
import { PlaneTakeoff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Panel } from '@/components/ui/Panel';
import { ReadOnlyNotice } from '@/components/ui/Feedback';
import { StageStepper } from '@/components/workflow/StageStepper';
import { DocumentUploadWorkspace } from '@/components/flight/DocumentUploadWorkspace';
import {
  FLIGHT_OPS_STEPS,
  FLIGHT_OPS_STEP_LABELS,
  FLIGHT_OPS_STEP_SHORT_LABELS,
  classifyDocument,
  type FlightOpsStep,
  type SourceDocument,
} from '@/types/flightOps';

/**
 * Flight Document Ops.
 *
 * MILESTONE 1 SCOPE — navigation, route, page shell and the document workspace.
 *
 * The remaining steps (Review Extraction, Trip Details, Confirm, Generate,
 * Download) are intentionally not built yet: the visual and UX direction for
 * them is being established and approved separately before implementation.
 * The step rail below shows the full approved workflow so the shape of the
 * module is visible, and the components for the later steps already exist but
 * are deliberately not wired.
 *
 * Nothing on this page performs extraction, generation, or any write. No
 * Supabase, Google or Gemini call is made from here.
 */
export default function FlightDocumentOpsPage() {
  const { profile } = useAuth();
  const isViewer = profile?.role === 'viewer';

  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [step] = useState<FlightOpsStep>('upload');

  const handleAdd = useCallback((files: FileList | File[]) => {
    const picked = Array.from(files);
    setDocuments((current) => [
      ...current,
      ...picked.map((file, index) =>
        classifyDocument(file, `doc-${Date.now()}-${current.length + index}`),
      ),
    ]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setDocuments((current) => current.filter((doc) => doc.id !== id));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Flight Document Ops"
        subtitle="AI-assisted itinerary extraction and document generation"
      />

      {isViewer ? (
        <div className="space-y-4">
          <ReadOnlyNotice>
            You have Viewer access. Flight Document Ops processes travel documents and generates
            itineraries — both are restricted to operations staff.
          </ReadOnlyNotice>
        </div>
      ) : (
        <div className="space-y-4">
          <Panel bodyClassName="px-4 py-3">
            <StageStepper
              steps={FLIGHT_OPS_STEPS}
              labels={FLIGHT_OPS_STEP_LABELS}
              shortLabels={FLIGHT_OPS_STEP_SHORT_LABELS}
              current={step}
              completed={new Set<FlightOpsStep>()}
              ariaLabel="Flight Document Ops progress"
            />
          </Panel>

          <Alert tone="info" title="Workflow under design review">
            The upload workspace below is available. Review, trip details, confirmation, generation
            and download are being designed and approved before they are built.
          </Alert>

          <Panel
            title="Upload Documents"
            description="Add every ticket document for the journey. Multiple files are read together as one continuous trip."
          >
            <DocumentUploadWorkspace
              documents={documents}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          </Panel>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <PlaneTakeoff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Extraction is not connected in this build. No document leaves your browser.
          </p>
        </div>
      )}
    </>
  );
}

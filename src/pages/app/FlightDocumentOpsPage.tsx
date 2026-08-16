import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ReadOnlyNotice } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';
import { FlightStepRail } from '@/components/flight/FlightStepRail';
import { DocumentUploadWorkspace } from '@/components/flight/DocumentUploadWorkspace';
import { StageProgressPanel } from '@/components/flight/StageProgressPanel';
import { JourneySummaryBlock, type SummaryDraft } from '@/components/flight/JourneySummaryBlock';
import { FlightSectorCard, type SectorDraft } from '@/components/flight/FlightSectorCard';
import { TripDetailsForm } from '@/components/flight/TripDetailsForm';
import { ConfirmationReview } from '@/components/flight/ConfirmationReview';
import { GeneratedItinerary } from '@/components/flight/GeneratedItinerary';
import { SideRailCard } from '@/components/flight/SideRailCard';
import {
  buildDemoExtraction,
  demoConfidenceLabel,
  SAMPLE_DOCUMENTS,
  type DemoScenario,
} from '@/lib/fixtures/flightOpsDemo';
import {
  countSequenceBreaks,
  emptyTripDetails,
  EXTRACTION_STAGES,
  extensionOf,
  GENERATION_STAGES,
  isReadableExtension,
  linkBetween,
  missingSectorFields,
  plannedFileName,
  routeLine,
  sectorState,
  showTime,
  STAGE_LABELS,
  STAGE_STEP_INDEX,
  STEP_RETURN_STAGE,
  summaryState,
  totalPax,
  type FlightSector,
  type FlightStage,
  type JourneySummary,
  type SourceDocument,
  type TimeFormat,
  type TripDetails,
} from '@/types/flightOps';

/** The gold culminating action — the one control that commits work forward. */
const GOLD_CTA =
  'border-gold-400 bg-gold-400 text-navy-950 hover:border-gold-500 hover:bg-gold-500';

const SECTION = 'text-xs font-extrabold uppercase tracking-[0.09em] text-navy-900';

let uid = 0;
const nextId = (prefix: string) => `${prefix}${(uid += 1)}`;

/**
 * Flight Document Ops.
 *
 * AI-assisted itinerary extraction and document generation, in six steps:
 * Upload → Review → Trip Details → Confirm → Generate → Download.
 *
 * SCOPE OF THIS PHASE — INTERFACE ONLY.
 *
 * Extraction and generation are simulated from local fixtures so every state,
 * including the failure states, can be reviewed. Nothing here calls Gemini,
 * Google or the `generate-itinerary` Edge Function, and nothing is persisted.
 * The one live data source is the hotel reference search, which is a read-only
 * SELECT (see `HotelReferenceCombobox`).
 *
 * The rule the whole screen exists to enforce: no AI-extracted value reaches
 * the generated document without a staff confirmation behind it.
 */
export default function FlightDocumentOpsPage() {
  const { profile } = useAuth();
  const isViewer = profile?.role === 'viewer';

  // Demonstration controls — which outcome the simulated extraction produces.
  const [scenario] = useState<DemoScenario>('clean');
  const [sectorCount] = useState(4);

  const [stage, setStage] = useState<FlightStage>('upload');
  const [documents, setDocuments] = useState<SourceDocument[]>(() =>
    SAMPLE_DOCUMENTS.slice(0, 2).map((doc) => ({ ...doc })),
  );
  const [uploadError, setUploadError] = useState(false);

  const [procStep, setProcStep] = useState(0);
  const [genStep, setGenStep] = useState(0);

  const [summary, setSummary] = useState<JourneySummary | null>(null);
  const [sectors, setSectors] = useState<FlightSector[]>([]);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  const [addedByStaff, setAddedByStaff] = useState<Record<string, boolean>>({});

  const [summaryReviewed, setSummaryReviewed] = useState(false);
  const [summaryEdited, setSummaryEdited] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<SummaryDraft>({
    passenger: '', pnr: '', carrier: '', adults: '', children: '',
  });

  const [editingSector, setEditingSector] = useState<string | null>(null);
  const [sectorDraft, setSectorDraft] = useState<SectorDraft>({
    dep: '', depCity: '', arr: '', arrCity: '', date: '', depT: '', arrT: '', flight: '', fmt: '12h',
  });

  const [showRaw, setShowRaw] = useState(false);
  const [trip, setTrip] = useState<TripDetails>(emptyTripDetails);
  const [acknowledged, setAcknowledged] = useState(false);
  const [generatedAt, setGeneratedAt] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Derived ──
  const readableDocs = documents.filter((doc) => isReadableExtension(doc.ext));
  const rejectedCount = documents.length - readableDocs.length;

  const sumState = summaryState(summary, summaryReviewed, summaryEdited);
  const breaks = countSequenceBreaks(sectors);
  const blockCount = 1 + sectors.length;
  const confirmedCount =
    (sumState === 'ok' ? 1 : 0) +
    sectors.filter((s) => sectorState(s, Boolean(reviewed[s.id]), Boolean(edited[s.id])) === 'ok').length;
  const allConfirmed = confirmedCount === blockCount && blockCount > 1;
  const anyMissing =
    sumState === 'need' || sectors.some((s) => missingSectorFields(s).length > 0);

  const fileName = plannedFileName(trip.groupName, summary?.passenger ?? '');
  const tripReady = Boolean(trip.makkahHotelId && trip.madinahHotelId);
  const generationReady = acknowledged && tripReady && breaks === 0;
  const stepIndex = STAGE_STEP_INDEX[stage];

  // ── Documents ──
  const addFiles = useCallback((files: File[]) => {
    setDocuments((current) => [
      ...current,
      ...files.map((file) => ({
        id: nextId('u'),
        name: file.name,
        bytes: file.size,
        ext: extensionOf(file.name),
      })),
    ]);
    setUploadError(false);
  }, []);

  // ── Extraction ──
  const runExtraction = useCallback(() => {
    if (readableDocs.length === 0) {
      setUploadError(true);
      return;
    }
    setUploadError(false);
    setStage('processing');
    setProcStep(0);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProcStep((current) => {
        if (current >= EXTRACTION_STAGES.length - 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (scenario === 'extraction_failed') {
            setStage('failed');
            return current;
          }
          const built = buildDemoExtraction(scenario, sectorCount);
          setSectors(built.sectors);
          setSummary(built.summary);
          setReviewed({});
          setEdited({});
          setAddedByStaff({});
          setSummaryReviewed(false);
          setSummaryEdited(false);
          setEditingSummary(false);
          setEditingSector(null);
          setShowRaw(false);
          setStage('review');
          return current;
        }
        return current + 1;
      });
    }, 820);
  }, [readableDocs.length, scenario, sectorCount]);

  const runGeneration = useCallback(() => {
    setStage('generating');
    setGenStep(0);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setGenStep((current) => {
        if (current >= GENERATION_STAGES.length - 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (scenario === 'generation_failed') {
            setStage('genfailed');
            return current;
          }
          const now = new Date();
          setGeneratedAt(
            `${now.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]} ${now.getFullYear()}, ` +
              `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
          );
          setDownloaded(false);
          setStage('done');
          return current;
        }
        return current + 1;
      });
    }, 760);
  }, [scenario]);

  const cancelProcessing = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage('upload');
    setProcStep(0);
  }, []);

  // ── Sector editing ──
  const openSectorEdit = useCallback((sector: FlightSector) => {
    setEditingSector(sector.id);
    setSectorDraft({
      dep: sector.dep, depCity: sector.depCity, arr: sector.arr, arrCity: sector.arrCity,
      date: sector.date, depT: sector.depT, arrT: sector.arrT, flight: sector.flight, fmt: sector.fmt,
    });
  }, []);

  /**
   * Saves a sector correction.
   *
   * Sets `edited` and clears `reviewed` — an edit is never a review. The carrier
   * is re-derived from the flight number so the two cannot drift apart.
   */
  const saveSector = useCallback(
    (id: string) => {
      setSectors((current) =>
        current.map((sector) =>
          sector.id === id
            ? {
                ...sector,
                ...sectorDraft,
                dep: sectorDraft.dep.toUpperCase(),
                arr: sectorDraft.arr.toUpperCase(),
                carrier:
                  sectorDraft.flight.trim().split(/\s+/)[0]?.toUpperCase() || sector.carrier,
              }
            : sector,
        ),
      );
      setEdited((current) => ({ ...current, [id]: true }));
      setReviewed((current) => ({ ...current, [id]: false }));
      setEditingSector(null);
    },
    [sectorDraft],
  );

  const moveSector = useCallback((id: string, direction: -1 | 1) => {
    setSectors((current) => {
      const index = current.findIndex((sector) => sector.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = current.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const addSector = useCallback(() => {
    const id = nextId('m');
    setSectors((current) => {
      const last = current[current.length - 1];
      const blank: FlightSector = {
        id,
        dep: last ? last.arr : '',
        depCity: last ? last.arrCity : '',
        arr: '', arrCity: '',
        date: last ? last.date : '',
        depT: '', arrT: '', carrier: '', flight: '',
        fmt: last ? last.fmt : '12h',
      };
      setSectorDraft({
        dep: blank.dep, depCity: blank.depCity, arr: '', arrCity: '',
        date: blank.date, depT: '', arrT: '', flight: '', fmt: blank.fmt,
      });
      return [...current, blank];
    });
    setAddedByStaff((current) => ({ ...current, [id]: true }));
    setEditingSector(id);
  }, []);

  /** Saves a summary correction. Same rule: editing clears any review. */
  const saveSummary = useCallback(() => {
    setSummary((current) =>
      current
        ? {
            ...current,
            passenger: summaryDraft.passenger,
            pnr: summaryDraft.pnr,
            carrier: summaryDraft.carrier.toUpperCase(),
            adults: summaryDraft.adults === '' ? current.adults : Number(summaryDraft.adults),
            children: summaryDraft.children === '' ? null : Number(summaryDraft.children),
          }
        : current,
    );
    setSummaryEdited(true);
    setSummaryReviewed(false);
    setEditingSummary(false);
  }, [summaryDraft]);

  const markEverythingReviewed = useCallback(() => {
    setReviewed(() => {
      const next: Record<string, boolean> = {};
      sectors.forEach((sector) => {
        if (missingSectorFields(sector).length === 0) next[sector.id] = true;
      });
      return next;
    });
    if (sumState !== 'need') setSummaryReviewed(true);
  }, [sectors, sumState]);

  const startOver = useCallback(() => {
    setStage('upload');
    setDocuments(SAMPLE_DOCUMENTS.slice(0, 2).map((doc) => ({ ...doc })));
    setSectors([]);
    setSummary(null);
    setReviewed({});
    setEdited({});
    setAddedByStaff({});
    setSummaryReviewed(false);
    setSummaryEdited(false);
    setTrip(emptyTripDetails());
    setAcknowledged(false);
    setGenStep(0);
    setGeneratedAt('');
    setDownloaded(false);
    setShowRaw(false);
  }, []);

  const rawJson = useMemo(
    () =>
      JSON.stringify(
        {
          passenger_name: summary?.passenger,
          adults: summary?.adults,
          children: summary?.children,
          pnr: summary?.pnr,
          primary_carrier: summary?.carrier,
          ai_confidence: scenario === 'partial' ? 'medium' : 'high',
          flights: sectors.map((s) => ({
            from: s.dep, from_city: s.depCity, to: s.arr, to_city: s.arrCity,
            date: s.date,
            departure: showTime(s.depT, s.fmt),
            arrival: showTime(s.arrT, s.fmt),
            source_time_format: s.fmt === '12h' ? '12-hour' : '24-hour',
            carrier: s.carrier, flight_number: s.flight,
          })),
        },
        null,
        2,
      ),
    [scenario, sectors, summary],
  );

  if (isViewer) {
    return (
      <>
        <PageHeader
          eyebrow="Operations"
          title="Flight Document Ops"
          subtitle="AI-assisted itinerary extraction and document generation"
        />
        <ReadOnlyNotice>
          You have Viewer access. Flight Document Ops reads travel documents and generates
          itineraries — both are restricted to operations staff.
        </ReadOnlyNotice>
      </>
    );
  }

  const rail = (children: React.ReactNode) => (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:max-w-[322px] lg:basis-[268px]">
      {children}
    </aside>
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Flight Document Ops"
        subtitle="AI-assisted itinerary extraction and document generation. Every value below states whether it was extracted by AI or confirmed by a staff member — nothing is generated from unconfirmed data."
        actions={
          <div className="flex items-center gap-4.5">
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Working file
              </p>
              <p className="identifier text-sm font-extrabold text-navy-900">
                {summary?.pnr || 'Not started'}
              </p>
            </div>
            <span className="h-8 w-px bg-slate-300" aria-hidden="true" />
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.12em] text-slate-500">Stage</p>
              <p className="text-sm font-extrabold text-navy-900">{STAGE_LABELS[stage]}</p>
            </div>
          </div>
        }
      />

      <div className="mb-5">
        <FlightStepRail
          currentIndex={stepIndex}
          onSelect={(index) => {
            const target = STEP_RETURN_STAGE[index];
            if (target) setStage(target);
          }}
          isReturnable={(index) => STEP_RETURN_STAGE[index] !== null}
        />
      </div>

      {/* ── A · Upload ── */}
      {stage === 'upload' && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4.5">
            <section>
              <h2 className={`${SECTION} mb-2.5`}>Source documents</h2>
              <DocumentUploadWorkspace
                documents={documents}
                onAdd={addFiles}
                onRemove={(id) => setDocuments((current) => current.filter((d) => d.id !== id))}
                onClear={() => setDocuments([])}
                onLoadSample={() => {
                  setDocuments(SAMPLE_DOCUMENTS.map((doc) => ({ ...doc })));
                  setUploadError(false);
                }}
              />
            </section>

            {rejectedCount > 0 && (
              <div role="alert" className="flex gap-3 rounded-lg border-2 border-amber-400 bg-white px-4 py-3.5">
                <AlertCircle className="mt-px h-[18px] w-[18px] shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-extrabold text-navy-900">
                    {rejectedCount} {rejectedCount === 1 ? 'document cannot' : 'documents cannot'} be read
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-slate-600">
                    Only PDF, JPG and PNG documents can be read. Remove the file, or save it as a PDF
                    and upload it again. The remaining documents can still be extracted.
                  </p>
                </div>
              </div>
            )}

            {uploadError && (
              <div role="alert" className="flex gap-3 rounded-lg border-2 border-red-700 bg-white px-4 py-3.5">
                <AlertCircle className="mt-px h-[18px] w-[18px] shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-extrabold text-navy-900">No document to extract</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-slate-600">
                    Add at least one readable ticket document (PDF, JPG or PNG) before extraction can
                    start.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3.5">
              <Button
                size="lg"
                icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                onClick={runExtraction}
                className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
              >
                Extract Travel Information
              </Button>
              <span className="text-xs text-slate-600">
                {readableDocs.length
                  ? 'Nothing is saved until you review the result.'
                  : 'Add a PDF, JPG or PNG to continue.'}
              </span>
            </div>
          </div>

          {rail(
            <>
              <SideRailCard title="What happens next">
                <ol className="flex flex-col gap-3">
                  {[
                    'The documents are read and the journey is extracted.',
                    'You review, correct and confirm every sector.',
                    'Trip details are added, then the Word itinerary is generated.',
                  ].map((text, index) => (
                    <li key={text} className="flex gap-2.5">
                      <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded border border-brand-200 bg-brand-50 text-2xs font-bold text-brand-700">
                        {index + 1}
                      </span>
                      <span className="text-[0.8125rem] leading-snug text-slate-600">{text}</span>
                    </li>
                  ))}
                </ol>
              </SideRailCard>

              <SideRailCard title="Document requirements">
                <ul className="flex flex-col gap-2.5">
                  {[
                    'Issued ticket or e-ticket receipt, not a boarding pass',
                    'All sectors for the same passenger and booking',
                    'Photographs must show the full page, in focus',
                  ].map((text) => (
                    <li key={text} className="flex gap-2.5 text-[0.8125rem] leading-snug text-slate-600">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
              </SideRailCard>

              <SideRailCard title="AI processing">
                <p className="text-[0.8125rem] leading-relaxed text-slate-600">
                  Documents are read with your own Gemini access. Your usage stays separate from
                  other staff accounts.
                </p>
              </SideRailCard>
            </>,
          )}
        </div>
      )}

      {/* ── B · Processing ── */}
      {stage === 'processing' && (
        <StageProgressPanel
          heading="Extracting travel information"
          meta={`${readableDocs.length} ${readableDocs.length === 1 ? 'document' : 'documents'} · Personal Gemini Access`}
          description="Documents are being read with your personal Gemini access. Nothing is saved until you review it."
          stages={EXTRACTION_STAGES}
          currentIndex={procStep}
          progressLabel="Extraction in progress"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <p className="text-xs text-slate-600">
                This usually finishes in well under a minute. You can leave this page open.
              </p>
              <Button variant="secondary" size="sm" onClick={cancelProcessing}>
                Cancel
              </Button>
            </div>
          }
        />
      )}

      {/* ── Extraction failed ── */}
      {stage === 'failed' && (
        <section className="max-w-3xl rounded-lg border-2 border-red-700 bg-white">
          <div className="flex gap-3.5 px-5 pb-4 pt-5">
            <AlertCircle className="mt-0.5 h-[22px] w-[22px] shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-navy-900">
                Extraction failed
              </h2>
              <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-slate-600">
                A structured journey could not be read from the uploaded documents. This usually
                happens when the file is a low-contrast scan, a boarding pass rather than an issued
                ticket, or a photograph where part of the page is cut off.
              </p>
              <p className="mt-1 text-xs text-slate-500">No data was saved.</p>
            </div>
          </div>

          <div className="px-5 pb-1.5">
            <p className="border-b border-slate-200 pb-2.5 text-2xs font-bold uppercase tracking-[0.11em] text-navy-900">
              What you can do
            </p>
            <ul className="flex flex-col gap-2.5 py-3.5">
              {[
                ['Try again', 'a repeat read often succeeds on the same file.'],
                ['Replace the document', "upload the airline's e-ticket PDF instead of a screenshot or photo."],
                ['Enter the journey manually', 'build the sectors by hand and continue the same workflow.'],
              ].map(([strong, rest]) => (
                <li key={strong} className="text-[0.8125rem] leading-snug text-slate-600">
                  <strong className="text-navy-900">{strong}</strong> — {rest}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <Button onClick={runExtraction} className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900">
              Try extraction again
            </Button>
            <Button variant="secondary" onClick={() => setStage('upload')} className="min-h-[44px]">
              Replace the document
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const built = buildDemoExtraction(scenario, sectorCount);
                setSectors(built.sectors);
                setSummary(built.summary);
                setStage('review');
              }}
              className="min-h-[44px] text-brand-700"
            >
              Enter journey manually
            </Button>
          </div>
        </section>
      )}

      {/* ── C · Journey review ── */}
      {stage === 'review' && summary && (
        <div className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4.5 bg-navy-800 px-4.5 py-3.5">
              <div className="flex min-w-0 flex-wrap items-center gap-3.5">
                <span className="text-2xs font-bold uppercase tracking-[0.13em] text-white/60">
                  Staff review
                </span>
                <span className="whitespace-nowrap text-sm font-extrabold text-white">
                  {confirmedCount} of {blockCount} blocks confirmed
                </span>
                <span className="flex items-center gap-1" aria-hidden="true">
                  {[sumState === 'ok', ...sectors.map((s) => sectorState(s, Boolean(reviewed[s.id]), Boolean(edited[s.id])) === 'ok')].map(
                    (done, index) => (
                      <span
                        key={index}
                        className={cn('h-1.5 w-[22px] rounded-sm', done ? 'bg-emerald-400' : 'bg-white/20')}
                      />
                    ),
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={markEverythingReviewed}
                  className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  Mark everything reviewed
                </Button>
                <Button
                  size="sm"
                  icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
                  disabled={!allConfirmed}
                  onClick={() => setStage('trip')}
                  className={cn(
                    'min-h-[42px]',
                    allConfirmed ? GOLD_CTA : 'border-white/20 bg-white/10 text-white/50',
                  )}
                >
                  Continue to Trip Details
                </Button>
              </div>
            </div>
            <p className="bg-slate-50 px-4.5 py-2.5 text-xs text-slate-600">
              {allConfirmed
                ? 'All extracted data has been confirmed by a staff member. You can continue.'
                : 'Check each block against the source document, correct anything wrong, then mark it reviewed.'}
            </p>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <section>
                <h2 className={`${SECTION} mb-2.5`}>Journey summary</h2>
                <JourneySummaryBlock
                  summary={summary}
                  state={sumState}
                  confidenceLabel={demoConfidenceLabel(scenario)}
                  editing={editingSummary}
                  draft={summaryDraft}
                  onDraftChange={(field, value) =>
                    setSummaryDraft((current) => ({ ...current, [field]: value }))
                  }
                  onToggleEdit={() => {
                    setSummaryDraft({
                      passenger: summary.passenger,
                      pnr: summary.pnr,
                      carrier: summary.carrier,
                      adults: String(summary.adults),
                      children: summary.children === null ? '' : String(summary.children),
                    });
                    setEditingSummary((current) => !current);
                  }}
                  onSave={saveSummary}
                  onCancel={() => setEditingSummary(false)}
                  onToggleReviewed={() => {
                    if (sumState !== 'need') setSummaryReviewed((current) => !current);
                  }}
                />
              </section>

              <section>
                <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3.5">
                  <h2 className={SECTION}>Flight sectors</h2>
                  <div className="flex flex-wrap items-center gap-3.5">
                    <span className="identifier text-xs text-slate-600">{routeLine(sectors)}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold',
                        breaks === 0 ? 'text-emerald-700' : 'text-amber-700',
                      )}
                    >
                      {breaks === 0 ? (
                        <>
                          <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                          Sequence continuous
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {breaks} {breaks === 1 ? 'sequence break' : 'sequence breaks'}
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  {sectors.map((sector, index) => {
                    const link = linkBetween(index > 0 ? sectors[index - 1] : null, sector);
                    const state = sectorState(
                      sector,
                      Boolean(reviewed[sector.id]),
                      Boolean(edited[sector.id]),
                    );

                    return (
                      <div key={sector.id} className={index === 0 ? '' : link.kind === 'none' ? 'mt-3' : ''}>
                        {link.kind === 'connection' || link.kind === 'ground_stay' ? (
                          <div className="my-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4.5 py-2">
                            <span className="h-4 w-0.5 shrink-0 bg-slate-400" aria-hidden="true" />
                            <span className="min-w-0 text-xs text-slate-600">{link.text}</span>
                          </div>
                        ) : link.kind === 'break' ? (
                          <div role="alert" className="my-2 flex items-center gap-2.5 rounded-lg border border-amber-400 bg-amber-50 px-4.5 py-2.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                            <span className="text-xs text-amber-900">{link.text}</span>
                          </div>
                        ) : null}

                        <FlightSectorCard
                          sector={sector}
                          index={index}
                          total={sectors.length}
                          state={state}
                          addedByStaff={Boolean(addedByStaff[sector.id])}
                          editing={editingSector === sector.id}
                          draft={sectorDraft}
                          onDraftChange={(field, value) =>
                            setSectorDraft((current) => ({
                              ...current,
                              [field]: field === 'fmt' ? (value as TimeFormat) : value,
                            }))
                          }
                          onEdit={() => openSectorEdit(sector)}
                          onSave={() => saveSector(sector.id)}
                          onCancel={() => setEditingSector(null)}
                          onToggleReviewed={() =>
                            setReviewed((current) => ({ ...current, [sector.id]: !current[sector.id] }))
                          }
                          onMoveUp={() => moveSector(sector.id, -1)}
                          onMoveDown={() => moveSector(sector.id, 1)}
                          onRemove={() => {
                            setSectors((current) => current.filter((s) => s.id !== sector.id));
                            if (editingSector === sector.id) setEditingSector(null);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addSector}
                  className="mt-3.5 flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-lg border border-dashed border-slate-400 bg-white p-3 text-[0.8125rem] font-bold text-brand-700 transition-colors hover:border-brand-600 hover:bg-brand-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add a sector the extraction missed
                </button>

                <div className="mt-3.5 rounded-lg border border-slate-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowRaw((current) => !current)}
                    aria-expanded={showRaw}
                    className="flex w-full items-center gap-2.5 rounded-lg px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="text-xs text-slate-500" aria-hidden="true">{showRaw ? '▾' : '▸'}</span>
                    <span className="text-[0.8125rem] font-bold text-navy-900">Raw extracted data</span>
                    <span className="ml-auto hidden text-xs text-slate-500 sm:inline">
                      Exactly what the extractor returned, before your corrections
                    </span>
                  </button>
                  {showRaw && (
                    <pre className="overflow-auto border-t border-slate-200 bg-slate-50 px-4 py-3.5 font-mono text-xs leading-relaxed text-slate-700">
                      {rawJson}
                    </pre>
                  )}
                </div>
              </section>
            </div>

            {rail(
              <>
                <SideRailCard title="Review checklist">
                  <ul className="flex flex-col gap-2.5">
                    {[
                      ['Journey summary confirmed by staff', sumState === 'ok'],
                      ['Every flight sector confirmed', sectors.length > 0 && sectors.every((s) => sectorState(s, Boolean(reviewed[s.id]), Boolean(edited[s.id])) === 'ok')],
                      ['No missing fields left to fill', !anyMissing],
                      ['Journey sequence is continuous', breaks === 0],
                    ].map(([label, done]) => (
                      <li key={String(label)} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white',
                          )}
                          aria-hidden="true"
                        >
                          {done ? <Check className="h-2.5 w-2.5" /> : null}
                        </span>
                        <span className={cn('text-xs leading-snug', done ? 'text-slate-900' : 'text-slate-600')}>
                          {label}
                          <span className="sr-only">{done ? ' — complete' : ' — outstanding'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </SideRailCard>

                <SideRailCard title="Source documents" bodyClassName="px-0 py-0">
                  <ul>
                    {readableDocs.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 last:border-0">
                        <span className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 text-[7.5px] font-bold text-slate-600" aria-hidden="true">
                          {doc.ext}
                        </span>
                        <span className="min-w-0 truncate text-xs text-slate-900" title={doc.name}>
                          {doc.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SideRailCard>

                <SideRailCard title="Why this step exists">
                  <p className="text-xs leading-relaxed text-slate-600">
                    The itinerary is only generated from data a staff member has confirmed.
                    AI-extracted values are never treated as verified on their own.
                  </p>
                </SideRailCard>
              </>,
            )}
          </div>
        </div>
      )}

      {/* ── D · Trip details ── */}
      {stage === 'trip' && summary && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <TripDetailsForm
              details={trip}
              plannedFileName={fileName}
              onChange={(updates) => setTrip((current) => ({ ...current, ...updates }))}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                icon={<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => setStage('review')}
                className="min-h-[44px]"
              >
                Back to Journey Review
              </Button>
              <Button
                icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                disabled={!tripReady}
                onClick={() => setStage('confirm')}
                className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900"
              >
                Continue to Confirmation
              </Button>
              <span className="text-xs text-slate-600">
                {tripReady
                  ? 'Group name is optional.'
                  : 'Select a Makkah hotel and a Madinah hotel to continue.'}
              </span>
            </div>
          </div>

          {rail(
            <>
              <SideRailCard title="Carried forward" bodyClassName="px-0 py-0">
                <dl>
                  {[
                    ['Primary passenger', summary.passenger || '—'],
                    ['Booking reference', summary.pnr || '—'],
                    ['Total passengers', String(totalPax(summary) ?? '—')],
                    ['Flight sectors', String(sectors.length)],
                    ['Source documents', String(readableDocs.length)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                      <dt className="text-xs text-slate-600">{k}</dt>
                      <dd className="min-w-0 text-right text-xs font-bold text-navy-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="px-4 py-2.5 text-xs text-slate-600">
                  All of it staff-reviewed. Nothing changes here.
                </p>
              </SideRailCard>

              <SideRailCard title="Where this appears">
                <p className="mb-2 text-xs leading-relaxed text-slate-600">
                  Group name feeds the <strong className="font-bold text-navy-900">GROUP SUMMARY</strong>{' '}
                  block; the two hotels feed the{' '}
                  <strong className="font-bold text-navy-900">HOTEL ACCOMMODATION</strong> table.
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Check-in and check-out dates are taken from the reviewed journey.
                </p>
              </SideRailCard>
            </>,
          )}
        </div>
      )}

      {/* ── E · Confirmation ── */}
      {stage === 'confirm' && summary && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4.5">
            <ConfirmationReview
              summary={summary}
              sectors={sectors}
              trip={trip}
              documentCount={readableDocs.length}
              breaks={breaks}
              acknowledged={acknowledged}
              onAcknowledge={setAcknowledged}
              onEditReview={() => setStage('review')}
              onEditTrip={() => setStage('trip')}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                icon={<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => setStage('trip')}
                className="min-h-[44px]"
              >
                Back to Trip Details
              </Button>
              <Button
                size="lg"
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
                disabled={!generationReady}
                onClick={runGeneration}
                className={cn('min-h-[46px]', generationReady && GOLD_CTA)}
              >
                Generate Itinerary
              </Button>
              <span className="text-xs text-slate-600">
                {generationReady
                  ? 'Nothing is generated until you press this.'
                  : breaks > 0
                    ? 'Resolve the sequence break first.'
                    : 'Tick the confirmation above to enable generation.'}
              </span>
            </div>
          </div>

          {rail(
            <>
              <SideRailCard title="Provenance">
                <div className="flex flex-col gap-2.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-emerald-800">
                      Staff reviewed
                    </span>
                    <span className="text-xs text-slate-600">
                      Passenger, booking and all {sectors.length} sectors
                    </span>
                  </p>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-navy-900">
                      Staff entered
                    </span>
                    <span className="text-xs text-slate-600">Group name and both hotels</span>
                  </p>
                  <p className="text-xs leading-relaxed text-slate-600">
                    No AI-extracted value reaches the document without a staff confirmation behind it.
                  </p>
                </div>
              </SideRailCard>

              <SideRailCard title="Output">
                <p className="text-xs leading-relaxed text-slate-600">
                  A Word document named{' '}
                  <strong className="font-bold text-navy-900">{fileName}</strong>, in the standard
                  Umrah package layout. The document template itself is unchanged.
                </p>
              </SideRailCard>
            </>,
          )}
        </div>
      )}

      {/* ── F · Generating ── */}
      {stage === 'generating' && (
        <StageProgressPanel
          heading="Generating the itinerary"
          meta={fileName}
          description="Writing the reviewed journey and accommodation into the standard Word layout."
          stages={GENERATION_STAGES}
          currentIndex={genStep}
          progressLabel="Generation in progress"
          footer={
            <p className="text-xs text-slate-600">Leave this page open until the document is ready.</p>
          }
        />
      )}

      {/* ── Generation failed ── */}
      {stage === 'genfailed' && (
        <section className="max-w-3xl rounded-lg border-2 border-red-700 bg-white">
          <div className="flex gap-3.5 px-5 pb-4 pt-5">
            <AlertCircle className="mt-0.5 h-[22px] w-[22px] shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-navy-900">
                The document could not be generated
              </h2>
              <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-slate-600">
                Formatting stopped partway through writing the Word file. Your reviewed journey,
                group name and hotel selections are all still here — nothing needs to be re-entered.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <Button onClick={runGeneration} className="min-h-[44px] border-navy-800 bg-navy-800 hover:border-navy-900 hover:bg-navy-900">
              Try generating again
            </Button>
            <Button variant="secondary" onClick={() => setStage('confirm')} className="min-h-[44px]">
              Back to confirmation
            </Button>
          </div>
        </section>
      )}

      {/* ── G · Download ── */}
      {stage === 'done' && summary && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <GeneratedItinerary
              rows={[
                { k: 'Group name', v: trip.groupName || 'Individual traveller' },
                { k: 'Primary passenger', v: summary.passenger || '—' },
                { k: 'Booking reference', v: summary.pnr || '—' },
                { k: 'Total passengers', v: String(totalPax(summary) ?? '—') },
                { k: 'Flight sectors', v: String(sectors.length) },
                { k: 'File name', v: fileName },
                { k: 'Generated', v: generatedAt || '—' },
              ]}
              downloaded={downloaded}
              onDownload={() => setDownloaded(true)}
              onGenerateAnother={startOver}
            />
          </div>

          {rail(
            <>
              <SideRailCard title="What the document contains">
                <ul className="flex flex-col gap-2.5">
                  {[
                    'Umrah package information',
                    'Group summary — group, adults, children, total',
                    `Flight information — all ${sectors.length} ${sectors.length === 1 ? 'sector' : 'sectors'}, with PNR`,
                    'Hotel accommodation — Makkah and Madinah',
                  ].map((text) => (
                    <li key={text} className="flex gap-2.5 text-xs leading-snug text-slate-600">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Times print exactly as they appear on each source ticket.
                </p>
              </SideRailCard>

              <SideRailCard title="Next">
                <p className="text-xs leading-relaxed text-slate-600">
                  Generating another itinerary starts a fresh upload. This one is not kept as a
                  draft.
                </p>
              </SideRailCard>
            </>,
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Extraction and generation are not connected in this build. No document leaves your browser
        and nothing is saved.
      </p>
    </>
  );
}

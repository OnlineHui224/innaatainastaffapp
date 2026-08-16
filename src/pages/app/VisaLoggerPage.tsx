import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileScan,
  Loader2,
  PenLine,
  Save,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePersonalGemini } from '@/context/personalGeminiStore';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/priority';
import { WorkflowStepper } from '@/components/visa/WorkflowStepper';
import { CaseDetailsCard } from '@/components/visa/CaseDetailsCard';
import { UploadVisaCard } from '@/components/visa/UploadVisaCard';
import {
  REQUIRED_VERIFICATION_KEYS,
  ReviewScreen,
  allRequiredVerified,
  countVerified,
} from '@/components/visa/ReviewScreen';
import { SuccessScreen } from '@/components/visa/SuccessScreen';
import { ConfirmRow, ConfirmSection } from '@/components/visa/ConfirmSection';
import {
  PilgrimMatchPanel,
  type MatchCandidate,
  type MatchPhase,
} from '@/components/visa/PilgrimMatchPanel';
import { ProcessingSummary } from '@/components/visa/ProcessingSummary';
import { ViewerReadOnly } from '@/components/visa/ViewerReadOnly';
import { ProvenanceLadder, buildCaseProvenance } from '@/components/visa/ProvenanceLadder';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { PersonalGeminiBanner } from '@/components/gemini/PersonalGeminiBanner';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import type { ComboboxOption } from '@/components/visa/SearchableCombobox';
import type {
  ExtractedFieldKey,
  ExtractionStatus,
  PilgrimMatchResult,
  VisaCaseDetails,
  VisaExtractionResult,
  WorkflowStep,
} from '@/types/visa';
import {
  EXTRACTION_STAGES,
  EXTRACTION_STATUS_MESSAGES,
  editFieldValue,
  emptyExtractedField,
  emptyTransportSelection,
  transportPackageSummary,
  TRANSPORT_PACKAGE_LABELS,
  TRANSPORT_PACKAGE_LEGS,
  unverifyField,
  verifyField,
} from '@/types/visa';
import { GEMINI_STATUS, VISA_CTA } from '@/types/personalGemini';
import type { SubAgent } from '@/types';
import { cn } from '@/lib/utils';

function emptyDetails(): VisaCaseDetails {
  return {
    pilgrimId: null,
    pilgrimName: '',
    passportNumber: '',
    agentId: null,
    agentName: '',
    agentIsProposed: false,
    newAgent: null,
    assignedStaffId: null,
    visaCompany: '',
    makkahHotelId: null,
    makkahHotelName: '',
    makkahHotelIsCustom: false,
    makkahCustomHotel: null,
    madinahHotelId: null,
    madinahHotelName: '',
    madinahHotelIsCustom: false,
    madinahCustomHotel: null,
    transport: emptyTransportSelection(),
    transportPackage: null,
    plannedOutboundDate: '',
    expectedReturnDate: '',
  };
}

function emptyExtraction(): VisaExtractionResult {
  return {
    passengerName: emptyExtractedField(),
    passportNumber: emptyExtractedField(),
    visaNumber: emptyExtractedField(),
    nationality: emptyExtractedField(),
    extractedAt: '',
  };
}

export default function VisaLoggerPage() {
  const navigate = useNavigate();
  const { profile, isAdminOrHigher } = useAuth();
  const gemini = usePersonalGemini();

  const isViewer = profile?.role === 'viewer';

  const [step, setStep] = useState<WorkflowStep>('case_details');
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());

  const [details, setDetails] = useState<VisaCaseDetails>(emptyDetails());
  /**
   * Which required fields may display an error yet.
   *
   * Validation itself is unchanged — `errors` below is still computed on every
   * render and still gates progression. This only decides when an officer is
   * shown a problem: a form they have not touched is not yet wrong.
   */
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<VisaExtractionResult>(emptyExtraction());
  const [manualEntry, setManualEntry] = useState(false);
  const [match, setMatch] = useState<PilgrimMatchResult>({
    status: 'no_match',
    pilgrim: null,
    conflicts: [],
    alternatives: [],
  });

  /* Passport matching, performed only after the identity has been reviewed. */
  const [matchPhase, setMatchPhase] = useState<MatchPhase>('idle');
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);

  const [agentOptions, setAgentOptions] = useState<ComboboxOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<ComboboxOption[]>([]);

  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>('idle');
  const [alert, setAlert] = useState<{ tone: 'info' | 'warning' | 'critical' | 'success'; message: string } | null>(
    null,
  );
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitial() {
      try {
        const { data: agents } = await supabase
          .from('sub_agents')
          .select('id, organisation_name, country')
          .eq('active_status', true)
          .order('organisation_name');
        if (agents) {
          setAgentOptions(
            (agents as SubAgent[]).map((a) => ({
              value: a.id,
              label: a.organisation_name,
              secondary: a.country,
            })),
          );
        }

        const { data: staff } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('is_active', true)
          .order('full_name');
        if (staff) {
          setStaffOptions(
            (staff as Array<{ id: string; full_name: string; role: string }>).map((s) => ({
              value: s.id,
              label: s.full_name,
              secondary: s.role.replace(/_/g, ' '),
            })),
          );
        }
      } catch (e) {
        console.error('Failed to load initial data:', e);
      }
    }
    loadInitial();
  }, []);

  /* Local preview for the uploaded document, shown beside the extracted fields. */
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);



  // ── Validation ─────────────────────────────────────────────────────
  const errors: Record<string, string> = {};
  const missingFields: string[] = [];

  /* An Existing Pilgrim is deliberately NOT required here. The pilgrim is
     matched later, from the reviewed passport number — see `runPilgrimMatch`.
     `pilgrimId` remains required before the final save. */
  if (!details.agentName && !details.agentIsProposed) {
    errors.agentId = 'Please select a responsible agent';
    missingFields.push('Responsible Agent');
  }
  if (details.agentIsProposed && details.newAgent && !details.newAgent.organisationName.trim()) {
    errors.agentId = 'Please enter the new agent name';
    missingFields.push('New Agent Name');
  }
  if (!details.visaCompany.trim()) {
    errors.visaCompany = 'Please enter the visa company';
    missingFields.push('Visa Company');
  }
  if (!details.transportPackage) {
    errors.transportPackage = 'Please select a transportation package';
    missingFields.push('Transportation Package');
  }
  if (!details.makkahHotelName) {
    errors.makkahHotelId = 'Please select a Makkah hotel';
    missingFields.push('Makkah Hotel');
  }
  if (!details.madinahHotelName) {
    errors.madinahHotelId = 'Please select a Madinah hotel';
    missingFields.push('Madinah Hotel');
  }
  if (details.plannedOutboundDate && details.expectedReturnDate) {
    if (details.expectedReturnDate < details.plannedOutboundDate) {
      errors.dateError = 'Expected return must be on or after the planned outbound date';
      missingFields.push('Valid date range');
    }
  }

  const caseDetailsValid = Object.keys(errors).length === 0;

  /**
   * The subset of `errors` the officer is actually shown.
   *
   * Nothing is relaxed: `errors`, `caseDetailsValid`, `missingFields` and every
   * save condition still see the full set. A field only surfaces its message
   * once it has been touched, or once a progression has been attempted — at
   * which point every blocking field is revealed at once.
   */
  const DATE_KEYS = ['plannedOutboundDate', 'expectedReturnDate'];
  const visibleErrors: Record<string, string> = attemptedContinue
    ? errors
    : Object.fromEntries(
        Object.entries(errors).filter(([key]) =>
          key === 'dateError'
            ? DATE_KEYS.some((dateKey) => touchedFields.has(dateKey))
            : touchedFields.has(key),
        ),
      );
  const isReady = caseDetailsValid && !!file;
  const verifiedCount = countVerified(extraction);
  const reviewComplete = allRequiredVerified(extraction);

  const handleDetailsChange = useCallback((updates: Partial<VisaCaseDetails>) => {
    // Any field the officer has actually interacted with may show its own error.
    setTouchedFields((prev) => {
      const next = new Set(prev);
      Object.keys(updates).forEach((key) => next.add(key));
      return next;
    });
    setDetails((prev) => ({ ...prev, ...updates }));
  }, []);

  // ── Explicit field verification ────────────────────────────────────
  /** An edit records the new value and clears any prior verification. */
  const handleFieldEdit = useCallback((key: ExtractedFieldKey, value: string) => {
    setExtraction((prev) => ({ ...prev, [key]: editFieldValue(prev[key], value) }));
  }, []);

  /** The only route to a verified field. Officer and timestamp come from the session. */
  const handleFieldVerify = useCallback(
    (key: ExtractedFieldKey) => {
      setExtraction((prev) => ({
        ...prev,
        [key]: verifyField(prev[key], {
          id: profile?.id ?? null,
          name: profile?.full_name ?? 'Staff member',
        }),
      }));
    },
    [profile?.id, profile?.full_name],
  );

  const handleFieldUnverify = useCallback((key: ExtractedFieldKey) => {
    setExtraction((prev) => ({ ...prev, [key]: unverifyField(prev[key]) }));
  }, []);

  const goToUpload = useCallback(() => {
    if (!caseDetailsValid) {
      setAlert({ tone: 'warning', message: 'Complete the required case details before continuing.' });
      return;
    }
    setCompletedSteps((prev) => new Set(prev).add('case_details'));
    setStep('upload_visa');
    setAlert(null);
  }, [caseDetailsValid]);

  const goToCaseDetails = useCallback(() => {
    setStep('case_details');
    setAlert(null);
  }, []);

  const handleExtract = useCallback(async () => {
    if (!file) {
      setAlert({ tone: 'warning', message: 'Upload a visa document before starting extraction.' });
      return;
    }
    if (!gemini.ready) {
      setAlert({
        tone: 'warning',
        message:
          'Your personal Gemini access is not available for extraction right now. You can continue with manual entry, or set up your access from My Account.',
      });
      return;
    }

    /* Real Personal Gemini is not implemented. Rather than fabricate a result —
       inventing a visa number, or copying a pilgrim's identity and calling it an
       extraction — the AI path refuses and hands the officer manual entry.
       Nothing synthetic ever reaches a saved record. */
    setAlert({
      tone: 'info',
      message:
        'AI extraction is not available yet. Enter the identity from the uploaded visa manually — each value still has to be reviewed individually.',
    });
  }, [file, gemini.ready]);

  /** Manual-entry path — used when extraction fails or the limit is exhausted. */
  const startManualEntry = useCallback(() => {
    setManualEntry(true);
    setExtractionStatus('idle');
    setExtraction({
      ...emptyExtraction(),
      extractedAt: new Date().toISOString(),
    });
    /* Matching happens AFTER the identity is reviewed. Nothing is matched here. */
    setMatchPhase('idle');
    setCandidates([]);
    setCompletedSteps((prev) => new Set(prev).add('upload_visa'));
    setStep('review_extraction');
    setAlert({
      tone: 'info',
      message: 'Manual entry. Type each value from the document, then review it explicitly.',
    });
  }, []);

  /**
   * Finds the HajjERP pilgrim this visa belongs to.
   *
   * The reviewed passport number is the key — it is the one identifier on a visa
   * that maps to exactly one person. A name is supporting context only, and no
   * candidate is ever selected automatically.
   *
   * This reads `pilgrims`; it writes nothing.
   */
  const runPilgrimMatch = useCallback(async () => {
    const passport = (extraction.passportNumber.value ?? '').trim();
    if (!passport) return;

    setMatchPhase('searching');
    setMatchError(null);
    try {
      const { data, error } = await supabase
        .from('pilgrims')
        .select('id, full_name, passport_number, visa_number, sub_agents(organisation_name)')
        .ilike('passport_number', passport)
        .limit(10);
      if (error) throw error;

      const found: MatchCandidate[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        full_name: row.full_name as string,
        passport_number: row.passport_number as string,
        visa_number: (row.visa_number as string) ?? null,
        agent_name:
          (row.sub_agents as { organisation_name: string } | null)?.organisation_name ?? null,
      }));

      setCandidates(found);
      setMatchPhase(found.length === 0 ? 'none' : found.length === 1 ? 'exact' : 'multiple');
    } catch (e) {
      setCandidates([]);
      setMatchError(e instanceof Error ? e.message : 'Search failed');
      setMatchPhase('error');
    }
  }, [extraction.passportNumber.value]);

  /**
   * Records the officer's explicit choice.
   *
   * This is the only route to a populated `pilgrimId`, and therefore the only
   * route to a save. The reviewed visa identity is never overwritten by the
   * matched record — the two are shown side by side and any difference stays
   * visible.
   */
  const confirmPilgrimMatch = useCallback((candidate: MatchCandidate) => {
    setDetails((prev) => ({
      ...prev,
      pilgrimId: candidate.id,
      pilgrimName: candidate.full_name,
    }));
    setMatch({
      status: 'exact_passport_match',
      pilgrim: {
        id: candidate.id,
        full_name: candidate.full_name,
        passport_number: candidate.passport_number,
        visa_number: candidate.visa_number,
        agent_name: candidate.agent_name,
      },
      conflicts: [],
      alternatives: [],
    });
  }, []);

  const clearPilgrimMatch = useCallback(() => {
    setDetails((prev) => ({ ...prev, pilgrimId: null, pilgrimName: '' }));
    setMatch({ status: 'no_match', pilgrim: null, conflicts: [], alternatives: [] });
    setMatchPhase('idle');
    setCandidates([]);
    setMatchError(null);
  }, []);

  const goToConfirm = useCallback(() => {
    if (!reviewComplete) {
      setAlert({
        tone: 'warning',
        message: 'Every identity field must be explicitly reviewed before this case can continue.',
      });
      return;
    }
    if (!details.pilgrimId) {
      setAlert({
        tone: 'warning',
        message:
          'Match this visa to a HajjERP pilgrim before continuing. A visa can only be saved against an existing pilgrim record.',
      });
      return;
    }
    setCompletedSteps((prev) => new Set(prev).add('review_extraction'));
    setStep('confirm_save');
    setAlert(null);
  }, [reviewComplete, details.pilgrimId]);

  const backToReview = useCallback(() => setStep('review_extraction'), []);

  // ── Save ───────────────────────────────────────────────────────────
  const handleConfirmSave = useCallback(async () => {
    if (!details.pilgrimId) {
      setAlert({ tone: 'critical', message: 'No pilgrim is selected. Go back and select a pilgrim record.' });
      return;
    }
    if (!allRequiredVerified(extraction)) {
      setAlert({ tone: 'warning', message: 'Every extracted field must be verified before saving.' });
      return;
    }

    setSaving(true);
    setConfirmDialog(false);

    try {
      let agentId = details.agentId;
      if (details.agentIsProposed && details.newAgent && isAdminOrHigher) {
        const { data: newAgent, error: agentErr } = await supabase
          .from('sub_agents')
          .insert({
            organisation_name: details.newAgent.organisationName.trim(),
            contact_person: details.newAgent.contactPerson || null,
            phone_number: details.newAgent.phoneNumber || null,
            email: details.newAgent.email || null,
            notes: details.newAgent.internalNote || null,
            active_status: true,
            created_by: profile?.id ?? null,
            updated_by: profile?.id ?? null,
          })
          .select('id')
          .single();

        if (agentErr) throw agentErr;
        agentId = newAgent.id;

        await logAudit({
          action: 'new_agent_created_from_ops_pro',
          recordType: 'sub_agent',
          recordId: agentId,
          recordLabel: details.newAgent.organisationName,
          newValue: { source: 'OPS_PRO_MANUAL_AGENT', created_by: profile?.full_name },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      } else if (details.agentIsProposed && details.newAgent) {
        await supabase.from('proposed_agents').insert({
          organisation_name: details.newAgent.organisationName.trim(),
          contact_person: details.newAgent.contactPerson || null,
          phone_number: details.newAgent.phoneNumber || null,
          email: details.newAgent.email || null,
          internal_note: details.newAgent.internalNote || null,
          entered_by: profile?.id ?? null,
          entered_by_name: profile?.full_name ?? null,
          source: 'OPS_PRO_MANUAL_AGENT',
        });

        await logAudit({
          action: 'proposed_agent_entered',
          recordType: 'proposed_agent',
          recordLabel: details.newAgent.organisationName,
          newValue: { entered_by: profile?.full_name, status: 'pending' },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      }

      /* Entitlement only. The visa workflow no longer collects a route, vehicle
         or price, so the old route/rate/override audit actions are not emitted
         for new records — there is nothing of that kind to report. Historical
         entries and the reference tables are untouched. */
      const transportSummary = transportPackageSummary(details.transportPackage);

      const makkahHotelName = details.makkahHotelName;
      if (details.makkahHotelIsCustom && details.makkahCustomHotel && isAdminOrHigher) {
        const { data: inserted } = await supabase
          .from('hotel_references')
          .insert({
            city: 'Makkah',
            name_en: details.makkahCustomHotel.name,
            name_ar: details.makkahCustomHotel.nameAr || null,
            licence_number: details.makkahCustomHotel.licenceNumber || null,
            source: 'CUSTOM_ITINERARY_HOTEL',
            entered_by: profile?.id ?? null,
          })
          .select('id')
          .single();
        if (inserted) {
          await logAudit({
            action: 'custom_hotel_entered',
            recordType: 'hotel_reference',
            recordId: inserted.id,
            recordLabel: details.makkahCustomHotel.name,
            newValue: { city: 'Makkah', source: 'CUSTOM_ITINERARY_HOTEL' },
            performedBy: profile?.id ?? null,
            performedByName: profile?.full_name ?? '',
          });
        }
      }

      const madinahHotelName = details.madinahHotelName;
      if (details.madinahHotelIsCustom && details.madinahCustomHotel && isAdminOrHigher) {
        const { data: inserted } = await supabase
          .from('hotel_references')
          .insert({
            city: 'Madinah',
            name_en: details.madinahCustomHotel.name,
            name_ar: details.madinahCustomHotel.nameAr || null,
            licence_number: details.madinahCustomHotel.licenceNumber || null,
            source: 'CUSTOM_ITINERARY_HOTEL',
            entered_by: profile?.id ?? null,
          })
          .select('id')
          .single();
        if (inserted) {
          await logAudit({
            action: 'custom_hotel_entered',
            recordType: 'hotel_reference',
            recordId: inserted.id,
            recordLabel: details.madinahCustomHotel.name,
            newValue: { city: 'Madinah', source: 'CUSTOM_ITINERARY_HOTEL' },
            performedBy: profile?.id ?? null,
            performedByName: profile?.full_name ?? '',
          });
        }
      }


      const updateData: Record<string, unknown> = {
        visa_number: extraction.visaNumber.value,
        visa_company: details.visaCompany || null,
        transportation: transportSummary || null,
        makkah_hotel: makkahHotelName || null,
        madinah_hotel: madinahHotelName || null,
        contract_record_date: new Date().toISOString().split('T')[0],
        expected_return_date: details.expectedReturnDate || null,
        sub_agent_id: agentId,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id ?? null,
      };

      const { error } = await supabase.from('pilgrims').update(updateData).eq('id', details.pilgrimId);
      if (error) throw error;

      /* The verification trail travels with the audit entry, so who reviewed
         which value — and when — is recoverable after the fact. */
      await logAudit({
        action: 'visa_record_saved',
        recordType: 'pilgrim',
        recordId: details.pilgrimId,
        recordLabel: details.pilgrimName,
        previousValue: { visa_number: null },
        newValue: {
          visa_number: extraction.visaNumber.value,
          visa_company: details.visaCompany,
          verified_fields: REQUIRED_VERIFICATION_KEYS.map((key) => ({
            field: key,
            value: extraction[key].value,
            edited: extraction[key].edited,
            verified_by: extraction[key].verifiedByName,
            verified_at: extraction[key].verifiedAt,
          })),
        },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });

      setSavedAt(new Date().toISOString());
      setCompletedSteps((prev) => new Set(prev).add('confirm_save'));
      setStep('confirm_save');
      setAlert({ tone: 'success', message: 'Visa record saved.' });
    } catch (e) {
      console.error('Save failed:', e);
      setAlert({
        tone: 'critical',
        message: 'The visa record could not be saved. Check your connection and try again.',
      });
    } finally {
      setSaving(false);
    }
  }, [details, extraction, profile, isAdminOrHigher]);

  const handleProcessAnother = useCallback(() => {
    setDetails(emptyDetails());
    setFile(null);
    setExtraction(emptyExtraction());
    setManualEntry(false);
    setMatch({ status: 'no_match', pilgrim: null, conflicts: [], alternatives: [] });
    setMatchPhase('idle');
    setCandidates([]);
    setMatchError(null);
    setExtractionStatus('idle');
    setAlert(null);
    setCompletedSteps(new Set());
    setStep('case_details');
    setSavedAt('');
  }, []);

  const handleViewPilgrim = useCallback(() => {
    if (details.pilgrimId) navigate(`/app/pilgrims/${details.pilgrimId}`);
  }, [details.pilgrimId, navigate]);

  const handleViewHistory = useCallback(() => navigate('/app/audit-history'), [navigate]);

  const showSuccess = step === 'confirm_save' && completedSteps.has('confirm_save') && Boolean(savedAt);
  const isProcessing =
    extractionStatus !== 'idle' && extractionStatus !== 'complete' && extractionStatus !== 'error';

  // ── Viewer — a completed read-only browser, not a disabled processing UI ──
  if (isViewer) {
    return (
      <div>
        <PageHeader
          eyebrow="Operations"
          title="Visa &amp; Contract Logger"
          subtitle="Browse the visa records already saved against pilgrims on the platform."
        />
        <ViewerReadOnly />
      </div>
    );
  }

  const reviewOfficer =
    REQUIRED_VERIFICATION_KEYS.map((key) => extraction[key].verifiedByName).find(Boolean) ?? null;
  const verifiedTimestamps = REQUIRED_VERIFICATION_KEYS.map((key) => extraction[key].verifiedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const lastVerifiedAt = verifiedTimestamps.length > 0 ? verifiedTimestamps[verifiedTimestamps.length - 1] : null;

  const caseProvenance = buildCaseProvenance({
    extractedAt: extraction.extractedAt,
    extractionConfidenceNote: manualEntry
      ? 'Manual entry — no AI extraction was used for this case'
      : `Machine-read from the uploaded document${
          extraction.visaNumber.confidence ? ` · visa number ${extraction.visaNumber.confidence} confidence` : ''
        }`,
    verifiedCount,
    requiredCount: REQUIRED_VERIFICATION_KEYS.length,
    reviewOfficer,
    reviewedAt: lastVerifiedAt,
    matchedPilgrimName: match.pilgrim?.full_name ?? null,
    matchedPassport: match.pilgrim?.passport_number ?? null,
    savedAt: savedAt || null,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Visa &amp; Contract Logger"
        subtitle="Extract visa information, review every value explicitly, match it to an existing pilgrim, and record the confirmed details. HajjERP is the system of record for every visa logged here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
              Database connected
            </span>
            <span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700">
              <span
                className={cn('h-2 w-2 rounded-full', GEMINI_STATUS[gemini.state].dot)}
                aria-hidden="true"
              />
              Personal Gemini:{' '}
              <span className="font-bold">{GEMINI_STATUS[gemini.state].label}</span>
            </span>
          </div>
        }
      />

      <div className="mb-5 rounded-lg border border-slate-300 bg-white px-4 py-3">
        <WorkflowStepper currentStep={step} completedSteps={completedSteps} />
      </div>

      {alert && (
        <div className="mb-4">
          <Alert tone={alert.tone} onDismiss={() => setAlert(null)}>
            {alert.message}
          </Alert>
        </div>
      )}

      {showSuccess ? (
        <div className="space-y-6">
          <ProvenanceLadder provenance={caseProvenance} orientation="horizontal" />
          <SuccessScreen
            extraction={extraction}
            details={details}
            savedBy={profile?.full_name || 'Staff'}
            savedAt={savedAt}
            onViewPilgrim={handleViewPilgrim}
            onProcessAnother={handleProcessAnother}
            onViewHistory={handleViewHistory}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            {step === 'case_details' && (
              <>
                <CaseDetailsCard
                  details={details}
                  onChange={handleDetailsChange}
                  agentOptions={agentOptions}
                  staffOptions={staffOptions}
                  errors={visibleErrors}
                  disabled={false}
                  isAdmin={isAdminOrHigher}
                />
                <div className="flex justify-end">
                  {/* Deliberately enabled. `goToUpload` still refuses to advance
                      while anything is missing — pressing it is how an officer
                      asks what is outstanding, rather than facing a dead control
                      with no explanation. */}
                  <Button
                    onClick={() => {
                      setAttemptedContinue(true);
                      goToUpload();
                    }}
                    icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  >
                    Continue to upload
                  </Button>
                </div>
              </>
            )}

            {step === 'upload_visa' && (
              <>
                <Button
                  variant="ghost"
                  onClick={goToCaseDetails}
                  icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                >
                  Back to case details
                </Button>

                {/* AI availability affects the extraction path only. Operational
                    details, hotels, dates and manual entry stay fully usable. */}
                <PersonalGeminiBanner />

                <UploadVisaCard
                  file={file}
                  onFileSelect={(f) => {
                    setFile(f);
                    setUploadError(null);
                  }}
                  disabled={isProcessing}
                  error={uploadError}
                />

                {isProcessing && (
                  <Panel title="Processing" description="Each stage runs in order. Do not close this page.">
                    <ol className="space-y-2.5">
                      {EXTRACTION_STAGES.map((stage) => {
                        const order = EXTRACTION_STAGES.indexOf(stage);
                        const currentOrder = EXTRACTION_STAGES.indexOf(extractionStatus);
                        const done = currentOrder > order;
                        const active = extractionStatus === stage;
                        return (
                          <li key={stage} className="flex items-center gap-3">
                            <span
                              className={cn(
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                done && 'border-emerald-700 bg-emerald-700 text-white',
                                active && 'border-brand-600 bg-brand-600 text-white',
                                !done && !active && 'border-dashed border-slate-300 text-slate-400',
                              )}
                              aria-hidden="true"
                            >
                              {done ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : active ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <span className="text-2xs">•</span>
                              )}
                            </span>
                            <span
                              className={cn(
                                'text-sm',
                                done && 'text-slate-700',
                                active && 'font-semibold text-brand-800',
                                !done && !active && 'text-slate-400',
                              )}
                            >
                              {EXTRACTION_STATUS_MESSAGES[stage]}
                              {active && <span className="sr-only"> (in progress)</span>}
                              {done && <span className="sr-only"> (complete)</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </Panel>
                )}

                {extractionStatus === 'error' && (
                  <Alert tone="critical" title="Extraction failed">
                    The document could not be read. You can retry the extraction, or enter every value by hand
                    and verify each one against the document.
                  </Alert>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-600">
                    {isProcessing
                      ? EXTRACTION_STATUS_MESSAGES[extractionStatus]
                      : VISA_CTA[gemini.state].note}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={startManualEntry}
                      disabled={isProcessing || !file}
                      icon={<PenLine className="h-4 w-4" aria-hidden="true" />}
                    >
                      Enter details manually
                    </Button>
                    {VISA_CTA[gemini.state].ready ? (
                      <Button
                        onClick={handleExtract}
                        loading={isProcessing}
                        disabled={!isReady}
                        icon={<FileScan className="h-4 w-4" aria-hidden="true" />}
                      >
                        Extract visa information
                      </Button>
                    ) : (
                      /* Not connected: the action routes to setup in the account
                         rather than vanishing. Manual entry beside it is
                         untouched, so a record can always be completed. */
                      <ButtonLink to="/app/account" variant="secondary">
                        {VISA_CTA[gemini.state].label}
                      </ButtonLink>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 'review_extraction' && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setStep('upload_visa')}
                  icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                >
                  Back to upload
                </Button>

                <ReviewScreen
                  extraction={extraction}
                  details={details}
                  onFieldEdit={handleFieldEdit}
                  onFieldVerify={handleFieldVerify}
                  onFieldUnverify={handleFieldUnverify}
                  documentPreviewUrl={filePreviewUrl}
                  documentName={file?.name ?? null}
                />

                {/* Matching comes AFTER the identity has been reviewed, and uses
                    the reviewed passport number as its key. */}
                <PilgrimMatchPanel
                  phase={matchPhase}
                  passport={extraction.passportNumber.value ?? ''}
                  travellerName={extraction.passengerName.value ?? ''}
                  candidates={candidates}
                  confirmedId={details.pilgrimId}
                  errorMessage={matchError}
                  onSearch={runPilgrimMatch}
                  onConfirm={confirmPilgrimMatch}
                  onClear={clearPilgrimMatch}
                />

                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {!reviewComplete && (
                    <p className="text-xs text-amber-900 sm:mr-auto">
                      {REQUIRED_VERIFICATION_KEYS.length - verifiedCount} field
                      {REQUIRED_VERIFICATION_KEYS.length - verifiedCount === 1 ? '' : 's'} still need explicit
                      verification.
                    </p>
                  )}
                  <Button
                    onClick={goToConfirm}
                    disabled={!reviewComplete}
                    icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  >
                    Proceed to confirmation
                  </Button>
                </div>
              </>
            )}

            {step === 'confirm_save' && !showSuccess && (
              <>
                <Button
                  variant="ghost"
                  onClick={backToReview}
                  icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                >
                  Return to review
                </Button>

                <Panel
                  title="D · Review &amp; confirmation"
                  description="Exactly what will be written to the pilgrim record. Staff-entered operational details, staff-reviewed visa identity and the matched HajjERP record are kept apart so their provenance stays legible."
                  bodyClassName="p-0"
                >
                  {/* ── Staff-entered operational details ── */}
                  <ConfirmSection title="Staff-entered operational details" provenance="Staff entered">
                    <ConfirmRow label="Responsible agent">
                      {details.agentName}
                      {details.agentIsProposed &&
                        (isAdminOrHigher ? ' (new — will be created)' : ' (proposed — pending approval)')}
                    </ConfirmRow>
                    <ConfirmRow label="Visa company">{details.visaCompany || '—'}</ConfirmRow>
                    <ConfirmRow label="Transportation package">
                      {details.transportPackage ? TRANSPORT_PACKAGE_LABELS[details.transportPackage] : '—'}
                    </ConfirmRow>
                    <ConfirmRow label="Included legs" className="sm:col-span-2">
                      {details.transportPackage
                        ? TRANSPORT_PACKAGE_LEGS[details.transportPackage].length > 0
                          ? TRANSPORT_PACKAGE_LEGS[details.transportPackage].join(', ')
                          : 'No transport legs included'
                        : '—'}
                    </ConfirmRow>
                    <ConfirmRow label="Makkah hotel">
                      {details.makkahHotelName || '—'}
                      {details.makkahHotelIsCustom && ' (custom)'}
                    </ConfirmRow>
                    <ConfirmRow label="Madinah hotel">
                      {details.madinahHotelName || '—'}
                      {details.madinahHotelIsCustom && ' (custom)'}
                    </ConfirmRow>
                    <ConfirmRow label="Planned outbound">{details.plannedOutboundDate || '—'}</ConfirmRow>
                    <ConfirmRow label="Expected return">{details.expectedReturnDate || '—'}</ConfirmRow>
                  </ConfirmSection>

                  {/* ── Staff-reviewed visa identity ── */}
                  <ConfirmSection title="Staff-reviewed visa identity" provenance="Staff reviewed">
                    {REQUIRED_VERIFICATION_KEYS.map((key) => {
                      const field = extraction[key];
                      const labels: Record<ExtractedFieldKey, string> = {
                        passengerName: 'Traveller name',
                        passportNumber: 'Passport number',
                        visaNumber: 'Visa number',
                        nationality: 'Nationality',
                      };
                      const isIdentifier = key === 'passportNumber' || key === 'visaNumber';
                      return (
                        <ConfirmRow
                          key={key}
                          label={labels[key]}
                          note={`Reviewed by ${field.verifiedByName ?? 'an officer'}${
                            field.verifiedAt ? ` · ${formatDateTime(field.verifiedAt)}` : ''
                          }`}
                        >
                          {isIdentifier ? (
                            <Identifier value={field.value} />
                          ) : (
                            field.value || <span className="text-slate-500">—</span>
                          )}
                        </ConfirmRow>
                      );
                    })}
                  </ConfirmSection>

                  {/* ── Matched HajjERP record — the row this save updates ── */}
                  <ConfirmSection title="Matched HajjERP record" provenance="Matched">
                    <ConfirmRow label="Pilgrim name">{match.pilgrim?.full_name || '—'}</ConfirmRow>
                    <ConfirmRow label="Passport on record">
                      <Identifier value={match.pilgrim?.passport_number ?? null} />
                    </ConfirmRow>
                    <ConfirmRow label="HajjERP record" className="sm:col-span-2">
                      <Identifier value={details.pilgrimId} />
                    </ConfirmRow>
                  </ConfirmSection>
                </Panel>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="secondary"
                    onClick={backToReview}
                    icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                  >
                    Return to review
                  </Button>
                  <Button
                    onClick={() => setConfirmDialog(true)}
                    loading={saving}
                    /* A visa is never saved without a confirmed HajjERP pilgrim. */
                    disabled={!reviewComplete || !details.pilgrimId}
                    icon={<Save className="h-4 w-4" aria-hidden="true" />}
                  >
                    Confirm and save visa record
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Case state — all four provenance stages are visible simultaneously */}
          <div className="space-y-5 xl:col-span-1">
            <Panel
              title="Case state"
              description="AI Extracted → Human Reviewed → Matched to HajjERP → Saved. These stages are never collapsed into one another."
            >
              <ProvenanceLadder provenance={caseProvenance} />
            </Panel>

            <ProcessingSummary
              details={details}
              file={file}
              geminiStatus={GEMINI_STATUS[gemini.state].label}
              geminiChip={GEMINI_STATUS[gemini.state].chip}
              currentStep={step}
              isReady={isReady}
              missingFields={missingFields}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog}
        title="Confirm and save visa record"
        confirmLabel="Confirm and save"
        loading={saving}
        onCancel={() => setConfirmDialog(false)}
        onConfirm={handleConfirmSave}
        message={
          <>
            This saves the reviewed visa information against{' '}
            <strong>{details.pilgrimName || 'the selected pilgrim'}</strong>. All{' '}
            {REQUIRED_VERIFICATION_KEYS.length} extracted fields have been explicitly verified, and the
            verification trail is recorded in the audit history. Journey arrival and departure statuses are not
            changed by this action.
          </>
        }
      />
    </div>
  );
}

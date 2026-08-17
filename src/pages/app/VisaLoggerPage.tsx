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
import {
  VisaExtractionError,
  extractVisaIdentity,
  persistVisaRecord,
  type VisaCaseSubmission,
} from '@/lib/visaExtraction';
import {
  VisaRecordError,
  clearFieldReview,
  confirmRecordReview,
  extractionFromRecord,
  linkPilgrim,
  reviewField,
  unlinkPilgrim,
} from '@/lib/visaContractRecords';
import type { VisaContractRecord } from '@/types/visaContract';
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
import { PendingReviewList } from '@/components/visa/PendingReviewList';
import { ProcessingSummary } from '@/components/visa/ProcessingSummary';
import { RecordStatusBar } from '@/components/visa/RecordStatusBar';
import { ViewerReadOnly } from '@/components/visa/ViewerReadOnly';
import { ProvenanceLadder, buildCaseProvenance } from '@/components/visa/ProvenanceLadder';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
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
} from '@/types/visa';
import type { SubAgent } from '@/types';
import { cn } from '@/lib/utils';

function emptyDetails(): VisaCaseDetails {
  return {
    pilgrimId: null,
    pilgrimName: '',
    passportNumber: '',
    clientSource: 'sub_agent',
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
    arrivalPort: '',
  };
}

/**
 * The operational half of the record, in the shape the server expects.
 *
 * Note what is not here: no user id. The Edge Function takes the actor from the
 * verified session, never from this payload.
 */
function toSubmission(details: VisaCaseDetails): VisaCaseSubmission {
  return {
    clientSource: details.clientSource,
    subAgentId: details.clientSource === 'direct' ? null : details.agentId,
    agentName:
      details.clientSource === 'direct'
        ? 'Inna Ataina (direct client)'
        : details.agentName || details.newAgent?.organisationName || '',
    assignedStaffId: details.assignedStaffId,
    visaCompany: details.visaCompany || null,
    plannedDepartureDate: details.plannedOutboundDate || null,
    expectedReturnDate: details.expectedReturnDate || null,
    makkahHotelId: details.makkahHotelIsCustom ? null : details.makkahHotelId,
    makkahHotelName: details.makkahHotelName || null,
    madinahHotelId: details.madinahHotelIsCustom ? null : details.madinahHotelId,
    madinahHotelName: details.madinahHotelName || null,
    transportPackage: details.transportPackage,
    transportSummary: transportPackageSummary(details.transportPackage) || null,
    arrivalPort: details.arrivalPort || null,
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

  /**
   * The liability record for this case.
   *
   * Created the moment a document is read or a manual case is started, and
   * updated in place from then on. `null` means no record exists yet, which is
   * the one state in which the officer must not be told responsibility tracking
   * has begun.
   */
  const [record, setRecord] = useState<VisaContractRecord | null>(null);
  /** Identifies the visa case, so a retried extraction cannot create a second record. */
  const [caseKey, setCaseKey] = useState<string>(() => crypto.randomUUID());
  /** Set when extraction succeeded but the database write did not. */
  const [persistFailed, setPersistFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

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

  /* An Existing Pilgrim is deliberately NOT required — not here, and not at
     any later point. The pilgrim is matched after the identity is reviewed,
     and a traveller who is not yet in HajjERP must never prevent the company
     from recording a visa it has issued. */
  if (details.clientSource === 'sub_agent') {
    if (!details.agentName && !details.agentIsProposed) {
      errors.agentId = 'Please select a responsible agent';
      missingFields.push('Responsible Agent');
    }
    if (details.agentIsProposed && details.newAgent && !details.newAgent.organisationName.trim()) {
      errors.agentId = 'Please enter the new agent name';
      missingFields.push('New Agent Name');
    }
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
  /**
   * An edit records the new value and clears any prior verification.
   *
   * If the record was already confirmed, it returns to Pending Review: a
   * confirmed record whose passport number has just changed is not confirmed
   * any more. This is a deliberate staff edit, quite distinct from a retried
   * extraction, which can never reach this path.
   */
  const handleFieldEdit = useCallback(
    async (key: ExtractedFieldKey, value: string) => {
      /* Optimistic locally so the badge clears the instant the value changes,
         then persisted — the database is what withdraws the review and returns
         a confirmed record to Pending Review. */
      setExtraction((prev) => ({ ...prev, [key]: editFieldValue(prev[key], value) }));
      if (!record) return;
      try {
        const updated = await clearFieldReview(record.id, key, value);
        setRecord(updated);
        setExtraction(extractionFromRecord(updated));
        await logAudit({
          action:
            record.record_status === 'REVIEWED_CONFIRMED'
              ? 'visa_contract_review_reopened'
              : 'visa_contract_field_review_withdrawn',
          recordType: 'visa_contract_record',
          recordId: updated.id,
          recordLabel: updated.traveller_name || updated.passport_number || 'Visa case',
          previousValue: {
            field: key,
            record_status: record.record_status,
            previously_reviewed_by: extraction[key].verifiedByName,
          },
          newValue: { field: key, reviewed: false, record_status: updated.record_status },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      } catch (e) {
        setAlert({
          tone: 'critical',
          message:
            e instanceof VisaRecordError
              ? `The correction could not be saved: ${e.message}`
              : 'The correction could not be saved. Check your connection and try again.',
        });
      }
    },
    [record, extraction, profile?.id, profile?.full_name],
  );

  /**
   * The only route to a reviewed field.
   *
   * The officer and the time are stamped by the database from the authenticated
   * session — this call says only which field, and which value is being attested
   * to. A browser cannot name a reviewer.
   */
  const handleFieldVerify = useCallback(
    async (key: ExtractedFieldKey) => {
      const value = (extraction[key].value ?? '').trim();
      if (!value) return;
      /* A review is a database fact. With no record there is nowhere to record
         it, and a badge that turned green anyway would assert something untrue —
         so the officer is told what has to happen first. */
      if (!record) {
        setAlert({
          tone: 'critical',
          message:
            'This Visa case is not yet saved to HajjERP, so reviews cannot be recorded. Retry saving first — the values you have entered are kept.',
        });
        return;
      }
      try {
        const updated = await reviewField(record.id, key, value);
        setRecord(updated);
        setExtraction(extractionFromRecord(updated));
        await logAudit({
          action: 'visa_contract_field_reviewed',
          recordType: 'visa_contract_record',
          recordId: updated.id,
          recordLabel: updated.traveller_name || updated.passport_number || 'Visa case',
          newValue: { field: key, reviewed: true },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      } catch (e) {
        setAlert({
          tone: 'critical',
          message:
            e instanceof VisaRecordError
              ? `The review could not be saved: ${e.message}`
              : 'The review could not be saved. Check your connection and try again.',
        });
      }
    },
    [record, extraction, profile?.id, profile?.full_name],
  );

  /** Withdraws a review without changing the value. */
  const handleFieldUnverify = useCallback(
    async (key: ExtractedFieldKey) => {
      setExtraction((prev) => ({ ...prev, [key]: unverifyField(prev[key]) }));
      if (!record) return;
      try {
        const updated = await clearFieldReview(record.id, key);
        setRecord(updated);
        setExtraction(extractionFromRecord(updated));
        await logAudit({
          action: 'visa_contract_field_review_withdrawn',
          recordType: 'visa_contract_record',
          recordId: updated.id,
          recordLabel: updated.traveller_name || updated.passport_number || 'Visa case',
          previousValue: { field: key, reviewed: true },
          newValue: { field: key, reviewed: false },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      } catch {
        setAlert({ tone: 'critical', message: 'The review could not be withdrawn. Try again.' });
      }
    },
    [record, profile?.id, profile?.full_name],
  );

  const goToUpload = useCallback(() => {
    if (!caseDetailsValid) {
      setAlert({ tone: 'warning', message: 'Complete the required case details before continuing.' });
      return;
    }
    setCompletedSteps((prev) => new Set(prev).add('case_details'));
    setStep('upload_visa');
    setAlert(null);
  }, [caseDetailsValid]);

  /**
   * Picks up a case a colleague already started.
   *
   * Everything is rebuilt from the record: the operational details, the identity
   * values, and which fields are already reviewed with by whom and when. No
   * second record is created — the case key comes from the record itself, so
   * even an accidental extraction would be idempotent — and Gemini is not
   * called, because the identity already exists.
   *
   * The source document is deliberately NOT restored: its bytes were never
   * stored. An officer who wants it for comparison can attach it again, locally,
   * from the review screen.
   */
  const continueReview = useCallback((existing: VisaContractRecord) => {
    setRecord(existing);
    setCaseKey(existing.client_case_key);
    setPersistFailed(false);
    setExtraction(extractionFromRecord(existing));
    setManualEntry(existing.entry_source === 'MANUAL');
    setFile(null);
    setDetails({
      ...emptyDetails(),
      clientSource: existing.client_source,
      agentId: existing.sub_agent_id,
      agentName: existing.agent_name_snapshot,
      assignedStaffId: existing.assigned_staff_id,
      visaCompany: existing.visa_company ?? '',
      makkahHotelId: existing.makkah_hotel_id,
      makkahHotelName: existing.makkah_hotel_name ?? '',
      madinahHotelId: existing.madinah_hotel_id,
      madinahHotelName: existing.madinah_hotel_name ?? '',
      transportPackage: (existing.transport_package as VisaCaseDetails['transportPackage']) ?? null,
      plannedOutboundDate: existing.planned_departure_date ?? '',
      expectedReturnDate: existing.expected_return_date ?? '',
      arrivalPort: existing.arrival_port ?? '',
      pilgrimId: existing.pilgrim_id,
    });
    setMatchPhase('idle');
    setCandidates([]);
    setMatchError(null);
    setMatch({ status: 'no_match', pilgrim: null, conflicts: [], alternatives: [] });
    setExtractionStatus('complete');
    setCompletedSteps(new Set(['case_details', 'upload_visa']));
    setStep('review_extraction');
    setSavedAt('');
    setAlert({
      tone: 'info',
      message:
        'Continuing an open visa case. Reviews already recorded by other staff are shown against each value.',
    });
  }, []);

  const goToCaseDetails = useCallback(() => {
    setStep('case_details');
    setAlert(null);
  }, []);

  /**
   * Reads the uploaded document through the server-side extraction function.
   *
   * What comes back is a proposal, never a decision: every value lands in the
   * review screen unverified, and `confidence` is carried through so a shaky
   * read is visible rather than silently equal to a clear one. A value the
   * document did not yield arrives as `null` and stays blank — nothing is
   * invented to fill a gap.
   */
  const handleExtract = useCallback(async () => {
    if (!file) {
      setAlert({ tone: 'warning', message: 'Upload a visa document before starting extraction.' });
      return;
    }

    setAlert(null);
    setExtractionStatus('securing');

    try {
      /* Staged only so the officer sees the request is alive. The stages are
         honest about what is happening — matching is NOT one of them, because
         matching happens after this identity has been reviewed. */
      setExtractionStatus('uploading');
      const result = await extractVisaIdentity(file, caseKey, toSubmission(details));
      setExtractionStatus('extracting');

      const extractedAt = result.extractedAt || new Date().toISOString();
      const field = (source: { value: string | null; confidence: 'high' | 'medium' | 'low' }) => ({
        ...emptyExtractedField(),
        value: source.value,
        originalValue: source.value,
        confidence: source.value === null ? null : source.confidence,
        /* Anything short of a confident read is flagged for a closer look. A
           null value needs review by definition — it has to be typed. */
        needsReview: source.value === null || source.confidence !== 'high',
      });

      setExtractionStatus('preparing_review');
      setManualEntry(false);
      setExtraction({
        passengerName: field(result.fields.travellerName),
        passportNumber: field(result.fields.passportNumber),
        visaNumber: field(result.fields.visaNumber),
        nationality: field(result.fields.nationality),
        extractedAt,
      });

      /* Matching is not attempted here. It runs from the reviewed passport
         number, after the officer has confirmed what the document says. */
      setMatchPhase('idle');
      setCandidates([]);
      setExtractionStatus('complete');
      setCompletedSteps((prev) => new Set(prev).add('upload_visa'));
      setStep('review_extraction');

      /* The liability record. A null one is not a detail to gloss over: the
         extraction is usable, but nothing has been recorded, so the officer is
         told plainly rather than left to assume the case is safe. */
      setRecord(result.record);
      setPersistFailed(result.record === null);

      /* The creation audit entry is written server-side, where the actor comes
         from the verified JWT rather than from this browser — and where an
         idempotent hit writes nothing at all. */

      const unread = Object.values(result.fields).filter((f) => f.value === null).length;

      setAlert(
        result.record === null
          ? {
              tone: 'critical',
              message:
                'This Visa case is not yet saved to HajjERP. Retry saving — the extracted values are kept and the document will not be read again.',
            }
          : {
              tone: unread > 0 ? 'warning' : 'info',
              message:
                unread > 0
                  ? `Document extracted, but ${unread} of 4 values could not be read. Type those in from the document, then review every value against it.`
                  : 'Document extracted. Nothing is reviewed yet — check each value against the document and mark it individually.',
            },
      );
    } catch (e) {
      setExtractionStatus('error');
      setAlert({
        tone: e instanceof VisaExtractionError && e.code === 'provider_quota' ? 'warning' : 'critical',
        message:
          e instanceof VisaExtractionError
            ? e.message
            : 'AI extraction could not be completed. Enter the Visa details manually or try again.',
      });
    }
  }, [file, caseKey, details]);

  /**
   * Writes the record for a case whose extraction succeeded but whose first
   * database write failed.
   *
   * Deliberately does NOT call Gemini again. The values already read are sent
   * straight to the database, so a paid read is not spent twice and the officer
   * does not lose corrections made while the warning was showing.
   */
  const retryPersist = useCallback(async () => {
    if (!file) return;
    setRetrying(true);
    try {
      const saved = await persistVisaRecord({
        caseKey,
        details: toSubmission(details),
        entrySource: 'GEMINI',
        fields: {
          travellerName: {
            value: extraction.passengerName.originalValue,
            confidence: extraction.passengerName.confidence ?? 'low',
          },
          passportNumber: {
            value: extraction.passportNumber.originalValue,
            confidence: extraction.passportNumber.confidence ?? 'low',
          },
          visaNumber: {
            value: extraction.visaNumber.originalValue,
            confidence: extraction.visaNumber.confidence ?? 'low',
          },
          nationality: {
            value: extraction.nationality.originalValue,
            confidence: extraction.nationality.confidence ?? 'low',
          },
        },
        extractedAt: extraction.extractedAt,
        sourceFilename: file.name,
        sourceMimeType: file.type,
      });
      setRecord(saved.record);
      setPersistFailed(false);
      /* Audited server-side, once, on the insert that actually happened. */
      setAlert({ tone: 'success', message: 'Visa case saved to HajjERP.' });
    } catch (e) {
      setAlert({
        tone: 'critical',
        message:
          e instanceof VisaExtractionError
            ? e.message
            : 'This Visa case is not yet saved to HajjERP. Retry saving.',
      });
    } finally {
      setRetrying(false);
    }
  }, [file, caseKey, details, extraction]);

  /**
   * Manual-entry path — used whenever extraction is unavailable or refused.
   *
   * The record is created here too, so a case typed by hand carries the same
   * liability weight as an extracted one. It is recorded as MANUAL, never
   * dressed up as a document extraction.
   */
  const startManualEntry = useCallback(async () => {
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

    try {
      const saved = await persistVisaRecord({
        caseKey,
        details: toSubmission(details),
        entrySource: 'MANUAL',
        sourceFilename: file?.name ?? null,
        sourceMimeType: file?.type ?? null,
      });
      setRecord(saved.record);
      setPersistFailed(false);
      setAlert({
        tone: 'info',
        message:
          'Manual entry. The Visa case is recorded — type each value from the document, then review it explicitly.',
      });
    } catch (e) {
      setPersistFailed(true);
      setAlert({
        tone: 'critical',
        message:
          e instanceof VisaExtractionError
            ? e.message
            : 'This Visa case is not yet saved to HajjERP. Retry saving.',
      });
    }
  }, [caseKey, details, file]);

  /** Retry for a manual case whose first write failed. No document is involved. */
  const retryManualPersist = useCallback(async () => {
    setRetrying(true);
    try {
      const saved = await persistVisaRecord({
        caseKey,
        details: toSubmission(details),
        entrySource: 'MANUAL',
        sourceFilename: file?.name ?? null,
        sourceMimeType: file?.type ?? null,
      });
      setRecord(saved.record);
      setPersistFailed(false);
      setAlert({ tone: 'success', message: 'Visa case saved to HajjERP.' });
    } catch (e) {
      setAlert({
        tone: 'critical',
        message:
          e instanceof VisaExtractionError
            ? e.message
            : 'This Visa case is not yet saved to HajjERP. Retry saving.',
      });
    } finally {
      setRetrying(false);
    }
  }, [caseKey, details, file]);

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
   * Records the officer's explicit choice of pilgrim.
   *
   * Linking is optional and never blocks anything. The reviewed visa identity is
   * NOT overwritten by the matched pilgrim — what the visa says and what the
   * pilgrim record says are separate facts, and quietly replacing one with the
   * other would hide exactly the discrepancy an officer needs to see.
   */
  const confirmPilgrimMatch = useCallback(
    async (candidate: MatchCandidate) => {
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

      if (!record || !profile?.id) return;
      try {
        setRecord(await linkPilgrim(record.id, candidate.id, profile.id));
        await logAudit({
          action: 'visa_contract_pilgrim_linked',
          recordType: 'visa_contract_record',
          recordId: record.id,
          recordLabel: candidate.full_name,
          previousValue: {
            pilgrim_id: record.pilgrim_id,
            pilgrim_match_status: record.pilgrim_match_status,
          },
          newValue: {
            pilgrim_id: candidate.id,
            pilgrim_match_status: 'MATCHED',
            matched_on_passport: candidate.passport_number,
          },
          performedBy: profile.id,
          performedByName: profile.full_name ?? '',
        });
      } catch (e) {
        setAlert({
          tone: 'critical',
          message:
            e instanceof VisaRecordError
              ? `The pilgrim link could not be saved: ${e.message}`
              : 'The pilgrim link could not be saved. Try again.',
        });
      }
    },
    [record, profile?.id, profile?.full_name],
  );

  /** Unlinks so a different pilgrim can be chosen. No pilgrim is ever deleted. */
  const clearPilgrimMatch = useCallback(async () => {
    setDetails((prev) => ({ ...prev, pilgrimId: null, pilgrimName: '' }));
    setMatch({ status: 'no_match', pilgrim: null, conflicts: [], alternatives: [] });
    setMatchPhase('idle');
    setCandidates([]);
    setMatchError(null);

    if (!record || !profile?.id || record.pilgrim_match_status !== 'MATCHED') return;
    try {
      const updated = await unlinkPilgrim(record.id, profile.id);
      setRecord(updated);
      await logAudit({
        action: 'visa_contract_pilgrim_unlinked',
        recordType: 'visa_contract_record',
        recordId: updated.id,
        recordLabel: updated.traveller_name || updated.passport_number || 'Visa case',
        previousValue: { pilgrim_id: record.pilgrim_id, pilgrim_match_status: 'MATCHED' },
        newValue: { pilgrim_id: null, pilgrim_match_status: 'PENDING_PILGRIM_MATCH' },
        performedBy: profile.id,
        performedByName: profile.full_name ?? '',
      });
    } catch {
      setAlert({
        tone: 'critical',
        message: 'The pilgrim link could not be removed. Try again.',
      });
    }
  }, [record, profile?.id, profile?.full_name]);

  /**
   * Advances to confirmation.
   *
   * A missing pilgrim link deliberately does NOT block this. Inna Ataina issued
   * the visa and carries the exposure whether or not the traveller has been
   * entered into Pilgrims yet, so the record must be completable regardless.
   * What does block is an unreviewed identity, and a case with no database row
   * behind it — confirming a record that does not exist would assert that
   * responsibility tracking had begun when it had not.
   */
  const goToConfirm = useCallback(() => {
    if (!reviewComplete) {
      setAlert({
        tone: 'warning',
        message: 'Every identity field must be explicitly reviewed before this case can continue.',
      });
      return;
    }
    if (!record) {
      setAlert({
        tone: 'critical',
        message: 'This Visa case is not yet saved to HajjERP. Retry saving before confirming it.',
      });
      return;
    }
    setCompletedSteps((prev) => new Set(prev).add('review_extraction'));
    setStep('confirm_save');
    setAlert(null);
  }, [reviewComplete, record]);

  const backToReview = useCallback(() => setStep('review_extraction'), []);

  // ── Save ───────────────────────────────────────────────────────────
  const handleConfirmSave = useCallback(async () => {
    /* A pilgrim link is NOT required. The record stands on its own — see
       `goToConfirm`. What is required is a reviewed identity and a real row to
       confirm. */
    if (!record) {
      setAlert({
        tone: 'critical',
        message: 'This Visa case is not yet saved to HajjERP. Retry saving before confirming it.',
      });
      return;
    }
    if (!allRequiredVerified(extraction)) {
      setAlert({ tone: 'warning', message: 'Every extracted field must be verified before saving.' });
      return;
    }
    if (!profile?.id) {
      setAlert({ tone: 'critical', message: 'Your session has expired. Sign in again.' });
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

      /* Custom hotels are still promoted into `hotel_references` here, exactly
         as before. The transport summary and hotel names themselves now travel
         with the record at creation time, not at save time. */
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


      /* The confirmation UPDATEs the record created at extraction. It never
         inserts: one visa case is one liability record, and a second would
         double-count the company's exposure.

         The visa contract is NOT written into `pilgrims` any more. The register
         is its own system of record; controlled synchronisation of approved
         fields into the pilgrim operational record is a later milestone. */
      const confirmed = await confirmRecordReview(record, profile.id);
      setRecord(confirmed);

      /* The verification trail travels with the audit entry too, so who reviewed
         which value — and when — is recoverable after the fact. */
      await logAudit({
        action: 'visa_contract_review_confirmed',
        recordType: 'visa_contract_record',
        recordId: confirmed.id,
        recordLabel: confirmed.traveller_name || confirmed.passport_number || 'Visa case',
        previousValue: { record_status: 'PENDING_REVIEW' },
        newValue: {
          record_status: 'REVIEWED_CONFIRMED',
          entry_source: confirmed.entry_source,
          pilgrim_match_status: confirmed.pilgrim_match_status,
          client_source: confirmed.client_source,
          verified_fields: REQUIRED_VERIFICATION_KEYS.map((key) => ({
            field: key,
            value: extraction[key].value,
            edited: extraction[key].edited,
            verified_by: extraction[key].verifiedByName,
            verified_at: extraction[key].verifiedAt,
          })),
        },
        performedBy: profile.id,
        performedByName: profile.full_name ?? '',
      });

      setSavedAt(new Date().toISOString());
      setCompletedSteps((prev) => new Set(prev).add('confirm_save'));
      setStep('confirm_save');
      setAlert({
        tone: 'success',
        message:
          confirmed.pilgrim_match_status === 'MATCHED'
            ? 'Visa & Contract record confirmed and linked to the pilgrim.'
            : 'Visa & Contract record confirmed. It remains Pending Pilgrim Match, which does not affect the record.',
      });
    } catch (e) {
      console.error('Save failed:', e);
      setAlert({
        tone: 'critical',
        message:
          e instanceof VisaRecordError
            ? `The visa record could not be confirmed: ${e.message}`
            : 'The visa record could not be confirmed. Check your connection and try again.',
      });
    } finally {
      setSaving(false);
    }
  }, [record, details, extraction, profile, isAdminOrHigher]);

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
    /* A new case gets a new key and no record. Reusing either would make the
       next visa idempotent against the last one and silently return it. */
    setRecord(null);
    setPersistFailed(false);
    setCaseKey(crypto.randomUUID());
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
          </div>
        }
      />

      <div className="mb-5 rounded-lg border border-slate-300 bg-white px-4 py-3">
        <WorkflowStepper currentStep={step} completedSteps={completedSteps} />
      </div>

      {/* The record's live state, above everything it describes. Persistent:
          an officer must be able to tell at any moment whether HajjERP is
          actually holding this case. */}
      {(record || persistFailed) && (
        <div className="mb-4">
          <RecordStatusBar
            record={record}
            persistFailed={persistFailed}
            retrying={retrying}
            onRetry={manualEntry && !file ? retryManualPersist : retryPersist}
          />
        </div>
      )}

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
                {/* Continue an open case rather than starting a duplicate. */}
                <PendingReviewList onContinue={continueReview} />
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

                {/* The reason is already stated in the banner above; this only
                    makes the two ways forward obvious next to the buttons. */}
                {extractionStatus === 'error' && (
                  <Alert tone="critical" title="Extraction failed">
                    Nothing has been lost. Retry the extraction, or enter every value by hand and review each
                    one against the document.
                  </Alert>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-600">
                    {isProcessing
                      ? EXTRACTION_STATUS_MESSAGES[extractionStatus]
                      : file
                        ? 'Reading the document proposes values. Every one still has to be reviewed against it.'
                        : 'Upload the issued visa to read it, or enter the details by hand.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Manual entry sits beside extraction at every moment, not
                        behind a failure. A record can always be completed. */}
                    <Button
                      variant="secondary"
                      onClick={startManualEntry}
                      disabled={isProcessing || !file}
                      icon={<PenLine className="h-4 w-4" aria-hidden="true" />}
                    >
                      Enter details manually
                    </Button>
                    <Button
                      onClick={handleExtract}
                      loading={isProcessing}
                      disabled={!isReady}
                      icon={<FileScan className="h-4 w-4" aria-hidden="true" />}
                    >
                      Extract visa information
                    </Button>
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
                  documentName={file?.name ?? record?.source_filename ?? null}
                  /* Local comparison only — no upload, no extraction, no write. */
                  onAttachDocument={(attached) => {
                    setFile(attached);
                    setUploadError(null);
                  }}
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

                  {/* ── Pilgrim link — optional, and shown as such ── */}
                  <ConfirmSection
                    title="Pilgrim link"
                    provenance={details.pilgrimId ? 'Matched' : 'Pending'}
                  >
                    {details.pilgrimId ? (
                      <>
                        <ConfirmRow label="Pilgrim name">
                          {match.pilgrim?.full_name || '—'}
                        </ConfirmRow>
                        <ConfirmRow label="Passport on record">
                          <Identifier value={match.pilgrim?.passport_number ?? null} />
                        </ConfirmRow>
                        <ConfirmRow label="HajjERP pilgrim" className="sm:col-span-2">
                          <Identifier value={details.pilgrimId} />
                        </ConfirmRow>
                      </>
                    ) : (
                      <ConfirmRow label="Status" className="sm:col-span-2">
                        <span className="text-amber-800">Pending Pilgrim Match</span>
                        <span className="mt-0.5 block text-xs font-normal text-slate-600">
                          The traveller is not yet in Pilgrims. The visa record is still complete —
                          Inna Ataina issued the visa and carries responsibility for it either way.
                          It can be linked later.
                        </span>
                      </ConfirmRow>
                    )}
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
                    /* A pilgrim link is deliberately NOT required. What is
                       required is a reviewed identity and a real record to
                       confirm — confirming a case with no row behind it would
                       claim responsibility tracking had begun when it had not. */
                    disabled={!reviewComplete || !record}
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
              description="Extracted → Reviewed → Matched to HajjERP → Recorded. These stages are never collapsed into one another, and the pilgrim link is optional."
            >
              <ProvenanceLadder provenance={caseProvenance} />
            </Panel>

            <ProcessingSummary
              details={details}
              file={file}
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

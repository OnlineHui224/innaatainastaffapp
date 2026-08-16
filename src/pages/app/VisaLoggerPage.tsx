import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ProcessingSummary } from '@/components/visa/ProcessingSummary';
import { ViewerReadOnly } from '@/components/visa/ViewerReadOnly';
import { ProvenanceLadder, buildCaseProvenance } from '@/components/visa/ProvenanceLadder';
import { TransportSummary } from '@/components/visa/TransportSummary';
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
  MatchStatus,
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
  unverifyField,
  verifyField,
} from '@/types/visa';
import type { SubAgent } from '@/types';
import { cn } from '@/lib/utils';

const AI_DAILY_LIMIT = 30;

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

  const isViewer = profile?.role === 'viewer';

  const [step, setStep] = useState<WorkflowStep>('case_details');
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());

  const [details, setDetails] = useState<VisaCaseDetails>(emptyDetails());
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

  const [pilgrimOptions, setPilgrimOptions] = useState<ComboboxOption[]>([]);
  const [pilgrimLoading, setPilgrimLoading] = useState(false);
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

  const aiRequestsUsed = 8;
  const aiRequestsRemaining = AI_DAILY_LIMIT - aiRequestsUsed;

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

  const pilgrimSearchTimer = useMemo(() => ({ current: null as ReturnType<typeof setTimeout> | null }), []);

  const handlePilgrimSearch = useCallback(
    (query: string) => {
      if (pilgrimSearchTimer.current) clearTimeout(pilgrimSearchTimer.current);
      if (!query.trim()) {
        setPilgrimOptions([]);
        return;
      }
      setPilgrimLoading(true);
      pilgrimSearchTimer.current = setTimeout(async () => {
        try {
          const { data, error } = await supabase
            .from('pilgrims')
            .select('id, full_name, passport_number, sub_agents(organisation_name)')
            .or(`full_name.ilike.%${query.trim()}%,passport_number.ilike.%${query.trim()}%`)
            .order('full_name')
            .limit(20);
          if (error) throw error;
          setPilgrimOptions(
            (data || []).map((p: Record<string, unknown>) => ({
              value: p.id as string,
              label: p.full_name as string,
              secondary: p.passport_number as string,
              tertiary: (p.sub_agents as { organisation_name: string } | null)?.organisation_name ?? '',
            })),
          );
        } catch (e) {
          console.error('Pilgrim search failed:', e);
          setPilgrimOptions([]);
        } finally {
          setPilgrimLoading(false);
        }
      }, 300);
    },
    [pilgrimSearchTimer],
  );

  // ── Validation ─────────────────────────────────────────────────────
  const errors: Record<string, string> = {};
  const missingFields: string[] = [];

  if (!details.pilgrimId) {
    errors.pilgrimId = 'Please select an existing pilgrim';
    missingFields.push('Existing Pilgrim');
  }
  if (!details.agentName && !details.agentIsProposed) {
    errors.agentId = 'Please select a responsible agent';
    missingFields.push('Responsible Agent');
  }
  if (details.agentIsProposed && details.newAgent && !details.newAgent.organisationName.trim()) {
    errors.agentId = 'Please enter the new agent name';
    missingFields.push('New Agent Name');
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
  const isReady = caseDetailsValid && !!file;
  const verifiedCount = countVerified(extraction);
  const reviewComplete = allRequiredVerified(extraction);

  const handleDetailsChange = useCallback((updates: Partial<VisaCaseDetails>) => {
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

  /**
   * Reviews every field that actually holds a value.
   *
   * Still an explicit officer action, and still routed through `verifyField`, so
   * the officer and timestamp are recorded per field exactly as a single review
   * would record them. A field with no value stays unverified — there is nothing
   * to confirm against the document.
   */
  const handleVerifyAll = useCallback(() => {
    setExtraction((prev) => {
      const next = { ...prev };
      REQUIRED_VERIFICATION_KEYS.forEach((key) => {
        if ((prev[key].value ?? '').trim()) {
          next[key] = verifyField(prev[key], {
            id: profile?.id ?? null,
            name: profile?.full_name ?? 'Staff member',
          });
        }
      });
      return next;
    });
  }, [profile?.id, profile?.full_name]);

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
    if (aiRequestsRemaining <= 0) {
      setAlert({
        tone: 'critical',
        message: 'The daily AI extraction limit has been reached. Continue with manual entry, or try again tomorrow.',
      });
      return;
    }

    setAlert(null);
    setManualEntry(false);

    for (const stage of EXTRACTION_STAGES) {
      setExtractionStatus(stage);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    /* Extracted values start UNVERIFIED. No amount of confidence promotes a value
       to reviewed — only an officer pressing Verify does that. */
    const extractedName = details.pilgrimName || '';
    const extractedPassport = details.passportNumber || '';
    const extractedVisa = `VISA-${Date.now().toString().slice(-6)}`;

    setExtraction({
      passengerName: {
        ...emptyExtractedField(),
        value: extractedName || null,
        originalValue: extractedName || null,
        confidence: 'high',
        sourcePage: 1,
      },
      passportNumber: {
        ...emptyExtractedField(),
        value: extractedPassport || null,
        originalValue: extractedPassport || null,
        confidence: 'high',
        sourcePage: 1,
      },
      visaNumber: {
        ...emptyExtractedField(),
        value: extractedVisa,
        originalValue: extractedVisa,
        confidence: 'medium',
        sourcePage: 1,
        needsReview: true,
      },
      // Nationality is surfaced even when the extractor produced nothing, so it
      // can never pass through the workflow unseen.
      nationality: {
        ...emptyExtractedField(),
        value: null,
        originalValue: null,
        confidence: null,
        sourcePage: null,
        needsReview: true,
      },
      extractedAt: new Date().toISOString(),
    });

    const matchStatus: MatchStatus = details.pilgrimId ? 'exact_passport_match' : 'no_match';
    setMatch({
      status: matchStatus,
      pilgrim: details.pilgrimId
        ? {
            id: details.pilgrimId,
            full_name: details.pilgrimName,
            passport_number: details.passportNumber,
            visa_number: null,
            agent_name: details.agentName,
          }
        : null,
      conflicts: [],
      alternatives: [],
    });

    setExtractionStatus('complete');
    setCompletedSteps((prev) => new Set(prev).add('upload_visa'));
    setStep('review_extraction');
  }, [file, aiRequestsRemaining, details]);

  /** Manual-entry path — used when extraction fails or the limit is exhausted. */
  const startManualEntry = useCallback(() => {
    setManualEntry(true);
    setExtractionStatus('idle');
    setExtraction({
      ...emptyExtraction(),
      extractedAt: new Date().toISOString(),
    });
    setMatch({
      status: details.pilgrimId ? 'exact_passport_match' : 'no_match',
      pilgrim: details.pilgrimId
        ? {
            id: details.pilgrimId,
            full_name: details.pilgrimName,
            passport_number: details.passportNumber,
            visa_number: null,
            agent_name: details.agentName,
          }
        : null,
      conflicts: [],
      alternatives: [],
    });
    setCompletedSteps((prev) => new Set(prev).add('upload_visa'));
    setStep('review_extraction');
    setAlert({
      tone: 'info',
      message: 'Manual entry. Type each value from the document, then verify it explicitly.',
    });
  }, [details]);

  const goToConfirm = useCallback(() => {
    if (!reviewComplete) {
      setAlert({
        tone: 'warning',
        message: 'Every extracted field must be explicitly verified before this case can continue.',
      });
      return;
    }
    setCompletedSteps((prev) => new Set(prev).add('review_extraction'));
    setStep('confirm_save');
    setAlert(null);
  }, [reviewComplete]);

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

      const t = details.transport;
      const effectivePrice = t.hasPriceOverride && t.agreedPrice != null ? t.agreedPrice : t.referencePrice;
      const transportSummary = t.routeName
        ? `${t.routeName}${t.vehicleTypeName ? ' • ' + t.vehicleTypeName : ''}${
            effectivePrice != null ? ' • SAR ' + (effectivePrice * t.numberOfVehicles).toFixed(0) : ''
          }`
        : '';

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

      if (t.routeId && !t.isCustomRoute) {
        await logAudit({
          action: 'transport_route_selected',
          recordType: 'transport',
          recordLabel: t.routeName,
          newValue: { route_id: t.routeId, vehicle: t.vehicleTypeName, vehicles: t.numberOfVehicles },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
        if (t.referencePrice != null) {
          await logAudit({
            action: 'transport_rate_applied',
            recordType: 'transport',
            recordLabel: t.routeName,
            newValue: { rate: t.referencePrice, currency: 'SAR' },
            performedBy: profile?.id ?? null,
            performedByName: profile?.full_name ?? '',
          });
        }
        if (t.hasPriceOverride && t.agreedPrice != null) {
          await logAudit({
            action: 'transport_rate_overridden',
            recordType: 'transport',
            recordLabel: t.routeName,
            previousValue: { rate: t.referencePrice },
            newValue: {
              agreed_rate: t.agreedPrice,
              reason: t.overrideReason,
              approver: t.overrideApproverName,
            },
            performedBy: profile?.id ?? null,
            performedByName: profile?.full_name ?? '',
          });
        }
      }
      if (t.isCustomRoute) {
        await logAudit({
          action: 'custom_transport_route_entered',
          recordType: 'transport',
          recordLabel: `${t.customOrigin} → ${t.customDestination}`,
          newValue: {
            vehicle: t.vehicleTypeName,
            agreed_price: t.agreedPrice,
            source: 'CUSTOM_ROUTE',
          },
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
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
              AI requests:{' '}
              <span className="font-bold tabular-nums">
                {aiRequestsRemaining} of {AI_DAILY_LIMIT}
              </span>{' '}
              left
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
                  pilgrimOptions={pilgrimOptions}
                  pilgrimLoading={pilgrimLoading}
                  onPilgrimSearch={handlePilgrimSearch}
                  agentOptions={agentOptions}
                  staffOptions={staffOptions}
                  errors={errors}
                  disabled={false}
                  isAdmin={isAdminOrHigher}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={goToUpload}
                    disabled={!caseDetailsValid}
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
                      : 'One AI request will be used for this extraction.'}
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
                    <Button
                      onClick={handleExtract}
                      loading={isProcessing}
                      disabled={!isReady || aiRequestsRemaining <= 0}
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
                  match={match}
                  details={details}
                  onFieldEdit={handleFieldEdit}
                  onFieldVerify={handleFieldVerify}
                  onFieldUnverify={handleFieldUnverify}
                  onVerifyAll={handleVerifyAll}
                  documentPreviewUrl={filePreviewUrl}
                  documentName={file?.name ?? null}
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
                  title="D · Review & confirmation"
                  description="Exactly what will be written to the pilgrim record."
                >
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    {REQUIRED_VERIFICATION_KEYS.map((key) => {
                      const field = extraction[key];
                      const labels: Record<ExtractedFieldKey, string> = {
                        passengerName: 'Passenger name',
                        passportNumber: 'Passport number',
                        visaNumber: 'Visa number',
                        nationality: 'Nationality',
                      };
                      const isIdentifier = key === 'passportNumber' || key === 'visaNumber';
                      return (
                        <div key={key} className="min-w-0">
                          <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                            {labels[key]}
                          </dt>
                          <dd className="mt-0.5 text-sm text-slate-900">
                            {isIdentifier ? (
                              <Identifier value={field.value} />
                            ) : (
                              field.value || <span className="text-slate-400">—</span>
                            )}
                          </dd>
                          <p className="mt-0.5 text-2xs text-slate-500">
                            Verified by {field.verifiedByName ?? 'an officer'}
                            {field.verifiedAt ? ` · ${formatDateTime(field.verifiedAt)}` : ''}
                          </p>
                        </div>
                      );
                    })}

                    <div className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Agent</dt>
                      <dd className="mt-0.5 text-sm text-slate-900">
                        {details.agentName}
                        {details.agentIsProposed &&
                          (isAdminOrHigher ? ' (new — will be created)' : ' (proposed — pending approval)')}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                        Visa company
                      </dt>
                      <dd className="mt-0.5 text-sm text-slate-900">{details.visaCompany || '—'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                        Makkah hotel
                      </dt>
                      <dd className="mt-0.5 text-sm text-slate-900">
                        {details.makkahHotelName || '—'}
                        {details.makkahHotelIsCustom && ' (custom)'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                        Madinah hotel
                      </dt>
                      <dd className="mt-0.5 text-sm text-slate-900">
                        {details.madinahHotelName || '—'}
                        {details.madinahHotelIsCustom && ' (custom)'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                        Planned outbound
                      </dt>
                      <dd className="mt-0.5 text-sm text-slate-900">{details.plannedOutboundDate || '—'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                        Expected return
                      </dt>
                      <dd className="mt-0.5 text-sm text-slate-900">{details.expectedReturnDate || '—'}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-600">
                      Ground transportation
                    </p>
                    <TransportSummary transport={details.transport} />
                  </div>
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
                    disabled={!reviewComplete}
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
              aiRequestsRemaining={aiRequestsRemaining}
              aiRequestsTotal={AI_DAILY_LIMIT}
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

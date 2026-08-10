import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileScan,
  ChevronRight,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Save,
  AlertCircle,
  Info,
  XCircle,
  Bus,
  Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { WorkflowStepper } from '@/components/visa/WorkflowStepper';
import { CaseDetailsCard } from '@/components/visa/CaseDetailsCard';
import { UploadVisaCard } from '@/components/visa/UploadVisaCard';
import { ReviewScreen } from '@/components/visa/ReviewScreen';
import { SuccessScreen } from '@/components/visa/SuccessScreen';
import { ProcessingSummary } from '@/components/visa/ProcessingSummary';
import { ViewerReadOnly } from '@/components/visa/ViewerReadOnly';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ComboboxOption } from '@/components/visa/SearchableCombobox';
import type {
  VisaCaseDetails,
  VisaExtractionResult,
  PilgrimMatchResult,
  WorkflowStep,
  ExtractionStatus,
  MatchStatus,
} from '@/types/visa';
import {
  EXTRACTION_STATUS_MESSAGES,
  emptyTransportSelection,
} from '@/types/visa';
import type { SubAgent } from '@/types';

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
    passengerName: { value: null, confidence: null, sourcePage: null, needsReview: false },
    passportNumber: { value: null, confidence: null, sourcePage: null, needsReview: false },
    visaNumber: { value: null, confidence: null, sourcePage: null, needsReview: false },
    nationality: { value: null, confidence: null, sourcePage: null, needsReview: false },
    extractedAt: '',
  };
}

type AlertType = 'info' | 'warning' | 'error' | 'success';

interface AlertState {
  type: AlertType;
  message: string;
}

function AlertBanner({ alert, onDismiss }: { alert: AlertState; onDismiss: () => void }) {
  const styles: Record<AlertType, { bg: string; border: string; icon: typeof Info; iconColor: string; textColor: string }> = {
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Info, iconColor: 'text-blue-600', textColor: 'text-blue-800' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle, iconColor: 'text-amber-600', textColor: 'text-amber-800' },
    error: { bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, iconColor: 'text-red-600', textColor: 'text-red-800' },
    success: { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle2, iconColor: 'text-green-600', textColor: 'text-green-800' },
  };
  const s = styles[alert.type];
  const Icon = s.icon;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border ${s.bg} ${s.border} px-4 py-3 animate-fade-in`}>
      <Icon className={`h-4 w-4 ${s.iconColor} shrink-0 mt-0.5`} />
      <p className={`text-sm ${s.textColor} flex-1`}>{alert.message}</p>
      <button onClick={onDismiss} className={`shrink-0 ${s.iconColor} hover:opacity-70`}>
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function VisaLoggerPage() {
  const navigate = useNavigate();
  const { profile, isAdminOrHigher } = useAuth();

  const isViewer = profile?.role === 'viewer';

  const [step, setStep] = useState<WorkflowStep>('case_details');
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());

  const [details, setDetails] = useState<VisaCaseDetails>(emptyDetails());
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<VisaExtractionResult>(emptyExtraction());
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
  const [alert, setAlert] = useState<AlertState | null>(null);
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

  const pilgrimSearchTimer = useMemo(
    () => ({ current: null as ReturnType<typeof setTimeout> | null }),
    [],
  );

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

  // Validation
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

  const handleDetailsChange = useCallback((updates: Partial<VisaCaseDetails>) => {
    setDetails((prev) => ({ ...prev, ...updates }));
  }, []);

  const goToUpload = useCallback(() => {
    if (!caseDetailsValid) {
      setAlert({ type: 'warning', message: 'Please complete the required fields before proceeding.' });
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
      setAlert({ type: 'warning', message: 'Please upload a visa document before extraction.' });
      return;
    }
    if (aiRequestsRemaining <= 0) {
      setAlert({ type: 'error', message: 'Your daily AI extraction limit has been reached. Please try again tomorrow.' });
      return;
    }

    setAlert(null);
    const steps: ExtractionStatus[] = [
      'securing',
      'uploading',
      'extracting',
      'matching',
      'checking_duplicates',
      'preparing_review',
    ];

    for (const s of steps) {
      setExtractionStatus(s);
      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 600));
    }

    const simulatedExtraction: VisaExtractionResult = {
      passengerName: {
        value: details.pilgrimName || 'Extracted Passenger Name',
        confidence: 'high',
        sourcePage: 1,
        needsReview: false,
      },
      passportNumber: {
        value: details.passportNumber || 'EXTRACTED12345',
        confidence: 'high',
        sourcePage: 1,
        needsReview: false,
      },
      visaNumber: {
        value: `VISA-${Date.now().toString().slice(-6)}`,
        confidence: 'medium',
        sourcePage: 1,
        needsReview: true,
      },
      nationality: {
        value: null,
        confidence: null,
        sourcePage: null,
        needsReview: false,
      },
      extractedAt: new Date().toISOString(),
    };

    const matchStatus: MatchStatus = details.pilgrimId
      ? 'exact_passport_match'
      : 'no_match';

    const simulatedMatch: PilgrimMatchResult = {
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
    };

    setExtraction(simulatedExtraction);
    setMatch(simulatedMatch);
    setExtractionStatus('complete');
    setCompletedSteps((prev) => new Set(prev).add('upload_visa'));
    setStep('review_extraction');
  }, [file, aiRequestsRemaining, details]);

  const handleExtractionChange = useCallback((updates: Partial<VisaExtractionResult>) => {
    setExtraction((prev) => ({ ...prev, ...updates }));
  }, []);

  const goToConfirm = useCallback(() => {
    setCompletedSteps((prev) => new Set(prev).add('review_extraction'));
    setStep('confirm_save');
    setAlert(null);
  }, []);

  const backToReview = useCallback(() => {
    setStep('review_extraction');
  }, []);

  // Save
  const handleConfirmSave = useCallback(async () => {
    if (!details.pilgrimId) {
      setAlert({ type: 'error', message: 'No pilgrim selected. Please go back and select a pilgrim.' });
      return;
    }

    setSaving(true);
    setConfirmDialog(false);

    try {
      // If admin + new agent, create permanent agent
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
        // Non-admin: save as proposed agent
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

      // Build transport summary string
      const t = details.transport;
      const effectivePrice = t.hasPriceOverride && t.agreedPrice != null ? t.agreedPrice : t.referencePrice;
      const transportSummary = t.routeName
        ? `${t.routeName}${t.vehicleTypeName ? ' • ' + t.vehicleTypeName : ''}${effectivePrice != null ? ' • SAR ' + (effectivePrice * t.numberOfVehicles).toFixed(0) : ''}`
        : '';

      // Save custom hotels to hotel_references if needed (marked CUSTOM_ITINERARY_HOTEL)
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

      // Audit transport selections
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
            newValue: { agreed_rate: t.agreedPrice, reason: t.overrideReason, approver: t.overrideApproverName },
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
          newValue: { vehicle: t.vehicleTypeName, agreed_price: t.agreedPrice, source: 'CUSTOM_ROUTE' },
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

      const { error } = await supabase
        .from('pilgrims')
        .update(updateData)
        .eq('id', details.pilgrimId);

      if (error) throw error;

      await logAudit({
        action: 'visa_record_saved',
        recordType: 'pilgrim',
        recordId: details.pilgrimId,
        recordLabel: details.pilgrimName,
        previousValue: { visa_number: null },
        newValue: { visa_number: extraction.visaNumber.value, visa_company: details.visaCompany },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });

      setSavedAt(new Date().toISOString());
      setCompletedSteps((prev) => new Set(prev).add('confirm_save'));
      setStep('confirm_save');
      setAlert({ type: 'success', message: 'Visa record saved successfully.' });
    } catch (e) {
      console.error('Save failed:', e);
      setAlert({
        type: 'error',
        message: 'Failed to save the visa record. Please check your connection and try again.',
      });
    } finally {
      setSaving(false);
    }
  }, [details, extraction, profile, isAdminOrHigher]);

  const handleProcessAnother = useCallback(() => {
    setDetails(emptyDetails());
    setFile(null);
    setExtraction(emptyExtraction());
    setMatch({
      status: 'no_match',
      pilgrim: null,
      conflicts: [],
      alternatives: [],
    });
    setExtractionStatus('idle');
    setAlert(null);
    setCompletedSteps(new Set());
    setStep('case_details');
    setSavedAt('');
  }, []);

  const handleViewPilgrim = useCallback(() => {
    if (details.pilgrimId) navigate(`/app/pilgrims/${details.pilgrimId}`);
  }, [details.pilgrimId, navigate]);

  const handleViewHistory = useCallback(() => {
    navigate('/app/audit-history');
  }, [navigate]);

  const showSuccess = step === 'confirm_save' && completedSteps.has('confirm_save') && savedAt;

  if (isViewer) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6">
          <nav className="text-xs text-slate-400 mb-2">
            <span>Operations Automation Pro</span>
            <ChevronRight className="inline h-3 w-3 mx-1" />
            <span className="text-slate-600 font-medium">Visa & Contract Logger</span>
          </nav>
          <h1 className="font-display font-bold text-2xl text-navy-900">Visa & Contract Logger</h1>
          <p className="mt-1 text-sm text-slate-500">Extract visa information, match it to an existing pilgrim and securely record confirmed details.</p>
        </div>
        <ViewerReadOnly />
      </div>
    );
  }

  const isProcessing = extractionStatus !== 'idle' && extractionStatus !== 'complete' && extractionStatus !== 'error';

  // Build confirmation summary rows
  const confirmationRows = [
    { label: 'Passenger Name', value: extraction.passengerName.value },
    { label: 'Passport Number', value: extraction.passportNumber.value || details.passportNumber },
    { label: 'Visa Number', value: extraction.visaNumber.value },
    {
      label: 'Agent',
      value: details.agentName + (details.agentIsProposed ? (isAdminOrHigher ? ' (new — will be created)' : ' (proposed — pending approval)') : ''),
    },
    { label: 'Visa Company', value: details.visaCompany },
    {
      label: 'Makkah Hotel',
      value: details.makkahHotelName + (details.makkahHotelIsCustom ? ' (custom)' : ''),
    },
    {
      label: 'Madinah Hotel',
      value: details.madinahHotelName + (details.madinahHotelIsCustom ? ' (custom)' : ''),
    },
    {
      label: 'Transport Route',
      value: details.transport.routeName + (details.transport.isCustomRoute ? ' (custom)' : ''),
    },
    { label: 'Vehicle Type', value: details.transport.vehicleTypeName },
    {
      label: 'Transport Total',
      value: details.transport.referencePrice != null
        ? `SAR ${((details.transport.hasPriceOverride && details.transport.agreedPrice != null ? details.transport.agreedPrice : details.transport.referencePrice) * details.transport.numberOfVehicles).toFixed(2)}`
        : '',
    },
    { label: 'Planned Outbound', value: details.plannedOutboundDate },
    { label: 'Expected Return', value: details.expectedReturnDate },
  ];

  return (
    <div className="max-w-[1280px] mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <nav className="text-xs text-slate-400 mb-2" aria-label="Breadcrumb">
          <span>Operations Automation Pro</span>
          <ChevronRight className="inline h-3 w-3 mx-1" />
          <span className="text-slate-600 font-medium">Visa & Contract Logger</span>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-navy-900">Visa & Contract Logger</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">
              Extract visa information, match it to an existing pilgrim and securely record confirmed details.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5" title="HajjERP Supabase database is connected">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-slate-600">DB Connected</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium leading-tight">AI Requests</span>
                <span className="text-xs font-bold text-slate-700 leading-tight">{aiRequestsRemaining} of {AI_DAILY_LIMIT} left</span>
              </div>
              <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(aiRequestsUsed / AI_DAILY_LIMIT) * 100}%` }} />
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold uppercase text-white">
                {(profile?.full_name || 'U').charAt(0)}
              </div>
              <span className="text-xs font-medium text-slate-700">{profile?.full_name || 'Staff'}</span>
            </div>

            <button onClick={handleViewHistory} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors" title="View processing history">
              <FileScan className="h-3.5 w-3.5" /> History
            </button>
          </div>
        </div>
      </div>

      {/* Workflow Stepper */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm px-4 sm:px-6 py-4">
        <WorkflowStepper currentStep={step} completedSteps={completedSteps} />
      </div>

      {alert && (
        <div className="mb-4">
          <AlertBanner alert={alert} onDismiss={() => setAlert(null)} />
        </div>
      )}

      {showSuccess ? (
        <SuccessScreen
          extraction={extraction}
          details={details}
          savedBy={profile?.full_name || 'Staff'}
          savedAt={savedAt}
          onViewPilgrim={handleViewPilgrim}
          onProcessAnother={handleProcessAnother}
          onViewHistory={handleViewHistory}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left side — main form */}
          <div className="lg:col-span-2 space-y-6">
            {step === 'case_details' && (
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
            )}

            {step === 'case_details' && (
              <div className="flex items-center justify-end gap-3">
                <button onClick={goToUpload} disabled={!caseDetailsValid} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue to Upload <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === 'upload_visa' && (
              <>
                <button onClick={goToCaseDetails} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Back to Case Details
                </button>

                <UploadVisaCard file={file} onFileSelect={(f) => { setFile(f); setUploadError(null); }} disabled={isProcessing} error={uploadError} />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {isProcessing ? EXTRACTION_STATUS_MESSAGES[extractionStatus] : 'One AI request will be used for this extraction'}
                  </p>
                  <button onClick={handleExtract} disabled={!isReady || isProcessing || aiRequestsRemaining <= 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    {isProcessing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />{EXTRACTION_STATUS_MESSAGES[extractionStatus]}</>
                    ) : (
                      <><FileScan className="h-4 w-4" /> Extract Visa Information</>
                    )}
                  </button>
                </div>

                {isProcessing && (
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
                    <div className="space-y-2.5">
                      {(['securing', 'uploading', 'extracting', 'matching', 'checking_duplicates', 'preparing_review'] as ExtractionStatus[]).map((s) => {
                        const isDone = completedSteps.has('upload_visa') || stepsOrder(extractionStatus) > stepsOrder(s);
                        const isActive = extractionStatus === s;
                        return (
                          <div key={s} className="flex items-center gap-3">
                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all ${
                              isDone ? 'bg-green-500 text-white' : isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'
                            }`}>
                              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-xs">•</span>}
                            </div>
                            <span className={`text-sm ${isDone ? 'text-slate-700' : isActive ? 'text-brand-700 font-medium' : 'text-slate-400'}`}>
                              {EXTRACTION_STATUS_MESSAGES[s]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 'review_extraction' && (
              <>
                <button onClick={() => setStep('upload_visa')} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Back to Upload
                </button>

                <ReviewScreen extraction={extraction} match={match} details={details} onExtractionChange={handleExtractionChange} onDetailsChange={handleDetailsChange} />

                <div className="flex items-center justify-end gap-3">
                  <button onClick={goToConfirm} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-all">
                    Proceed to Confirmation <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            {step === 'confirm_save' && !showSuccess && (
              <>
                <button onClick={backToReview} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Return to Review
                </button>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="px-6 py-5 border-b border-slate-100">
                    <h3 className="font-display font-bold text-lg text-navy-900">Confirmation Summary</h3>
                    <p className="mt-1 text-sm text-slate-500">Review what will be saved before confirming</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {confirmationRows.map((item) => (
                        <div key={item.label} className="flex items-start gap-2">
                          {item.label.includes('Transport') || item.label.includes('Vehicle') ? (
                            <Bus className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                          ) : item.label === 'Agent' ? (
                            <Building2 className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400 font-medium">{item.label}</p>
                            <p className="text-sm text-slate-800 font-medium">{item.value || '—'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                  <button onClick={backToReview} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto">
                    <ArrowLeft className="h-4 w-4" /> Return to Review
                  </button>
                  <button onClick={() => setConfirmDialog(true)} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-all disabled:opacity-50 w-full sm:w-auto">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Confirm and Save Visa Record
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right side — Processing Summary */}
          <div className="lg:col-span-1">
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
        title="Confirm and Save Visa Record"
        message="This will save the reviewed visa information and link it to the selected pilgrim. Journey arrival and departure statuses will not be changed."
        confirmLabel="Confirm and Save"
        onConfirm={handleConfirmSave}
        onCancel={() => setConfirmDialog(false)}
        loading={saving}
      />
    </div>
  );
}

function stepsOrder(status: ExtractionStatus): number {
  const order: ExtractionStatus[] = ['idle', 'securing', 'uploading', 'extracting', 'matching', 'checking_duplicates', 'preparing_review', 'complete', 'error'];
  return order.indexOf(status);
}

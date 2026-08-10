export interface HotelReference {
  id: string;
  city: 'Makkah' | 'Madinah';
  name_en: string;
  name_ar: string | null;
  classification: string | null;
  licence_number: string | null;
  district: string | null;
  is_active: boolean;
  source?: string | null;
}

// ── Transport types ──
export interface TransportRoute {
  id: string;
  route_code: string;
  route_name: string;
  origin: string;
  destination: string;
  is_bidirectional: boolean;
  city_scope: string;
  status: string;
  effective_season: string;
  currency: string;
}

export interface TransportVehicleType {
  id: string;
  vehicle_code: string;
  vehicle_name: string;
  status: string;
}

export interface TransportReferenceRate {
  id: string;
  route_id: string;
  vehicle_type_id: string;
  price: number;
  currency: string;
  effective_season: string;
  status: string;
  source: string;
}

// ── Transport selection on the visa case ──
export interface TransportSelection {
  routeId: string | null;
  routeName: string;
  vehicleTypeId: string | null;
  vehicleTypeName: string;
  referencePrice: number | null;
  numberOfVehicles: number;
  calculatedTotal: number | null;
  transportProvider: string;
  pickupDate: string;
  pickupTime: string;
  internalNotes: string;
  isCustomRoute: boolean;
  customOrigin: string;
  customDestination: string;
  // Price override
  hasPriceOverride: boolean;
  agreedPrice: number | null;
  overrideReason: string;
  overrideApproverId: string | null;
  overrideApproverName: string;
}

// ── Agent manual entry ──
export interface NewAgentEntry {
  organisationName: string;
  contactPerson: string;
  phoneNumber: string;
  email: string;
  internalNote: string;
}

export interface ProposedAgent {
  id: string;
  organisation_name: string;
  contact_person: string | null;
  phone_number: string | null;
  email: string | null;
  internal_note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  entered_by: string | null;
  entered_by_name: string | null;
  source: string;
  created_at: string;
}

// ── Custom hotel entry ──
export interface CustomHotelEntry {
  name: string;
  city: 'Makkah' | 'Madinah';
  nameAr: string;
  licenceNumber: string;
  internalNote: string;
}

// ── Updated VisaCaseDetails ──
export interface VisaCaseDetails {
  pilgrimId: string | null;
  pilgrimName: string;
  passportNumber: string;
  agentId: string | null;
  agentName: string;
  agentIsProposed: boolean;
  newAgent: NewAgentEntry | null;
  assignedStaffId: string | null;
  visaCompany: string;
  makkahHotelId: string | null;
  makkahHotelName: string;
  makkahHotelIsCustom: boolean;
  makkahCustomHotel: CustomHotelEntry | null;
  madinahHotelId: string | null;
  madinahHotelName: string;
  madinahHotelIsCustom: boolean;
  madinahCustomHotel: CustomHotelEntry | null;
  transport: TransportSelection;
  plannedOutboundDate: string;
  expectedReturnDate: string;
}

// ── Extraction types (unchanged) ──
export type ExtractionStatus =
  | 'idle'
  | 'securing'
  | 'uploading'
  | 'extracting'
  | 'matching'
  | 'checking_duplicates'
  | 'preparing_review'
  | 'complete'
  | 'error';

export interface ExtractedField<T = string> {
  value: T | null;
  confidence: 'high' | 'medium' | 'low' | null;
  sourcePage: number | null;
  needsReview: boolean;
}

export interface VisaExtractionResult {
  passengerName: ExtractedField;
  passportNumber: ExtractedField;
  visaNumber: ExtractedField;
  nationality: ExtractedField;
  extractedAt: string;
}

export type MatchStatus =
  | 'exact_passport_match'
  | 'possible_name_match'
  | 'no_match'
  | 'passport_mismatch'
  | 'duplicate_visa'
  | 'multiple_matches';

export interface PilgrimMatchResult {
  status: MatchStatus;
  pilgrim: {
    id: string;
    full_name: string;
    passport_number: string;
    visa_number: string | null;
    agent_name: string | null;
  } | null;
  conflicts: string[];
  alternatives: Array<{
    id: string;
    full_name: string;
    passport_number: string;
  }>;
}

export type WorkflowStep = 'case_details' | 'upload_visa' | 'review_extraction' | 'confirm_save';

export interface VisaLogEntry {
  id: string;
  pilgrim_id: string;
  pilgrim_name: string;
  visa_number: string;
  passport_number: string;
  agent_name: string;
  visa_company: string;
  makkah_hotel: string;
  madinah_hotel: string;
  transportation: string;
  planned_outbound: string;
  expected_return: string;
  extracted_by: string;
  extracted_by_name: string;
  created_at: string;
  document_filename: string | null;
}

export const EXTRACTION_STATUS_MESSAGES: Record<ExtractionStatus, string> = {
  idle: '',
  securing: 'Securing document...',
  uploading: 'Uploading to extraction service...',
  extracting: 'Extracting visa details with AI...',
  matching: 'Searching for pilgrim match...',
  checking_duplicates: 'Checking for duplicate records...',
  preparing_review: 'Preparing review screen...',
  complete: 'Extraction complete',
  error: 'Extraction failed',
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  exact_passport_match: 'Exact passport match',
  possible_name_match: 'Possible name match — review required',
  no_match: 'No pilgrim found',
  passport_mismatch: 'Passport mismatch detected',
  duplicate_visa: 'Duplicate visa number found',
  multiple_matches: 'Multiple possible matches',
};

// ── Helpers ──
export function emptyTransportSelection(): TransportSelection {
  return {
    routeId: null,
    routeName: '',
    vehicleTypeId: null,
    vehicleTypeName: '',
    referencePrice: null,
    numberOfVehicles: 1,
    calculatedTotal: null,
    transportProvider: '',
    pickupDate: '',
    pickupTime: '',
    internalNotes: '',
    isCustomRoute: false,
    customOrigin: '',
    customDestination: '',
    hasPriceOverride: false,
    agreedPrice: null,
    overrideReason: '',
    overrideApproverId: null,
    overrideApproverName: '',
  };
}

export function emptyCustomHotel(city: 'Makkah' | 'Madinah'): CustomHotelEntry {
  return { name: '', city, nameAr: '', licenceNumber: '', internalNote: '' };
}

export function emptyNewAgent(): NewAgentEntry {
  return { organisationName: '', contactPerson: '', phoneNumber: '', email: '', internalNote: '' };
}

// ── Normalize agent name for duplicate check ──
export function normalizeAgentName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,&'`-]/g, '')
    .toLowerCase()
    .trim();
}

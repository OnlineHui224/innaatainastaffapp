// ── Flight Document Ops Pro types ──

export interface FlightPassenger {
  id: string;
  fullName: string;
  title: string;
  ticketNumber: string;
  bookingReference: string;
  sourceFile: string;
  confidence: 'high' | 'medium' | 'low' | null;
  needsReview: boolean;
  linkedPilgrimId: string | null;
}

export interface FlightSegment {
  id: string;
  airlineName: string;
  airlineCode: string;
  flightNumber: string;
  operatingCarrier: string;
  departureAirport: string;
  departureCity: string;
  departureTerminal: string;
  departureDate: string;
  departureTime: string;
  arrivalAirport: string;
  arrivalCity: string;
  arrivalTerminal: string;
  arrivalDate: string;
  arrivalTime: string;
  cabinClass: string;
  baggageAllowance: string;
  stopoverInfo: string;
  layoverDuration: string;
  segmentType: 'outbound' | 'connection' | 'return';
  sourceFile: string;
  confidence: 'high' | 'medium' | 'low' | null;
  needsReview: boolean;
}

export interface HotelStay {
  hotelId: string | null;
  hotelName: string;
  city: 'Makkah' | 'Madinah';
  isCustom: boolean;
  customHotelName: string;
  customHotelAr: string;
  customLicence: string;
  checkInDate: string;
  checkOutDate: string;
  doubleRooms: number;
  quadRooms: number;
  quintRooms: number;
  reservationNumber: string;
}

export interface GroupInfo {
  groupNumber: string;
  groupName: string;
  tourLeader: string;
  agentId: string | null;
  agentName: string;
  agentIsProposed: boolean;
  adultPax: number;
  childPax: number;
  totalPax: number;
  internalNotes: string;
}

export type ItineraryType = 'group' | 'individual';

export type FlightWorkflowStep = 'upload_tickets' | 'review_flight_data' | 'group_accommodation' | 'generate_itinerary';

export interface FlightItineraryData {
  passengers: FlightPassenger[];
  segments: FlightSegment[];
  group: GroupInfo;
  makkahHotel: HotelStay;
  madinahHotel: HotelStay;
  itineraryType: ItineraryType;
  selectedPassengerIds: string[];
}

export interface FlightExtractionResult {
  passengers: FlightPassenger[];
  segments: FlightSegment[];
  extractedAt: string;
  sourceFiles: string[];
}

export function emptyGroupInfo(): GroupInfo {
  return {
    groupNumber: '',
    groupName: '',
    tourLeader: '',
    agentId: null,
    agentName: '',
    agentIsProposed: false,
    adultPax: 0,
    childPax: 0,
    totalPax: 0,
    internalNotes: '',
  };
}

export function emptyHotelStay(city: 'Makkah' | 'Madinah'): HotelStay {
  return {
    hotelId: null,
    hotelName: '',
    city,
    isCustom: false,
    customHotelName: '',
    customHotelAr: '',
    customLicence: '',
    checkInDate: '',
    checkOutDate: '',
    doubleRooms: 0,
    quadRooms: 0,
    quintRooms: 0,
    reservationNumber: '',
  };
}

export function emptyExtractionResult(): FlightExtractionResult {
  return {
    passengers: [],
    segments: [],
    extractedAt: '',
    sourceFiles: [],
  };
}

export const FLIGHT_EXTRACTION_STEPS = [
  'Securing documents...',
  'Uploading to extraction service...',
  'Extracting flight details with AI...',
  'Identifying passengers...',
  'Extracting flight segments...',
  'Checking for connections...',
  'Preparing review screen...',
] as const;

export const FLIGHT_STEP_LABELS: Record<FlightWorkflowStep, string> = {
  upload_tickets: 'Upload Tickets',
  review_flight_data: 'Review Flight Data',
  group_accommodation: 'Group & Accommodation',
  generate_itinerary: 'Generate Itinerary',
};

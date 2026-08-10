import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FlightPassenger {
  id: string;
  fullName: string;
  title: string;
  ticketNumber: string;
  bookingReference: string;
}

interface FlightSegment {
  airlineName: string;
  airlineCode: string;
  flightNumber: string;
  departureAirport: string;
  departureCity: string;
  departureDate: string;
  departureTime: string;
  arrivalAirport: string;
  arrivalCity: string;
  arrivalDate: string;
  arrivalTime: string;
  cabinClass: string;
  segmentType: string;
}

interface HotelStay {
  hotelName: string;
  city: string;
  checkInDate: string;
  checkOutDate: string;
  doubleRooms: number;
  quadRooms: number;
  quintRooms: number;
  reservationNumber: string;
}

interface GroupInfo {
  groupNumber: string;
  groupName: string;
  tourLeader: string;
  agentName: string;
  adultPax: number;
  childPax: number;
  totalPax: number;
}

interface ItineraryRequest {
  passengers: FlightPassenger[];
  segments: FlightSegment[];
  group: GroupInfo;
  makkahHotel: HotelStay;
  madinahHotel: HotelStay;
  itineraryType: 'group' | 'individual';
  selectedPassengerIds: string[];
  sourceFiles: string[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function generateDocxXml(req: ItineraryRequest): string {
  const { passengers, segments, group, makkahHotel, madinahHotel, itineraryType } = req;

  // Determine dynamic flight heading
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const mainOrigin = firstSegment?.departureCity || firstSegment?.departureAirport || "ORIGIN";
  const mainDestination = segments.find(s => s.segmentType !== 'return')?.arrivalCity ||
    lastSegment?.arrivalCity || "DESTINATION";
  const flightHeading = `FLIGHT: ${mainOrigin.toUpperCase()} – ${mainDestination.toUpperCase()}`;

  // Build flight rows
  const flightRows = segments.map((seg) => {
    const from = seg.departureCity || seg.departureAirport || "-";
    const to = seg.arrivalCity || seg.arrivalAirport || "-";
    const date = formatDate(seg.departureDate);
    const dep = seg.departureTime || "-";
    const arr = seg.arrivalTime || "-";
    const carrier = seg.airlineName || "-";
    const flightNo = seg.flightNumber || "-";
    const pnr = passengers[0]?.bookingReference || "-";

    return `<w:tr>
      <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${from}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${to}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${date}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${dep}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${arr}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${carrier}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${flightNo}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${pnr}</w:t></w:r></w:p></w:tc>
    </w:tr>`;
  }).join("\n");

  // Build hotel rows
  const hotelRow = (hotel: HotelStay, cityLabel: string) => `<w:tr>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${cityLabel}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${hotel.hotelName || "-"}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${formatDate(hotel.checkInDate)}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${formatDate(hotel.checkOutDate)}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${hotel.doubleRooms}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${hotel.quadRooms}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${hotel.quintRooms}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${hotel.reservationNumber || "-"}</w:t></w:r></w:p></w:tc>
  </w:tr>`;

  // Build passenger list
  const passengerRows = passengers.map((p, i) => `<w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${i + 1}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${p.title} ${p.fullName}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${p.ticketNumber || "-"}</w:t></w:r></w:p></w:tc>
  </w:tr>`).join("\n");

  // Full document XML
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<!-- Title -->
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="006600"/></w:rPr><w:t>INNA ATAINA TRAVELS</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="006600"/></w:rPr><w:t>Flight Itinerary</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${flightHeading}</w:t></w:r></w:p>
<w:p/>

<!-- Group Information Table -->
<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="006600"/></w:rPr><w:t>GROUP INFORMATION</w:t></w:r></w:p>
<w:tbl>
<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>
<w:tr>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Group No.</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Group Name</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Adult PAX</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Child PAX</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Total</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Tour Leader</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${group.groupNumber || "-"}</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${group.groupName || "-"}</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${group.adultPax}</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${group.childPax}</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${group.totalPax}</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${group.tourLeader || "-"}</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>
<w:p/>

<!-- Flight Information Table -->
<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="006600"/></w:rPr><w:t>FLIGHT INFORMATION</w:t></w:r></w:p>
<w:tbl>
<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/><w:gridCol w:w="800"/><w:gridCol w:w="800"/><w:gridCol w:w="1000"/><w:gridCol w:w="800"/><w:gridCol w:w="800"/></w:tblGrid>
<w:tr>
<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>From</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>To</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Date</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Departure</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Arrival</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Carrier</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Flight No.</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>PNR</w:t></w:r></w:p></w:tc>
</w:tr>
${flightRows}
</w:tbl>
<w:p/>

<!-- Hotel Accommodation Table -->
<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="006600"/></w:rPr><w:t>HOTEL ACCOMMODATION</w:t></w:r></w:p>
<w:tbl>
<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="800"/><w:gridCol w:w="2000"/><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/><w:gridCol w:w="600"/><w:gridCol w:w="600"/><w:gridCol w:w="600"/><w:gridCol w:w="800"/></w:tblGrid>
<w:tr>
<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>City</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Hotel</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Check In</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Check Out</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>DOUB</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>QUAD</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>QUINT</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Res No.</w:t></w:r></w:p></w:tc>
</w:tr>
${hotelRow(madinahHotel, "MEDINAH")}
${hotelRow(makkahHotel, "MAKKAH")}
</w:tbl>
<w:p/>

<!-- Passenger List (for group itinerary or individual) -->
<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="006600"/></w:rPr><w:t>PASSENGER LIST (${itineraryType === 'group' ? 'Group' : 'Individual'} Itinerary)</w:t></w:r></w:p>
<w:tbl>
<w:tblPr><w:tblW w:w="5500" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="500"/><w:gridCol w:w="3000"/><w:gridCol w:w="2000"/></w:tblGrid>
<w:tr>
<w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>#</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Passenger Name</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="006600"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="FFFFFF"/></w:rPr><w:t>Ticket Number</w:t></w:r></w:p></w:tc>
</w:tr>
${passengerRows}
</w:tbl>
<w:p/>
<w:p><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t>Generated by HajjERP Flight Document Ops Pro on ${new Date().toLocaleString("en-GB")}</w:t></w:r></w:p>
<w:sectPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:sectPr>
</w:body>
</w:document>`;
  return docXml;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: ItineraryRequest = await req.json();

    if (!body.group?.groupName) {
      return json({ error: "Group name is required" }, 400);
    }
    if (!body.segments || body.segments.length === 0) {
      return json({ error: "At least one flight segment is required" }, 400);
    }

    // Generate DOCX XML
    const docXml = generateDocxXml(body);

    // Build minimal DOCX (ZIP) package
    // A DOCX is a ZIP file with specific structure.
    // We'll build a minimal valid DOCX with the document XML.
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

    // Build ZIP manually (minimal DOCX)
    const encoder = new TextEncoder();
    const files: { name: string; data: Uint8Array }[] = [
      { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
      { name: "_rels/.rels", data: encoder.encode(rels) },
      { name: "word/document.xml", data: encoder.encode(docXml) },
      { name: "word/_rels/document.xml.rels", data: encoder.encode(docRels) },
    ];

    // Create ZIP using a simple approach
    // Since we can't use external ZIP libraries easily, we'll use uncompressed ZIP
    const zipBytes = buildZip(files);
    const base64 = base64Encode(zipBytes);

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const fileName = `itinerary_${body.group.groupName.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.docx`;
    const filePath = `flight-itineraries/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, zipBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    let savedPath = filePath;
    if (uploadError) {
      console.error("Storage upload failed, saving path as reference only:", uploadError);
      savedPath = `local:${fileName}`;
    }

    // Get auth info
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let generatedBy = null;
    let generatedByName = "";
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        generatedBy = user.id;
        generatedByName = user.email ?? "";
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.full_name) generatedByName = profile.full_name;
      }
    }

    // Save record to database
    const { data: record, error: dbError } = await supabase
      .from("flight_itineraries")
      .insert({
        group_number: body.group.groupNumber || null,
        group_name: body.group.groupName,
        tour_leader: body.group.tourLeader || null,
        agent_name: body.group.agentName || null,
        adult_pax: body.group.adultPax,
        child_pax: body.group.childPax,
        total_pax: body.group.totalPax,
        itinerary_type: body.itineraryType,
        itinerary_data: body,
        docx_file_path: savedPath,
        source_ticket_files: body.sourceFiles || [],
        generated_by: generatedBy,
        generated_by_name: generatedByName,
        processing_batch: `FLIGHT_${Date.now()}`,
      })
      .select("id")
      .single();

    if (dbError) throw dbError;

    return json({
      success: true,
      itineraryId: record.id,
      fileName,
      base64,
      filePath: savedPath,
    });
  } catch (err) {
    console.error("DOCX generation error:", err);
    return json({ error: err instanceof Error ? err.message : "DOCX generation failed" }, 500);
  }
});

// ── Minimal ZIP builder (store, no compression) ──
function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true); // version
    localHeader.setUint16(6, 0, true); // flags
    localHeader.setUint16(8, 0, true); // compression: store
    localHeader.setUint16(10, 0, true); // mod time
    localHeader.setUint16(12, 0, true); // mod date
    const crc = crc32(file.data);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, file.data.length, true); // compressed size
    localHeader.setUint32(22, file.data.length, true); // uncompressed size
    localHeader.setUint16(26, nameBytes.length, true);
    localHeader.setUint16(28, 0, true); // extra field length

    const headerBytes = new Uint8Array(localHeader.buffer);
    chunks.push(headerBytes);
    chunks.push(nameBytes);
    chunks.push(file.data);

    // Central directory entry
    const cdHeader = new DataView(new ArrayBuffer(46));
    cdHeader.setUint32(0, 0x02014b50, true);
    cdHeader.setUint16(4, 20, true); // version made by
    cdHeader.setUint16(6, 20, true); // version needed
    cdHeader.setUint16(8, 0, true);
    cdHeader.setUint16(10, 0, true);
    cdHeader.setUint16(12, 0, true);
    cdHeader.setUint16(14, 0, true);
    cdHeader.setUint32(16, crc, true);
    cdHeader.setUint32(20, file.data.length, true);
    cdHeader.setUint32(24, file.data.length, true);
    cdHeader.setUint16(28, nameBytes.length, true);
    cdHeader.setUint16(30, 0, true);
    cdHeader.setUint16(32, 0, true);
    cdHeader.setUint16(34, 0, true);
    cdHeader.setUint16(36, 0, true);
    cdHeader.setUint32(38, 0, true);
    cdHeader.setUint32(42, offset, true);

    const cdBytes = new Uint8Array(cdHeader.buffer);
    centralDir.push(cdBytes);
    centralDir.push(nameBytes);

    offset += headerBytes.length + nameBytes.length + file.data.length;
  }

  // End of central directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    chunks.push(cd);
    cdSize += cd.length;
  }

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdOffset, true);
  eocd.setUint16(20, 0, true);
  chunks.push(new Uint8Array(eocd.buffer));

  // Combine all chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

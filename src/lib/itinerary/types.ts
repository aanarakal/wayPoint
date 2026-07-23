export type LegStatus =
  | "confirmed"
  | "cancelled"
  | "rebooked"
  | "modified"
  | "pending";

export type PaymentStatus = "none" | "pending" | "approved" | "CAPTURED";

export interface FlightSegment {
  id: string;
  type: "flight";
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  seat?: string;
  cabin?: string;
  recordLocator?: string;
  status: LegStatus;
  confidence?: number;
}

export interface CarRental {
  id: string;
  type: "car";
  vendor: string;
  location: string;
  pickupAt: string;
  returnAt: string;
  vehicleClass: string;
  confirmationCode?: string;
  status: LegStatus;
  dependsOnFlightId: string;
  bufferMinutes: number;
}

export interface HotelStay {
  id: string;
  type: "hotel";
  name: string;
  city: string;
  checkIn: string;
  checkOut: string;
  confirmationCode?: string;
  lateArrivalGuaranteed: boolean;
  status: LegStatus;
  dependsOnCarId: string;
}

export interface PriceDeltaLine {
  label: string;
  amount: number;
  currency: string;
}

export interface PaymentState {
  status: PaymentStatus;
  orderId?: string;
  currency: string;
  lines: PriceDeltaLine[];
  total: number;
  capturedAt?: string;
}

export interface RebookOption {
  id: string;
  label: string;
  flightNumber: string;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  seat: string;
  fareDelta: number;
  changeFee: number;
  currency: string;
}

export interface DisruptionState {
  active: boolean;
  cancelledSegmentId?: string;
  message?: string;
  options: RebookOption[];
  selectedOptionId?: string;
}

export interface Itinerary {
  id: string;
  travelerName: string;
  /** E.164 phone for outbound recovery calls (demo sample uses this) */
  travelerPhone?: string;
  source: "landing_ai" | "demo" | "upload";
  createdAt: string;
  flights: FlightSegment[];
  car: CarRental | null;
  hotel: HotelStay | null;
  payment: PaymentState;
  disruption: DisruptionState;
  events: ItineraryEvent[];
}

export interface ItineraryEvent {
  id: string;
  at: string;
  kind:
    | "ingested"
    | "disrupted"
    | "rebooked"
    | "cascaded"
    | "payment"
    | "reconciled"
    | "info";
  message: string;
}

export interface CascadeResult {
  itinerary: Itinerary;
  carChanged: boolean;
  hotelChanged: boolean;
  carDelta: number;
  hotelDelta: number;
}

import type { Itinerary } from "./types";

/** Hero demo itinerary: SFO → DEN → AUS + car + hotel in Austin */
export function createSampleItinerary(): Itinerary {
  const now = new Date().toISOString();

  return {
    id: `itin-${Date.now()}`,
    travelerName: "Alex Rivera",
    travelerPhone: process.env.DEMO_TRAVELER_PHONE ?? "+12099981960",
    source: "demo",
    createdAt: now,
    flights: [
      {
        id: "flt-sfo-den",
        type: "flight",
        airline: "United",
        flightNumber: "UA 1542",
        from: "SFO",
        to: "DEN",
        departAt: "2026-07-18T08:15:00-07:00",
        arriveAt: "2026-07-18T11:45:00-06:00",
        seat: "14A",
        cabin: "Economy",
        recordLocator: "WYPT42",
        status: "confirmed",
        confidence: 0.98,
      },
      {
        id: "flt-den-aus",
        type: "flight",
        airline: "United",
        flightNumber: "UA 2089",
        from: "DEN",
        to: "AUS",
        departAt: "2026-07-18T13:10:00-06:00",
        arriveAt: "2026-07-18T16:25:00-05:00",
        seat: "21C",
        cabin: "Economy",
        recordLocator: "WYPT42",
        status: "confirmed",
        confidence: 0.97,
      },
    ],
    car: {
      id: "car-aus-1",
      type: "car",
      vendor: "Hertz",
      location: "AUS Airport",
      pickupAt: "2026-07-18T17:00:00-05:00",
      returnAt: "2026-07-21T10:00:00-05:00",
      vehicleClass: "Intermediate SUV",
      confirmationCode: "H9876543",
      status: "confirmed",
      dependsOnFlightId: "flt-den-aus",
      bufferMinutes: 35,
    },
    hotel: {
      id: "htl-aus-1",
      type: "hotel",
      name: "The LINE Austin",
      city: "Austin",
      checkIn: "2026-07-18",
      checkOut: "2026-07-21",
      confirmationCode: "LINE-AUS-8821",
      lateArrivalGuaranteed: false,
      status: "confirmed",
      dependsOnCarId: "car-aus-1",
    },
    payment: {
      status: "none",
      currency: "USD",
      lines: [],
      total: 0,
    },
    disruption: {
      active: false,
      options: [],
    },
    events: [
      {
        id: "evt-ingest",
        at: now,
        kind: "ingested",
        message: "Demo itinerary loaded: SFO → DEN → AUS with car and hotel.",
      },
    ],
  };
}

export const SAMPLE_ITINERARY_MARKDOWN = `
# Travel Confirmation — WayPoint Demo

Traveler: Alex Rivera
Record Locator: WYPT42

## Flights
- UA 1542 SFO → DEN · Depart Jul 18 08:15 PDT · Arrive 11:45 MDT · Seat 14A
- UA 2089 DEN → AUS · Depart Jul 18 13:10 MDT · Arrive 16:25 CDT · Seat 21C

## Car Rental
Hertz Intermediate SUV · AUS Airport
Pickup Jul 18 17:00 CDT · Return Jul 21 10:00 CDT
Confirmation H9876543

## Hotel
The LINE Austin · Austin
Check-in Jul 18 · Check-out Jul 21
Confirmation LINE-AUS-8821
`;

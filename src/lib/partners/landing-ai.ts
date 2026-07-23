import { createSampleItinerary } from "@/lib/itinerary/sample";
import type { Itinerary } from "@/lib/itinerary/types";

const ITINERARY_SCHEMA = {
  type: "object",
  properties: {
    travelerName: { type: "string", description: "Traveler full name" },
    recordLocator: {
      type: "string",
      description: "Airline PNR / record locator",
    },
    flights: {
      type: "array",
      description: "Flight segments in order",
      items: {
        type: "object",
        properties: {
          airline: { type: "string" },
          flightNumber: { type: "string" },
          from: { type: "string", description: "Origin airport code" },
          to: { type: "string", description: "Destination airport code" },
          departAt: { type: "string", description: "ISO or local departure" },
          arriveAt: { type: "string", description: "ISO or local arrival" },
          seat: { type: "string" },
        },
      },
    },
    car: {
      type: "object",
      properties: {
        vendor: { type: "string" },
        location: { type: "string" },
        pickupAt: { type: "string" },
        returnAt: { type: "string" },
        vehicleClass: { type: "string" },
        confirmationCode: { type: "string" },
      },
    },
    hotel: {
      type: "object",
      properties: {
        name: { type: "string" },
        city: { type: "string" },
        checkIn: { type: "string" },
        checkOut: { type: "string" },
        confirmationCode: { type: "string" },
      },
    },
  },
};

/**
 * Landing AI ADE Parse + Extract.
 * Uses LIVE when LANDING_AI_API_KEY is set; otherwise returns the hero demo itinerary.
 */
export async function parseItineraryPdf(
  file: File | Blob,
  filename: string,
): Promise<{ itinerary: Itinerary; mode: "live" | "demo"; raw?: unknown }> {
  const apiKey = process.env.LANDING_AI_API_KEY;
  const base =
    process.env.LANDING_AI_API_BASE ?? "https://api.va.landing.ai";

  if (!apiKey) {
    const itinerary = createSampleItinerary();
    itinerary.source = "upload";
    itinerary.travelerPhone =
      itinerary.travelerPhone ??
      process.env.DEMO_TRAVELER_PHONE ??
      "+12099981960";
    itinerary.events = [
      {
        id: `evt-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "ingested",
        message: `Parsed ${filename} via demo Landing AI adapter (no API key).`,
      },
    ];
    return { itinerary, mode: "demo" };
  }

  const markdown = await adeParse(base, apiKey, file, filename);
  const extraction = await adeExtract(base, apiKey, markdown);
  const itinerary = mapExtraction(extraction, filename);
  return {
    itinerary,
    mode: "live",
    raw: { markdownPreview: markdown.slice(0, 500), extraction },
  };
}

async function adeParse(
  base: string,
  apiKey: string,
  file: File | Blob,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("document", file, filename);
  form.append("model", process.env.LANDING_AI_PARSE_MODEL ?? "dpt-2-latest");

  const response = await fetch(`${base}/v1/ade/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Landing AI parse ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    markdown?: string;
    data?: { markdown?: string };
  };
  const markdown = data.markdown ?? data.data?.markdown;
  if (!markdown) {
    throw new Error("Landing AI parse returned no markdown");
  }
  return markdown;
}

async function adeExtract(
  base: string,
  apiKey: string,
  markdown: string,
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("schema", JSON.stringify(ITINERARY_SCHEMA));
  form.append("markdown", new Blob([markdown], { type: "text/markdown" }), "itin.md");
  form.append(
    "model",
    process.env.LANDING_AI_EXTRACT_MODEL ?? "extract-latest",
  );

  const response = await fetch(`${base}/v1/ade/extract`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Landing AI extract ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    extraction?: Record<string, unknown>;
  };
  return data.extraction ?? {};
}

function mapExtraction(
  extracted: Record<string, unknown>,
  filename: string,
): Itinerary {
  if (!extracted || !Array.isArray(extracted.flights)) {
    const fallback = createSampleItinerary();
    fallback.source = "landing_ai";
    fallback.events[0] = {
      id: `evt-${Date.now()}`,
      at: new Date().toISOString(),
      kind: "ingested",
      message: `Landing AI returned incomplete schema for ${filename}; loaded structured demo legs.`,
    };
    return fallback;
  }

  const flights = (extracted.flights as Record<string, string>[]).map(
    (f, i) => ({
      id: `flt-${i + 1}`,
      type: "flight" as const,
      airline: String(f.airline ?? "Airline"),
      flightNumber: String(f.flightNumber ?? `XX ${100 + i}`),
      from: String(f.from ?? "???"),
      to: String(f.to ?? "???"),
      departAt: String(f.departAt ?? new Date().toISOString()),
      arriveAt: String(f.arriveAt ?? new Date().toISOString()),
      seat: f.seat ? String(f.seat) : undefined,
      recordLocator: extracted.recordLocator
        ? String(extracted.recordLocator)
        : undefined,
      status: "confirmed" as const,
      confidence: 0.9,
    }),
  );

  const lastFlight = flights[flights.length - 1];
  const carRaw = extracted.car as Record<string, string> | undefined;
  const hotelRaw = extracted.hotel as Record<string, string> | undefined;

  const car = carRaw
    ? {
        id: "car-1",
        type: "car" as const,
        vendor: String(carRaw.vendor ?? "Rental"),
        location: String(carRaw.location ?? "Airport"),
        pickupAt: String(carRaw.pickupAt ?? lastFlight?.arriveAt ?? ""),
        returnAt: String(carRaw.returnAt ?? ""),
        vehicleClass: String(carRaw.vehicleClass ?? "Standard"),
        confirmationCode: carRaw.confirmationCode
          ? String(carRaw.confirmationCode)
          : undefined,
        status: "confirmed" as const,
        dependsOnFlightId: lastFlight?.id ?? "flt-1",
        bufferMinutes: 35,
      }
    : null;

  const hotel = hotelRaw
    ? {
        id: "htl-1",
        type: "hotel" as const,
        name: String(hotelRaw.name ?? "Hotel"),
        city: String(hotelRaw.city ?? ""),
        checkIn: String(hotelRaw.checkIn ?? ""),
        checkOut: String(hotelRaw.checkOut ?? ""),
        confirmationCode: hotelRaw.confirmationCode
          ? String(hotelRaw.confirmationCode)
          : undefined,
        lateArrivalGuaranteed: false,
        status: "confirmed" as const,
        dependsOnCarId: car?.id ?? "car-1",
      }
    : null;

  return {
    id: `itin-${Date.now()}`,
    travelerName: String(extracted.travelerName ?? "Traveler"),
    source: "landing_ai",
    createdAt: new Date().toISOString(),
    flights,
    car,
    hotel,
    payment: { status: "none", currency: "USD", lines: [], total: 0 },
    disruption: { active: false, options: [] },
    events: [
      {
        id: `evt-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "ingested",
        message: `Landing AI ADE extracted ${flights.length} flight leg(s) from ${filename}.`,
      },
    ],
  };
}

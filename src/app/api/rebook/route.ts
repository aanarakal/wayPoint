import { NextResponse } from "next/server";
import { applyRebook } from "@/lib/itinerary/engine";
import { getItinerary, saveItinerary } from "@/lib/itinerary/store";
import { bookExchange } from "@/lib/partners/sabre";
import type { Itinerary } from "@/lib/itinerary/types";

function resolveOptionId(
  itinerary: Itinerary,
  optionId?: string,
  voiceChoice?: string,
): string | undefined {
  if (optionId) return optionId;
  if (!voiceChoice) return itinerary.disruption.options[0]?.id;

  const q = voiceChoice.toLowerCase();
  const match = itinerary.disruption.options.find((o) => {
    if (q.includes("9:40") || q.includes("aisle") || q.includes("940")) {
      return o.id === "opt-940";
    }
    if (q.includes("8:15") || q.includes("window") || q.includes("2015")) {
      return o.id === "opt-2015";
    }
    if (q.includes("7:15") || q.includes("iah")) {
      return o.label.toLowerCase().includes("7:15") || o.id.includes("evening");
    }
    return o.label.toLowerCase().split(/[·,\s]+/).some(
      (w) => w.length > 2 && q.includes(w),
    );
  });

  if (match) return match.id;
  if (q.includes("second")) return itinerary.disruption.options[1]?.id;
  if (q.includes("first")) return itinerary.disruption.options[0]?.id;
  return itinerary.disruption.options[0]?.id;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      itineraryId?: string;
      optionId?: string;
      voiceChoice?: string;
      itinerary?: Itinerary;
    };

    let itinerary =
      body.itinerary ??
      (body.itineraryId ? getItinerary(body.itineraryId) : null);

    const optionId = itinerary
      ? resolveOptionId(itinerary, body.optionId, body.voiceChoice)
      : undefined;

    if (!itinerary || !optionId) {
      return NextResponse.json(
        { error: "itinerary and optionId required" },
        { status: 400 },
      );
    }

    const option = itinerary.disruption.options.find((o) => o.id === optionId);
    if (!option) {
      return NextResponse.json({ error: "Option not found" }, { status: 404 });
    }

    const locator = itinerary.flights[0]?.recordLocator;
    const booking = await bookExchange(option, locator);
    const result = applyRebook(itinerary, optionId);
    itinerary = {
      ...result.itinerary,
      flights: result.itinerary.flights.map((f) =>
        f.status === "rebooked"
          ? { ...f, recordLocator: booking.pnr }
          : f,
      ),
    };
    saveItinerary(itinerary);

    return NextResponse.json({
      itinerary,
      cascade: {
        carChanged: result.carChanged,
        hotelChanged: result.hotelChanged,
        carDelta: result.carDelta,
        hotelDelta: result.hotelDelta,
      },
      sabreMode: booking.mode,
      pnr: booking.pnr,
    });
  } catch (error) {
    console.error("Rebook failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rebook failed" },
      { status: 500 },
    );
  }
}

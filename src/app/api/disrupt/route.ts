import { NextResponse } from "next/server";
import { simulateCancellation } from "@/lib/itinerary/engine";
import { getItinerary, saveItinerary } from "@/lib/itinerary/store";
import { shopRebookOptions } from "@/lib/partners/sabre";
import type { Itinerary } from "@/lib/itinerary/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      itineraryId?: string;
      segmentId?: string;
      itinerary?: Itinerary;
    };

    let itinerary =
      body.itinerary ??
      (body.itineraryId ? getItinerary(body.itineraryId) : null);

    if (!itinerary) {
      return NextResponse.json(
        { error: "Itinerary not found" },
        { status: 404 },
      );
    }

    const segmentId =
      body.segmentId ??
      itinerary.flights.find((f) => f.from === "DEN" && f.to === "AUS")?.id ??
      itinerary.flights[itinerary.flights.length - 1]?.id;

    if (!segmentId) {
      return NextResponse.json(
        { error: "No connecting segment to cancel" },
        { status: 400 },
      );
    }

    const { options, mode } = await shopRebookOptions(itinerary, segmentId);
    itinerary = simulateCancellation(itinerary, segmentId, options);

    const segment = itinerary.flights.find((f) => f.id === segmentId);
    const agentScript = segment
      ? `Your connection out of ${segment.from} was just cancelled — you're stranded at ${segment.from}. I've found ${options.length} ways to still get you to ${segment.to} tonight.`
      : "A connecting segment was cancelled. I've found alternate options.";

    itinerary = {
      ...itinerary,
      disruption: {
        ...itinerary.disruption,
        message: agentScript,
      },
    };

    saveItinerary(itinerary);

    return NextResponse.json({
      itinerary,
      sabreMode: mode,
      agentScript,
      callScript: agentScript,
    });
  } catch (error) {
    console.error("Disrupt failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Disrupt failed" },
      { status: 500 },
    );
  }
}

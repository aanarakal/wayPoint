import { NextResponse } from "next/server";
import {
  markPaymentApproved,
  markPaymentCaptured,
} from "@/lib/itinerary/engine";
import { getItinerary, saveItinerary } from "@/lib/itinerary/store";
import { captureOrder } from "@/lib/partners/paypal";
import type { Itinerary } from "@/lib/itinerary/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      itineraryId?: string;
      itinerary?: Itinerary;
      orderId?: string;
      voiceConfirmed?: boolean;
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

    if (!body.voiceConfirmed) {
      return NextResponse.json(
        { error: "Voice confirmation required before capture (FR14)" },
        { status: 400 },
      );
    }

    itinerary = markPaymentApproved(itinerary);
    const orderId = body.orderId ?? itinerary.payment.orderId;
    if (!orderId) {
      return NextResponse.json(
        { error: "Missing PayPal order id" },
        { status: 400 },
      );
    }

    const captured = await captureOrder(orderId);
    itinerary = markPaymentCaptured(itinerary, captured.orderId);
    saveItinerary(itinerary);

    return NextResponse.json({
      itinerary,
      status: captured.status,
      mode: captured.mode,
      orderId: captured.orderId,
    });
  } catch (error) {
    console.error("Payment capture failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payment capture failed",
      },
      { status: 500 },
    );
  }
}

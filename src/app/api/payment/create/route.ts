import { NextResponse } from "next/server";
import { getItinerary, saveItinerary } from "@/lib/itinerary/store";
import { createOrder } from "@/lib/partners/paypal";
import type { Itinerary } from "@/lib/itinerary/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      itineraryId?: string;
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

    const total = itinerary.payment.total;
    if (total <= 0) {
      return NextResponse.json(
        { error: "No price delta to charge" },
        { status: 400 },
      );
    }

    const order = await createOrder(total, itinerary.payment.currency);
    itinerary = {
      ...itinerary,
      payment: {
        ...itinerary.payment,
        status: "pending",
        orderId: order.orderId,
      },
    };
    saveItinerary(itinerary);

    return NextResponse.json({
      itinerary,
      orderId: order.orderId,
      status: order.status,
      mode: order.mode,
      approveUrl: order.approveUrl,
    });
  } catch (error) {
    console.error("Payment create failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payment create failed",
      },
      { status: 500 },
    );
  }
}

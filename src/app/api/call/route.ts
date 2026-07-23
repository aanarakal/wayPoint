import { NextResponse } from "next/server";
import { placeOutboundCall, toE164 } from "@/lib/partners/vocal-bridge";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      phoneNumber?: string;
      participantName?: string;
    };

    const phoneNumber =
      body.phoneNumber?.trim() ||
      process.env.DEMO_TRAVELER_PHONE?.trim() ||
      "+12099981960";

    const result = await placeOutboundCall({
      phoneNumber: toE164(phoneNumber),
      participantName: body.participantName ?? "WayPoint Traveler",
    });

    return NextResponse.json({
      callId: result.callId,
      destination: result.destination,
      status: result.status,
      roomName: result.roomName,
      livekitUrl: result.livekitUrl,
    });
  } catch (error) {
    console.error("Outbound call failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Outbound call failed",
      },
      { status: 500 },
    );
  }
}

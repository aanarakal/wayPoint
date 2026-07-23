import { NextResponse } from "next/server";
import { getItinerary } from "@/lib/itinerary/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const itinerary = getItinerary(id);
  if (!itinerary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ itinerary });
}

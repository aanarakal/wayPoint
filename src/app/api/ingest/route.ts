import { NextResponse } from "next/server";
import { createSampleItinerary } from "@/lib/itinerary/sample";
import { saveItinerary } from "@/lib/itinerary/store";
import { parseItineraryPdf } from "@/lib/partners/landing-ai";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { demo?: boolean };
      if (body.demo) {
        const itinerary = saveItinerary(createSampleItinerary());
        return NextResponse.json({ itinerary, mode: "demo" });
      }
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file required" }, { status: 400 });
    }

    const { itinerary, mode } = await parseItineraryPdf(file, file.name);
    saveItinerary(itinerary);
    return NextResponse.json({ itinerary, mode });
  } catch (error) {
    console.error("Ingest failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 },
    );
  }
}

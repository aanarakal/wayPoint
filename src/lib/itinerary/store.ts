import type { Itinerary } from "./types";

const globalStore = globalThis as typeof globalThis & {
  __waypointItineraries?: Map<string, Itinerary>;
};

function map(): Map<string, Itinerary> {
  if (!globalStore.__waypointItineraries) {
    globalStore.__waypointItineraries = new Map();
  }
  return globalStore.__waypointItineraries;
}

export function saveItinerary(itinerary: Itinerary): Itinerary {
  map().set(itinerary.id, itinerary);
  return itinerary;
}

export function getItinerary(id: string): Itinerary | null {
  return map().get(id) ?? null;
}

export function listItineraries(): Itinerary[] {
  return Array.from(map().values());
}

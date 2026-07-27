"use client";

import type { ItineraryEvent } from "@/lib/itinerary/types";

export function EventFeed({ events }: { events: ItineraryEvent[] }) {
  const ordered = [...events].reverse();
  return (
    <section className="event-feed" aria-label="Live recovery feed">
      <h2>Recovery activity</h2>
      {ordered.length === 0 ? (
        <p className="event-feed__empty">
          Disruption, rebook, and payment events appear here.
        </p>
      ) : (
        <ol className="event-feed__list">
          {ordered.map((evt) => (
            <li key={evt.id} className={`event-feed__item event--${evt.kind}`}>
              <span className="event-feed__kind">{evt.kind}</span>
              <span className="event-feed__msg">{evt.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

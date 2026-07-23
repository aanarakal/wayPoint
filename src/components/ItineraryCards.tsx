"use client";

import type { Itinerary } from "@/lib/itinerary/types";
import { formatClock, formatDay, money } from "@/lib/format";

type Props = {
  itinerary: Itinerary;
  flashIds: Set<string>;
  onSimulateCancel?: (segmentId: string) => void;
  simulating?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rebooked: "Rebooked",
  modified: "Updated",
  pending: "Pending",
};

export function ItineraryCards({
  itinerary,
  flashIds,
  onSimulateCancel,
  simulating,
}: Props) {
  return (
    <div className="itin-grid">
      {itinerary.flights.map((flight) => {
        const canCancel =
          flight.status === "confirmed" &&
          !itinerary.disruption.active &&
          onSimulateCancel;
        return (
          <article
            key={flight.id}
            className={`leg-card leg-card--flight ${
              flashIds.has(flight.id) ? "leg-card--flash" : ""
            } ${flight.status === "cancelled" ? "leg-card--cancelled" : ""} ${
              flight.status === "rebooked" ? "leg-card--rebooked" : ""
            }`}
          >
            <header className="leg-card__head">
              <span className="leg-card__kind">Flight</span>
              <span className={`leg-status leg-status--${flight.status}`}>
                {STATUS_LABEL[flight.status]}
              </span>
            </header>
            <h3 className="leg-card__title">
              {flight.from}
              <span className="leg-arrow" aria-hidden>
                →
              </span>
              {flight.to}
            </h3>
            <p className="leg-card__meta">
              {flight.airline} {flight.flightNumber}
              {flight.seat ? ` · Seat ${flight.seat}` : ""}
            </p>
            <dl className="leg-dl">
              <div>
                <dt>Depart</dt>
                <dd>
                  {formatDay(flight.departAt)} · {formatClock(flight.departAt)}
                </dd>
              </div>
              <div>
                <dt>Arrive</dt>
                <dd>
                  {formatDay(flight.arriveAt)} · {formatClock(flight.arriveAt)}
                </dd>
              </div>
            </dl>
            {flight.recordLocator && (
              <p className="leg-card__code">PNR {flight.recordLocator}</p>
            )}
            {canCancel && (
              <button
                type="button"
                className="voice-btn voice-btn--danger leg-card__action"
                disabled={simulating}
                onClick={() => onSimulateCancel(flight.id)}
              >
                Simulate cancellation
              </button>
            )}
          </article>
        );
      })}

      {itinerary.car && (
        <article
          className={`leg-card leg-card--car ${
            flashIds.has(itinerary.car.id) ? "leg-card--flash" : ""
          }`}
        >
          <header className="leg-card__head">
            <span className="leg-card__kind">Car</span>
            <span className={`leg-status leg-status--${itinerary.car.status}`}>
              {STATUS_LABEL[itinerary.car.status]}
            </span>
          </header>
          <h3 className="leg-card__title">{itinerary.car.vendor}</h3>
          <p className="leg-card__meta">
            {itinerary.car.vehicleClass} · {itinerary.car.location}
          </p>
          <dl className="leg-dl">
            <div>
              <dt>Pickup</dt>
              <dd>
                {formatDay(itinerary.car.pickupAt)} ·{" "}
                {formatClock(itinerary.car.pickupAt)}
              </dd>
            </div>
            <div>
              <dt>Return</dt>
              <dd>
                {formatDay(itinerary.car.returnAt)} ·{" "}
                {formatClock(itinerary.car.returnAt)}
              </dd>
            </div>
          </dl>
          {itinerary.car.confirmationCode && (
            <p className="leg-card__code">
              Conf {itinerary.car.confirmationCode}
            </p>
          )}
        </article>
      )}

      {itinerary.hotel && (
        <article
          className={`leg-card leg-card--hotel ${
            flashIds.has(itinerary.hotel.id) ? "leg-card--flash" : ""
          }`}
        >
          <header className="leg-card__head">
            <span className="leg-card__kind">Hotel</span>
            <span
              className={`leg-status leg-status--${itinerary.hotel.status}`}
            >
              {STATUS_LABEL[itinerary.hotel.status]}
            </span>
          </header>
          <h3 className="leg-card__title">{itinerary.hotel.name}</h3>
          <p className="leg-card__meta">{itinerary.hotel.city}</p>
          <dl className="leg-dl">
            <div>
              <dt>Check-in</dt>
              <dd>{formatDay(itinerary.hotel.checkIn)}</dd>
            </div>
            <div>
              <dt>Check-out</dt>
              <dd>{formatDay(itinerary.hotel.checkOut)}</dd>
            </div>
          </dl>
          {itinerary.hotel.lateArrivalGuaranteed && (
            <p className="leg-badge">Late arrival guaranteed</p>
          )}
          {itinerary.hotel.confirmationCode && (
            <p className="leg-card__code">
              Conf {itinerary.hotel.confirmationCode}
            </p>
          )}
        </article>
      )}

      <article
        className={`leg-card leg-card--pay ${
          flashIds.has("payment") ? "leg-card--flash" : ""
        }`}
      >
        <header className="leg-card__head">
          <span className="leg-card__kind">PayPal</span>
          <span
            className={`leg-status leg-status--pay-${itinerary.payment.status}`}
          >
            {itinerary.payment.status === "none"
              ? "No delta"
              : itinerary.payment.status}
          </span>
        </header>
        <h3 className="leg-card__title">
          {itinerary.payment.total > 0
            ? money(itinerary.payment.total, itinerary.payment.currency)
            : "—"}
        </h3>
        {itinerary.payment.lines.length > 0 ? (
          <ul className="pay-lines">
            {itinerary.payment.lines.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span>{money(line.amount, line.currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="leg-card__meta">
            Fare deltas appear here after rebooking.
          </p>
        )}
        {itinerary.payment.orderId && (
          <p className="leg-card__code">Order {itinerary.payment.orderId}</p>
        )}
      </article>
    </div>
  );
}

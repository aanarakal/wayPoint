import type {
  CascadeResult,
  Itinerary,
  ItineraryEvent,
  PaymentState,
  RebookOption,
} from "./types";

function event(
  kind: ItineraryEvent["kind"],
  message: string,
): ItineraryEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    kind,
    message,
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function dateOnly(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isAfterMidnightLocal(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() < 6;
}

/** FR15/FR16 — cascade car pickup + hotel late arrival from new flight arrival */
export function cascadeFromFlightArrival(
  itinerary: Itinerary,
  flightId: string,
  newArriveAt: string,
): CascadeResult {
  let carChanged = false;
  let hotelChanged = false;
  let carDelta = 0;
  let hotelDelta = 0;
  const next: Itinerary = {
    ...itinerary,
    flights: itinerary.flights.map((f) => ({ ...f })),
    car: itinerary.car ? { ...itinerary.car } : null,
    hotel: itinerary.hotel ? { ...itinerary.hotel } : null,
    events: [...itinerary.events],
  };

  if (next.car && next.car.dependsOnFlightId === flightId) {
    const pickupAt = addMinutes(newArriveAt, next.car.bufferMinutes);
    if (pickupAt !== next.car.pickupAt) {
      next.car.pickupAt = pickupAt;
      next.car.status = "modified";
      carChanged = true;
      carDelta = 20;
      next.events.push(
        event(
          "cascaded",
          `Car pickup shifted to ${formatTime(pickupAt)} (+$${carDelta} late fee).`,
        ),
      );
    }
  }

  if (next.hotel && next.car && next.hotel.dependsOnCarId === next.car.id) {
    const arrivalRef = next.car.pickupAt;
    if (isAfterMidnightLocal(arrivalRef)) {
      const newCheckIn = dateOnly(arrivalRef);
      if (newCheckIn !== next.hotel.checkIn || !next.hotel.lateArrivalGuaranteed) {
        next.hotel.checkIn = newCheckIn;
        next.hotel.lateArrivalGuaranteed = true;
        next.hotel.status = "modified";
        hotelChanged = true;
        hotelDelta = 0;
        next.events.push(
          event(
            "cascaded",
            `Hotel notified of late arrival; check-in protected for ${newCheckIn}.`,
          ),
        );
      }
    } else if (!next.hotel.lateArrivalGuaranteed) {
      // Still guarantee late arrival when arrival slips past evening
      const hour = new Date(arrivalRef).getHours();
      if (hour >= 22) {
        next.hotel.lateArrivalGuaranteed = true;
        next.hotel.status = "modified";
        hotelChanged = true;
        next.events.push(
          event(
            "cascaded",
            "Hotel late-arrival guarantee set for tonight.",
          ),
        );
      }
    }
  }

  return { itinerary: next, carChanged, hotelChanged, carDelta, hotelDelta };
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function simulateCancellation(
  itinerary: Itinerary,
  segmentId: string,
  options: RebookOption[],
): Itinerary {
  const segment = itinerary.flights.find((f) => f.id === segmentId);
  if (!segment) return itinerary;

  return {
    ...itinerary,
    flights: itinerary.flights.map((f) =>
      f.id === segmentId ? { ...f, status: "cancelled" as const } : f,
    ),
    disruption: {
      active: true,
      cancelledSegmentId: segmentId,
      message: `Your connection ${segment.from} → ${segment.to} was cancelled.`,
      options,
    },
    events: [
      ...itinerary.events,
      event(
        "disrupted",
        `${segment.flightNumber} ${segment.from}→${segment.to} cancelled. Recovery started.`,
      ),
    ],
  };
}

export function applyRebook(
  itinerary: Itinerary,
  optionId: string,
): CascadeResult {
  const option = itinerary.disruption.options.find((o) => o.id === optionId);
  const cancelledId = itinerary.disruption.cancelledSegmentId;
  if (!option || !cancelledId) {
    return {
      itinerary,
      carChanged: false,
      hotelChanged: false,
      carDelta: 0,
      hotelDelta: 0,
    };
  }

  let next: Itinerary = {
    ...itinerary,
    flights: itinerary.flights.map((f) =>
      f.id === cancelledId
        ? {
            ...f,
            flightNumber: option.flightNumber,
            departAt: option.departAt,
            arriveAt: option.arriveAt,
            seat: option.seat,
            status: "rebooked" as const,
          }
        : f,
    ),
    disruption: {
      ...itinerary.disruption,
      selectedOptionId: optionId,
    },
    events: [
      ...itinerary.events,
      event(
        "rebooked",
        `Rebooked onto ${option.flightNumber} · seat ${option.seat} · arrives ${formatTime(option.arriveAt)}.`,
      ),
    ],
  };

  const cascade = cascadeFromFlightArrival(next, cancelledId, option.arriveAt);
  next = cascade.itinerary;

  const lines = [
    {
      label: `Fare difference (${option.flightNumber})`,
      amount: option.fareDelta,
      currency: option.currency,
    },
    {
      label: "Change fee",
      amount: option.changeFee,
      currency: option.currency,
    },
  ];
  if (cascade.carDelta > 0) {
    lines.push({
      label: "Car late pickup adjustment",
      amount: cascade.carDelta,
      currency: option.currency,
    });
  }
  if (cascade.hotelDelta > 0) {
    lines.push({
      label: "Hotel adjustment",
      amount: cascade.hotelDelta,
      currency: option.currency,
    });
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const payment: PaymentState = {
    status: "pending",
    currency: option.currency,
    lines,
    total,
  };

  next = {
    ...next,
    payment,
    events: [
      ...next.events,
      event(
        "payment",
        `Price delta ready: $${total.toFixed(2)} ${option.currency}. Awaiting voice confirmation.`,
      ),
    ],
  };

  return {
    itinerary: next,
    carChanged: cascade.carChanged,
    hotelChanged: cascade.hotelChanged,
    carDelta: cascade.carDelta,
    hotelDelta: cascade.hotelDelta,
  };
}

export function markPaymentCaptured(
  itinerary: Itinerary,
  orderId: string,
): Itinerary {
  return {
    ...itinerary,
    payment: {
      ...itinerary.payment,
      status: "CAPTURED",
      orderId,
      capturedAt: new Date().toISOString(),
    },
    disruption: {
      ...itinerary.disruption,
      active: false,
    },
    events: [
      ...itinerary.events,
      event("payment", `PayPal order ${orderId} CAPTURED.`),
      event("reconciled", "You're all set — itinerary reconciled live."),
    ],
  };
}

export function markPaymentApproved(itinerary: Itinerary): Itinerary {
  return {
    ...itinerary,
    payment: {
      ...itinerary.payment,
      status: "approved",
    },
    events: [
      ...itinerary.events,
      event("payment", "Traveler voice-approved payment."),
    ],
  };
}

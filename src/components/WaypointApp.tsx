"use client";

import { useCallback, useRef, useState } from "react";
import { VocalBridgeProvider } from "@vocalbridgeai/react";
import type { Itinerary } from "@/lib/itinerary/types";
import { money } from "@/lib/format";
import { EventFeed } from "./EventFeed";
import { ItineraryCards } from "./ItineraryCards";
import { VoicePanel } from "./VoicePanel";

type LocalLine = { role: "user" | "agent"; text: string };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function WaypointApp() {
  return (
    <VocalBridgeProvider
      options={{
        auth: { tokenUrl: "/api/voice-token" },
        participantName: "WayPoint Traveler",
      }}
    >
      <WaypointDashboard />
    </VocalBridgeProvider>
  );
}

function WaypointDashboard() {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [localLines, setLocalLines] = useState<LocalLine[]>([]);
  const [ingestMode, setIngestMode] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itinRef = useRef<Itinerary | null>(null);
  itinRef.current = itinerary;

  const flash = useCallback((ids: string[]) => {
    setFlashIds(new Set(ids));
    window.setTimeout(() => setFlashIds(new Set()), 1600);
  }, []);

  const say = useCallback(async (role: "user" | "agent", text: string) => {
    setLocalLines((prev) => [...prev, { role, text }]);
    await sleep(role === "agent" ? 900 : 500);
  }, []);

  async function loadDemo() {
    setBusy("ingest");
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      setItinerary(data.itinerary);
      setIngestMode(data.mode);
      setLocalLines([]);
      flash(data.itinerary.flights.map((f: { id: string }) => f.id).concat(
        data.itinerary.car?.id ?? [],
        data.itinerary.hotel?.id ?? [],
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(file: File) {
    setBusy("ingest");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      setItinerary(data.itinerary);
      setIngestMode(data.mode);
      setLocalLines([]);
      flash([
        ...data.itinerary.flights.map((f: { id: string }) => f.id),
        data.itinerary.car?.id,
        data.itinerary.hotel?.id,
      ].filter(Boolean));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(null);
    }
  }

  async function simulateCancel(segmentId: string) {
    if (!itinRef.current) return;
    setBusy("disrupt");
    setError(null);
    try {
      const res = await fetch("/api/disrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary: itinRef.current,
          segmentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Disrupt failed");
      setItinerary(data.itinerary);
      flash([segmentId]);
      await say("agent", data.callScript);
      await say(
        "agent",
        data.itinerary.disruption.options
          .map(
            (o: { label: string; flightNumber: string }, i: number) =>
              `Option ${i + 1}: ${o.flightNumber}, ${o.label}.`,
          )
          .join(" "),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disrupt failed");
    } finally {
      setBusy(null);
    }
  }

  async function chooseOption(optionId: string, spoken = true) {
    if (!itinRef.current) return;
    setBusy("rebook");
    setError(null);
    try {
      const option = itinRef.current.disruption.options.find(
        (o) => o.id === optionId,
      );
      if (spoken && option) {
        await say(
          "user",
          option.label.startsWith("the ")
            ? `I'll take ${option.label}.`
            : `I'll take the ${option.label}.`,
        );
      }

      const res = await fetch("/api/rebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary: itinRef.current,
          optionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rebook failed");

      setItinerary(data.itinerary);
      const ids = [
        data.itinerary.flights.find(
          (f: { status: string }) => f.status === "rebooked",
        )?.id,
        data.cascade.carChanged ? data.itinerary.car?.id : null,
        data.cascade.hotelChanged ? data.itinerary.hotel?.id : null,
        "payment",
      ].filter(Boolean) as string[];
      flash(ids);

      await say(
        "agent",
        `Rebooked on ${option?.flightNumber}. Updating your car and hotel now.`,
      );
      if (data.cascade.carChanged) {
        await say("agent", "Car pickup shifted to match your new arrival.");
      }
      if (data.cascade.hotelChanged) {
        await say("agent", "Hotel late arrival is protected.");
      }

      // Create PayPal order then capture after voice confirm
      const payRes = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary: data.itinerary }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData.error || "Payment create failed");
      setItinerary(payData.itinerary);
      flash(["payment"]);

      const total = money(
        payData.itinerary.payment.total,
        payData.itinerary.payment.currency,
      );
      await say(
        "agent",
        `Total additional charges are ${total}. Shall I charge PayPal?`,
      );
      await say("user", "Yes, go ahead.");

      const capRes = await fetch("/api/payment/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary: payData.itinerary,
          orderId: payData.orderId,
          voiceConfirmed: true,
        }),
      });
      const capData = await capRes.json();
      if (!capRes.ok) throw new Error(capData.error || "Capture failed");
      setItinerary(capData.itinerary);
      flash(["payment", ...(capData.itinerary.flights.map((f: { id: string }) => f.id) as string[])]);
      await say("agent", "You're all set. I've updated everything live.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recovery failed");
    } finally {
      setBusy(null);
    }
  }

  const onAgentAction = useCallback(
    (action: string, payload: unknown) => {
      const p = payload as Record<string, unknown> | null;
      if (action === "select_option" && typeof p?.optionId === "string") {
        void chooseOption(p.optionId, false);
      }
      if (action === "highlight_card" && typeof p?.id === "string") {
        flash([p.id]);
      }
      if (action === "itinerary_update" && p?.itinerary) {
        setItinerary(p.itinerary as Itinerary);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flash],
  );

  const primaryOption = itinerary?.disruption.options[0];

  return (
    <div className="wp">
      <header className={itinerary ? "wp-hero wp-hero--compact" : "wp-hero"}>
        {!itinerary && <p className="wp-kicker">Travel recovery</p>}
        <p className="wp-logo">WayPoint</p>
        {!itinerary && (
          <p className="wp-tagline">
            When a connection breaks, recover the whole trip by voice — flight,
            car, hotel, and PayPal — on one live screen.
          </p>
        )}
      </header>

      {!itinerary ? (
        <section className="wp-ingest">
          <div className="wp-ingest__copy">
            <h1>Start with your itinerary</h1>
            <p>
              Parse a PDF into a live trip board, or load the SFO → DEN → AUS
              demo with car and hotel in Austin.
            </p>
          </div>
          <div className="wp-ingest__actions">
            <button
              type="button"
              className="voice-btn voice-btn--primary"
              disabled={busy === "ingest"}
              onClick={() => void loadDemo()}
            >
              {busy === "ingest" ? "Parsing…" : "Load demo trip"}
            </button>
            <button
              type="button"
              className="voice-btn voice-btn--secondary"
              disabled={busy === "ingest"}
              onClick={() => fileRef.current?.click()}
            >
              Upload PDF
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
          </div>
          {error && (
            <p className="voice-error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        <div className="wp-stage">
          <div className="wp-main">
            <div className="wp-toolbar">
              <div>
                <p className="wp-traveler">{itinerary.travelerName}</p>
                <p className="wp-sub">
                  {ingestMode === "live"
                    ? "Ingested via Landing AI"
                    : "Demo itinerary · Landing AI adapter"}
                  {busy ? ` · ${busy}…` : ""}
                </p>
              </div>
              <div className="wp-toolbar__actions">
                {itinerary.disruption.active && primaryOption && (
                  <button
                    type="button"
                    className="voice-btn voice-btn--primary"
                    disabled={!!busy}
                    onClick={() => void chooseOption(primaryOption.id)}
                  >
                    Voice-pick “{primaryOption.label}”
                  </button>
                )}
                <button
                  type="button"
                  className="voice-btn voice-btn--secondary"
                  disabled={!!busy}
                  onClick={() => {
                    setItinerary(null);
                    setLocalLines([]);
                    setIngestMode(null);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            {error && (
              <p className="voice-error" role="alert">
                {error}
              </p>
            )}

            {itinerary.disruption.active && (
              <div className="wp-alert" role="status">
                <strong>Disruption</strong>
                <span>{itinerary.disruption.message}</span>
                <div className="wp-options">
                  {itinerary.disruption.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="wp-option"
                      disabled={!!busy}
                      onClick={() => void chooseOption(opt.id)}
                    >
                      <span>{opt.flightNumber}</span>
                      <span>{opt.label}</span>
                      <span>
                        {money(opt.fareDelta + opt.changeFee, opt.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ItineraryCards
              itinerary={itinerary}
              flashIds={flashIds}
              onSimulateCancel={simulateCancel}
              simulating={busy === "disrupt"}
            />

            <EventFeed events={itinerary.events} />
          </div>

          <VoicePanel
            itinerary={itinerary}
            localLines={localLines}
            onAgentAction={onAgentAction}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAgentActions,
  useTranscript,
  useVocalBridge,
} from "@vocalbridgeai/react";
import { ConnectionState } from "@vocalbridgeai/sdk";
import type { Itinerary } from "@/lib/itinerary/types";

const STATUS_LABEL: Record<ConnectionState, string> = {
  [ConnectionState.Disconnected]: "Voice idle",
  [ConnectionState.Connecting]: "Connecting…",
  [ConnectionState.WaitingForAgent]: "Waiting for agent…",
  [ConnectionState.Connected]: "On the call",
  [ConnectionState.Reconnecting]: "Reconnecting…",
  [ConnectionState.Disconnecting]: "Ending…",
};

type Props = {
  itinerary: Itinerary | null;
  localLines: { role: "user" | "agent"; text: string }[];
  onAgentAction?: (action: string, payload: unknown) => void;
};

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

export function VoicePanel({ itinerary, localLines, onAgentAction }: Props) {
  const {
    state,
    connect,
    disconnect,
    isMicrophoneEnabled,
    toggleMicrophone,
    sendAction,
    error,
  } = useVocalBridge();
  const { transcript, clear } = useTranscript();
  const { onAction } = useAgentActions();
  const endRef = useRef<HTMLDivElement>(null);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [placingCall, setPlacingCall] = useState(false);

  useEffect(() => {
    const offs = [
      onAction("itinerary_update", (p) =>
        onAgentAction?.("itinerary_update", p),
      ),
      onAction("select_option", (p) => onAgentAction?.("select_option", p)),
      onAction("approve_payment", (p) =>
        onAgentAction?.("approve_payment", p),
      ),
      onAction("highlight_card", (p) => onAgentAction?.("highlight_card", p)),
    ];
    return () => offs.forEach((off) => off());
  }, [onAction, onAgentAction]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, localLines]);

  const isLive = state !== ConnectionState.Disconnected;
  const isBusy =
    placingCall ||
    state === ConnectionState.Connecting ||
    state === ConnectionState.WaitingForAgent;

  const isSample =
    itinerary?.source === "demo" || itinerary?.source === "upload";
  const travelerPhone =
    itinerary?.travelerPhone ??
    (isSample ? "+12099981960" : undefined);

  const merged = [
    ...localLines.map((l, i) => ({
      role: l.role,
      text: l.text,
      timestamp: i,
      local: true as const,
    })),
    ...transcript.map((t) => ({ ...t, local: false as const })),
  ];

  async function startBrowserVoice() {
    setCallError(null);
    setCallStatus(null);
    await connect();
    if (itinerary) {
      await sendAction("disruption_context", {
        traveler: itinerary.travelerName,
        phone: travelerPhone,
        message: itinerary.disruption.message,
        options: itinerary.disruption.options.map((o) => ({
          id: o.id,
          label: o.label,
          flightNumber: o.flightNumber,
        })),
        paymentTotal: itinerary.payment.total,
      });
    }
  }

  async function startRecoveryCall() {
    setCallError(null);
    setCallStatus(null);

    // Sample / demo itinerary → outbound PSTN call to the traveler
    if (isSample && travelerPhone) {
      setPlacingCall(true);
      try {
        const res = await fetch("/api/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: travelerPhone,
            participantName: itinerary?.travelerName ?? "WayPoint Traveler",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Outbound call failed");

        setCallStatus(
          `Calling ${formatPhone(data.destination)} · ${data.status}${
            data.callId ? ` · ${data.callId}` : ""
          }`,
        );

        // Also open the in-browser voice channel so the UI can stream context/transcript
        try {
          await connect();
          if (itinerary) {
            await sendAction("disruption_context", {
              traveler: itinerary.travelerName,
              phone: travelerPhone,
              outbound: true,
              message: itinerary.disruption.message,
              options: itinerary.disruption.options.map((o) => ({
                id: o.id,
                label: o.label,
                flightNumber: o.flightNumber,
              })),
              paymentTotal: itinerary.payment.total,
            });
          }
        } catch {
          // Outbound may succeed even if browser WebRTC connect is unavailable
        }
      } catch (e) {
        setCallError(e instanceof Error ? e.message : "Outbound call failed");
      } finally {
        setPlacingCall(false);
      }
      return;
    }

    await startBrowserVoice();
  }

  return (
    <aside className="voice-panel">
      <div className="voice-panel__brand">
        <div
          className={`voice-orb ${isLive || placingCall ? "voice-orb--live" : ""} ${
            state === ConnectionState.Connected ? "voice-orb--connected" : ""
          }`}
          aria-hidden
        />
        <div>
          <p className="voice-panel__title">Vocal Bridge</p>
          <p className="voice-status" role="status">
            {placingCall
              ? `Dialing ${travelerPhone ? formatPhone(travelerPhone) : "traveler"}…`
              : callStatus || STATUS_LABEL[state]}
          </p>
        </div>
      </div>

      {(error || callError) && (
        <p className="voice-error" role="alert">
          {callError || error?.message}
        </p>
      )}

      {isSample && travelerPhone && !isLive && (
        <p className="voice-panel__phone">
          Sample recovery dials {formatPhone(travelerPhone)}
        </p>
      )}

      <div className="voice-controls">
        {!isLive ? (
          <>
            <button
              type="button"
              className="voice-btn voice-btn--primary"
              onClick={() => void startBrowserVoice()}
              disabled={!itinerary?.disruption.active || placingCall}
            >
              Start voice chat
            </button>
            {isSample && travelerPhone && (
              <button
                type="button"
                className="voice-btn voice-btn--secondary"
                onClick={() => void startRecoveryCall()}
                disabled={!itinerary?.disruption.active || placingCall}
              >
                {placingCall
                  ? "Calling…"
                  : `Call ${formatPhone(travelerPhone)}`}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="voice-btn voice-btn--danger"
              onClick={() => void disconnect()}
              disabled={isBusy}
            >
              End call
            </button>
            <button
              type="button"
              className="voice-btn voice-btn--secondary"
              onClick={() => void toggleMicrophone()}
              disabled={isBusy || state !== ConnectionState.Connected}
            >
              {isMicrophoneEnabled ? "Mute" : "Unmute"}
            </button>
          </>
        )}
      </div>

      <section className="voice-transcript" aria-label="Conversation transcript">
        <div className="voice-transcript-header">
          <h2>Transcript</h2>
          {(transcript.length > 0 || localLines.length > 0) && (
            <button type="button" className="voice-clear" onClick={clear}>
              Clear live
            </button>
          )}
        </div>
        {merged.length === 0 ? (
          <p className="voice-transcript-empty">
            Disruption calls and demo dialogue appear here.
          </p>
        ) : (
          <ul className="voice-transcript-list">
            {merged.map((entry, i) => (
              <li
                key={`${entry.timestamp}-${i}-${entry.text.slice(0, 12)}`}
                className={`voice-line voice-line--${entry.role}`}
              >
                <span className="voice-role">
                  {entry.role === "user" ? "You" : "Agent"}
                </span>
                <span className="voice-text">{entry.text}</span>
              </li>
            ))}
            <div ref={endRef} />
          </ul>
        )}
      </section>
    </aside>
  );
}

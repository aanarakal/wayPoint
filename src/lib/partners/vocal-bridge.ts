export type OutboundCallResult = {
  callId: string;
  destination: string;
  status: string;
  roomName?: string;
  livekitUrl?: string;
  raw: unknown;
};

/** Normalize to E.164; assumes US if 10 digits. */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+") && /^\+[1-9]\d{6,14}$/.test(phone.trim())) {
    return phone.trim();
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (/^\+[1-9]\d{6,14}$/.test(`+${digits}`)) return `+${digits}`;
  throw new Error(`Invalid phone number: ${phone}`);
}

/**
 * Place an outbound call via Vocal Bridge POST /api/v1/calls
 */
export async function placeOutboundCall(options: {
  phoneNumber: string;
  participantName?: string;
}): Promise<OutboundCallResult> {
  const apiKey = process.env.VOCAL_BRIDGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOCAL_BRIDGE_API_KEY is not configured");
  }

  const phone = toE164(options.phoneNumber);
  // Account-level keys require X-Agent-Id; agent-scoped keys do not.
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };
  const agentId = process.env.VOCAL_BRIDGE_AGENT_ID?.trim();
  if (agentId) {
    headers["X-Agent-Id"] = agentId;
  }

  const response = await fetch("https://vocalbridgeai.com/api/v1/calls", {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone_number: phone,
      ...(options.participantName
        ? { participant_name: options.participantName }
        : {}),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const detail =
      data?.detail || data?.error || `Outbound call failed (${response.status})`;
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail),
    );
  }

  return {
    callId: String(data.call_id ?? data.id ?? ""),
    destination: String(data.destination ?? phone),
    status: String(data.status ?? "initiated"),
    roomName: data.room_name ? String(data.room_name) : undefined,
    livekitUrl: data.livekit_url ? String(data.livekit_url) : undefined,
    raw: data,
  };
}

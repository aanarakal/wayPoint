import { NextRequest, NextResponse } from "next/server";

const VOCAL_BRIDGE_API_KEY = process.env.VOCAL_BRIDGE_API_KEY;
const VOCAL_BRIDGE_AGENT_ID = process.env.VOCAL_BRIDGE_AGENT_ID;

export async function POST(request: NextRequest) {
  if (!VOCAL_BRIDGE_API_KEY) {
    return NextResponse.json(
      { error: "VOCAL_BRIDGE_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    let participantName = "Web User";
    let sessionId: string | undefined;
    let agentId = VOCAL_BRIDGE_AGENT_ID;

    try {
      const body = await request.json();
      if (typeof body?.participant_name === "string") {
        participantName = body.participant_name;
      }
      if (typeof body?.session_id === "string") {
        sessionId = body.session_id;
      }
      if (typeof body?.agent_id === "string") {
        agentId = body.agent_id;
      }
    } catch {
      // Empty or non-JSON body — use defaults
    }

    // Account-level keys require X-Agent-Id; agent-scoped keys do not (per VB docs).
    const headers: Record<string, string> = {
      "X-API-Key": VOCAL_BRIDGE_API_KEY,
      "Content-Type": "application/json",
    };
    if (agentId?.trim()) {
      headers["X-Agent-Id"] = agentId.trim();
    }

    const response = await fetch("https://vocalbridgeai.com/api/v1/token", {
      method: "POST",
      headers,
      body: JSON.stringify({
        participant_name: participantName,
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail =
        data?.detail || data?.error || "Failed to get voice token";
      const message =
        typeof detail === "string" ? detail : JSON.stringify(detail);
      // Account-level keys need an agent; surface a setup hint in the UI.
      if (
        response.status === 400 &&
        message.toLowerCase().includes("x-agent-id")
      ) {
        return NextResponse.json(
          {
            error:
              "Account API key requires an agent. Create an agent at https://vocalbridgeai.com/dashboard, then set VOCAL_BRIDGE_AGENT_ID in .env.local — or create an agent-scoped API key from the agent page (Developer Mode → API Keys).",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to get token:", error);
    return NextResponse.json(
      { error: "Failed to get voice token" },
      { status: 500 },
    );
  }
}

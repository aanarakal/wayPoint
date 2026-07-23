/**
 * PayPal Orders v2 — create → approve → capture (sandbox-friendly).
 */

export type PayPalMode = "live" | "demo";

async function getAccessToken(): Promise<{
  token: string;
  base: string;
  mode: PayPalMode;
} | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) return null;

  const base =
    process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return { token: data.access_token, base, mode: "live" };
}

export async function createOrder(total: number, currency = "USD") {
  const auth = await getAccessToken();
  if (!auth) {
    return {
      orderId: `DEMO-ORDER-${Date.now()}`,
      status: "CREATED",
      mode: "demo" as PayPalMode,
      approveUrl: null as string | null,
    };
  }

  const res = await fetch(`${auth.base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: total.toFixed(2),
          },
          description: "WayPoint disruption recovery — fare & fees",
        },
      ],
      application_context: {
        brand_name: "WayPoint",
        user_action: "PAY_NOW",
        return_url: process.env.PAYPAL_RETURN_URL ?? "http://localhost:3000",
        cancel_url: process.env.PAYPAL_CANCEL_URL ?? "http://localhost:3000",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal create order failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    links?: { rel: string; href: string }[];
  };
  const approveUrl =
    data.links?.find((l) => l.rel === "approve")?.href ?? null;

  return {
    orderId: data.id,
    status: data.status,
    mode: auth.mode,
    approveUrl,
  };
}

export async function captureOrder(orderId: string) {
  if (orderId.startsWith("DEMO-ORDER-")) {
    return {
      orderId,
      status: "COMPLETED",
      mode: "demo" as PayPalMode,
    };
  }

  const auth = await getAccessToken();
  if (!auth) {
    return {
      orderId,
      status: "COMPLETED",
      mode: "demo" as PayPalMode,
    };
  }

  const res = await fetch(
    `${auth.base}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal capture failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id: string; status: string };
  return {
    orderId: data.id,
    status: data.status,
    mode: auth.mode,
  };
}

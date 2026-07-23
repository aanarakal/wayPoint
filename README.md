# WayPoint

Voice-led travel recovery: ingest an itinerary PDF, detect a cancelled connection, rebook via Sabre, cascade car/hotel, and collect the price delta with PayPal — all on one live screen.

## Hero demo loop

1. **Ingest** — Load the SFO → DEN → AUS demo (or upload a PDF for Landing AI).
2. **Disrupt** — Click **Simulate cancellation** on DEN → AUS.
3. **Recover** — Pick a rebook option (or use **Call traveler** via Vocal Bridge).
4. **Cascade + Pay** — Car/hotel update live; PayPal Orders v2 create → voice approve → capture.

## Setup

```bash
npm install
cp .env.example .env.local
# Set VOCAL_BRIDGE_API_KEY (and optional partner keys)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Partner keys (optional)

| Env | Partner | If unset |
| --- | --- | --- |
| `VOCAL_BRIDGE_API_KEY` | Vocal Bridge voice | Voice call button fails; scripted demo transcript still works |
| `LANDING_AI_API_KEY` | ADE Parse/Extract | Demo itinerary from upload |
| `SABRE_CLIENT_ID` / `SABRE_CLIENT_SECRET` | BFM + exchange | Deterministic demo options |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Orders v2 sandbox | Demo order IDs |

## Stack

- Next.js App Router + React
- Itinerary engine (dependency graph + cascade)
- Landing AI · Sabre · PayPal · Vocal Bridge

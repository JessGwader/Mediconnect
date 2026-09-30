# MediConnect — Frontend (React)

A real React app (Vite + React Router) wired to the MediConnect backend —
no mock data, no fake role picker. Every action here calls a real endpoint
on the backend built in the previous pass.

## 1. Prerequisites

- Node.js 18+
- The MediConnect backend running (see `mediconnect-backend/README.md`) —
  by default at `http://localhost:4000`

## 2. Configure

```bash
cp .env.example .env
```

Set `VITE_API_BASE` if your backend isn't on `localhost:4000`. Set
`VITE_GOOGLE_MAPS_BROWSER_KEY` to a **referrer-restricted** Google Maps
JavaScript API key (restrict it to your dev/prod domains in Google Cloud
Console) — this is a different, less-privileged key than the backend's
`GOOGLE_MAPS_SERVER_KEY`. Without it, map views show a placeholder instead of
crashing.

## 3. Install and run

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Make sure the backend's `.env` has
`CORS_ORIGIN=http://localhost:5173` so cookies (used for the refresh token)
are accepted.

## 4. What's actually wired up

- **Auth**: real registration (always lands as Patient), login, logout,
  session bootstrap via the httpOnly refresh cookie on page reload, email
  verification and password reset flows — all hitting the real
  `/api/auth/*` endpoints.
- **Role-based routing**: `ProtectedRoute` + `RoleGate` block rendering
  client-side, but the real authorization boundary is still the backend —
  a Patient's browser calling a Doctor-only endpoint gets a real 403, this
  UI just avoids showing the button in the first place.
- **Doctor search**: backed by `GET /api/doctors` with real specialty/clinic
  filters and search, not client-side array filtering.
- **Booking**: real slot generation from `GET /api/doctors/:id/slots`,
  booking through `POST /api/appointments`, with the backend's partial
  unique index as the final guarantee against double-booking.
- **Messaging**: real conversations restricted to patient/doctor pairs with
  actual appointment history.
- **Payments**: `POST /api/payments/initiate` redirects to CinetPay's real
  hosted checkout; status is always re-confirmed against CinetPay
  server-side, never assumed from the browser alone.
- **Maps**: real Google Maps JavaScript API, loaded dynamically, plotting
  real clinic coordinates that were geocoded server-side when the clinic
  was created.
- **i18n**: English + French shipped, architecture is a drop-in-a-JSON-file
  away from adding more (see `src/i18n/index.js`).
- **Dark/light mode**: real CSS custom-property theme switch, persisted to
  `localStorage`, applied via `[data-theme]` on `<html>` — covers forms,
  tables, chat, modals, cards, nav, and the file upload areas since they all
  read from the same variables in `src/styles/global.css`.

## 5. What's still pending

- PDF document generation (prescriptions, receipts, referral letters) — the
  backend serves uploaded documents but doesn't generate new ones yet
- Statistics/analytics dashboards
- Automated tests
- Production build/deploy configuration (this is a dev server; `npm run
  build` produces static assets you'd still need to host — e.g. behind
  nginx, Vercel, Netlify, or the same box as the API behind a reverse proxy)

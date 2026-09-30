# MediConnect — Backend API

A real Node.js / Express / PostgreSQL backend implementing the MediConnect
requirements: JWT + refresh-token auth, bcrypt password hashing, RBAC
(Patient / Doctor / Specialist / Administrator), audit logging, rate limiting,
secure headers, prescription safety checks, patient transfer, real-time
messaging (Socket.IO), Campay mobile money payments, and a Gemini-backed
admin statistics/insights feature.

This is genuine, runnable source code — not a UI mock, and it isn't
backend-only either: the companion `mediconnect-frontend` React app is a
real, complete client for everything below. It needs Node.js and a real
PostgreSQL database to run, on your own machine or a server you control.
This chat environment cannot host it live for you.

## 1. Prerequisites

- Node.js 18+ (`node -v`)
- Docker (easiest way to get PostgreSQL), or a PostgreSQL 14+ server you already have

## 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` with the credentials already wired
into `.env.example` (database `mediconnect`, user `mediconnect`).

If you'd rather use an existing Postgres instance, just create a database and
point `DATABASE_URL` at it in the next step.

## 3. Configure environment

```bash
cp .env.example .env
```

Generate real random secrets for JWT signing (don't ship the placeholder values):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Paste the output into `JWT_ACCESS_SECRET` and run it again for a different
`JWT_REFRESH_SECRET`.

### Real credentials you'll need for the full feature set

- **Gmail SMTP (email)**: turn on 2-Step Verification on the sending Google
  account, then create an **App Password** (Google Account → Security →
  2-Step Verification → App passwords). Put the Gmail address in `GMAIL_USER`
  and the 16-character app password in `GMAIL_APP_PASSWORD`. Without these
  set, the app still runs — it just logs emails to the console instead of
  sending them, so nothing crashes in development.
- **Campay (payments — MTN MoMo + Orange Money)**: create a merchant account
  at [campay.net](https://www.campay.net), grab your App username and
  password from the dashboard, and set `CAMPAY_APP_USERNAME` /
  `CAMPAY_APP_PASSWORD`. Payments won't initiate without these — the route
  returns a clear 503 rather than silently pretending to succeed.
- **Google Maps (location)**: create a project in Google Cloud Console,
  enable the *Geocoding API* (server-side use) and *Maps JavaScript API*
  (browser use). Create two keys: an unrestricted-by-referrer one for
  `GOOGLE_MAPS_SERVER_KEY` (keep this secret, backend-only), and a
  referrer-restricted one for `GOOGLE_MAPS_BROWSER_KEY` (safe to ship to the
  frontend since it's locked to your domain).

## 4. Install dependencies and run migrations

```bash
npm install
npm run migrate
```

`npm run migrate` applies every `.sql` file in `/migrations` in order
(currently `001_init.sql` through `009_user_phone.sql`) — it's safe to re-run.

`002_extend.sql` adds: specialties, clinics, doctor recurring availability
(with a real double-booking-proof unique index), formal patient transfers,
doctor↔patient messaging, payments, and email verification/password-reset
tokens. A starter list of specialties is seeded automatically.

## 5. Run the API

```bash
npm run dev     # auto-restarts on file changes
# or
npm start
```

The API is now live at `http://localhost:4000`. Check `GET /health`.

## 6. Try it

```bash
# Register — always lands as Patient, regardless of what you send.
# dob and gender are required; phone is optional.
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jamie Lin","email":"jamie@example.com","password":"Str0ngPassw0rd!","dob":"1998-04-12","gender":"Female","phone":"237670000000"}'

# Log in
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"jamie@example.com","password":"Str0ngPassw0rd!"}'
```

Use the returned `accessToken` as `Authorization: Bearer <token>` on
subsequent requests. There is no first Administrator until you create one —
`/api/auth/register` can never produce one, by design (see the RBAC section
below) — so bootstrap the very first admin directly against the database:

```bash
node scripts/create-admin.js "Your Name" admin@example.com "SomeStrongPassw0rd!"
```

Running it again on the same email resets that account's password **and**
status back to Active — handy if an admin locks themselves out (e.g.
accidentally suspending their own account from the Users screen). From
there, that admin account can promote/verify other users through
`PATCH /api/admin/users/:id/role` instead of touching SQL or this script again.

## 7. API surface

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `GET /me`, `POST /verify-email`, `POST /request-password-reset`, `POST /reset-password`, `POST /change-password` |
| Admin | `GET /api/admin/users`, `PATCH /users/:id/role`, `PATCH /users/:id/status` (both block an admin acting on their own account), `GET /audit-log`, `GET/PATCH /me/profile` |
| Patients | `GET /api/patients` (staff), `GET/PATCH /api/patients/me`, `GET /:id`, `GET /:id/transfer-package?transferId=` |
| Doctors | `GET /api/doctors` (filter: `specialtyId`, `clinicId`, `search`, `status`), `GET/POST/DELETE /:id/availability`, `.../me/availability`, `GET/PATCH /me/profile`, `GET/PATCH /me/capacity`, `GET /:id/slots?date=` (excludes already-past times for today) |
| Specialties | `GET /api/specialties`, `POST` / `DELETE /:id` (admin) |
| Clinics | `GET /api/clinics?near=lat,lng&radiusKm=`, `POST` (admin, auto-geocoded) |
| Medical records | `GET/POST/PATCH/DELETE /api/patients/:patientId/consultations[/:id]` (delete = soft-delete only) |
| Prescriptions | `GET/POST/PATCH /api/patients/:patientId/prescriptions[/:id]`, `GET /:id/pdf` |
| Appointments | `GET/POST/PATCH /api/appointments[/:id]`, `PATCH /:id/cancel` (patient, 2-hour rule), `PATCH /:id/reschedule` (patient, resets to Pending) — booking, doctor reschedule, and patient reschedule all run the same future-date, doctor-availability, and daily-capacity checks |
| Transfers | `GET/POST/PATCH /api/transfers[/:id]`, `GET /:id/referral-letter` — formal Requested→Accepted/Rejected→Completed workflow |
| Messaging | `GET/POST /api/conversations`, `GET/POST /:id/messages` — plus real-time delivery over Socket.IO, with room-join membership checked server-side |
| Peer support | `GET /api/support-topics`, `GET/POST /:id/messages` (Patient only, anonymous aliases; the same Patient-only rule is enforced on the Socket.IO room join, not just the REST route) |
| Documents | `GET/POST /api/patients/:patientId/documents`, `GET /:id/download` |
| Payments | `POST /api/payments/initiate` (fixed 5,000 XAF fee, phone required, Campay push to MTN/Orange), `POST /webhook`, `GET /:transactionRef/status`, `GET /:id/receipt`, `GET /` (history) |
| Doctor applications | `POST /api/doctor-applications`, `GET /me`, `GET /` (admin), `PATCH /:id` (admin approve/reject) |
| Statistics | `GET /api/statistics`, `GET /report` (PDF, admin only), `POST /generate-insights` (re-runs just the Gemini/rule-based step on demand) |
| Notifications | `GET /api/notifications`, `PATCH /:id/read` |

## 8. Testing

Real integration tests — Jest + Supertest, hitting the actual Express app and
a real (dedicated) test PostgreSQL database. Nothing here is mocked at the
database layer, since MediConnect's routes talk to Postgres directly rather
than through a swappable repository layer — mocking `pg` would mean testing
something other than the real queries.

```bash
cp .env.test.example .env.test
npm install
npm run migrate:test   # applies the real migrations to the test database
npm test
```

`docker-compose up -d` (from step 2) already creates the `mediconnect_test`
database automatically alongside the dev one — no extra setup needed if
you're using the provided Postgres container.

**What's covered:**

| File | Covers |
|---|---|
| `tests/auth.test.js` | Registration (role can never be self-assigned, 6-char password minimum, required dob/gender, duplicate email), login, refresh token rotation and reuse detection, Remember Me (session vs. persistent cookie), authenticated password change |
| `tests/rbac.test.js` | Cross-role access denial, missing/garbage token rejection, immediate loss of access on suspension (not just at next refresh), patients unable to self-promote |
| `tests/appointments.test.js` | Real slot generation from availability windows, booking outside availability, double-booking prevention, daily patient capacity (including the resulting "Full" search status), the 18+ booking rule (account still works, booking is blocked), patient self-cancellation and its ownership check |
| `tests/prescriptions.test.js` | Allergy-conflict blocking + explicit override, drug-interaction detection, duplicate-medication warning (non-blocking), role restriction, discontinuing a prescription |
| `tests/doctorApplications.test.js` | Generalist auto-tagging to General Medicine, Specialist requiring a specialty, duplicate pending applications blocked, a pending applicant still can't reach doctor routes, approval as the only path that promotes a role (and only an admin can do it), rejection leaving the role unchanged |
| `tests/database.test.js` | Every expected table exists, unique/check constraints are enforced at the database level (not just in application code), the double-booking-prevention index, cascade deletes |

**What's not covered yet:** frontend component tests, load/performance testing,
and end-to-end browser tests (Playwright/Cypress) driving the real UI against
the real API — those are a reasonable next step once this API-level suite is
green.

## 9. What's real vs. what's still pending

**Real, as of this pass:**
- JWT/bcrypt auth, RBAC, audit log, soft-delete records, prescription safety checks, secure uploads
- Email verification and password reset, sent via real Gmail SMTP (`nodemailer`)
- Real Campay payment initiation (MTN MoMo + Orange Money) at a fixed 5,000 XAF consultation fee — the amount is never taken from the client — with a server-verified webhook (never trusts a frontend or webhook "success" claim without an independent status check)
- Real Google Maps geocoding for clinic addresses + Haversine "nearby clinics" search
- Doctor recurring availability + real slot generation (excludes already-past times for "today") + double-booking prevention enforced at the database level
- Appointment booking, doctor-side rescheduling, and patient-side rescheduling all run through one shared validator: future date/time, doctor availability window, and the doctor's daily patient cap — a doctor changing a date/time can no longer bypass their own schedule
- Formal patient-transfer workflow (Requested → Accepted/Rejected → Completed) with an authorization gate on the record handoff
- Doctor↔patient messaging, restricted to pairs with an actual appointment history, delivered live over Socket.IO — room joins are membership-checked server-side, for both conversations and peer-support topics
- Patient-initiated appointment cancellation and rescheduling, both with a 2-hour cutoff rule
- Admin statistics dashboard backed by Gemini-generated insights (with an on-demand "generate insights" endpoint and an automatic rule-based fallback if Gemini is unreachable or unconfigured), plus a downloadable PDF report
- Self-service profile editing and password change for all four roles, including Administrator
- A phone number field, captured at registration, on every account

**Still pending / known limitations:**
- Frontend component tests, load/performance testing, and end-to-end browser tests (Playwright/Cypress) — the backend has a real integration suite (see §8), the frontend doesn't yet
- Production hardening: HTTPS termination, secrets manager, MFA, backup/DR, compliance review — all environment-dependent and outside what a chat tool can configure for you
- The in-process rate limiter doesn't share state across multiple server instances — fine for one process, would need a shared store (e.g. Redis) behind a load balancer

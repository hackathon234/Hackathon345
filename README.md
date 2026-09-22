# Amani — Mental Health & Community Care Platform

A full-stack implementation of the Amani platform: landing pages, role-based sign-in,
session booking (paid and free), events & gatherings filterable by location, a
Groq-powered AI chatbot available site-wide, host payouts, and a live-call signaling
layer — backed by PostgreSQL.

## Stack

- **Backend:** Node.js + Express, JWT auth, `pg` for PostgreSQL, Socket.IO for live-call signaling
- **Database:** PostgreSQL
- **Frontend:** Plain HTML/CSS/JS (no build step) served statically by Express
- **AI chatbot:** Groq's `/openai/v1/chat/completions` endpoint, called server-side so the API key is never exposed to the browser

## Project structure

```
amani-project/
├── package.json
├── .env.example
├── backend/
│   ├── server.js            # Express app + Socket.IO server
│   ├── db.js                # PostgreSQL connection pool
│   ├── schema.sql           # Table definitions
│   ├── seed.sql              # Optional demo data
│   ├── middleware/
│   │   └── auth.js          # JWT verification + role guard
│   └── routes/
│       ├── auth.js          # register / login
│       ├── profile.js       # view / update profile
│       ├── sessions.js      # upload & list therapy sessions
│       ├── bookings.js      # normal users book sessions
│       ├── listings.js      # events & gatherings, filtering, sign-up
│       ├── payments.js      # charge confirmation, payouts
│       └── chat.js          # Groq-powered chatbot proxy
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/app.js             # calls the API, renders every view
```

## Setup

**1. Install PostgreSQL and create a database**
```bash
createdb amani_db
```

**2. Configure environment variables**
```bash
cp .env.example .env
```
Then edit `.env`:
- `DATABASE_URL` — your Postgres connection string
- `JWT_SECRET` — any long random string
- `GROQ_API_KEY` — from https://console.groq.com/keys (the chatbot won't work without this)

**3. Load the schema (and optional demo data)**
```bash
psql -d amani_db -f backend/schema.sql
psql -d amani_db -f backend/seed.sql   # optional — sample users, sessions, events
```

**4. Install dependencies and run**
```bash
npm install
npm start
```
The site is now at **http://localhost:4000** — Express serves the frontend and the API from the same origin, so there's no CORS setup needed locally.

> This sandbox has no internet access, so `npm install` couldn't be run here — every backend and frontend JS file has been syntax-checked (`node -c`), but you should run it locally to fully verify before deploying.

## How each part of the brief maps to the code

| Brief item | Where it lives |
|---|---|
| Landing page with sign-in | `frontend/index.html` + `js/app.js` (`openAuth`, `submitAuth`) |
| 3 upcoming events + sessions preview, locked until sign-in | `GET /api/listings/preview`, `GET /api/sessions` (guest-safe), blurred cards in `js/app.js` |
| Profile customization after sign-in | `PUT /api/profile/me` |
| Six roles at sign-up | `user`, `professional`, `volunteer`, `mentor`, `organizer`, `partner` — `user_role` enum in `schema.sql` |
| AI chatbot (Groq), site-wide | `backend/routes/chat.js`, floating widget in every view |
| Book paid sessions with professionals | `POST /api/bookings` → creates a `pending_payment` booking + payment row |
| Book free sessions with volunteers/mentors | Same endpoint; price 0 sessions confirm immediately |
| Live calls between users | `Socket.IO` room signaling in `server.js` (`call:join`, `call:signal`, `call:leave`) |
| Events/gatherings filterable by location/constituency/county/sub-county | `GET /api/listings?county=&constituency=&sub_county=&type=` |
| Sign up + payment prompt for events (paid) and gatherings (free by default, payable) | `POST /api/listings/:id/signup` + `POST /api/payments/confirm` |
| Professional payouts | `GET /api/payments/balance`, `POST /api/payments/payout` |
| Organizers/partners add events/gatherings | `POST /api/listings` (role-guarded to `organizer`/`partner`) |
| PostgreSQL database | `backend/schema.sql` — `users`, `sessions`, `bookings`, `listings`, `listing_signups`, `payments`, `chat_messages` |

## Notes on things that are simulated for this build

- **Payments** use a mock confirm step (`POST /api/payments/confirm`) instead of a live M-Pesa/Stripe integration. To go live, replace that route's body with a real charge call, and have the provider's webhook call the same "mark payment paid" logic.
- **Live calls** only implement signaling (who's in the room, and a channel to pass WebRTC offer/answer/ICE messages). Actual audio/video needs a WebRTC client on the frontend, or a managed SFU (Daily.co, Twilio, LiveKit) for group calls at scale.
- **The chatbot** calls Groq's OpenAI-compatible endpoint with `GROQ_MODEL` (defaults to `llama-3.3-70b-versatile`). It keeps the last 10 turns of conversation for context and logs exchanges to `chat_messages` for signed-in users only.

## Security notes before going to production

- Add rate limiting (e.g. `express-rate-limit`) to `/api/auth/*` and `/api/chat`.
- Serve over HTTPS and set `secure`/`httpOnly` cookies instead of `localStorage` if you want to harden against XSS token theft.
- Add input validation (e.g. `zod` or `joi`) on all POST/PUT bodies — this build relies on lightweight manual checks.
- Rotate `JWT_SECRET` and store secrets in your host's secret manager rather than a committed `.env`.

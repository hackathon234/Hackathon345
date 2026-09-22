-- Amani platform schema (PostgreSQL)
-- Run with: psql -d amani_db -f backend/schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user','professional','volunteer','mentor','organizer','partner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_kind AS ENUM ('professional','volunteer','mentor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_type AS ENUM ('event','gathering');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending_payment','confirmed','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- users & profiles ----------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  bio           TEXT,
  county        TEXT,
  constituency  TEXT,
  sub_county    TEXT,
  location      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- sessions (uploaded by professionals / volunteers / mentors) ----------
CREATE TABLE IF NOT EXISTS sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             session_kind NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  price            NUMERIC(10,2) NOT NULL DEFAULT 0, -- 0 = free (volunteer/mentor)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- bookings of sessions by normal users ----------
CREATE TABLE IF NOT EXISTS bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       booking_status NOT NULL DEFAULT 'pending_payment',
  amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- events & gatherings (added by organizers/partners) ----------
CREATE TABLE IF NOT EXISTS listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          listing_type NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  county        TEXT NOT NULL,
  constituency  TEXT,
  sub_county    TEXT,
  location      TEXT,
  event_date    DATE NOT NULL,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0, -- events are usually paid, gatherings usually free
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- sign-ups for listings ----------
CREATE TABLE IF NOT EXISTS listing_signups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     booking_status NOT NULL DEFAULT 'pending_payment',
  amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

-- ---------- payments (bookings, listing signups, and host payouts) ----------
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         NUMERIC(10,2) NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('charge','payout')),
  reference_type TEXT NOT NULL,        -- 'booking' | 'listing_signup' | 'host_payout'
  reference_id   UUID,
  status         payment_status NOT NULL DEFAULT 'pending',
  provider       TEXT DEFAULT 'mock',  -- e.g. 'mpesa', 'stripe' in production
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- chatbot conversation log (optional, for continuity/analytics) ----------
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_location ON listings (county, constituency, sub_county);
CREATE INDEX IF NOT EXISTS idx_sessions_kind ON sessions (kind);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_signups_user ON listing_signups (user_id);

COMMIT;

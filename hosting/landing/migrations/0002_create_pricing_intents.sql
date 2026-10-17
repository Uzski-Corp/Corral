-- Pricing requests (POST /api/pricing-intent): who asked for Corral's pricing. Additive: the waitlist table is untouched.
-- One row per request (a repeat of the same email adds a row, which is also what the per-email rate limit counts).
-- ip_hash is a SHA-256 of the client IP (salted with IP_HASH_SALT when set), never the raw IP.
CREATE TABLE IF NOT EXISTS pricing_intents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,        -- trimmed, lowercased
  full_name  TEXT NOT NULL,
  industry   TEXT NOT NULL,        -- slug, see INDUSTRIES in src/pricing-validate.ts
  other_text TEXT,                 -- only when industry = 'other'
  phone      TEXT,                 -- E.164 (+254712345678), NULL when not given
  free_mail  INTEGER NOT NULL DEFAULT 0,
  source     TEXT,
  country    TEXT,                 -- request.cf.country
  ip_hash    TEXT,
  created_at TEXT NOT NULL,        -- ISO 8601
  emailed_at TEXT                  -- set when AutoSend accepted the pricing email
);

CREATE INDEX IF NOT EXISTS pricing_intents_email ON pricing_intents (email, created_at);
CREATE INDEX IF NOT EXISTS pricing_intents_ip ON pricing_intents (ip_hash, created_at);

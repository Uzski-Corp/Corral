-- The landing waitlist (POST /api/waitlist). One row per address; the email is stored trimmed and lowercased.
-- ip_hash is a SHA-256 of the client IP (never the raw IP), used only for the per-IP rate limit.
CREATE TABLE IF NOT EXISTS waitlist (
  email      TEXT PRIMARY KEY,
  source     TEXT,
  country    TEXT,
  created_at TEXT,
  ip_hash    TEXT
);

-- The rate limit counts recent rows per ip_hash.
CREATE INDEX IF NOT EXISTS waitlist_ip_hash_created_at ON waitlist (ip_hash, created_at);

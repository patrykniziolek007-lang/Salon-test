-- Struktura bazy rezerwacji (Cloudflare D1)
CREATE TABLE IF NOT EXISTS bookings (
  id         TEXT PRIMARY KEY,
  service    TEXT NOT NULL,
  dur        INTEGER NOT NULL,
  price      INTEGER NOT NULL,
  date       TEXT NOT NULL,
  time       TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NOT NULL,
  note       TEXT,
  status     TEXT NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  sample     INTEGER NOT NULL DEFAULT 0,
  ip         TEXT,
  emails     TEXT
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_ip ON bookings(ip, created_at);

-- Dwie aktywne wizyty nie mogą zaczynać się o tej samej godzinie
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_slot ON bookings(date, time)
  WHERE status IN ('pending','accepted');

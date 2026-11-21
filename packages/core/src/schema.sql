-- packages/core/src/schema.sql
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS bikes(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  odometer_km INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parts(
  id TEXT PRIMARY KEY,
  bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  km_interval INTEGER,
  days_interval INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY,
  bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  odometer_km INTEGER NOT NULL,
  action TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_parts_bike ON parts(bike_id);
CREATE INDEX IF NOT EXISTS idx_events_part ON events(part_id);
CREATE INDEX IF NOT EXISTS idx_events_bike ON events(bike_id);

export const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bikes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  odometer_km INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  bike_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  km_interval INTEGER,
  days_interval INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parts_bike ON parts (bike_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  bike_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  date TEXT NOT NULL,
  odometer_km INTEGER NOT NULL,
  action TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_bike_date ON events (bike_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_events_part_date ON events (part_id, date DESC);

INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1');
    `,
  },
];

export const SQL = {
  meta: {
    getVersion: `SELECT value FROM meta WHERE key='schema_version'`,
    setVersion: `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`,
  },
  bikes: {
    upsert: `
INSERT INTO bikes (id, name, model, odometer_km, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  model=excluded.model,
  odometer_km=excluded.odometer_km,
  updated_at=excluded.updated_at
`,
    get: `SELECT * FROM bikes WHERE id=?`,
    all: `SELECT * FROM bikes ORDER BY updated_at DESC`,
    remove: `DELETE FROM bikes WHERE id=?`,
    updateOdo: `UPDATE bikes SET odometer_km=?, updated_at=? WHERE id=?`,
  },
  parts: {
    upsert: `
INSERT INTO parts (id, bike_id, type, name, km_interval, days_interval, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  type=excluded.type,
  name=excluded.name,
  km_interval=excluded.km_interval,
  days_interval=excluded.days_interval,
  updated_at=excluded.updated_at
`,
    byBike: `SELECT * FROM parts WHERE bike_id=? ORDER BY updated_at DESC`,
    get: `SELECT * FROM parts WHERE id=?`,
    remove: `DELETE FROM parts WHERE id=?`,
  },
  events: {
    insert: `
INSERT INTO events (id, bike_id, part_id, date, odometer_km, action, notes)
VALUES (?, ?, ?, ?, ?, ?, ?)
`,
    byBike: `SELECT * FROM events WHERE bike_id=? ORDER BY date DESC, odometer_km DESC`,
    byPart: `SELECT * FROM events WHERE part_id=? ORDER BY date DESC, odometer_km DESC`,
    get: `SELECT * FROM events WHERE id=?`,
    remove: `DELETE FROM events WHERE id=?`,
  },
};

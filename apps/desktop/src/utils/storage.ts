// apps/desktop/src/utils/storage.ts
import Database from '@tauri-apps/plugin-sql';

export type UUID = string;
export type PartType =
  | 'oil_change'
  | 'oil_filter'
  | 'chain_maintenance'
  | 'chain_lube'
  | 'tires'
  | 'brake_service'
  | 'spark_plugs'
  | 'custom'
  | 'oil'
  | 'chain'
  | 'chain_inspection'; // legacy fallback handled dynamically

export interface Bike {
  id: UUID;
  name: string;
  model?: string;
  year?: number | null;
  odometerKm: number;
  createdAt: string;
  updatedAt: string;
}

export interface Part {
  id: UUID;
  bikeId: UUID;
  type: PartType;
  name: string;
  kmInterval?: number | null;
  daysInterval?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceEvent {
  id: UUID;
  bikeId: UUID;
  partId: UUID;
  date: string;
  odometerKm: number;
  action: string;
  notes?: string | null;
}

interface DefaultPartConfig {
  type: Exclude<PartType, 'custom' | 'oil' | 'chain' | 'chain_inspection'>;
  name: string;
  kmInterval?: number | null;
  daysInterval?: number | null;
}

export const DEFAULT_PARTS: ReadonlyArray<DefaultPartConfig> = [
  {
    type: 'oil_change',
    name: 'Oil Change',
    kmInterval: 5000,
    daysInterval: null,
  },
  {
    type: 'oil_filter',
    name: 'Oil & Filter Change',
    kmInterval: 5000,
    daysInterval: null,
  },
  {
    type: 'chain_maintenance',
    name: 'Chain Inspection & Maintenance',
    kmInterval: 10000,
    daysInterval: null,
  },
  {
    type: 'chain_lube',
    name: 'Chain Lube',
    kmInterval: 500,
    daysInterval: 30,
  },
  {
    type: 'tires',
    name: 'Tire Check',
    kmInterval: 25000,
    daysInterval: null,
  },
  {
    type: 'brake_service',
    name: 'Brake Pads & Fluid',
    kmInterval: 10000,
    daysInterval: null,
  },
  {
    type: 'spark_plugs',
    name: 'Spark Plugs',
    kmInterval: 10000,
    daysInterval: null,
  },
] as const;

const DEFAULT_PART_MAP = new Map(DEFAULT_PARTS.map((cfg) => [cfg.type, cfg]));

const LEGACY_NAME_REPLACEMENTS = new Map<string, string>([
  ['Engine Oil', 'Oil Change'],
  ['Oil', 'Oil Change'],
  ['Chain', 'Chain Inspection & Maintenance'],
  ['Chain Maintenance', 'Chain Inspection & Maintenance'],
  ['Clutch Service', 'Brake Pads & Fluid'],
  ['Clutch', 'Brake Pads & Fluid'],
]);

function newId(): UUID {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as UUID;
}

function normalizedType(type: string): PartType {
  if (type === 'oil') return 'oil_change';
  if (type === 'chain' || type === 'chain_inspection') return 'chain_maintenance';
  if (type === 'clutch') return 'brake_service';
  if (type === 'brake_service' || type === 'spark_plugs' || type === 'oil_change' || type === 'oil_filter' || type === 'chain_lube' || type === 'tires') {
    return type as PartType;
  }
  return type as PartType;
}

// ---------- DB lazy init (no top-level await) ----------
let _dbPromise: Promise<Database> | null = null;
async function getDb(): Promise<Database> {
  if (!_dbPromise) {
    _dbPromise = Database.load('sqlite:app.db');
  }
  return _dbPromise;
}

export async function ensureDefaultPartsForBike(bikeId: UUID, providedDb?: Database): Promise<void> {
  const db = providedDb ?? await getDb();
  const existing = await db.select<{
    id: UUID;
    type: string;
    name: string | null;
  }[]>(
    `SELECT id, type, name FROM parts WHERE bike_id = ?`,
    [bikeId]
  );

  const presentTypes = new Set<PartType>();
  for (const part of existing) {
    const normalized = normalizedType(part.type);
    const defaults = DEFAULT_PART_MAP.get(normalized);

    if (part.type !== normalized) {
      if (normalized === 'custom') {
        await db.execute(
          `UPDATE parts
           SET type = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [normalized, part.id]
        );
      } else {
        const trimmedName = part.name?.trim() ?? '';
        const mappedName = LEGACY_NAME_REPLACEMENTS.get(trimmedName) ?? trimmedName;
        const fallbackName = mappedName.length > 0 ? mappedName : defaults?.name ?? part.name ?? '';
        await db.execute(
          `UPDATE parts
           SET type = ?,
               name = ?,
               km_interval = ?,
               days_interval = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [
            normalized,
          fallbackName,
            defaults?.kmInterval ?? null,
            defaults?.daysInterval ?? null,
            part.id,
          ]
        );
      }
    }

    if (defaults && normalized !== 'custom') {
      const desiredKm = defaults.kmInterval ?? null;
      const desiredDays = defaults.daysInterval ?? null;
      const trimmedName = part.name?.trim() ?? '';
      const legacyName = LEGACY_NAME_REPLACEMENTS.get(trimmedName) === defaults.name ? trimmedName : null;
      await db.execute(
        `UPDATE parts
         SET name = CASE
               WHEN name IS NULL OR trim(name) = '' THEN ?
               WHEN ? IS NOT NULL AND name = ? THEN ?
               ELSE name
             END,
             km_interval = CASE WHEN km_interval IS NULL THEN ? ELSE km_interval END,
             days_interval = CASE
               WHEN ? IS NULL THEN NULL
               WHEN days_interval IS NULL THEN ?
               ELSE days_interval
             END
         WHERE id = ?`,
        [
          defaults.name,
          legacyName,
          legacyName,
          defaults.name,
          desiredKm,
          desiredDays,
          desiredDays,
          part.id,
        ]
      );
      presentTypes.add(normalized);
    }
  }

  for (const cfg of DEFAULT_PARTS) {
    if (!presentTypes.has(cfg.type)) {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO parts(id, bike_id, type, name, km_interval, days_interval, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          bikeId,
          cfg.type,
          cfg.name,
          cfg.kmInterval ?? null,
          cfg.daysInterval ?? null,
          now,
          now,
        ]
      );
      presentTypes.add(cfg.type);
    }
  }
}

// ---------- Schema / Migrations ----------
export async function migrate() {
  const db = await getDb();

  await db.execute(`PRAGMA journal_mode=WAL;`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bikes(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT,
      odometer_km INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const cols = await db.select<{ name: string }[]>(`PRAGMA table_info(bikes)`);
  if (!cols.some((c) => c.name === 'year')) {
    await db.execute(`ALTER TABLE bikes ADD COLUMN year INTEGER`);
  }

  await db.execute(`
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
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS events(
      id TEXT PRIMARY KEY,
      bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
      part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer_km INTEGER NOT NULL,
      action TEXT NOT NULL,
      notes TEXT
    );
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_bike ON events(bike_id, date DESC);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_part ON events(part_id, date DESC);`);

  const bikes = await db.select<{ id: UUID }[]>(`SELECT id FROM bikes`);
  for (const bike of bikes) {
    await ensureDefaultPartsForBike(bike.id, db);
  }
}

/* ---------- Bikes ---------- */
export async function listBikes(): Promise<Bike[]> {
  const db = await getDb();
  return db.select<Bike[]>(`
    SELECT
      id,
      name,
      model,
      year,
      odometer_km AS odometerKm,
      created_at  AS createdAt,
      updated_at  AS updatedAt
    FROM bikes
    ORDER BY created_at ASC
  `);
}

export async function upsertBike(b: Bike) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO bikes(id, name, model, year, odometer_km, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name         = excluded.name,
       model        = excluded.model,
       year         = excluded.year,
       odometer_km  = excluded.odometer_km,
       updated_at   = excluded.updated_at`,
    [b.id, b.name, b.model ?? null, b.year ?? null, b.odometerKm, b.createdAt, b.updatedAt]
  );
}

export async function updateBikeOdometer(id: UUID, km: number) {
  const db = await getDb();
  await db.execute(
    `UPDATE bikes SET odometer_km = ?, updated_at = datetime('now') WHERE id = ?`,
    [km, id]
  );
}

export async function deleteBike(id: UUID) {
  const db = await getDb();
  await db.execute(`DELETE FROM bikes WHERE id = ?`, [id]);
}

/* ---------- Parts ---------- */
export async function listParts(bikeId: UUID): Promise<Part[]> {
  const db = await getDb();
  await ensureDefaultPartsForBike(bikeId, db);
  return db.select<Part[]>(
    `SELECT
        id,
        bike_id       AS bikeId,
        type,
        name,
        km_interval   AS kmInterval,
        days_interval AS daysInterval,
        created_at    AS createdAt,
        updated_at    AS updatedAt
     FROM parts
     WHERE bike_id = ?
     ORDER BY created_at ASC`,
    [bikeId]
  );
}

export async function upsertPart(p: Part) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO parts(id, bike_id, type, name, km_interval, days_interval, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type          = excluded.type,
       name          = excluded.name,
       km_interval   = excluded.km_interval,
       days_interval = excluded.days_interval,
       updated_at    = excluded.updated_at`,
    [p.id, p.bikeId, p.type, p.name, p.kmInterval ?? null, p.daysInterval ?? null, p.createdAt, p.updatedAt]
  );
}

/* ---------- Events ---------- */
export async function addEvent(e: MaintenanceEvent) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO events(id, bike_id, part_id, date, odometer_km, action, notes)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [e.id, e.bikeId, e.partId, e.date, e.odometerKm, e.action, e.notes ?? null]
  );
}

export async function listEventsByBike(bikeId: UUID): Promise<MaintenanceEvent[]> {
  const db = await getDb();
  return db.select<MaintenanceEvent[]>(
    `SELECT
        id,
        bike_id     AS bikeId,
        part_id     AS partId,
        date,
        odometer_km AS odometerKm,
        action,
        notes
     FROM events
     WHERE bike_id = ?
     ORDER BY date DESC`,
    [bikeId]
  );
}

/* ---------- Export / Import ---------- */
export async function exportAll() {
  const bikes = await listBikes();
  const parts: Part[] = [];
  for (const b of bikes) {
    parts.push(...(await listParts(b.id)));
  }
  const db = await getDb();
  const events = await db.select<MaintenanceEvent[]>(`
    SELECT
      id,
      bike_id     AS bikeId,
      part_id     AS partId,
      date,
      odometer_km AS odometerKm,
      action,
      notes
    FROM events
    ORDER BY date DESC
  `);
  return { bikes, parts, events };
}

export async function importAll(payload: { bikes: Bike[]; parts: Part[]; events: MaintenanceEvent[] }) {
  const db = await getDb();
  await db.execute('BEGIN');
  try {
    for (const b of payload.bikes) await upsertBike(b);
    for (const p of payload.parts) await upsertPart(p);
    for (const e of payload.events) await addEvent(e);

    const affected = new Set<UUID>();
    for (const b of payload.bikes) affected.add(b.id);
    for (const p of payload.parts) affected.add(p.bikeId);
    for (const e of payload.events) affected.add(e.bikeId);
    for (const id of affected) await ensureDefaultPartsForBike(id, db);

    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

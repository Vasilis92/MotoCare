import Database from '@tauri-apps/plugin-sql';
import { formatISO } from 'date-fns';
import { z } from 'zod';
import { MIGRATIONS } from './migrations';
import { SQL } from './sql';

export type UUID = string;
export type PartType = 'oil' | 'chain' | 'tires' | 'clutch' | 'custom';

export interface Bike {
  id: UUID;
  name: string;
  model?: string;
  odometerKm: number;
  createdAt: string;
  updatedAt: string;
}

export interface Part {
  id: UUID;
  bikeId: UUID;
  type: PartType;
  name: string;
  createdAt: string;
  updatedAt: string;
  kmInterval?: number | null;
  daysInterval?: number | null;
}

export interface MaintenanceEvent {
  id: UUID;
  bikeId: UUID;
  partId: UUID;
  date: string;      // ISO
  odometerKm: number;
  action: string;
  notes?: string | null;
}

const BikeRow = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().nullable().optional(),
  odometer_km: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
type BikeRow = z.infer<typeof BikeRow>;

const PartRow = z.object({
  id: z.string(),
  bike_id: z.string(),
  type: z.string(),
  name: z.string(),
  km_interval: z.number().nullable(),
  days_interval: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
type PartRow = z.infer<typeof PartRow>;

const EventRow = z.object({
  id: z.string(),
  bike_id: z.string(),
  part_id: z.string(),
  date: z.string(),
  odometer_km: z.number(),
  action: z.string(),
  notes: z.string().nullable(),
});
type EventRow = z.infer<typeof EventRow>;

function mapBike(r: BikeRow): Bike {
  return {
    id: r.id,
    name: r.name,
    model: r.model ?? undefined,
    odometerKm: r.odometer_km,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPart(r: PartRow): Part {
  return {
    id: r.id,
    bikeId: r.bike_id,
    type: r.type as any,
    name: r.name,
    kmInterval: r.km_interval ?? undefined,
    daysInterval: r.days_interval ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapEvent(r: EventRow): MaintenanceEvent {
  return {
    id: r.id,
    bikeId: r.bike_id,
    partId: r.part_id,
    date: r.date,
    odometerKm: r.odometer_km,
    action: r.action,
    notes: r.notes ?? undefined,
  };
}

export interface SqliteTauriStorage {
  db(): Database;
  close(): Promise<void>;
  upsertBike(bike: Bike): Promise<void>;
  updateBikeOdometer(bikeId: UUID, odometerKm: number): Promise<void>;
  getBike(bikeId: UUID): Promise<Bike | null>;
  listBikes(): Promise<Bike[]>;
  deleteBike(bikeId: UUID): Promise<void>;
  upsertPart(part: Part): Promise<void>;
  getPart(partId: UUID): Promise<Part | null>;
  listParts(bikeId: UUID): Promise<Part[]>;
  deletePart(partId: UUID): Promise<void>;
  addEvent(evt: MaintenanceEvent): Promise<void>;
  getEvent(eventId: UUID): Promise<MaintenanceEvent | null>;
  listEventsByBike(bikeId: UUID): Promise<MaintenanceEvent[]>;
  listEventsByPart(partId: UUID): Promise<MaintenanceEvent[]>;
  deleteEvent(eventId: UUID): Promise<void>;
  exportAll(): Promise<{ bikes: Bike[]; parts: Part[]; events: MaintenanceEvent[] }>;
  importAll(payload: { bikes: Bike[]; parts: Part[]; events: MaintenanceEvent[] }): Promise<void>;
}

export async function createSqliteTauriStorage(dsn?: string): Promise<SqliteTauriStorage> {
  const database = await Database.load(dsn ?? 'sqlite:app.db');
  await database.execute('PRAGMA foreign_keys = ON;');

  let current = 0;
  const rows = (await database.select<any[]>(SQL.meta.getVersion)) as any[];
  if (rows.length > 0 && rows[0]?.value) current = parseInt(rows[0].value, 10) || 0;

  for (const m of MIGRATIONS) {
    if (m.id > current) {
      await database.execute(m.sql);
      await database.execute(SQL.meta.setVersion, [String(m.id)]);
      current = m.id;
    }
  }

  const api: SqliteTauriStorage = {
    db: () => database,

    async close() { await database.close(); },

    async upsertBike(bike) {
      await database.execute(SQL.bikes.upsert, [
        bike.id, bike.name, bike.model ?? null, bike.odometerKm, bike.createdAt, bike.updatedAt,
      ]);
    },

    async updateBikeOdometer(bikeId, odometerKm) {
      await database.execute(SQL.bikes.updateOdo, [odometerKm, formatISO(new Date()), bikeId]);
    },

    async getBike(bikeId) {
      const rows = (await database.select(SQL.bikes.get, [bikeId])) as any[];
      if (!rows?.length) return null;
      return mapBike(BikeRow.parse(rows[0]));
    },

    async listBikes() {
      const rows = (await database.select(SQL.bikes.all)) as any[];
      return rows.map(r => mapBike(BikeRow.parse(r)));
    },

    async deleteBike(bikeId) {
      await database.execute(SQL.bikes.remove, [bikeId]);
    },

    async upsertPart(part) {
      await database.execute(SQL.parts.upsert, [
        part.id, part.bikeId, part.type, part.name,
        part.kmInterval ?? null, part.daysInterval ?? null,
        part.createdAt, part.updatedAt,
      ]);
    },

    async getPart(partId) {
      const rows = (await database.select(SQL.parts.get, [partId])) as any[];
      if (!rows?.length) return null;
      return mapPart(PartRow.parse(rows[0]));
    },

    async listParts(bikeId) {
      const rows = (await database.select(SQL.parts.byBike, [bikeId])) as any[];
      return rows.map(r => mapPart(PartRow.parse(r)));
    },

    async deletePart(partId) {
      await database.execute(SQL.parts.remove, [partId]);
    },

    async addEvent(evt) {
      await database.execute(SQL.events.insert, [
        evt.id, evt.bikeId, evt.partId, evt.date, evt.odometerKm, evt.action, evt.notes ?? null,
      ]);
    },

    async getEvent(eventId) {
      const rows = (await database.select(SQL.events.get, [eventId])) as any[];
      if (!rows?.length) return null;
      return mapEvent(EventRow.parse(rows[0]));
    },

    async listEventsByBike(bikeId) {
      const rows = (await database.select(SQL.events.byBike, [bikeId])) as any[];
      return rows.map(r => mapEvent(EventRow.parse(r)));
    },

    async listEventsByPart(partId) {
      const rows = (await database.select(SQL.events.byPart, [partId])) as any[];
      return rows.map(r => mapEvent(EventRow.parse(r)));
    },

    async deleteEvent(eventId) {
      await database.execute(SQL.events.remove, [eventId]);
    },

    async exportAll() {
      const [b, p, e] = await Promise.all([
        database.select('SELECT * FROM bikes'),
        database.select('SELECT * FROM parts'),
        database.select('SELECT * FROM events'),
      ]);
      return {
        bikes:  (b as any[]).map(r => mapBike(BikeRow.parse(r))),
        parts:  (p as any[]).map(r => mapPart(PartRow.parse(r))),
        events: (e as any[]).map(r => mapEvent(EventRow.parse(r))),
      };
    },

    async importAll(payload) {
      await database.execute('BEGIN');
      try {
        for (const b of payload.bikes) {
          await database.execute(SQL.bikes.upsert, [
            b.id, b.name, b.model ?? null, b.odometerKm, b.createdAt, b.updatedAt,
          ]);
        }
        for (const p of payload.parts) {
          await database.execute(SQL.parts.upsert, [
            p.id, p.bikeId, p.type, p.name,
            p.kmInterval ?? null, p.daysInterval ?? null,
            p.createdAt, p.updatedAt,
          ]);
        }
        for (const e of payload.events) {
          await database.execute(SQL.events.insert, [
            e.id, e.bikeId, e.partId, e.date, e.odometerKm, e.action, e.notes ?? null,
          ]);
        }
        await database.execute('COMMIT');
      } catch (err) {
        await database.execute('ROLLBACK');
        throw err;
      }
    },
  };

  return api;
}

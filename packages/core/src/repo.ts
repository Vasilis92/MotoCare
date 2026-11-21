// packages/core/src/repo.ts
// @ts-ignore
import { Bike, MaintenanceEvent, Part, UUID } from './types';

export interface MotoRepo {
  init(): Promise<void>;

  // Bikes
  createBike(b: Omit<Bike, 'createdAt'|'updatedAt'>): Promise<Bike>;
  listBikes(): Promise<Bike[]>;
  getBike(id: UUID): Promise<Bike | null>;
  updateBike(id: UUID, patch: Partial<Bike>): Promise<Bike>;
  deleteBike(id: UUID): Promise<void>;

  // Parts
  createPart(p: Omit<Part, 'createdAt'|'updatedAt'>): Promise<Part>;
  listPartsByBike(bikeId: UUID): Promise<Part[]>;
  updatePart(id: UUID, patch: Partial<Part>): Promise<Part>;
  deletePart(id: UUID): Promise<void>;

  // Events
  createEvent(e: MaintenanceEvent): Promise<MaintenanceEvent>;
  listEventsByPart(partId: UUID): Promise<MaintenanceEvent[]>;
  listEventsByBike(bikeId: UUID): Promise<MaintenanceEvent[]>;
  deleteEvent(id: UUID): Promise<void>;
}

export interface Notifier {
  notify(title: string, body: string): Promise<void>;
}

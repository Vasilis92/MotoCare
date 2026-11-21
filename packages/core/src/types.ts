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
  kmInterval?: number | null;
  daysInterval?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceEvent {
  id: UUID;
  bikeId: UUID;
  partId: UUID;
  date: string; // ISO
  odometerKm: number;
  action: string;
  notes?: string | null;
}

export type Status = 'OK' | 'DUE_SOON' | 'OVERDUE';

export interface PartStatus {
  part: Part;
  sinceKm: number;
  sinceDays: number;
  thresholdKm: number | null;
  thresholdDays: number | null;
  status: Status;
}

import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Bike, MaintenanceEvent, Part, PartStatus, Status } from './types';

export const defaultIntervals = {
  oil:   { km: 6000,  days: 365 },
  chain: { km: 500,   days: 30  },
  tires: { km: 10000, days: 365 * 3 },
  clutch:{ km: 8000,  days: 548 }, // ~18 months
} as const;

const DUE_SOON_RATIO = 0.8;

function pickInterval(part: Part) {
  const base = defaultIntervals[part.type as keyof typeof defaultIntervals];
  return {
    km: part.kmInterval ?? base?.km ?? null,
    days: part.daysInterval ?? base?.days ?? null,
  };
}

export function computePartStatus(
  bike: Bike,
  part: Part,
  eventsForBike: MaintenanceEvent[],
  todayISO: string
): PartStatus {
  const events = eventsForBike.filter(e => e.partId === part.id);
  const last = events.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())[0];

  const now = parseISO(todayISO);
  const sinceDays = last ? differenceInCalendarDays(now, parseISO(last.date)) : Infinity;
  const sinceKm   = last ? (bike.odometerKm - last.odometerKm) : Infinity;

  const { km: kmThresh, days: daysThresh } = pickInterval(part);

  const ratioKm   = kmThresh   ? sinceKm   / kmThresh   : 0;
  const ratioDays = daysThresh ? sinceDays / daysThresh : 0;

  const worstRatio = Math.max(ratioKm || 0, ratioDays || 0);

  let status: Status = 'OK';
  if (worstRatio >= 1) status = 'OVERDUE';
  else if (worstRatio >= DUE_SOON_RATIO) status = 'DUE_SOON';

  return {
    part,
    sinceKm,
    sinceDays,
    thresholdKm: kmThresh ?? null,
    thresholdDays: daysThresh ?? null,
    status,
  };
}

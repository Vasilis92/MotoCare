import { useEffect, useMemo, useState, useRef } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import './App.css';

import {
  migrate,
  listBikes,
  listParts,
  listEventsByBike,
  upsertBike,
  updateBikeOdometer,
  deleteBike,
  ensureDefaultPartsForBike,
  DEFAULT_PARTS,
  addEvent as dbAddEvent,
  exportAll as dbExportAll,
  importAll as dbImportAll,
  type Bike,
  type Part,
  type MaintenanceEvent,
  type PartType
} from '../utils/storage';

type UUID = string;
type Status = 'OK' | 'DUE_SOON' | 'OVERDUE';

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as UUID;

const normalizePartType = (type: PartType): PartType => {
  if (type === 'oil') return 'oil_change';
  if (type === 'chain' || type === 'chain_inspection') return 'chain_maintenance';
  if (type === 'clutch') return 'custom';
  return type;
};

const getDefaultConfig = (type: PartType) => {
  if (type === 'custom') return undefined;
  const normalized = normalizePartType(type) as Exclude<PartType, 'custom'>;
  if (normalized === 'custom') return undefined;
  return DEFAULT_PARTS.find((cfg) => cfg.type === normalized);
};
function Badge({ status }: { status: Status }) {
  const map = {
    OVERDUE: { fg: '#b91c1c', bg: '#fee2e2', text: 'OVERDUE' },
    DUE_SOON: { fg: '#b45309', bg: '#fef3c7', text: 'DUE SOON' },
    OK: { fg: '#065f46', bg: '#d1fae5', text: 'OK' },
  }[status];
  return (
    <span
      style={{
        color: map.fg,
        background: map.bg,
        padding: '2px 8px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        border: `1px solid ${map.fg}22`,
      }}
    >
      {map.text}
    </span>
  );
}

export default function App() {
  // DB-backed state
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<UUID | null>(null);

  // add bike form
  const [bikeName, setBikeName] = useState('');
  const [bikeModel, setBikeModel] = useState('');
  const [bikeYear, setBikeYear] = useState<number | undefined>(undefined);
  const [bikeOdo, setBikeOdo] = useState<number>(0);

  // log event form
  const [selectedPartIds, setSelectedPartIds] = useState<UUID[]>([]);
  const [isPartMenuOpen, setIsPartMenuOpen] = useState(false);
  const partMenuRef = useRef<HTMLDivElement | null>(null);
  const [odo, setOdo] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // theme
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }

  // boot + load + seed-if-empty
  useEffect(() => {
    (async () => {
      await migrate();
      const bs = await listBikes();
      setBikes(bs);

      if (bs.length > 0) {
        const id = bs[0].id;
        setSelectedBikeId(id);
        setParts(await listParts(id));
        setEvents(await listEventsByBike(id));
        return;
      }

      // Seed one demo bike if DB empty (same as your in-memory seed)
      const now = new Date().toISOString();
      const id = uuid();
      const demo: Bike = {
        id,
        name: 'MT-07',
        model: 'Yamaha',
        odometerKm: 18000,
        createdAt: now,
        updatedAt: now,
      };
      await upsertBike(demo);

      await ensureDefaultPartsForBike(id);

      const bs2 = await listBikes();
      setBikes(bs2);
      setSelectedBikeId(id);
      setParts(await listParts(id));
      setEvents(await listEventsByBike(id));
    })().catch(console.error);
  }, []);

  const selectedBike = useMemo(
    () => bikes.find((b) => b.id === selectedBikeId) ?? null,
    [bikes, selectedBikeId]
  );
  const bikeParts = useMemo(() => {
    if (!selectedBikeId) return [];
    const orderLookup = new Map(DEFAULT_PARTS.map((cfg, index) => [cfg.type, index]));
    return parts
      .filter((p) => p.bikeId === selectedBikeId)
      .sort((a, b) => {
        const aIndex = orderLookup.get(normalizePartType(a.type)) ?? orderLookup.size + 1;
        const bIndex = orderLookup.get(normalizePartType(b.type)) ?? orderLookup.size + 1;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [parts, selectedBikeId]);

  const bikeEvents = useMemo(
    () =>
      selectedBikeId
        ? [...events.filter((e) => e.bikeId === selectedBikeId)].sort(
            (a, b) => +new Date(b.date) - +new Date(a.date)
          )
        : [],
    [events, selectedBikeId]
  );

  useEffect(() => {
    const availableIds = bikeParts.map((p) => p.id);
    setSelectedPartIds((prev) => {
      const filtered = prev.filter((id) => availableIds.includes(id));
      const unchanged =
        filtered.length === prev.length && filtered.every((id, idx) => id === prev[idx]);
      if (filtered.length > 0) {
        return unchanged ? prev : filtered;
      }
      if (availableIds.length > 0) {
        return [availableIds[0]];
      }
      return [];
    });
    setIsPartMenuOpen(false);
  }, [bikeParts]);

  useEffect(() => {
    if (!isPartMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (partMenuRef.current && !partMenuRef.current.contains(event.target as Node)) {
        setIsPartMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPartMenuOpen]);

  const selectedSummary = useMemo(() => {
    if (bikeParts.length === 0) return 'No parts available';
    if (selectedPartIds.length === 0) return 'Select parts';
    if (selectedPartIds.length === 1) {
      const part = bikeParts.find((p) => p.id === selectedPartIds[0]);
      return part?.name ?? '1 part selected';
    }
    return `${selectedPartIds.length} parts selected`;
  }, [selectedPartIds, bikeParts]);

  const togglePartSelection = (id: UUID) => {
    setSelectedPartIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      const orderLookup = new Map(bikeParts.map((p, index) => [p.id, index]));
      return next.sort((a, b) => (orderLookup.get(a) ?? 999) - (orderLookup.get(b) ?? 999));
    });
  };

  function computeStatus(p: Part): { status: Status; sinceKm: number | null; sinceDays: number | null } {
    const last = bikeEvents.find((e) => e.partId === p.id);
    const defaults = getDefaultConfig(p.type);
    const kmTh = p.kmInterval ?? defaults?.kmInterval ?? undefined;
    const dTh = p.daysInterval ?? defaults?.daysInterval ?? undefined;

    const sinceKm = last ? selectedBike!.odometerKm - last.odometerKm : null;
    const sinceDays = last ? differenceInCalendarDays(new Date(), parseISO(last.date)) : null;

    const ratioKm = sinceKm != null && kmTh ? sinceKm / kmTh : 0;
    const ratioD = sinceDays != null && dTh ? sinceDays / dTh : 0;
    const worst = Math.max(ratioKm, ratioD);

    let status: Status = 'OK';
    if (worst >= 1) status = 'OVERDUE';
    else if (worst >= 0.8) status = 'DUE_SOON';
    return { status, sinceKm, sinceDays };
  }

  async function addBike() {
    if (!bikeName.trim()) return;
    const now = new Date().toISOString();
    const id = uuid();
    const b: Bike = {
      id,
      name: bikeName.trim(),
      model: bikeModel.trim() || undefined,
      year: bikeYear ?? null,
      odometerKm: bikeOdo || 0,
      createdAt: now,
      updatedAt: now,
    };
    await upsertBike(b);

    await ensureDefaultPartsForBike(id);


    const bs = await listBikes();
    setBikes(bs);
    setSelectedBikeId(id);
    setParts(await listParts(id));
    setBikeName('');
    setBikeModel('');
    setBikeYear(undefined);
    setBikeOdo(0);
  }

  async function removeBike(id: UUID) {
    const target = bikes.find((b) => b.id === id);
    if (!target) return;

    const confirmed = window.confirm('Delete ' + target.name + '? This will remove all parts and maintenance history.');
    if (!confirmed) return;

    try {
      await deleteBike(id);
      const remaining = await listBikes();
      setBikes(remaining);

      const wasSelected = selectedBikeId === id;
      if (!wasSelected) {
        return;
      }

      const removedIndex = bikes.findIndex((b) => b.id === id);
      const fallback =
        remaining[removedIndex] ??
        (removedIndex > 0 ? remaining[removedIndex - 1] : undefined) ??
        null;

      const nextId = fallback ? fallback.id : null;
      setSelectedBikeId(nextId);
      if (nextId) {
        setParts(await listParts(nextId));
        setEvents(await listEventsByBike(nextId));
      } else {
        setParts([]);
        setEvents([]);
      }
    } catch (error) {
      console.error('Failed to delete bike', error);
      alert('Failed to delete bike. Check console for details.');
    }
  }

  async function logEvent() {
    if (!selectedBike) return;
    const selectedSet = new Set(selectedPartIds);
    const partsToLog = bikeParts.filter((p) => selectedSet.has(p.id));
    if (partsToLog.length === 0) return;

    const now = new Date().toISOString();
    const odoValue = odo || selectedBike.odometerKm;

    for (const part of partsToLog) {
      const ev: MaintenanceEvent = {
        id: uuid(),
        bikeId: selectedBike.id,
        partId: part.id,
        date: now,
        odometerKm: odoValue,
        action: part.name,
        notes: notes || undefined,
      };
      await dbAddEvent(ev);
    }

    if (odoValue > selectedBike.odometerKm) {
      await updateBikeOdometer(selectedBike.id, odoValue);
    }

    setEvents(await listEventsByBike(selectedBike.id));
    setBikes(await listBikes());
    setParts(await listParts(selectedBike.id));

    setSelectedPartIds(partsToLog.map((p) => p.id));
    setIsPartMenuOpen(false);
    setOdo(0);
    setNotes('');
  }



  // Export/Import using DB dump (JSON)
  async function exportJson() {
    const data = await dbExportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'motocare-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const data = JSON.parse(text);
    await dbImportAll(data);
    const bs = await listBikes();
    setBikes(bs);
    const id = bs[0]?.id ?? null;
    setSelectedBikeId(id);
    setParts(id ? await listParts(id) : []);
    setEvents(id ? await listEventsByBike(id) : []);
    e.currentTarget.value = '';
  }

  return (
    <div className="container">
      <header className="header">
        <h1>MotoCare — Desktop</h1>
        <label className="theme-toggle" title="Toggle theme">
          <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
          <span className="knob"></span>
        </label>
        <div className="header-actions">
          <button onClick={exportJson}>Export JSON</button>
          <label className="import">
            Import JSON
            <input type="file" accept="application/json" onChange={importJson} hidden />
          </label>
        </div>
      </header>

      <section className="card">
        <h2>Add Bike</h2>
        <div className="grid4">
          <input
            placeholder="Name (e.g., MT-07)"
            value={bikeName}
            onChange={(e) => setBikeName(e.target.value)}
          />
          <input
            placeholder="Model (e.g., Yamaha)"
            value={bikeModel}
            onChange={(e) => setBikeModel(e.target.value)}
          />
          <input
           type="number"
           placeholder="Year"
           value={bikeYear ?? ''}
           onChange={e=>setBikeYear(e.target.value ? parseInt(e.target.value, 10) : undefined)}
          />
          <input
            type="number"
            placeholder="Odometer (km)"
            value={bikeOdo}
            onChange={(e) => setBikeOdo(parseInt(e.target.value || '0'))}
          />
          <button onClick={addBike}>Add</button>
        </div>
      </section>

      <section className="card">
        <h2>Bikes</h2>
        <div className="chips">
          {bikes.map((b) => {
            const isActive = selectedBikeId === b.id;
            return (
              <div key={b.id} className="chip-wrapper">
                <button
                  type="button"
                  className={`chip ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedBikeId(b.id)}
                  title={`Odometer: ${b.odometerKm} km`}
                >
                  {b.name} {b.model ? `(${b.model})` : ''}
                </button>
                <button
                  type="button"
                  className="chip-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeBike(b.id);
                  }}
                  aria-label={`Delete ${b.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        {bikes.length === 0 && <div className="muted">No bikes yet.</div>}
      </section>

      {selectedBike && (
        <>
          <section className="card">
            <h2>{selectedBike.name}: Log Maintenance</h2>
            <div className="grid4">
              <div className="part-picker" ref={partMenuRef}>
                <button
                  type="button"
                  className="part-picker-button"
                  onClick={() => setIsPartMenuOpen((open) => !open)}
                  disabled={bikeParts.length === 0}
                  aria-haspopup="listbox"
                  aria-expanded={isPartMenuOpen}
                  aria-controls="part-picker-menu"
                >
                  <span>{selectedSummary}</span>
                  <span className="caret" aria-hidden="true">▾</span>
                </button>
                {isPartMenuOpen && (
                  <div
                    id="part-picker-menu"
                    className="part-picker-menu"
                    role="listbox"
                    aria-multiselectable="true"
                  >
                    {bikeParts.map((p) => {
                      const checked = selectedPartIds.includes(p.id);
                      return (
                        <label key={p.id} className="part-picker-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePartSelection(p.id)}
                          />
                          <span>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <input
                type="number"
                placeholder="Odometer (km)"
                value={odo}
                onChange={(e) => setOdo(parseInt(e.target.value || '0'))}
              />
              <input
                placeholder="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button onClick={logEvent}>Log</button>
            </div>
            <small className="muted">Use the checkboxes to record all work completed in this service.</small>
          </section>

          <section className="card">
            <h2>{selectedBike.name}: Parts & Status</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Interval</th>
                  <th>Since</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bikeParts.map((p) => {
                  const s = computeStatus(p);
                  const defaults = getDefaultConfig(p.type);
                  const kmInterval = p.kmInterval ?? defaults?.kmInterval ?? null;
                  const daysInterval = p.daysInterval ?? defaults?.daysInterval ?? null;
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>
                        {kmInterval != null ? `${kmInterval} km` : '—'} /{' '}
                        {daysInterval != null ? `${daysInterval} days` : '—'}
                      </td>
                      <td className="muted">
                        {s.sinceKm != null ? `${s.sinceKm} km` : '—'} /{' '}
                        {s.sinceDays != null ? `${s.sinceDays} days` : '—'}
                      </td>
                      <td>
                        <Badge status={s.status} />
                      </td>
                    </tr>
                  );
                })}
                {bikeParts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No parts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>{selectedBike.name}: Events</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Odo</th>
                  <th>Action</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {bikeEvents.map((e) => (
                  <tr key={e.id}>
                    <td>{format(new Date(e.date), 'yyyy-MM-dd HH:mm')}</td>
                    <td>{e.odometerKm}</td>
                    <td>{e.action}</td>
                    <td>{e.notes ?? '—'}</td>
                  </tr>
                ))}
                {bikeEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No events logged.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}











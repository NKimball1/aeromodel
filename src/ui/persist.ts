/**
 * Remembers the setup and baseline in this browser between visits.
 * Everything read back is validated field by field; anything unknown or out
 * of range falls back to the default, so a stale or hand-edited entry can
 * never break the app.
 */
import {
  BIKE_TYPES,
  FRONT_WHEEL_DEPTHS,
  HELMETS,
  KITS,
  POSITIONS,
  REAR_WHEEL_DEPTHS,
  TIRE_QUALITIES,
  TIRE_WIDTHS,
  type RiderConfig,
} from '../physics';
import { initialAppState, type AppState, type Setup } from './appState';

export const STORAGE_KEY = 'aeromodel:state:v1';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const num = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function sanitizeConfig(raw: unknown, fallback: RiderConfig): RiderConfig {
  const r = isRec(raw) ? raw : {};
  return {
    position: oneOf(r.position, POSITIONS, fallback.position),
    kit: oneOf(r.kit, KITS, fallback.kit),
    helmet: oneOf(r.helmet, HELMETS, fallback.helmet),
    bikeType: oneOf(r.bikeType, BIKE_TYPES, fallback.bikeType),
    frontWheel: oneOf(r.frontWheel, FRONT_WHEEL_DEPTHS, fallback.frontWheel),
    rearWheel: oneOf(r.rearWheel, REAR_WHEEL_DEPTHS, fallback.rearWheel),
    tireWidthMm: oneOf(r.tireWidthMm, TIRE_WIDTHS, fallback.tireWidthMm),
    tireQuality: oneOf(r.tireQuality, TIRE_QUALITIES, fallback.tireQuality),
  };
}

function sanitizeSetup(raw: unknown): Setup | null {
  if (!isRec(raw)) return null;
  return {
    config: sanitizeConfig(raw.config, initialAppState.config),
    bikeMassKg: num(raw.bikeMassKg, 3, 20, initialAppState.bikeMassKg),
  };
}

export function sanitizeState(raw: unknown): AppState {
  const d = initialAppState;
  if (!isRec(raw)) return { ...d, config: { ...d.config } };
  const units = isRec(raw.units) ? raw.units : {};
  return {
    config: sanitizeConfig(raw.config, d.config),
    hold: oneOf(raw.hold, ['power', 'speed'] as const, d.hold),
    targetPowerW: num(raw.targetPowerW, 0, 2000, d.targetPowerW),
    speedMs: num(raw.speedMs, 0, 30, d.speedMs),
    riderMassKg: num(raw.riderMassKg, 20, 200, d.riderMassKg),
    bikeMassKg: num(raw.bikeMassKg, 3, 20, d.bikeMassKg),
    headwindMs: num(raw.headwindMs, -30, 30, d.headwindMs),
    gradePct: num(raw.gradePct, -30, 30, d.gradePct),
    drivetrainLossPct: num(raw.drivetrainLossPct, 0, 20, d.drivetrainLossPct),
    rhoSource: oneOf(raw.rhoSource, ['manual', 'altitude'] as const, d.rhoSource),
    rhoManual: num(raw.rhoManual, 0.5, 1.5, d.rhoManual),
    altitudeM: num(raw.altitudeM, -500, 6000, d.altitudeM),
    temperatureC: num(raw.temperatureC, -40, 55, d.temperatureC),
    units: {
      speed: oneOf(units.speed, ['kmh', 'mph'] as const, d.units.speed),
      mass: oneOf(units.mass, ['kg', 'lb'] as const, d.units.mass),
    },
    baseline: sanitizeSetup(raw.baseline),
  };
}

/** Storage can be missing or throw (private mode, blocked site data); never let that break the app. */
export function loadState(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AppState {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return sanitizeState(text ? JSON.parse(text) : null);
  } catch {
    return sanitizeState(null);
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or access errors: remembering the setup is a convenience, not a requirement.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

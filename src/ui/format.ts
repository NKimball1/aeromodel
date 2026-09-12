import { kgToLb, msToKmh, msToMph } from '../physics';
import type { MassUnit, SpeedUnit } from './appState';

const MINUS = '−';

export const SPEED_UNIT_LABEL: Record<SpeedUnit, string> = { kmh: 'km/h', mph: 'mph' };
export const MASS_UNIT_LABEL: Record<MassUnit, string> = { kg: 'kg', lb: 'lb' };

export const toSpeedUnit = (ms: number, unit: SpeedUnit): number => (unit === 'kmh' ? msToKmh(ms) : msToMph(ms));
export const toMassUnit = (kg: number, unit: MassUnit): number => (unit === 'kg' ? kg : kgToLb(kg));

/** Signed number with a true minus sign; zero shows no sign. */
export function signed(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? '+' : MINUS}${Math.abs(rounded).toFixed(digits)}`;
}

export function speedText(ms: number, unit: SpeedUnit, digits = 1): string {
  return `${toSpeedUnit(ms, unit).toFixed(digits)} ${SPEED_UNIT_LABEL[unit]}`;
}

export function massText(kg: number, unit: MassUnit, digits = 1): string {
  return `${toMassUnit(kg, unit).toFixed(digits)} ${MASS_UNIT_LABEL[unit]}`;
}

export function wattsText(w: number): string {
  return `${Math.round(w)} W`;
}

/** 72 → "1:12", 3725 → "1:02:05". */
export function durationText(seconds: number): string {
  const total = Math.round(Math.abs(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A time gap: under a minute as seconds ("8.4 s"), otherwise m:ss. Sign dropped. */
export function gapText(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${abs.toFixed(abs < 10 ? 1 : 0)} s`;
  return durationText(abs);
}

/** Reference distance for "time saved": 40 km, or 25 mi for imperial users. */
export function referenceDistance(unit: SpeedUnit): { metres: number; label: string } {
  return unit === 'kmh' ? { metres: 40_000, label: '40 km' } : { metres: 25 * 1609.344, label: '25 mi' };
}

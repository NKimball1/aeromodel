/**
 * Data for the "where the power goes as speed rises" chart. Pure: samples
 * each power sink's share of the rider's effort across speed, finds where the
 * air overtakes rolling resistance, writes the headline, and (with a pinned
 * baseline) what the setup change is worth at a few speeds.
 */
import { coefficientsFor, kmhToMs, mphToMs, powerFromSpeed, type PowerBreakdown } from '../physics';
import { currentSetup, type AppState } from './appState';
import type { ShareKey } from './breakdownSeries';
import { rideConditions, type Evaluation } from './evaluate';
import { SPEED_UNIT_LABEL, toSpeedUnit } from './format';

export const SHARE_KEYS: readonly ShareKey[] = ['aero', 'rolling', 'gravity', 'drivetrain'];

export interface SharePoint {
  /** Speed in the display unit (km/h or mph). */
  speed: number;
  /** 0..1 of the positive resistance; sinks that are helping (negative) count as 0. */
  shares: Record<ShareKey, number>;
  watts: Record<ShareKey, number>;
}

export interface Crossover {
  kind: 'at' | 'always' | 'never';
  /** Display-unit speed where aero first exceeds rolling (kind 'at'). */
  speed: number | null;
}

export interface ShareModel {
  xMax: number;
  xTicks: number[];
  points: SharePoint[];
  current: SharePoint;
  crossover: Crossover;
  headline: string;
  detail: string;
  /** Baseline power minus current power at fixed speeds (positive = the change saves watts). */
  savings: Array<{ speed: number; watts: number }> | null;
}

const SAMPLES = 80;

/** Nearest of 1, 2, 2.5, 5 or 10 × 10^n. */
export function niceStep(roughStep: number): number {
  const exp = Math.floor(Math.log10(roughStep));
  const f = roughStep / 10 ** exp;
  const nice = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return nice * 10 ** exp;
}

/** Evenly spaced round ticks covering [min, max], always including 0 when in range. */
export function niceTicks(min: number, max: number, target = 5): { ticks: number[]; min: number; max: number } {
  const step = niceStep(Math.max(1e-9, (max - min) / target));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Number(v.toFixed(6)));
  return { ticks, min: lo, max: hi };
}

export function sharePoint(speed: number, p: PowerBreakdown): SharePoint {
  const watts = { aero: p.aero, rolling: p.rolling, gravity: p.gravity, drivetrain: p.drivetrain };
  const total = SHARE_KEYS.reduce((s, k) => s + Math.max(0, watts[k]), 0);
  const shares = Object.fromEntries(
    SHARE_KEYS.map((k) => [k, total > 0 ? Math.max(0, watts[k]) / total : 0]),
  ) as Record<ShareKey, number>;
  return { speed, shares, watts };
}

/** Where the air overtakes rolling resistance across the sampled speeds. */
export function findCrossover(points: SharePoint[]): Crossover {
  const moving = points.filter((p) => p.watts.aero + p.watts.rolling > 0);
  if (moving.length === 0) return { kind: 'never', speed: null };
  const diff = (p: SharePoint) => p.watts.aero - p.watts.rolling;
  if (diff(moving[0]!) >= 0) return { kind: 'always', speed: null };
  for (let i = 1; i < moving.length; i++) {
    const a = moving[i - 1]!;
    const b = moving[i]!;
    if (diff(b) >= 0) {
      const t = -diff(a) / (diff(b) - diff(a));
      return { kind: 'at', speed: a.speed + (b.speed - a.speed) * t };
    }
  }
  return { kind: 'never', speed: null };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildShareModel(state: AppState, current: Evaluation, baseline: Evaluation | null): ShareModel {
  const unit = state.units.speed;
  const unitLabel = SPEED_UNIT_LABEL[unit];
  const toMs = unit === 'kmh' ? kmhToMs : mphToMs;
  const floor = unit === 'kmh' ? 50 : 30;
  const x = niceTicks(0, Math.max(floor, toSpeedUnit(current.speedMs, unit) * 1.2), 5);

  const base = rideConditions(state);
  const coeffs = coefficientsFor(state.config);
  const powerAt = (speed: number, setupCoeffs = coeffs, conditions = base) =>
    powerFromSpeed({ ...conditions, speedMs: toMs(speed) }, setupCoeffs);

  const points: SharePoint[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    // Start just above zero: shares have a well-defined limit there but 0 W total at exactly 0.
    const speed = Math.max((x.max / SAMPLES) * 0.25, (x.max * i) / SAMPLES);
    points.push(sharePoint(speed, powerAt(speed)));
  }

  const currentSpeed = toSpeedUnit(current.speedMs, unit);
  const now = sharePoint(currentSpeed, current.power);
  const crossover = findCrossover(points);

  const positive = SHARE_KEYS.some((k) => now.shares[k] > 0);
  let headline: string;
  if (!positive || current.speedMs <= 0) {
    headline =
      current.speedMs <= 0 ? 'Stopped: nothing to push against yet.' : 'Coasting: gravity is doing all the work.';
  } else if (now.shares.gravity > now.shares.aero) {
    headline = `On this ${state.gradePct.toFixed(1)}% grade, gravity takes ${pct(now.shares.gravity)} of your effort and the air ${pct(now.shares.aero)}.`;
  } else {
    headline = `At ${currentSpeed.toFixed(0)} ${unitLabel}, ${pct(now.shares.aero)} of your effort goes into the air.`;
  }

  const detail =
    crossover.kind === 'at'
      ? `Air outweighs rolling resistance above ${crossover.speed!.toFixed(0)} ${unitLabel}.`
      : crossover.kind === 'always'
        ? 'Air outweighs rolling resistance at every speed here.'
        : 'Rolling resistance outweighs the air at every speed shown.';

  let savings: ShareModel['savings'] = null;
  if (state.baseline && baseline) {
    const baseCoeffs = coefficientsFor(state.baseline.config);
    const baseConditions = rideConditions(state, state.baseline);
    const speeds = unit === 'kmh' ? [20, 30, 40, 50] : [12, 18, 25, 30];
    savings = speeds.map((speed) => ({
      speed,
      watts: powerAt(speed, baseCoeffs, baseConditions).total - powerAt(speed).total,
    }));
  }

  return { xMax: x.max, xTicks: x.ticks, points, current: now, crossover, headline, detail, savings };
}

/** The sampled point nearest a speed. */
export function nearestPoint(points: SharePoint[], speed: number): SharePoint {
  let best = points[0]!;
  for (const p of points) if (Math.abs(p.speed - speed) < Math.abs(best.speed - speed)) best = p;
  return best;
}

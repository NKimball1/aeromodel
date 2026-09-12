/**
 * Baseline comparison. The baseline pins position + equipment + bike mass;
 * ride conditions (power or speed, wind, grade, air, rider mass) are shared,
 * so the delta isolates what the setup change is worth.
 */
import { FRONT_WHEEL, REAR_WHEEL } from '../physics';
import { currentSetup, type AppState, type Setup } from './appState';
import { evaluate, type Evaluation } from './evaluate';
import {
  SPEED_UNIT_LABEL,
  gapText,
  massText,
  referenceDistance,
  signed,
  speedText,
  toSpeedUnit,
  wattsText,
} from './format';
import { BIKE_TYPE_LABELS, HELMET_LABELS, KIT_LABELS, POSITION_LABELS, TIRE_QUALITY_LABELS } from './labels';

export type Direction = 'better' | 'worse' | 'same';

export interface Comparison {
  baseline: Evaluation;
  current: Evaluation;
  /** Current minus baseline power at the same speed (hold-speed mode). */
  deltaPowerW: number;
  /** Current minus baseline speed at the same power (hold-power mode). */
  deltaSpeedMs: number;
  deltaCdA: number;
  /** Seconds saved over the reference distance (positive = current is faster). Null if either is stopped. */
  timeSavedSeconds: number | null;
  direction: Direction;
  headline: string;
  detail: string | null;
  baselineDescription: string;
  changes: string[];
}

/** Below these, a difference reads as "the same". */
const SAME_WATTS = 0.5;
const SAME_SPEED_MS = 0.05 / 3.6;

export function compare(state: AppState): Comparison | null {
  if (!state.baseline) return null;
  const baseline = evaluate(state, state.baseline);
  const current = evaluate(state);
  const units = state.units;
  const deltaPowerW = current.powerW - baseline.powerW;
  const deltaSpeedMs = current.speedMs - baseline.speedMs;
  const dist = referenceDistance(units.speed);
  const timeSavedSeconds =
    current.speedMs > 0 && baseline.speedMs > 0 ? dist.metres / baseline.speedMs - dist.metres / current.speedMs : null;

  let direction: Direction;
  let headline: string;
  let detail: string | null = null;
  if (state.hold === 'speed') {
    const at = speedText(current.speedMs, units.speed, 0);
    if (Math.abs(deltaPowerW) < SAME_WATTS) {
      direction = 'same';
      headline = `Same power as baseline at ${at}`;
    } else if (deltaPowerW < 0) {
      direction = 'better';
      headline = `Saving ${wattsText(-deltaPowerW)} at ${at}`;
    } else {
      direction = 'worse';
      headline = `Costing ${wattsText(deltaPowerW)} more at ${at}`;
    }
  } else {
    const at = wattsText(state.targetPowerW);
    const dv = toSpeedUnit(deltaSpeedMs, units.speed);
    if (Math.abs(deltaSpeedMs) < SAME_SPEED_MS) {
      direction = 'same';
      headline = `Same speed as baseline at ${at}`;
    } else {
      direction = deltaSpeedMs > 0 ? 'better' : 'worse';
      headline = `${signed(dv, 1)} ${SPEED_UNIT_LABEL[units.speed]} at ${at}`;
      if (timeSavedSeconds !== null) {
        detail = `${gapText(timeSavedSeconds)} ${timeSavedSeconds > 0 ? 'faster' : 'slower'} over ${dist.label}`;
      }
    }
  }

  return {
    baseline,
    current,
    deltaPowerW,
    deltaSpeedMs,
    deltaCdA: current.cda.total - baseline.cda.total,
    timeSavedSeconds,
    direction,
    headline,
    detail,
    baselineDescription: describeSetup(state.baseline),
    changes: changedItems(state.baseline, currentSetup(state), state),
  };
}

export function describeSetup(setup: Setup): string {
  const c = setup.config;
  return [
    POSITION_LABELS[c.position],
    KIT_LABELS[c.kit],
    `${HELMET_LABELS[c.helmet]} helmet`,
    `${BIKE_TYPE_LABELS[c.bikeType]} bike`,
    wheelsText(c.frontWheel, c.rearWheel),
    `${c.tireWidthMm} mm ${TIRE_QUALITY_LABELS[c.tireQuality].toLowerCase()} tires`,
  ].join(' · ');
}

function wheelsText(front: keyof typeof FRONT_WHEEL, rear: keyof typeof REAR_WHEEL): string {
  const f = FRONT_WHEEL[front].label;
  const r = REAR_WHEEL[rear].label;
  return f === r ? `${f} wheels` : `${f} front / ${r} rear`;
}

/** Human-readable list of what differs from the baseline, in the order the panel shows them. */
export function changedItems(from: Setup, to: Setup, state: Pick<AppState, 'units'>): string[] {
  const a = from.config;
  const b = to.config;
  const out: string[] = [];
  if (a.position !== b.position) out.push(POSITION_LABELS[b.position]);
  if (a.kit !== b.kit) out.push(KIT_LABELS[b.kit]);
  if (a.helmet !== b.helmet) out.push(`${HELMET_LABELS[b.helmet]} helmet`);
  if (a.bikeType !== b.bikeType) out.push(`${BIKE_TYPE_LABELS[b.bikeType]} bike`);
  if (a.frontWheel !== b.frontWheel) out.push(`${FRONT_WHEEL[b.frontWheel].label} front`);
  if (a.rearWheel !== b.rearWheel) out.push(`${REAR_WHEEL[b.rearWheel].label} rear`);
  if (a.tireWidthMm !== b.tireWidthMm) out.push(`${b.tireWidthMm} mm tires`);
  if (a.tireQuality !== b.tireQuality) out.push(`${TIRE_QUALITY_LABELS[b.tireQuality]} tires`);
  if (Math.abs(from.bikeMassKg - to.bikeMassKg) > 0.005) out.push(`Bike ${massText(to.bikeMassKg, state.units.mass)}`);
  return out;
}

/**
 * Per-part "dirty air" ranks for the scene's turbulence plumes.
 *
 * A single global wake can't show small changes: swapping a road helmet for
 * an aero one moves total CdA by ~0.01 m². So each drag source also gets its
 * own plume, and its rank is where the chosen option sits within that part's
 * own range: best option 0, worst 1. The scene adds a floor (nothing is ever
 * clean air) and scales each plume by that part's share of total drag, so
 * the rider's body dominates.
 *
 * Ranks come straight from the physics constants, so tuning a CdA delta moves
 * the visual too.
 */
import {
  BIKE_TYPE,
  FRONT_WHEEL,
  HELMET_CDA_DELTA,
  KIT_CDA_DELTA,
  POSITION_CDA,
  REAR_WHEEL,
  TIRE_WIDTH_CDA_DELTA,
  type RiderConfig,
} from '../physics';
import type { HotspotLevels } from '../scene';

function rank(table: Record<string, number>, key: string | number): number {
  const values = Object.values(table);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const v = table[String(key)] ?? min;
  return max > min ? (v - min) / (max - min) : 0;
}

const deltas = <T extends Record<string, { cdaDeltaZeroYaw: number } | { cdaDelta: number }>>(table: T) =>
  Object.fromEntries(
    Object.entries(table).map(([k, v]) => [k, 'cdaDeltaZeroYaw' in v ? v.cdaDeltaZeroYaw : v.cdaDelta]),
  ) as Record<string, number>;

export function hotspotLevels(config: RiderConfig): HotspotLevels {
  const position = rank(POSITION_CDA, config.position);
  return {
    // Position is the rider's biggest lever: it drives shoulders fully and
    // legs partly (a tuck tucks the knees in, but legs always churn).
    shoulders: position,
    legs: 0.35 + 0.65 * position,
    kit: rank(KIT_CDA_DELTA, config.kit),
    helmet: rank(HELMET_CDA_DELTA, config.helmet),
    frame: rank(deltas(BIKE_TYPE), config.bikeType),
    frontWheel: rank(deltas(FRONT_WHEEL), config.frontWheel),
    rearWheel: rank(deltas(REAR_WHEEL), config.rearWheel),
    tires: rank(TIRE_WIDTH_CDA_DELTA, config.tireWidthMm),
  };
}

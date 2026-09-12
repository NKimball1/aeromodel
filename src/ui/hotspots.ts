/**
 * Per-component "dirty air" levels for the scene.
 *
 * A single global wake can't show small changes: swapping a road helmet for
 * an aero one moves total CdA by ~0.01 m², a few percent of the wake. So each
 * component also gets its own turbulence plume, and its level is where the
 * chosen option sits within that component's own range of options: the best
 * option is 0 (clean), the worst is 1 (churning). Every option change moves
 * its plume by at least ~0.2, which is always visible.
 *
 * Levels are derived from the physics constants, so if a CdA delta is tuned,
 * the visual follows.
 */
import {
  BIKE_TYPE,
  FRONT_WHEEL,
  HELMET_CDA_DELTA,
  KIT_CDA_DELTA,
  REAR_WHEEL,
  TIRE_WIDTH_CDA_DELTA,
  type RiderConfig,
} from '../physics';
import type { HotspotKey, HotspotLevels } from '../scene';

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
  const levels: Record<HotspotKey, number> = {
    helmet: rank(HELMET_CDA_DELTA, config.helmet),
    kit: rank(KIT_CDA_DELTA, config.kit),
    frame: rank(deltas(BIKE_TYPE), config.bikeType),
    frontWheel: rank(deltas(FRONT_WHEEL), config.frontWheel),
    rearWheel: rank(deltas(REAR_WHEEL), config.rearWheel),
    tires: rank(TIRE_WIDTH_CDA_DELTA, config.tireWidthMm),
  };
  return levels;
}

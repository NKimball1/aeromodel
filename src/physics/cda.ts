import {
  FRONT_WHEEL,
  HELMET_CDA_DELTA,
  KIT_CDA_DELTA,
  POSITION_CDA,
  REAR_WHEEL,
  TIRE_WIDTH_CDA_DELTA,
} from './constants';
import type { CdABreakdown, RiderConfig } from './types';

/**
 * Compose CdA (m²) from a base position value plus additive modifiers.
 *
 * @param yawDeg Apparent-wind yaw angle in degrees. ACCEPTED BUT IGNORED.
 *   TODO(yaw): when crosswind support lands, each wheel's contribution should
 *   come from its per-wheel yaw curve and the rider's frontal area should
 *   grow with |yaw|. The signature is fixed now so callers won't change.
 */
export function computeCdABreakdown(config: RiderConfig, yawDeg = 0): CdABreakdown {
  void yawDeg; // TODO(yaw)
  const position = POSITION_CDA[config.position];
  const kit = KIT_CDA_DELTA[config.kit];
  const helmet = HELMET_CDA_DELTA[config.helmet];
  const frontWheel = FRONT_WHEEL[config.frontWheel].cdaDeltaZeroYaw;
  const rearWheel = REAR_WHEEL[config.rearWheel].cdaDeltaZeroYaw;
  const tireWidth = TIRE_WIDTH_CDA_DELTA[config.tireWidthMm];
  const total = position + kit + helmet + frontWheel + rearWheel + tireWidth;
  return { position, kit, helmet, frontWheel, rearWheel, tireWidth, total };
}

/** Total CdA in m². See computeCdABreakdown for the yawDeg caveat. */
export function computeCdA(config: RiderConfig, yawDeg = 0): number {
  return computeCdABreakdown(config, yawDeg).total;
}

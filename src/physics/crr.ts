import { TIRE_QUALITY_CRR, TIRE_WIDTH_CRR_MULTIPLIER } from './constants';
import type { RiderConfig } from './types';

/** Coefficient of rolling resistance from the tire preset and width. */
export function computeCrr(config: Pick<RiderConfig, 'tireQuality' | 'tireWidthMm'>): number {
  return TIRE_QUALITY_CRR[config.tireQuality] * TIRE_WIDTH_CRR_MULTIPLIER[config.tireWidthMm];
}

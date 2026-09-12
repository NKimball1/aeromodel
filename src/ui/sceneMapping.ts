/**
 * Wires physics output into scene parameters. The only place that knows
 * about both sides.
 */
import { computeCdA, powerFromSpeed, type Environment, type RiderConfig } from '../physics';
import type { SceneState } from '../scene';
import { hotspotLevels } from './hotspots';

/** Cadence range the animation uses; loosely tied to power, not physiology. */
export const CADENCE = {
  minRpm: 80,
  maxRpm: 95,
  powerAtMinW: 100,
  powerAtMaxW: 400,
  /** Below this the rider is coasting and the legs stop. */
  coastBelowW: 5,
};

export function cadenceFromPower(powerW: number): number {
  if (powerW < CADENCE.coastBelowW) return 0;
  const t = (powerW - CADENCE.powerAtMinW) / (CADENCE.powerAtMaxW - CADENCE.powerAtMinW);
  return CADENCE.minRpm + (CADENCE.maxRpm - CADENCE.minRpm) * Math.min(1, Math.max(0, t));
}

export function sceneStateFor(config: RiderConfig, env: Environment): SceneState {
  const power = powerFromSpeed(env, config).total;
  return {
    position: config.position,
    kit: config.kit,
    helmet: config.helmet,
    bikeType: config.bikeType,
    frontWheel: config.frontWheel,
    rearWheel: config.rearWheel,
    tireWidthMm: config.tireWidthMm,
    groundSpeedMs: env.speedMs,
    airSpeedMs: env.speedMs + env.headwindMs,
    cadenceRpm: cadenceFromPower(power),
    cda: computeCdA(config),
    hotspots: hotspotLevels(config),
  };
}

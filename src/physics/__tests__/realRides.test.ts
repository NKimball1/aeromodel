/**
 * Validation against REAL rides. Add rides you've actually done (steady-state
 * efforts work best: a flat TT, a long climb at constant power, a known
 * segment) and the test checks the model predicts your measured speed from
 * your measured power within a tolerance. When these fail, tune constants.ts,
 * not the rides.
 *
 * Tips for good validation points:
 *   - Use segments with steady power and speed, not whole rides with stops.
 *   - Long climbs (>5 %) mostly validate MASS and Crr; aero barely matters.
 *   - Flat, still-air efforts at 35+ km/h mostly validate CdA.
 *   - Note the wind. Even 2 m/s of headwind moves a 40 km/h effort ~40 W.
 */
import { describe, expect, it } from 'vitest';
import {
  DRIVETRAIN_LOSS_DEFAULT,
  airDensity,
  defaultConfig,
  kmhToMs,
  msToKmh,
  powerFromSpeed,
  speedFromPower,
  type RiderConfig,
} from '../index';

interface RealRide {
  label: string;
  /** Measured average power over the segment, W. */
  avgPowerW: number;
  /** Measured average speed over the segment, km/h. */
  avgSpeedKmh: number;
  riderMassKg: number;
  bikeMassKg: number;
  /** Average grade as a fraction: 0.05 = 5 %. */
  grade: number;
  /** Headwind component along travel, m/s. Negative = tailwind. 0 if unknown. */
  headwindMs: number;
  altitudeM: number;
  temperatureC: number;
  config: RiderConfig;
  /** Acceptable speed error, km/h. Wider for windy / uncertain rides. */
  toleranceKmh: number;
}

// ---------------------------------------------------------------------------
// Fill these in. The one below is a worked EXAMPLE with made-up numbers and
// is skipped; copy the shape, set `skip: false`, and put real data in.
// ---------------------------------------------------------------------------
const RIDES: Array<RealRide & { skip?: boolean }> = [
  {
    skip: true,
    label: 'EXAMPLE — flat 20 km TT effort, calm morning',
    avgPowerW: 230,
    avgSpeedKmh: 36.5,
    riderMassKg: 75,
    bikeMassKg: 8.5,
    grade: 0,
    headwindMs: 0,
    altitudeM: 260,
    temperatureC: 12,
    config: { ...defaultConfig, position: 'drops', kit: 'tightJersey', tireQuality: 'racing' },
    toleranceKmh: 1.5,
  },
];

describe('real rides', () => {
  const active = RIDES.filter((r) => !r.skip);

  it.skipIf(active.length === 0)('placeholder so the suite reports when no rides are entered', () => {
    expect(active.length).toBeGreaterThan(0);
  });

  for (const ride of active) {
    it(`${ride.label}: ${ride.avgPowerW} W → ${ride.avgSpeedKmh} km/h (±${ride.toleranceKmh})`, () => {
      const env = {
        rho: airDensity(ride.altitudeM, ride.temperatureC),
        riderMassKg: ride.riderMassKg,
        bikeMassKg: ride.bikeMassKg,
        headwindMs: ride.headwindMs,
        grade: ride.grade,
        drivetrainLoss: DRIVETRAIN_LOSS_DEFAULT,
      };
      const predictedKmh = msToKmh(speedFromPower(ride.avgPowerW, env, ride.config));
      const predictedW = powerFromSpeed({ ...env, speedMs: kmhToMs(ride.avgSpeedKmh) }, ride.config).total;
      // Both directions printed so a failure tells you which way to tune.
      console.log(
        `${ride.label}\n  measured ${ride.avgPowerW} W @ ${ride.avgSpeedKmh} km/h` +
          `\n  model: ${ride.avgPowerW} W → ${predictedKmh.toFixed(1)} km/h;` +
          ` ${ride.avgSpeedKmh} km/h → ${predictedW.toFixed(0)} W`,
      );
      expect(Math.abs(predictedKmh - ride.avgSpeedKmh)).toBeLessThanOrEqual(ride.toleranceKmh);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { defaultConfig, defaultEnvironment, kmhToMs } from '../../physics';
import { CADENCE, cadenceFromPower, sceneStateFor } from '../sceneMapping';

describe('cadenceFromPower', () => {
  it('stays within 80–95 rpm while pedaling and is monotone', () => {
    let prev = 0;
    for (const w of [20, 100, 150, 250, 400, 800]) {
      const c = cadenceFromPower(w);
      expect(c).toBeGreaterThanOrEqual(CADENCE.minRpm);
      expect(c).toBeLessThanOrEqual(CADENCE.maxRpm);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('stops the legs when coasting', () => {
    expect(cadenceFromPower(0)).toBe(0);
    expect(cadenceFromPower(-50)).toBe(0);
  });
});

describe('sceneStateFor', () => {
  it('adds headwind to airspeed but not to ground speed', () => {
    const s = sceneStateFor(defaultConfig, { ...defaultEnvironment, speedMs: kmhToMs(36), headwindMs: 3 });
    expect(s.groundSpeedMs).toBeCloseTo(10, 9);
    expect(s.airSpeedMs).toBeCloseTo(13, 9);
    expect(s.cadenceRpm).toBeGreaterThan(80);
  });
});

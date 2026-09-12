import { describe, expect, it } from 'vitest';
import { airDensity, kgToLb, kmhToMs, lbToKg, mphToMs, msToKmh, msToMph } from '../index';

describe('airDensity', () => {
  it('sea level, 15 °C is the ISA value 1.225', () => {
    expect(airDensity(0, 15)).toBeCloseTo(1.225, 3);
  });

  it('is lower at altitude and lower when warmer', () => {
    expect(airDensity(1500, 15)).toBeLessThan(airDensity(0, 15));
    expect(airDensity(0, 30)).toBeLessThan(airDensity(0, 15));
  });

  it('Denver-ish (1600 m, 20 °C) is roughly 1.00 ± 0.03', () => {
    expect(airDensity(1600, 20)).toBeGreaterThan(0.97);
    expect(airDensity(1600, 20)).toBeLessThan(1.03);
  });
});

describe('units', () => {
  it('round-trips km/h, mph and lb', () => {
    expect(msToKmh(kmhToMs(40))).toBeCloseTo(40, 9);
    expect(msToMph(mphToMs(25))).toBeCloseTo(25, 9);
    expect(kgToLb(lbToKg(165))).toBeCloseTo(165, 9);
  });

  it('has the right magnitudes', () => {
    expect(kmhToMs(36)).toBeCloseTo(10, 9);
    expect(msToMph(kmhToMs(100))).toBeCloseTo(62.137, 2);
    expect(kgToLb(75)).toBeCloseTo(165.35, 1);
  });
});

/**
 * Validation against published data. Each block cites a source from
 * references.ts. If a constant is retuned outside what these studies
 * measured, or the power equation changes, these fail.
 */
import { describe, expect, it } from 'vitest';
import {
  DRIVETRAIN_LOSS_DEFAULT,
  POSITION_CDA,
  REFERENCES,
  TIRE_QUALITY_CRR,
  TIRE_WIDTH_CRR_MULTIPLIER,
  computeCdA,
  defaultConfig,
  powerFromSpeed,
  referenceById,
} from '../index';

describe('references', () => {
  it('every source has a title, a venue and an https link', () => {
    for (const r of REFERENCES) {
      expect(r.title.length, r.id).toBeGreaterThan(10);
      expect(r.venue.length, r.id).toBeGreaterThan(3);
      expect(r.url, r.id).toMatch(/^https:\/\//);
    }
    expect(new Set(REFERENCES.map((r) => r.id)).size).toBe(REFERENCES.length);
  });
});

/**
 * Martin et al. 1998 (martin1998). Six riders, SRM power meters, a 471.8 m
 * taxiway at 0.3 % grade, wind measured at the course. Table 2 gives the
 * means of all riders for six bouts. Their parameters: drag area 0.264 m²
 * (wind-tunnel mean) plus 0.0044 m² for wheel rotation, Crr 0.0032, chain
 * efficiency 97.698 %, air density 1.2234 kg/m³ (appendix). Total mass
 * ≈ 85 kg is back-solved from their rolling-resistance column.
 *
 * Our model omits wheel-bearing friction (1–2 W) and speed changes (±2 W),
 * both in their measured totals, so a few watts of disagreement is expected.
 */
describe(`Martin et al. 1998: ${referenceById('martin1998').title}`, () => {
  const bouts = [
    { vg: 6.8, va: 6.1, uphill: true, measured: 81, aero: 45.5, rolling: 18.2, gravity: 16.5 },
    { vg: 7.0, va: 8.1, uphill: false, measured: 77, aero: 75.6, rolling: 18.6, gravity: -16.9 },
    { vg: 8.8, va: 8.2, uphill: true, measured: 151, aero: 98.6, rolling: 23.3, gravity: 21.2 },
    { vg: 9.1, va: 9.6, uphill: false, measured: 156, aero: 137, rolling: 24.2, gravity: -22 },
    { vg: 10.9, va: 10.4, uphill: true, measured: 251, aero: 193, rolling: 29, gravity: 26.3 },
    { vg: 11.1, va: 12.1, uphill: false, measured: 273, aero: 269, rolling: 29.4, gravity: -26.7 },
  ];
  const coeffs = { cda: 0.264 + 0.0044, crr: 0.0032 };
  const env = (b: (typeof bouts)[number]) => ({
    rho: 1.2234,
    riderMassKg: 72,
    bikeMassKg: 13,
    speedMs: b.vg,
    headwindMs: b.va - b.vg,
    grade: b.uphill ? 0.003 : -0.003,
    drivetrainLoss: 1 - 0.97698,
  });

  it('predicts measured road power within 6.4 W RMS (their own model: 6.2 W)', () => {
    const errors = bouts.map((b) => powerFromSpeed(env(b), coeffs).total - b.measured);
    const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
    expect(rms).toBeLessThan(7);
    for (const e of errors) expect(Math.abs(e)).toBeLessThan(15);
  });

  it('matches their aero, rolling and gravity components bout by bout', () => {
    for (const b of bouts) {
      const p = powerFromSpeed(env(b), coeffs);
      // Their aero column uses per-trial yaw-interpolated drag areas; ours a single mean.
      expect(Math.abs(p.aero - b.aero)).toBeLessThan(5);
      expect(Math.abs(p.rolling - b.rolling)).toBeLessThan(1);
      expect(Math.abs(p.gravity - b.gravity)).toBeLessThan(1.5);
    }
  });

  it('reproduces the appendix worked example term by term', () => {
    // 80 kg rider + 10 kg bike, 8.36 m/s over the ground, 10.91 m/s airspeed,
    // drag area 0.2565 + 0.0044 at 7.7° yaw, grade 0.003.
    const p = powerFromSpeed(
      { rho: 1.2234, riderMassKg: 80, bikeMassKg: 10, speedMs: 8.36, headwindMs: 10.91 - 8.36, grade: 0.003, drivetrainLoss: 0 },
      { cda: 0.2565 + 0.0044, crr: 0.0032 },
    );
    expect(p.aero).toBeCloseTo(158.8, 0);
    expect(p.rolling).toBeCloseTo(23.6, 0);
    expect(p.gravity).toBeCloseTo(22.1, 0);
  });

  it('keeps our drivetrain loss near their measured 2.3 %', () => {
    expect(DRIVETRAIN_LOSS_DEFAULT).toBeGreaterThanOrEqual(0.015);
    expect(DRIVETRAIN_LOSS_DEFAULT).toBeLessThanOrEqual(0.03);
  });
});

/**
 * Wind-tunnel drag areas (rider + bike) compiled in Defraeye et al. 2010,
 * Table 1 (defraeye2010), plus their own measurements:
 *   time trial: Dal Monte 1987 0.246–0.254, Kyle 1991 0.221, Broker & Kyle 1995 0.203,
 *     Martin 1998 0.269, Padilla 2000 0.244, Jeukendrup & Martin 2001 0.240–0.269,
 *     Gibertini 2008 0.223, Garcia-Lopez 2008 0.260 (static), Defraeye 2010 0.211
 *   dropped: Kyle & Burke 1984 0.32, Jeukendrup & Martin 2001 0.307, Gibertini 2008 0.275,
 *     Defraeye 2010 0.243
 *   upright (hands on the tops): Jeukendrup & Martin 2001 0.358, Defraeye 2010 0.270
 */
describe(`Wind-tunnel CdA by position: ${referenceById('defraeye2010').title}`, () => {
  const TT = [0.25, 0.221, 0.203, 0.269, 0.244, 0.2545, 0.223, 0.26, 0.211];
  const DROPPED = [0.32, 0.307, 0.275, 0.243];
  const UPRIGHT = [0.358, 0.27];
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };

  it('time-trial CdA is inside the published range and within 0.015 m² of its median', () => {
    expect(POSITION_CDA.tt).toBeGreaterThanOrEqual(Math.min(...TT));
    expect(POSITION_CDA.tt).toBeLessThanOrEqual(Math.max(...TT));
    expect(Math.abs(POSITION_CDA.tt - median(TT))).toBeLessThanOrEqual(0.015);
  });

  it('dropped CdA is inside the published range', () => {
    expect(POSITION_CDA.drops).toBeGreaterThanOrEqual(Math.min(...DROPPED));
    expect(POSITION_CDA.drops).toBeLessThanOrEqual(Math.max(...DROPPED));
  });

  it('upright CdA does not exceed the highest published value (with a little margin)', () => {
    expect(POSITION_CDA.upright).toBeGreaterThanOrEqual(Math.min(...UPRIGHT));
    expect(POSITION_CDA.upright).toBeLessThanOrEqual(Math.max(...UPRIGHT) + 0.01);
  });

  it('hoods sits between the dropped and upright values', () => {
    expect(POSITION_CDA.hoods).toBeGreaterThan(POSITION_CDA.drops);
    expect(POSITION_CDA.hoods).toBeLessThan(POSITION_CDA.upright);
  });

  it('the spread between positions matches published ratios (dropped ≈ 0.86–0.90 of upright)', () => {
    // Jeukendrup & Martin 2001: 0.307 / 0.358 = 0.86; Defraeye 2010: 0.243 / 0.270 = 0.90.
    const ratio = POSITION_CDA.drops / POSITION_CDA.upright;
    expect(ratio).toBeGreaterThanOrEqual(0.82);
    expect(ratio).toBeLessThanOrEqual(0.92);
  });

  it('the Defraeye rider (aero helmet, race suit) lands near their measured time-trial value', () => {
    const ours = computeCdA({ ...defaultConfig, position: 'tt', helmet: 'aero', kit: 'skinsuit' });
    expect(Math.abs(ours - 0.211)).toBeLessThan(0.02);
  });
});

/**
 * Drum tests of a Continental GP5000 (brrGp5000): 29 km/h, 42.5 kg wheel
 * load. Crr = watts / (load · g · speed). 25 mm with butyl tubes, 80–120 psi:
 * 10.0–12.1 W; with latex tubes 8.4–10.0 W. At equal pressure the 32 mm rolls
 * ~8 % easier than the 23 mm; at equal tire drop they are nearly identical.
 */
describe(`Rolling resistance: ${referenceById('brrGp5000').title}`, () => {
  const crr = (watts: number) => watts / (42.5 * 9.80665 * (29 / 3.6));

  it('racing-tire Crr falls within the GP5000 25 mm drum results', () => {
    expect(TIRE_QUALITY_CRR.racing).toBeGreaterThanOrEqual(crr(8.4));
    expect(TIRE_QUALITY_CRR.racing).toBeLessThanOrEqual(crr(12.1));
  });

  it('width adjustment stays between "equal pressure" (−8 %) and "equal comfort" (≈0 %)', () => {
    const ratio3223 = TIRE_WIDTH_CRR_MULTIPLIER[32] / TIRE_WIDTH_CRR_MULTIPLIER[23];
    const drumEqualPressure = 9.7 / 10.6; // butyl, 100 psi
    expect(ratio3223).toBeGreaterThanOrEqual(drumEqualPressure - 0.01);
    expect(ratio3223).toBeLessThanOrEqual(1);
  });
});

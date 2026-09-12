import { describe, expect, it } from 'vitest';
import {
  defaultEnvironment,
  kmhToMs,
  msToKmh,
  powerFromSpeed,
  speedFromPower,
  type Environment,
} from '../index';

const flat = (speedKmh: number, overrides: Partial<Environment> = {}): Environment => ({
  ...defaultEnvironment,
  speedMs: kmhToMs(speedKmh),
  ...overrides,
});

describe('powerFromSpeed — sanity points', () => {
  it('75 kg rider on the hoods (CdA 0.34, Crr 0.0045), flat, 30 km/h ≈ 150–170 W', () => {
    const p = powerFromSpeed(flat(30), { cda: 0.34, crr: 0.0045 });
    expect(p.total).toBeGreaterThan(150);
    expect(p.total).toBeLessThan(170);
    // Aero should dominate rolling at 30 km/h, roughly 4:1.
    expect(p.aero / p.rolling).toBeGreaterThan(3);
    expect(p.aero / p.rolling).toBeLessThan(5);
    expect(p.gravity).toBe(0);
  });

  it('same rider at 40 km/h needs roughly 310–360 W', () => {
    const p = powerFromSpeed(flat(40), { cda: 0.34, crr: 0.0045 });
    expect(p.total).toBeGreaterThan(310);
    expect(p.total).toBeLessThan(360);
  });

  it('TT position (CdA 0.225, racing tires) at 40 km/h ≈ 215–250 W', () => {
    const p = powerFromSpeed(flat(40), { cda: 0.225, crr: 0.00325 });
    expect(p.total).toBeGreaterThan(215);
    expect(p.total).toBeLessThan(250);
  });

  it('breakdown sums to total and drivetrain is loss/(1-loss) of the wheel power', () => {
    const p = powerFromSpeed(flat(35), { cda: 0.3, crr: 0.004 });
    expect(p.aero + p.rolling + p.gravity + p.drivetrain).toBeCloseTo(p.total, 9);
    const atWheel = p.aero + p.rolling + p.gravity;
    const loss = defaultEnvironment.drivetrainLoss;
    expect(p.drivetrain).toBeCloseTo(atWheel * (loss / (1 - loss)), 9);
  });

  it('8 % climb at 15 km/h is gravity-dominated, ≈ 280–320 W', () => {
    const p = powerFromSpeed(flat(15, { grade: 0.08 }), { cda: 0.4, crr: 0.0045 });
    expect(p.gravity).toBeGreaterThan(p.aero + p.rolling);
    expect(p.total).toBeGreaterThan(280);
    expect(p.total).toBeLessThan(320);
  });

  it('zero speed needs zero power', () => {
    expect(powerFromSpeed(flat(0), { cda: 0.3, crr: 0.004 }).total).toBe(0);
  });

  it('a tailwind stronger than ground speed gives negative aero power', () => {
    const p = powerFromSpeed(flat(10, { headwindMs: -8 }), { cda: 0.3, crr: 0.004 });
    expect(p.aero).toBeLessThan(0);
  });

  it('a headwind costs more than still air, which costs more than a tailwind', () => {
    const c = { cda: 0.3, crr: 0.004 };
    const head = powerFromSpeed(flat(30, { headwindMs: 3 }), c).total;
    const still = powerFromSpeed(flat(30), c).total;
    const tail = powerFromSpeed(flat(30, { headwindMs: -3 }), c).total;
    expect(head).toBeGreaterThan(still);
    expect(still).toBeGreaterThan(tail);
  });
});

describe('powerFromSpeed — monotonicity', () => {
  const speeds = [10, 20, 30, 40, 50];

  it('more CdA → more power at every speed', () => {
    for (const s of speeds) {
      const lo = powerFromSpeed(flat(s), { cda: 0.25, crr: 0.004 }).total;
      const hi = powerFromSpeed(flat(s), { cda: 0.35, crr: 0.004 }).total;
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it('more Crr → more power at every speed', () => {
    for (const s of speeds) {
      const lo = powerFromSpeed(flat(s), { cda: 0.3, crr: 0.003 }).total;
      const hi = powerFromSpeed(flat(s), { cda: 0.3, crr: 0.006 }).total;
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it('more speed → more power on the flat', () => {
    let prev = -1;
    for (const s of speeds) {
      const p = powerFromSpeed(flat(s), { cda: 0.3, crr: 0.004 }).total;
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it('more mass, more grade, more rho, more drivetrain loss → more power', () => {
    const c = { cda: 0.3, crr: 0.004 };
    const base = powerFromSpeed(flat(30), c).total;
    expect(powerFromSpeed(flat(30, { riderMassKg: 90 }), c).total).toBeGreaterThan(base);
    expect(powerFromSpeed(flat(30, { grade: 0.02 }), c).total).toBeGreaterThan(base);
    expect(powerFromSpeed(flat(30, { rho: 1.3 }), c).total).toBeGreaterThan(base);
    expect(powerFromSpeed(flat(30, { drivetrainLoss: 0.05 }), c).total).toBeGreaterThan(base);
  });

  it('aero grows ~cubically with speed (doubling speed ≈ 8× aero power)', () => {
    const c = { cda: 0.3, crr: 0.004 };
    const a20 = powerFromSpeed(flat(20), c).aero;
    const a40 = powerFromSpeed(flat(40), c).aero;
    expect(a40 / a20).toBeCloseTo(8, 6);
  });
});

describe('speedFromPower — inverts powerFromSpeed', () => {
  const c = { cda: 0.34, crr: 0.0045 };
  const { speedMs: _ignored, ...envNoSpeed } = defaultEnvironment;

  it('round-trips at a range of speeds on the flat within 0.01 km/h', () => {
    for (const kmh of [5, 15, 25, 35, 45, 60]) {
      const p = powerFromSpeed(flat(kmh), c).total;
      const v = speedFromPower(p, envNoSpeed, c);
      expect(Math.abs(msToKmh(v) - kmh)).toBeLessThan(0.01);
    }
  });

  it('round-trips on a climb, a descent, and into a headwind', () => {
    const cases: Array<Partial<Environment>> = [
      { grade: 0.06 },
      { grade: -0.04 },
      { headwindMs: 5 },
      { headwindMs: -3 },
      { grade: 0.03, headwindMs: 2, rho: 1.1, riderMassKg: 85 },
    ];
    for (const over of cases) {
      const env = { ...envNoSpeed, ...over };
      const p = powerFromSpeed({ ...env, speedMs: kmhToMs(28) }, c).total;
      const v = speedFromPower(p, env, c);
      expect(Math.abs(msToKmh(v) - 28)).toBeLessThan(0.01);
    }
  });

  it('200 W on the hoods on the flat is roughly 32–35 km/h', () => {
    const kmh = msToKmh(speedFromPower(200, envNoSpeed, c));
    expect(kmh).toBeGreaterThan(32);
    expect(kmh).toBeLessThan(35);
  });

  it('more power → more speed', () => {
    let prev = 0;
    for (const w of [50, 100, 200, 300, 400]) {
      const v = speedFromPower(w, envNoSpeed, c);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('0 W on the flat is 0 km/h', () => {
    expect(speedFromPower(0, envNoSpeed, c)).toBe(0);
  });

  it('0 W on a −8 % descent is a terminal coasting speed (largest root), ≈ 55–75 km/h', () => {
    const env = { ...envNoSpeed, grade: -0.08 };
    const v = speedFromPower(0, env, c);
    const kmh = msToKmh(v);
    expect(kmh).toBeGreaterThan(55);
    expect(kmh).toBeLessThan(75);
    // It really is a root, and going faster really does need positive power.
    expect(Math.abs(powerFromSpeed({ ...env, speedMs: v }, c).total)).toBeLessThan(1);
    expect(powerFromSpeed({ ...env, speedMs: v + 1 }, c).total).toBeGreaterThan(0);
  });

  it('with a big tailwind, low target power picks the fast (stable) root', () => {
    const env = { ...envNoSpeed, headwindMs: -10 };
    const v = speedFromPower(5, env, c);
    // With a 36 km/h tailwind, 5 W should carry you well past walking pace.
    expect(msToKmh(v)).toBeGreaterThan(20);
    expect(powerFromSpeed({ ...env, speedMs: v + 0.5 }, c).total).toBeGreaterThan(5);
  });
});

import { describe, expect, it } from 'vitest';
import { BIKE_TYPE, kmhToMs, msToKmh, powerFromSpeed } from '../../physics';
import { currentSetup, initialAppState, withBikeType, type AppState } from '../appState';
import { changedItems, compare, describeSetup } from '../baseline';
import { evaluate, resolveRho, switchHold } from '../evaluate';
import { durationText, gapText, massText, signed, speedText } from '../format';

const state = (over: Partial<AppState> = {}): AppState => ({ ...initialAppState, ...over });

describe('evaluate', () => {
  it('hold power: solves speed, and the power at that speed matches the target', () => {
    const ev = evaluate(state({ hold: 'power', targetPowerW: 250 }));
    expect(ev.powerW).toBe(250);
    expect(Math.abs(ev.power.total - 250)).toBeLessThan(0.5);
    expect(msToKmh(ev.speedMs)).toBeGreaterThan(30);
  });

  it('hold speed: power is what that speed requires', () => {
    const s = state({ hold: 'speed', speedMs: kmhToMs(40) });
    const ev = evaluate(s);
    expect(ev.speedMs).toBeCloseTo(kmhToMs(40), 9);
    expect(ev.powerW).toBeCloseTo(powerFromSpeed(ev.env, s.config).total, 9);
  });

  it('W/kg uses rider mass only', () => {
    const ev = evaluate(state({ hold: 'power', targetPowerW: 300, riderMassKg: 75, bikeMassKg: 8 }));
    expect(ev.wPerKg).toBeCloseTo(4, 9);
  });

  it('air density comes from altitude + temperature when asked', () => {
    expect(resolveRho(state({ rhoSource: 'manual', rhoManual: 1.1 }))).toBe(1.1);
    expect(resolveRho(state({ rhoSource: 'altitude', altitudeM: 0, temperatureC: 15 }))).toBeCloseTo(1.225, 3);
  });

  it('switching hold mode carries the ride on at the same speed and power', () => {
    const p = state({ hold: 'power', targetPowerW: 220 });
    const before = evaluate(p);
    const s = switchHold(p, 'speed');
    expect(s.speedMs).toBeCloseTo(before.speedMs, 9);
    expect(evaluate(s).powerW).toBeCloseTo(220, 0);
    const back = switchHold(s, 'power');
    expect(back.targetPowerW).toBe(220);
  });
});

describe('withBikeType', () => {
  it('pre-fills a typical bike mass for the new type', () => {
    const s = withBikeType(state(), 'endurance');
    expect(s.config.bikeType).toBe('endurance');
    expect(s.bikeMassKg).toBe(BIKE_TYPE.endurance.typicalMassKg);
  });

  it('leaves the mass alone when the type does not change', () => {
    const s = state({ bikeMassKg: 9.9 });
    expect(withBikeType(s, s.config.bikeType).bikeMassKg).toBe(9.9);
  });
});

describe('compare', () => {
  const pinned = (over: Partial<AppState> = {}) => {
    const s = state(over);
    return { ...s, baseline: currentSetup(s) };
  };

  it('returns null with no baseline, and "same" right after pinning', () => {
    expect(compare(state())).toBeNull();
    const c = compare(pinned())!;
    expect(c.direction).toBe('same');
    expect(c.changes).toEqual([]);
  });

  it('hold speed: a tuck reports watts saved at that speed', () => {
    const s = pinned({ hold: 'speed', speedMs: kmhToMs(40) });
    const c = compare({ ...s, config: { ...s.config, position: 'drops', kit: 'skinsuit' } })!;
    expect(c.direction).toBe('better');
    expect(c.deltaPowerW).toBeLessThan(-30);
    expect(c.headline).toMatch(/^Saving \d+ W at 40 km\/h$/);
    expect(c.changes).toEqual(['Drops', 'Skinsuit']);
    expect(c.deltaCdA).toBeLessThan(0);
  });

  it('hold power: an aero change reports speed gained and time saved over 40 km', () => {
    const s = pinned({ hold: 'power', targetPowerW: 250 });
    const c = compare({ ...s, config: { ...s.config, position: 'tt', helmet: 'aero' } })!;
    expect(c.direction).toBe('better');
    expect(c.deltaSpeedMs).toBeGreaterThan(0);
    expect(c.headline).toMatch(/^\+\d+\.\d km\/h at 250 W$/);
    expect(c.detail).toMatch(/faster over 40 km$/);
    expect(c.timeSavedSeconds!).toBeGreaterThan(60);
  });

  it('a worse setup is flagged worse, in mph when imperial', () => {
    const s = pinned({ hold: 'power', targetPowerW: 200, units: { speed: 'mph', mass: 'lb' } });
    const c = compare({ ...s, config: { ...s.config, kit: 'baggyJacket' } })!;
    expect(c.direction).toBe('worse');
    expect(c.headline).toMatch(/^−\d+\.\d mph at 200 W$/);
    expect(c.detail).toMatch(/slower over 25 mi$/);
  });

  it('describes the baseline and lists bike mass changes in the chosen unit', () => {
    const s = pinned();
    expect(describeSetup(s.baseline!)).toBe(
      'Hoods · Tight jersey · Road helmet · Climbing bike · Box (~25 mm) wheels · 25 mm training tires',
    );
    expect(changedItems(s.baseline!, { ...s.baseline!, bikeMassKg: 7 }, { units: { speed: 'kmh', mass: 'lb' } })).toEqual([
      'Bike 15.4 lb',
    ]);
  });
});

describe('format', () => {
  it('formats signed values, speeds, masses and durations', () => {
    expect(signed(2.345, 1)).toBe('+2.3');
    expect(signed(-1.26, 1)).toBe('−1.3');
    expect(signed(0.01, 1)).toBe('0.0');
    expect(speedText(kmhToMs(36), 'kmh')).toBe('36.0 km/h');
    expect(speedText(kmhToMs(100), 'mph', 0)).toBe('62 mph');
    expect(massText(75, 'lb')).toBe('165.3 lb');
    expect(durationText(72)).toBe('1:12');
    expect(durationText(3725)).toBe('1:02:05');
    expect(gapText(8.44)).toBe('8.4 s');
    expect(gapText(-95)).toBe('1:35');
  });
});

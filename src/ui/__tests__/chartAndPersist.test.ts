import { describe, expect, it } from 'vitest';
import { kmhToMs } from '../../physics';
import { currentSetup, initialAppState, type AppState } from '../appState';
import { compare } from '../baseline';
import { SHARE_KEYS, buildShareModel, findCrossover, nearestPoint, niceStep, niceTicks } from '../chartModel';
import { evaluate } from '../evaluate';
import { STORAGE_KEY, loadState, sanitizeState, saveState } from '../persist';

const state = (over: Partial<AppState> = {}): AppState => ({ ...initialAppState, ...over });

describe('niceTicks', () => {
  it('picks round steps and covers the range', () => {
    expect(niceStep(7)).toBe(5);
    expect(niceStep(8)).toBe(10);
    expect(niceStep(0.23)).toBe(0.25);
    const t = niceTicks(0, 437, 4);
    expect(t.ticks).toEqual([0, 100, 200, 300, 400, 500]);
    expect(t.max).toBe(500);
  });

  it('includes zero when the range spans negative values', () => {
    const t = niceTicks(-180, 420, 4);
    expect(t.ticks).toContain(0);
    expect(t.min).toBeLessThanOrEqual(-180);
  });
});

describe('buildShareModel', () => {
  const model = (over: Partial<AppState> = {}) => {
    const s = state(over);
    return buildShareModel(s, evaluate(s), null);
  };

  it('shares add up to 100 % at every sampled speed', () => {
    for (const p of model().points) {
      const sum = SHARE_KEYS.reduce((acc, k) => acc + p.shares[k], 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('on the flat, the air takes a growing share as speed rises', () => {
    const pts = model().points;
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.shares.aero).toBeGreaterThanOrEqual(pts[i - 1]!.shares.aero);
    expect(nearestPoint(pts, 10).shares.aero).toBeLessThan(0.4);
    expect(nearestPoint(pts, 50).shares.aero).toBeGreaterThan(0.85);
  });

  it('finds the air/rolling crossover where the physics puts it (~15 km/h for the default rider)', () => {
    // 0.5·rho·CdA·v² = Crr·m·g  →  v = sqrt(0.0045·83·9.80665 / (0.5·1.225·0.34)) ≈ 4.19 m/s ≈ 15.1 km/h
    const m = model();
    expect(m.crossover.kind).toBe('at');
    expect(Math.abs(m.crossover.speed! - 15.1)).toBeLessThan(0.5);
    expect(m.detail).toBe('Air outweighs rolling resistance above 15 km/h.');
  });

  it('headline quotes the aero share at the current speed', () => {
    const m = model({ hold: 'speed', speedMs: kmhToMs(40) });
    expect(m.headline).toMatch(/^At 40 km\/h, \d+% of your effort goes into the air\.$/);
    expect(m.current.shares.aero).toBeGreaterThan(0.8);
  });

  it('on a steep climb the headline switches to gravity', () => {
    const m = model({ hold: 'power', targetPowerW: 250, gradePct: 8 });
    expect(m.current.shares.gravity).toBeGreaterThan(m.current.shares.aero);
    expect(m.headline).toMatch(/^On this 8\.0% grade, gravity takes \d+% of your effort/);
  });

  it('a strong headwind makes the air dominant at every speed', () => {
    expect(findCrossover(model({ headwindMs: 8 }).points).kind).toBe('always');
  });

  it('with a baseline, an aero change saves more the faster you go (cubically)', () => {
    const pinned = { ...state({ hold: 'power', targetPowerW: 200 }), baseline: currentSetup(state()) };
    const tucked = { ...pinned, config: { ...pinned.config, position: 'drops' as const } };
    const cmp = compare(tucked)!;
    const m = buildShareModel(tucked, cmp.current, cmp.baseline);
    const at = (v: number) => m.savings!.find((x) => x.speed === v)!.watts;
    expect(at(20)).toBeGreaterThan(0);
    // Same tires and mass, so the saving is pure aero: ∝ v³ → (50/20)³ = 15.6.
    expect(at(50) / at(20)).toBeCloseTo(15.625, 1);
    expect(model().savings).toBeNull();
  });

  it('shows no shares when stopped', () => {
    const m = model({ hold: 'power', targetPowerW: 0 });
    expect(m.headline).toMatch(/^Stopped/);
  });
});

describe('persist', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    };
  };

  it('round-trips a setup with a baseline', () => {
    const store = memory();
    const s = { ...state({ hold: 'speed', riderMassKg: 68, units: { speed: 'mph', mass: 'lb' } }), baseline: currentSetup(state()) };
    const changed = { ...s, config: { ...s.config, position: 'drops' as const, bikeType: 'aero' as const } };
    saveState(changed, store);
    expect(loadState(store)).toEqual(changed);
  });

  it('falls back field by field on bad or hostile data', () => {
    const s = sanitizeState({
      config: { position: 'superman', kit: 'skinsuit', tireWidthMm: 99 },
      riderMassKg: 'heavy',
      targetPowerW: 1e9,
      units: { speed: 'furlongs' },
      baseline: 'nope',
    });
    expect(s.config.position).toBe(initialAppState.config.position);
    expect(s.config.kit).toBe('skinsuit');
    expect(s.config.tireWidthMm).toBe(initialAppState.config.tireWidthMm);
    expect(s.riderMassKg).toBe(initialAppState.riderMassKg);
    expect(s.targetPowerW).toBe(2000);
    expect(s.units.speed).toBe('kmh');
    expect(s.baseline).toBeNull();
  });

  it('survives unreadable storage and broken JSON', () => {
    expect(loadState(null)).toEqual(sanitizeState(null));
    expect(loadState({ getItem: () => '{not json' })).toEqual(sanitizeState(null));
    expect(
      loadState({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(sanitizeState(null));
    expect(() => saveState(initialAppState, { setItem: () => { throw new Error('quota'); } })).not.toThrow();
    expect(STORAGE_KEY).toMatch(/v1$/);
  });
});

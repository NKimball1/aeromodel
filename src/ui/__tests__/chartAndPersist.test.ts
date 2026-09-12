import { describe, expect, it } from 'vitest';
import { powerFromSpeed, kmhToMs } from '../../physics';
import { currentSetup, initialAppState, type AppState } from '../appState';
import { compare } from '../baseline';
import { buildChartModel, niceStep, niceTicks, powerCurve, valueAt } from '../chartModel';
import { evaluate, rideConditions } from '../evaluate';
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

describe('buildChartModel', () => {
  it('has only the current curve without a baseline, and it passes through the operating point', () => {
    const s = state({ hold: 'power', targetPowerW: 250 });
    const ev = evaluate(s);
    const m = buildChartModel(s, ev, null);
    expect(m.series.map((x) => x.key)).toEqual(['current']);
    const marker = m.markers[0]!;
    expect(valueAt(m.series[0]!.points, marker.point.speed)).toBeCloseTo(250, -1);
    expect(m.xMax).toBeGreaterThan(marker.point.speed);
    expect(m.yMax).toBeGreaterThanOrEqual(Math.max(...m.series[0]!.points.map((p) => p.powerW)));
  });

  it('adds the baseline curve and marker once pinned; a tuck curve sits below it', () => {
    const pinned = { ...state({ hold: 'speed', speedMs: kmhToMs(40) }), baseline: currentSetup(state()) };
    const tucked = { ...pinned, config: { ...pinned.config, position: 'tt' as const } };
    const cmp = compare(tucked)!;
    const m = buildChartModel(tucked, cmp.current, cmp.baseline);
    expect(m.series.map((x) => x.key)).toEqual(['current', 'baseline']);
    expect(m.markers).toHaveLength(2);
    const cur = m.series[0]!.points;
    const base = m.series[1]!.points;
    expect(valueAt(cur, 40)).toBeLessThan(valueAt(base, 40));
  });

  it('samples power exactly as the physics does, in the display unit', () => {
    const s = state({ units: { speed: 'mph', mass: 'kg' } });
    const pts = powerCurve(s, currentSetup(s), 40);
    const p = pts.find((x) => Math.abs(x.speed - 20) < 1e-9) ?? pts[36]!;
    const expected = powerFromSpeed({ ...rideConditions(s), speedMs: p.speed / 2.2369362920544 }, s.config).total;
    expect(p.powerW).toBeCloseTo(expected, 6);
  });

  it('extends the y axis below zero on a descent', () => {
    const s = state({ hold: 'power', targetPowerW: 0, gradePct: -6 });
    const m = buildChartModel(s, evaluate(s), null);
    expect(m.yMin).toBeLessThan(0);
    expect(m.yTicks).toContain(0);
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

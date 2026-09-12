import { describe, expect, it } from 'vitest';
import {
  BIKE_TYPES,
  POSITIONS,
  FRONT_WHEEL_DEPTHS,
  HELMETS,
  KITS,
  REAR_WHEEL_DEPTHS,
  TIRE_WIDTHS,
  defaultConfig,
  type RiderConfig,
} from '../../physics';
import { hotspotLevels } from '../../ui/hotspots';
import { FRAME_STYLES, frameLayout } from '../bikeTypes';
import {
  CLEAN_HOTSPOTS,
  HOTSPOT_KEYS,
  HOTSPOT_VISUAL,
  flooredLevel,
  hotspotEmitters,
  hotspotStrength,
  type HotspotKey,
} from '../hotspots';
import { POSE_PRESETS, solveSkeleton } from '../pose';

const cfg = (over: Partial<RiderConfig>) => ({ ...defaultConfig, ...over });
const skeleton = solveSkeleton(POSE_PRESETS.hoods, 0);
const layout = frameLayout(FRAME_STYLES.climbing);

describe('hotspotLevels (ui)', () => {
  /** Every option change must move its plume visibly; ordering must follow drag. */
  // Position also changes the pose and the main wake, so its plume steps may be a little smaller.
  const cases: Array<[HotspotKey, keyof RiderConfig, readonly (string | number)[], number]> = [
    ['shoulders', 'position', POSITIONS, 0.14],
    ['helmet', 'helmet', HELMETS, 0.18],
    ['kit', 'kit', KITS, 0.18],
    ['frame', 'bikeType', BIKE_TYPES, 0.18],
    ['frontWheel', 'frontWheel', FRONT_WHEEL_DEPTHS, 0.18],
    ['rearWheel', 'rearWheel', REAR_WHEEL_DEPTHS, 0.18],
    ['tires', 'tireWidthMm', TIRE_WIDTHS, 0.18],
  ];

  for (const [hotspot, field, options, minGap] of cases) {
    it(`${hotspot}: best option ranks 0, worst 1, and neighbouring options differ by ≥ ${minGap}`, () => {
      const levels = options.map((o) => hotspotLevels(cfg({ [field]: o } as Partial<RiderConfig>))[hotspot]);
      expect(Math.min(...levels)).toBe(0);
      expect(Math.max(...levels)).toBe(1);
      const sorted = [...levels].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(minGap);
    });
  }

  it('aero helmet ranks best, road helmet clearly worse', () => {
    expect(hotspotLevels(cfg({ helmet: 'aero' })).helmet).toBe(0);
    expect(hotspotLevels(cfg({ helmet: 'road' })).helmet).toBeGreaterThan(0.5);
  });

  it('legs always churn, and churn more when sitting up', () => {
    expect(hotspotLevels(cfg({ position: 'tt' })).legs).toBeGreaterThan(0.3);
    expect(hotspotLevels(cfg({ position: 'upright' })).legs).toBe(1);
  });
});

describe('hotspotEmitters', () => {
  it('never omits a part: the best option still sheds a visible plume', () => {
    const emitters = hotspotEmitters(CLEAN_HOTSPOTS, skeleton, layout);
    expect(emitters.map((e) => e.key)).toEqual(HOTSPOT_KEYS);
    for (const e of emitters) {
      expect(e.level).toBe(HOTSPOT_VISUAL.minLevel);
      expect(e.length).toBeGreaterThan(0.2);
      expect(hotspotStrength([e], e.x - 0.1, e.y, e.z).strength).toBeGreaterThan(0.05);
    }
  });

  it('places the helmet plume at the head and the leg plume at the knees', () => {
    const byKey = Object.fromEntries(hotspotEmitters(CLEAN_HOTSPOTS, skeleton, layout).map((e) => [e.key, e]));
    expect(Math.abs(byKey.helmet!.y - skeleton.head.y)).toBeLessThan(0.1);
    expect(byKey.helmet!.x).toBeLessThan(skeleton.head.x);
    expect(Math.abs(byKey.legs!.y - skeleton.right.knee.y)).toBeLessThan(0.2);
  });

  it('rider plumes outweigh bike plumes at the same level', () => {
    const all = { shoulders: 1, legs: 1, kit: 1, helmet: 1, frame: 1, frontWheel: 1, rearWheel: 1, tires: 1 };
    const byKey = Object.fromEntries(hotspotEmitters(all, skeleton, layout).map((e) => [e.key, e]));
    for (const rider of ['shoulders', 'legs', 'kit', 'helmet'] as const) {
      for (const bike of ['frame', 'frontWheel', 'rearWheel', 'tires'] as const) {
        expect(byKey[rider]!.weight).toBeGreaterThan(byKey[bike]!.weight);
        expect(byKey[rider]!.length).toBeGreaterThan(byKey[bike]!.length);
      }
    }
  });

  it('a dirtier option makes a longer, wider plume', () => {
    const find = (rankValue: number) =>
      hotspotEmitters({ ...CLEAN_HOTSPOTS, frontWheel: rankValue }, skeleton, layout).find((e) => e.key === 'frontWheel')!;
    const lo = find(0);
    const hi = find(1);
    expect(hi.length).toBeGreaterThan(lo.length * 1.8);
    expect(hi.radius).toBeGreaterThan(lo.radius);
    expect(flooredLevel(0)).toBeGreaterThan(0);
  });
});

describe('hotspotStrength', () => {
  const helmetOnly = (r: number) =>
    hotspotEmitters({ ...CLEAN_HOTSPOTS, helmet: r }, skeleton, layout).filter((x) => x.key === 'helmet');
  const emitters = helmetOnly(1);
  const e = emitters[0]!;

  it('is strong just behind the emitter and zero upstream or far away', () => {
    expect(hotspotStrength(emitters, e.x - 0.3, e.y, 0).strength).toBeGreaterThan(0.4);
    expect(hotspotStrength(emitters, e.x + 0.1, e.y, 0).strength).toBe(0);
    expect(hotspotStrength(emitters, e.x - 0.3, e.y + 1.5, 0).strength).toBe(0);
    expect(hotspotStrength(emitters, e.x - e.length - 0.1, e.y, 0).strength).toBe(0);
  });

  it('scales with level', () => {
    const half = helmetOnly(0.3);
    expect(hotspotStrength(half, e.x - 0.15, e.y, 0).strength).toBeLessThan(
      hotspotStrength(emitters, e.x - 0.15, e.y, 0).strength,
    );
  });
});

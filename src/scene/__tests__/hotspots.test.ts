import { describe, expect, it } from 'vitest';
import {
  BIKE_TYPES,
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
import { CLEAN_HOTSPOTS, hotspotEmitters, hotspotStrength, type HotspotKey } from '../hotspots';
import { POSE_PRESETS, solveSkeleton } from '../pose';

const cfg = (over: Partial<RiderConfig>) => ({ ...defaultConfig, ...over });
const skeleton = solveSkeleton(POSE_PRESETS.hoods, 0);
const layout = frameLayout(FRAME_STYLES.climbing);

describe('hotspotLevels (ui)', () => {
  /** Every option change must move its plume visibly; ordering must follow drag. */
  const cases: Array<[HotspotKey, keyof RiderConfig, readonly (string | number)[]]> = [
    ['helmet', 'helmet', HELMETS],
    ['kit', 'kit', KITS],
    ['frame', 'bikeType', BIKE_TYPES],
    ['frontWheel', 'frontWheel', FRONT_WHEEL_DEPTHS],
    ['rearWheel', 'rearWheel', REAR_WHEEL_DEPTHS],
    ['tires', 'tireWidthMm', TIRE_WIDTHS],
  ];

  for (const [hotspot, field, options] of cases) {
    it(`${hotspot}: best option is clean, worst is 1, and every pair of options differs by ≥ 0.18`, () => {
      const levels = options.map((o) => hotspotLevels(cfg({ [field]: o } as Partial<RiderConfig>))[hotspot]);
      expect(Math.min(...levels)).toBe(0);
      expect(Math.max(...levels)).toBe(1);
      const sorted = [...levels].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(0.18);
    });
  }

  it('aero helmet is clean, road helmet is clearly dirty', () => {
    expect(hotspotLevels(cfg({ helmet: 'aero' })).helmet).toBe(0);
    expect(hotspotLevels(cfg({ helmet: 'road' })).helmet).toBeGreaterThan(0.5);
  });
});

describe('hotspotEmitters', () => {
  it('omits clean components and places the helmet plume at the head', () => {
    expect(hotspotEmitters(CLEAN_HOTSPOTS, skeleton, layout)).toEqual([]);
    const [helmet] = hotspotEmitters({ ...CLEAN_HOTSPOTS, helmet: 1 }, skeleton, layout);
    expect(helmet!.key).toBe('helmet');
    expect(Math.abs(helmet!.y - skeleton.head.y)).toBeLessThan(0.1);
    expect(helmet!.x).toBeLessThan(skeleton.head.x);
  });

  it('a dirtier option makes a longer, wider plume', () => {
    const lo = hotspotEmitters({ ...CLEAN_HOTSPOTS, frontWheel: 0.3 }, skeleton, layout)[0]!;
    const hi = hotspotEmitters({ ...CLEAN_HOTSPOTS, frontWheel: 1 }, skeleton, layout)[0]!;
    expect(hi.length).toBeGreaterThan(lo.length * 1.8);
    expect(hi.radius).toBeGreaterThan(lo.radius);
  });
});

describe('hotspotStrength', () => {
  const emitters = hotspotEmitters({ ...CLEAN_HOTSPOTS, helmet: 1 }, skeleton, layout);
  const e = emitters[0]!;

  it('is strong just behind the emitter and zero upstream or far away', () => {
    expect(hotspotStrength(emitters, e.x - 0.3, e.y, 0).strength).toBeGreaterThan(0.6);
    expect(hotspotStrength(emitters, e.x + 0.1, e.y, 0).strength).toBe(0);
    expect(hotspotStrength(emitters, e.x - 0.3, e.y + 1.5, 0).strength).toBe(0);
    expect(hotspotStrength(emitters, e.x - e.length - 0.1, e.y, 0).strength).toBe(0);
  });

  it('scales with level', () => {
    const half = hotspotEmitters({ ...CLEAN_HOTSPOTS, helmet: 0.5 }, skeleton, layout);
    expect(hotspotStrength(half, e.x - 0.15, e.y, 0).strength).toBeLessThan(
      hotspotStrength(emitters, e.x - 0.15, e.y, 0).strength,
    );
  });
});

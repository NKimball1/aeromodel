import { describe, expect, it } from 'vitest';
import {
  BIKE_TYPE,
  FRONT_WHEEL,
  FRONT_WHEEL_DEPTHS,
  HELMET_CDA_DELTA,
  KIT_CDA_DELTA,
  POSITION_CDA,
  REAR_WHEEL,
  REAR_WHEEL_DEPTHS,
  TIRE_WIDTHS,
  computeCdA,
  computeCdABreakdown,
  computeCrr,
  defaultConfig,
  type RiderConfig,
} from '../index';

const cfg = (over: Partial<RiderConfig> = {}): RiderConfig => ({ ...defaultConfig, ...over });

describe('computeCdA', () => {
  it('baseline setup on the hoods equals the raw hoods position value', () => {
    // defaultConfig is hoods / tight jersey / road helmet / box wheels / 25 mm:
    // every modifier should be zero so the total is exactly the table entry.
    expect(computeCdA(cfg())).toBeCloseTo(POSITION_CDA.hoods, 12);
    const b = computeCdABreakdown(cfg());
    expect(b.kit).toBe(0);
    expect(b.helmet).toBe(0);
    expect(b.frame).toBe(0);
    expect(b.frontWheel).toBe(0);
    expect(b.rearWheel).toBe(0);
    expect(b.tireWidth).toBe(0);
  });

  it('positions are ordered tt < forearms-flat < drops < hoods < upright', () => {
    const order = ['tt', 'hoodsForearmsFlat', 'drops', 'hoods', 'upright'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(computeCdA(cfg({ position: order[i]! }))).toBeGreaterThan(
        computeCdA(cfg({ position: order[i - 1]! })),
      );
    }
  });

  it('positions sit inside the published ranges', () => {
    expect(POSITION_CDA.tt).toBeGreaterThanOrEqual(0.21);
    expect(POSITION_CDA.tt).toBeLessThanOrEqual(0.24);
    expect(POSITION_CDA.drops).toBeGreaterThanOrEqual(0.3);
    expect(POSITION_CDA.drops).toBeLessThanOrEqual(0.32);
    expect(POSITION_CDA.hoods).toBeGreaterThanOrEqual(0.33);
    expect(POSITION_CDA.hoods).toBeLessThanOrEqual(0.36);
    expect(POSITION_CDA.upright).toBeGreaterThanOrEqual(0.4);
  });

  it('kit is ordered skinsuit < tight < loose < baggy, loose clothing adds 0.02–0.05', () => {
    expect(KIT_CDA_DELTA.skinsuit).toBeLessThan(KIT_CDA_DELTA.tightJersey);
    expect(KIT_CDA_DELTA.tightJersey).toBeLessThan(KIT_CDA_DELTA.looseJersey);
    expect(KIT_CDA_DELTA.looseJersey).toBeLessThan(KIT_CDA_DELTA.baggyJacket);
    expect(KIT_CDA_DELTA.looseJersey).toBeGreaterThanOrEqual(0.02);
    expect(KIT_CDA_DELTA.baggyJacket).toBeLessThanOrEqual(0.05);
  });

  it('aero helmet beats road helmet beats no helmet', () => {
    expect(HELMET_CDA_DELTA.aero).toBeLessThan(HELMET_CDA_DELTA.road);
    expect(HELMET_CDA_DELTA.road).toBeLessThanOrEqual(HELMET_CDA_DELTA.none);
  });

  it('frames are ordered aero < all-round < climbing < endurance', () => {
    const order = ['aero', 'allRound', 'climbing', 'endurance'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(computeCdA(cfg({ bikeType: order[i]! }))).toBeGreaterThan(computeCdA(cfg({ bikeType: order[i - 1]! })));
    }
  });

  it('aero frame saving vs the climbing baseline sits in the ~0.008–0.017 m² independent-test range', () => {
    const saving = computeCdA(cfg({ bikeType: 'climbing' })) - computeCdA(cfg({ bikeType: 'aero' }));
    expect(saving).toBeGreaterThanOrEqual(0.008);
    expect(saving).toBeLessThanOrEqual(0.017);
    expect(BIKE_TYPE.climbing.cdaDelta).toBe(0);
  });

  it('deeper wheels never add drag, and the best pair saves 0.005–0.010 vs box', () => {
    for (let i = 1; i < FRONT_WHEEL_DEPTHS.length; i++) {
      expect(FRONT_WHEEL[FRONT_WHEEL_DEPTHS[i]!].cdaDeltaZeroYaw).toBeLessThanOrEqual(
        FRONT_WHEEL[FRONT_WHEEL_DEPTHS[i - 1]!].cdaDeltaZeroYaw,
      );
    }
    for (let i = 1; i < REAR_WHEEL_DEPTHS.length; i++) {
      expect(REAR_WHEEL[REAR_WHEEL_DEPTHS[i]!].cdaDeltaZeroYaw).toBeLessThanOrEqual(
        REAR_WHEEL[REAR_WHEEL_DEPTHS[i - 1]!].cdaDeltaZeroYaw,
      );
    }
    const box = computeCdA(cfg({ frontWheel: 'box', rearWheel: 'box' }));
    const best = computeCdA(cfg({ frontWheel: 'deep', rearWheel: 'disc' }));
    expect(box - best).toBeGreaterThanOrEqual(0.005);
    expect(box - best).toBeLessThanOrEqual(0.01);
  });

  it('tire width nudges CdA only slightly (≤ 0.005 across the full range)', () => {
    const narrow = computeCdA(cfg({ tireWidthMm: 23 }));
    const wide = computeCdA(cfg({ tireWidthMm: 32 }));
    expect(wide).toBeGreaterThan(narrow);
    expect(wide - narrow).toBeLessThanOrEqual(0.005 + 1e-9);
  });

  it('accepts a yaw angle and (for now) ignores it', () => {
    expect(computeCdA(cfg(), 10)).toBe(computeCdA(cfg(), 0));
  });

  it('breakdown parts sum to the total', () => {
    const b = computeCdABreakdown(
      cfg({ position: 'tt', kit: 'skinsuit', helmet: 'aero', bikeType: 'aero', frontWheel: 'deep', rearWheel: 'disc', tireWidthMm: 28 }),
    );
    const sum = b.position + b.kit + b.helmet + b.frame + b.frontWheel + b.rearWheel + b.tireWidth;
    expect(sum).toBeCloseTo(b.total, 12);
  });
});

describe('computeCrr', () => {
  it('racing < training < gravel at every width', () => {
    for (const w of TIRE_WIDTHS) {
      const r = computeCrr({ tireQuality: 'racing', tireWidthMm: w });
      const t = computeCrr({ tireQuality: 'training', tireWidthMm: w });
      const g = computeCrr({ tireQuality: 'gravel', tireWidthMm: w });
      expect(r).toBeLessThan(t);
      expect(t).toBeLessThan(g);
    }
  });

  it('presets at 25 mm land in the spec ranges', () => {
    const r = computeCrr({ tireQuality: 'racing', tireWidthMm: 25 });
    expect(r).toBeGreaterThanOrEqual(0.003);
    expect(r).toBeLessThanOrEqual(0.0035);
    expect(computeCrr({ tireQuality: 'training', tireWidthMm: 25 })).toBeCloseTo(0.0045, 6);
    expect(computeCrr({ tireQuality: 'gravel', tireWidthMm: 25 })).toBeCloseTo(0.006, 6);
  });

  it('width adjustment is small (within ±5 % of the 25 mm value)', () => {
    const base = computeCrr({ tireQuality: 'training', tireWidthMm: 25 });
    for (const w of TIRE_WIDTHS) {
      const ratio = computeCrr({ tireQuality: 'training', tireWidthMm: w }) / base;
      expect(ratio).toBeGreaterThanOrEqual(0.95);
      expect(ratio).toBeLessThanOrEqual(1.05);
    }
  });
});

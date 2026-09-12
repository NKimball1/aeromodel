import { describe, expect, it } from 'vitest';
import { computeCdA, defaultConfig, type RiderConfig } from '../../physics';
import { HEAD_RADIUS } from '../bikeGeometry';
import { POSE_PRESETS, solveSkeleton } from '../pose';
import { WAKE_VISUAL, bodyExtent, dragLevel, wakeShape, wakeStrength } from '../wake';

const body = { rearX: -0.3, topY: 1.6 };
const AIR = 10;

describe('dragLevel', () => {
  it('spans the model: full TT setup near 0, upright baggy near 1, clamped outside', () => {
    const tt: RiderConfig = {
      ...defaultConfig,
      position: 'tt',
      kit: 'skinsuit',
      helmet: 'aero',
      bikeType: 'aero',
      frontWheel: 'deep',
      rearWheel: 'disc',
      tireWidthMm: 23,
    };
    const upright: RiderConfig = {
      ...defaultConfig,
      position: 'upright',
      kit: 'baggyJacket',
      helmet: 'none',
      bikeType: 'endurance',
      tireWidthMm: 32,
    };
    expect(dragLevel(computeCdA(tt))).toBeLessThan(0.05);
    expect(dragLevel(computeCdA(upright))).toBeGreaterThan(0.95);
    expect(dragLevel(0.05)).toBe(0);
    expect(dragLevel(0.9)).toBe(1);
  });
});

describe('wakeShape', () => {
  it('grows in length, width, deficit, chaos and opacity with drag', () => {
    const lo = wakeShape(0.2, body, AIR);
    const hi = wakeShape(0.8, body, AIR);
    for (const key of ['length', 'halfWidth', 'halfHeight', 'deficit', 'chaos', 'opacity'] as const) {
      expect(hi[key], key).toBeGreaterThan(lo[key]);
    }
  });

  it('makes the upright wake at least 3× longer than the tuck wake', () => {
    expect(wakeShape(1, body, AIR).length / wakeShape(0, body, AIR).length).toBeGreaterThanOrEqual(3);
  });

  it('fades out completely in still air', () => {
    const still = wakeShape(1, body, 0);
    expect(still.opacity).toBe(0);
    expect(still.deficit).toBe(0);
    expect(wakeStrength(still, body.rearX - 0.5, 1, 0)).toBe(0);
  });

  it('sits lower behind a tucked rider than behind an upright one', () => {
    const tuck = bodyExtent(solveSkeleton(POSE_PRESETS.tt, 0), HEAD_RADIUS);
    const up = bodyExtent(solveSkeleton(POSE_PRESETS.upright, 0), HEAD_RADIUS);
    expect(wakeShape(0.5, tuck, AIR).centerY).toBeLessThan(wakeShape(0.5, up, AIR).centerY);
    expect(wakeShape(0.5, tuck, AIR).halfHeight).toBeLessThan(wakeShape(0.5, up, AIR).halfHeight);
  });
});

describe('wakeStrength', () => {
  const shape = wakeShape(0.6, body, AIR);

  it('is zero upstream of the rider and beyond the wake end', () => {
    expect(wakeStrength(shape, body.rearX + 0.2, shape.centerY, 0)).toBe(0);
    expect(wakeStrength(shape, body.rearX - shape.length - 0.1, shape.centerY, 0)).toBe(0);
  });

  it('is strongest on the centreline just behind the rider and falls off sideways', () => {
    const x = body.rearX - 0.4;
    const centre = wakeStrength(shape, x, shape.centerY, 0);
    expect(centre).toBeGreaterThan(0.9);
    expect(wakeStrength(shape, x, shape.centerY, shape.halfWidth)).toBeLessThan(centre);
    expect(wakeStrength(shape, x, shape.centerY, 3)).toBeLessThan(0.01);
  });

  it('decays toward the far end', () => {
    const near = wakeStrength(shape, body.rearX - shape.length * 0.2, shape.centerY, 0);
    const far = wakeStrength(shape, body.rearX - shape.length * 0.85, shape.centerY, 0);
    expect(far).toBeLessThan(near);
  });

  it('reaches further behind a high-drag rider', () => {
    const x = body.rearX - 2.5;
    expect(wakeStrength(wakeShape(0.9, body, AIR), x, 1, 0)).toBeGreaterThan(
      wakeStrength(wakeShape(0.1, body, AIR), x, 1, 0),
    );
    expect(WAKE_VISUAL.length[0]).toBeLessThan(2.5);
  });
});

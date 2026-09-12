import { describe, expect, it } from 'vitest';
import { HEAD_RADIUS } from '../bikeGeometry';
import { DEFLECT_VISUAL, deflect, riderColliders, type Capsule, type Deflected } from '../deflection';
import { POSE_PRESETS, solveSkeleton } from '../pose';

const out = (): Deflected => ({ x: 0, y: 0, z: 0, amount: 0 });
/** A horizontal capsule along x at y = 1, radius 0.15, like a torso in a tuck. */
const torso: Capsule = { ax: -0.3, ay: 1, az: 0, bx: 0.3, by: 1, bz: 0, r: 0.15 };

describe('deflect', () => {
  it('leaves points outside the influence radius untouched', () => {
    const r = deflect([torso], 0, 1 + 0.15 + DEFLECT_VISUAL.influence + 0.01, 0, out());
    expect(r.amount).toBe(0);
    expect(r.y).toBeCloseTo(1.4, 9);
  });

  it('pushes a point inside the body out past its surface', () => {
    const r = deflect([torso], 0, 1.05, 0.02, out());
    const dist = Math.hypot(r.y - 1, r.z);
    expect(dist).toBeGreaterThan(torso.r);
    expect(r.y).toBeGreaterThan(1.05);
  });

  it('pushes nearer points harder than farther ones, and always away from the body', () => {
    const near = deflect([torso], 0, 1.18, 0, out());
    const far = deflect([torso], 0, 1.3, 0, out());
    expect(near.y - 1.18).toBeGreaterThan(far.y - 1.3);
    expect(far.y).toBeGreaterThanOrEqual(1.3);
    const side = deflect([torso], 0.1, 1, -0.2, out());
    expect(side.z).toBeLessThan(-0.2);
  });

  it('damps the fore-aft component so streaks bend sideways rather than bunch', () => {
    const inFront = deflect([torso], 0.5, 1, 0, out());
    expect(inFront.x - 0.5).toBeLessThan(DEFLECT_VISUAL.influence * DEFLECT_VISUAL.strength);
    expect(inFront.x).toBeGreaterThan(0.5);
  });

  it('builds colliders that follow the pose: the TT torso sits lower than the upright one', () => {
    const tt = riderColliders(solveSkeleton(POSE_PRESETS.tt, 0), HEAD_RADIUS);
    const up = riderColliders(solveSkeleton(POSE_PRESETS.upright, 0), HEAD_RADIUS);
    expect(tt).toHaveLength(8);
    expect(tt[1]!.ay).toBeLessThan(up[1]!.ay);
    // A point just above the upright rider's head is deflected; the same point is clear of the TT rider.
    const probeY = up[1]!.ay + up[1]!.r + 0.05;
    expect(deflect(up, up[1]!.ax, probeY, 0, out()).amount).toBeGreaterThan(0);
    expect(deflect(tt, up[1]!.ax, probeY, 0, out()).amount).toBe(0);
  });
});

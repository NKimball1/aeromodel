import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../../physics';
import { BAR_CLAMP, BAR_TUBE_RADIUS, FOREARM_LENGTH, SHANK_LENGTH, THIGH_LENGTH, UPPER_ARM_LENGTH } from '../bikeGeometry';
import { POSE_PRESETS, jointFlexionDeg, lerpPose, solveSkeleton, type SideJoints } from '../pose';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const crankAngles = Array.from({ length: 36 }, (_, i) => (i * 10 * Math.PI) / 180);
const forearmAngleDeg = (s: SideJoints) => (Math.atan2(s.hand.y - s.elbow.y, s.hand.x - s.elbow.x) * 180) / Math.PI;

describe('pose presets', () => {
  it('hands land on the bar (within 1.5 cm) for every fixed-bar position', () => {
    for (const pos of POSITIONS) {
      const p = POSE_PRESETS[pos];
      if (!p.gripFixed) continue;
      expect(solveSkeleton(p, 0).handError, pos).toBeLessThan(0.015);
    }
  });

  it('torso angle and head height both drop from upright to TT', () => {
    const order = ['upright', 'hoods', 'drops', 'hoodsForearmsFlat', 'tt'] as const;
    for (let i = 1; i < order.length; i++) {
      const higher = POSE_PRESETS[order[i - 1]!];
      const lower = POSE_PRESETS[order[i]!];
      expect(lower.torsoAngleDeg, order[i]).toBeLessThan(higher.torsoAngleDeg);
      expect(solveSkeleton(lower, 0).head.y, order[i]).toBeLessThan(solveSkeleton(higher, 0).head.y);
    }
  });

  it('TT and forearms-flat have near-horizontal forearms resting above the bar', () => {
    for (const pos of ['tt', 'hoodsForearmsFlat'] as const) {
      const s = solveSkeleton(POSE_PRESETS[pos], 0).right;
      expect(Math.abs(forearmAngleDeg(s)), pos).toBeLessThan(12);
      expect(s.elbow.y, pos).toBeGreaterThan(BAR_CLAMP.y + BAR_TUBE_RADIUS);
    }
  });

  it('only TT shows aerobars', () => {
    for (const pos of POSITIONS) expect(POSE_PRESETS[pos].aerobars).toBe(pos === 'tt' ? 1 : 0);
  });
});

describe('solveSkeleton', () => {
  it('keeps every bone at its fixed length through a full crank revolution', () => {
    for (const pos of POSITIONS) {
      for (const a of crankAngles) {
        const s = solveSkeleton(POSE_PRESETS[pos], a);
        for (const side of [s.left, s.right]) {
          expect(dist(side.hip, side.knee)).toBeCloseTo(THIGH_LENGTH, 6);
          expect(dist(side.knee, side.ankle)).toBeCloseTo(SHANK_LENGTH, 6);
          expect(dist(side.shoulder, side.elbow)).toBeCloseTo(UPPER_ARM_LENGTH, 6);
          expect(dist(side.elbow, side.hand)).toBeCloseTo(FOREARM_LENGTH, 6);
        }
      }
    }
  });

  it('knee flexion stays in a realistic pedaling range (≈25–45° at bottom, <125° at top)', () => {
    for (const pos of POSITIONS) {
      let min = 999;
      let max = -1;
      for (const a of crankAngles) {
        const r = solveSkeleton(POSE_PRESETS[pos], a).right;
        const f = jointFlexionDeg(r.hip, r.knee, r.ankle);
        min = Math.min(min, f);
        max = Math.max(max, f);
      }
      expect(min, pos).toBeGreaterThan(25);
      expect(min, pos).toBeLessThan(45);
      expect(max, pos).toBeLessThan(125);
    }
  });

  it('knees point forward of the hip→ankle line', () => {
    for (const a of crankAngles) {
      const r = solveSkeleton(POSE_PRESETS.hoods, a).right;
      // Cross product sign of (ankle−hip) × (knee−hip) > 0 means knee is CCW, i.e. forward.
      const cross = (r.ankle.x - r.hip.x) * (r.knee.y - r.hip.y) - (r.ankle.y - r.hip.y) * (r.knee.x - r.hip.x);
      expect(cross).toBeGreaterThan(0);
    }
  });

  it('left and right pedals are opposite each other', () => {
    const s = solveSkeleton(POSE_PRESETS.drops, 1.234);
    expect(s.left.pedal.x + s.right.pedal.x).toBeCloseTo(0, 9);
    expect(s.left.pedal.z).toBeCloseTo(-s.right.pedal.z, 9);
  });

  it('achieved elbow flexion matches the elbowBendDeg parameter', () => {
    for (const pos of POSITIONS) {
      const r = solveSkeleton(POSE_PRESETS[pos], 0).right;
      expect(jointFlexionDeg(r.shoulder, r.elbow, r.hand)).toBeCloseTo(POSE_PRESETS[pos].elbowBendDeg, 1);
    }
  });
});

describe('lerpPose', () => {
  it('returns the endpoints at t = 0 and t = 1 and blends in between', () => {
    const a = POSE_PRESETS.hoods;
    const b = POSE_PRESETS.tt;
    expect(lerpPose(a, b, 0)).toEqual(a);
    expect(lerpPose(a, b, 1)).toEqual(b);
    expect(lerpPose(a, b, 0.5).torsoAngleDeg).toBeCloseTo((a.torsoAngleDeg + b.torsoAngleDeg) / 2, 9);
  });
});

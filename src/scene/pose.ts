/**
 * Rider pose kinematics. Pure math, no Three.js.
 *
 * A pose is a handful of numbers (torso angle, elbow bend, neck angle, head
 * drop, ...). Position presets are just parameter sets, so switching presets
 * can be animated by interpolating the numbers. `solveSkeleton` turns a pose
 * plus a crank angle into joint positions that the scene draws limbs between.
 */
import type { Position } from '../physics';
import {
  ANKLE_FROM_PEDAL,
  BB,
  CRANK_LENGTH,
  FOREARM_LENGTH,
  GRIPS,
  HIP_HALF_WIDTH,
  HIP_OFFSET,
  NECK_LENGTH,
  PEDAL_HALF_Q,
  SADDLE_TOP,
  SHANK_LENGTH,
  SHOULDER_HALF_WIDTH,
  THIGH_LENGTH,
  TOE_FROM_PEDAL,
  TORSO_LENGTH,
  UPPER_ARM_LENGTH,
  type GripKind,
  type V2,
  type V3,
} from './bikeGeometry';

const DEG = Math.PI / 180;

export interface PoseParams {
  /** Hip→shoulder line, degrees above horizontal. The main aero lever. */
  torsoAngleDeg: number;
  /** 0 = straight arm, 90 = right angle at the elbow. */
  elbowBendDeg: number;
  /** Shoulder→head line, degrees above horizontal. */
  neckAngleDeg: number;
  /** How far the head sinks toward the shoulders (turtling), metres. */
  headDropM: number;
  /** Nose-down tilt of the head and helmet, degrees. */
  headPitchDeg: number;
  /** Rider sits this far forward on the saddle (TT riders do), metres. */
  hipForwardM: number;
  /** Hand target (side view) and lateral half-width. */
  gripX: number;
  gripY: number;
  gripHalfWidth: number;
  /** 1 when the hand must land on the grip (fixed bar), 0 when it may float. */
  gripFixed: number;
  /** 0..1 visibility of the clip-on aerobars. */
  aerobars: number;
}

function withGrip(kind: GripKind): Pick<PoseParams, 'gripX' | 'gripY' | 'gripHalfWidth' | 'gripFixed' | 'aerobars'> {
  const g = GRIPS[kind];
  return {
    gripX: g.x,
    gripY: g.y,
    gripHalfWidth: g.halfWidth,
    gripFixed: g.fixed ? 1 : 0,
    aerobars: kind === 'aerobars' ? 1 : 0,
  };
}

/**
 * Pose parameter sets per position. Elbow bends are tuned so the hands land
 * on the bar for the fixed grips (checked by the pose tests); torso angles
 * are what make each position look like itself.
 */
export const POSE_PRESETS: Record<Position, PoseParams> = {
  upright: {
    torsoAngleDeg: 51,
    elbowBendDeg: 18,
    neckAngleDeg: 82,
    headDropM: 0,
    headPitchDeg: 2,
    hipForwardM: 0,
    ...withGrip('tops'),
  },
  hoods: {
    torsoAngleDeg: 46,
    elbowBendDeg: 26.5,
    neckAngleDeg: 68,
    headDropM: 0,
    headPitchDeg: 10,
    hipForwardM: 0,
    ...withGrip('hoods'),
  },
  drops: {
    torsoAngleDeg: 35,
    elbowBendDeg: 33,
    neckAngleDeg: 56,
    headDropM: 0.02,
    headPitchDeg: 16,
    hipForwardM: 0,
    ...withGrip('drops'),
  },
  hoodsForearmsFlat: {
    torsoAngleDeg: 23,
    elbowBendDeg: 89.5,
    neckAngleDeg: 44,
    headDropM: 0.045,
    headPitchDeg: 20,
    hipForwardM: 0.02,
    ...withGrip('hoodsForearms'),
  },
  tt: {
    torsoAngleDeg: 20,
    elbowBendDeg: 86.5,
    neckAngleDeg: 38,
    headDropM: 0.07,
    headPitchDeg: 18,
    hipForwardM: 0.06,
    ...withGrip('aerobars'),
  },
};

export function lerpPose(a: PoseParams, b: PoseParams, t: number): PoseParams {
  const out = { ...a };
  for (const key of Object.keys(a) as Array<keyof PoseParams>) {
    out[key] = a[key] * (1 - t) + b[key] * t;
  }
  return out;
}

export interface SideJoints {
  hip: V3;
  knee: V3;
  ankle: V3;
  toe: V3;
  pedal: V3;
  shoulder: V3;
  elbow: V3;
  hand: V3;
}

export interface Skeleton {
  left: SideJoints;
  right: SideJoints;
  /** Centre between the hips. */
  pelvis: V3;
  /** Centre between the shoulders. */
  chest: V3;
  head: V3;
  headPitchRad: number;
  /** Side-view distance from the solved hand to the grip target, metres. */
  handError: number;
}

const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: V2): number => Math.hypot(a.x, a.y);
const scale = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
const rotate = (a: V2, rad: number): V2 => ({
  x: a.x * Math.cos(rad) - a.y * Math.sin(rad),
  y: a.x * Math.sin(rad) + a.y * Math.cos(rad),
});
const polar = (r: number, deg: number): V2 => ({ x: r * Math.cos(deg * DEG), y: r * Math.sin(deg * DEG) });
const at = (p: V2, z: number): V3 => ({ x: p.x, y: p.y, z });

/**
 * Two-bone IK in the side-view plane. Returns the middle joint.
 * `bend` = +1 rotates the joint counter-clockwise off the root→end line
 * (knees forward), −1 clockwise (elbows down and back).
 */
export function twoBoneJoint(root: V2, end: V2, a: number, b: number, bend: 1 | -1): V2 {
  const d = sub(end, root);
  const dist = Math.min(Math.max(len(d), Math.abs(a - b) + 1e-6), a + b - 1e-6);
  const cosAlpha = (a * a + dist * dist - b * b) / (2 * a * dist);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosAlpha)));
  const dir = scale(d, 1 / (len(d) || 1));
  return add(root, scale(rotate(dir, bend * alpha), a));
}

/** Interior angle at the middle joint of a two-bone chain, degrees. */
export function jointFlexionDeg(root: V2, joint: V2, end: V2): number {
  const u = sub(root, joint);
  const v = sub(end, joint);
  const cos = (u.x * v.x + u.y * v.y) / (len(u) * len(v));
  return 180 - Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
}

export function solveSkeleton(p: PoseParams, crankAngleRad: number): Skeleton {
  const hip2 = add(add(SADDLE_TOP, HIP_OFFSET), { x: p.hipForwardM, y: 0 });
  const chest2 = add(hip2, polar(TORSO_LENGTH, p.torsoAngleDeg));

  // Arm: the elbow bend fixes how far the hand is from the shoulder; the hand
  // goes that far toward the grip target.
  const interior = Math.PI - p.elbowBendDeg * DEG;
  const reach = Math.sqrt(
    UPPER_ARM_LENGTH ** 2 + FOREARM_LENGTH ** 2 - 2 * UPPER_ARM_LENGTH * FOREARM_LENGTH * Math.cos(interior),
  );
  const grip2: V2 = { x: p.gripX, y: p.gripY };
  const toGrip = sub(grip2, chest2);
  const hand2 = add(chest2, scale(toGrip, reach / (len(toGrip) || 1)));
  const elbow2 = twoBoneJoint(chest2, hand2, UPPER_ARM_LENGTH, FOREARM_LENGTH, -1);

  const neck = Math.max(0.05, NECK_LENGTH - p.headDropM);
  const head2 = add(chest2, polar(neck, p.neckAngleDeg));

  const side = (sign: 1 | -1, phase: number): SideJoints => {
    const pedal2 = add(BB, polar(CRANK_LENGTH, (crankAngleRad + phase) / DEG));
    const ankle2 = add(pedal2, ANKLE_FROM_PEDAL);
    const toe2 = add(pedal2, TOE_FROM_PEDAL);
    const knee2 = twoBoneJoint(hip2, ankle2, THIGH_LENGTH, SHANK_LENGTH, 1);
    const shoulderZ = sign * SHOULDER_HALF_WIDTH;
    const handZ = sign * p.gripHalfWidth;
    return {
      hip: at(hip2, sign * HIP_HALF_WIDTH),
      knee: at(knee2, sign * (HIP_HALF_WIDTH + 0.01)),
      ankle: at(ankle2, sign * (PEDAL_HALF_Q - 0.01)),
      toe: at(toe2, sign * (PEDAL_HALF_Q - 0.005)),
      pedal: at(pedal2, sign * PEDAL_HALF_Q),
      shoulder: at(chest2, shoulderZ),
      elbow: at(elbow2, shoulderZ + (handZ - shoulderZ) * 0.45),
      hand: at(hand2, handZ),
    };
  };

  return {
    // Right crank leads; left is half a turn behind.
    right: side(1, 0),
    left: side(-1, Math.PI),
    pelvis: at(hip2, 0),
    chest: at(chest2, 0),
    head: at(head2, 0),
    headPitchRad: p.headPitchDeg * DEG,
    handError: len(sub(hand2, grip2)),
  };
}

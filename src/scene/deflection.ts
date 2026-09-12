/**
 * Coarse flow deflection around the rider. Not a flow solver: the body is a
 * handful of capsules built from the skeleton, and a particle near one is
 * pushed outward along the surface normal with a smooth falloff. Enough for
 * streaks to visibly bend around the torso, head, arms and legs.
 * Pure math, no Three.js, unit-tested.
 */
import type { Skeleton } from './pose';
import type { V3 } from './bikeGeometry';

export const DEFLECT_VISUAL = {
  /** Distance beyond a capsule's surface that still feels the push, metres. */
  influence: 0.24,
  /** Push at the surface, as a fraction of `influence`. */
  strength: 0.8,
  /**
   * Scale on the fore-aft part of the push. Streaks mostly move sideways and
   * up/down around the body rather than bunching along the flow.
   */
  alongFlow: 0.3,
} as const;

export interface Capsule {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  r: number;
}

const cap = (a: V3, b: V3, r: number): Capsule => ({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r });

/** Body capsules in the bike's frame of reference. */
export function riderColliders(s: Skeleton, headRadius: number): Capsule[] {
  const out: Capsule[] = [
    cap(s.pelvis, s.chest, 0.17),
    cap(s.head, s.head, headRadius + 0.03),
  ];
  for (const side of [s.left, s.right]) {
    out.push(cap(side.shoulder, side.hand, 0.06), cap(side.hip, side.knee, 0.085), cap(side.knee, side.ankle, 0.06));
  }
  return out;
}

export interface Deflected {
  x: number;
  y: number;
  z: number;
  /** 0..1 how strongly the point was pushed (for colouring, if wanted). */
  amount: number;
}

/**
 * Displace a point away from the nearest capsule. Points outside every
 * capsule's influence come back unchanged. Points inside a capsule are
 * pushed out past its surface.
 */
export function deflect(colliders: readonly Capsule[], x: number, y: number, z: number, out: Deflected): Deflected {
  const R = DEFLECT_VISUAL.influence;
  let bestD = Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (const c of colliders) {
    // Cheap reject on the capsule's bounding box grown by influence.
    const pad = c.r + R;
    if (
      x < Math.min(c.ax, c.bx) - pad ||
      x > Math.max(c.ax, c.bx) + pad ||
      y < Math.min(c.ay, c.by) - pad ||
      y > Math.max(c.ay, c.by) + pad ||
      z < Math.min(c.az, c.bz) - pad ||
      z > Math.max(c.az, c.bz) + pad
    ) {
      continue;
    }
    const abx = c.bx - c.ax;
    const aby = c.by - c.ay;
    const abz = c.bz - c.az;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - c.ax) * abx + (y - c.ay) * aby + (z - c.az) * abz) / len2)) : 0;
    const px = x - (c.ax + abx * t);
    const py = y - (c.ay + aby * t);
    const pz = z - (c.az + abz * t);
    const dist = Math.hypot(px, py, pz);
    const d = dist - c.r;
    if (d < bestD) {
      bestD = d;
      if (dist > 1e-6) {
        nx = px / dist;
        ny = py / dist;
        nz = pz / dist;
      } else {
        // Dead centre on the axis: push upward.
        nx = 0;
        ny = 1;
        nz = 0;
      }
    }
  }

  if (bestD >= R) {
    out.x = x;
    out.y = y;
    out.z = z;
    out.amount = 0;
    return out;
  }

  const falloff = bestD > 0 ? (1 - bestD / R) ** 2 : 1;
  const push = R * DEFLECT_VISUAL.strength * falloff + Math.max(0, -bestD);
  out.x = x + nx * push * DEFLECT_VISUAL.alongFlow;
  out.y = y + ny * push;
  out.z = z + nz * push;
  out.amount = falloff;
  return out;
}

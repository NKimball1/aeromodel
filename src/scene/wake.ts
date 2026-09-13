/**
 * Wake model: how the turbulent region behind the rider looks for a given
 * CdA. Illustrative, not CFD. Pure math, no Three.js, unit-tested.
 *
 * Drag sets a 0..1 "level". Level drives the wake's length, width, velocity
 * deficit, turbulence and opacity, deliberately exaggerated so that sitting
 * up visibly grows the wake and tucking visibly shrinks it. The wake's
 * height comes from the rider's actual pose, so a tuck also lowers it.
 */
import type { V3 } from './bikeGeometry';

export const WAKE_VISUAL = {
  /**
   * CdA mapped to level 0 and 1: the model's range, from a full TT setup
   * (~0.20 m²) to upright in a baggy jacket on an endurance bike (~0.42 m²).
   */
  cdaAtLevel0: 0.2,
  cdaAtLevel1: 0.42,
  /** Wake length behind the rider's back, metres. */
  length: [1.2, 5.2],
  /** Lateral half-width at the start of the wake, metres. */
  halfWidth: [0.2, 0.62],
  /** Multiplier on half the body's height. */
  heightScale: [0.55, 0.92],
  /** Fraction of freestream speed lost at the wake centreline. */
  deficit: [0.35, 0.88],
  /** Turbulence amount, 0..1: swirl amplitude and frequency. */
  chaos: [0.15, 1.0],
  /** Peak opacity of the shed smoke. */
  opacity: [0.16, 0.42],
  /** How much wider/taller the wake grows by its far end (×). */
  spread: 1.6,
  /** Below this airspeed (m/s) the wake fades out entirely. */
  fadeOutBelowMs: 0.5,
  fadeInByMs: 3,
  /** Lowest point of the wake: the bike and lower legs. */
  bottomY: 0.25,
} as const;

export interface WakeShape {
  /** 0..1 drag level after easing. */
  level: number;
  /** Where the wake starts: just behind the rider's back. */
  originX: number;
  centerY: number;
  length: number;
  halfWidth: number;
  halfHeight: number;
  deficit: number;
  chaos: number;
  opacity: number;
  /** 0..1 fade for low airspeed; already folded into deficit/chaos/opacity. */
  presence: number;
}

const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function dragLevel(cda: number): number {
  return clamp01((cda - WAKE_VISUAL.cdaAtLevel0) / (WAKE_VISUAL.cdaAtLevel1 - WAKE_VISUAL.cdaAtLevel0));
}

/** The rider's extent that sheds the wake. */
export interface BodyExtent {
  /** Rearmost point of the back / seat, x. */
  rearX: number;
  /** Top of the head or helmet, y. */
  topY: number;
}

export function bodyExtent(skeleton: { pelvis: V3; head: V3 }, headRadius: number): BodyExtent {
  return { rearX: skeleton.pelvis.x - 0.14, topY: skeleton.head.y + headRadius + 0.03 };
}

export function wakeShape(level: number, body: BodyExtent, airSpeedMs: number): WakeShape {
  const W = WAKE_VISUAL;
  const t = clamp01(level);
  const presence = smooth(W.fadeOutBelowMs, W.fadeInByMs, airSpeedMs);
  const halfBody = Math.max(0.2, (body.topY - W.bottomY) / 2);
  return {
    level: t,
    originX: body.rearX,
    centerY: W.bottomY + halfBody,
    length: lerp(W.length, t),
    halfWidth: lerp(W.halfWidth, t),
    halfHeight: halfBody * lerp(W.heightScale, t),
    deficit: lerp(W.deficit, t) * presence,
    chaos: lerp(W.chaos, t) * presence,
    opacity: lerp(W.opacity, t) * presence,
    presence,
  };
}

/** Cross-section radii at a fraction `along` (0 at the back, 1 at the far end). */
export function wakeRadii(shape: WakeShape, along: number): { ry: number; rz: number } {
  const grow = 1 + (WAKE_VISUAL.spread - 1) * Math.sqrt(clamp01(along));
  return { ry: shape.halfHeight * grow, rz: shape.halfWidth * grow };
}

/**
 * 0..1 influence of the wake at a point: 1 on the centreline just behind the
 * rider, falling off radially (Gaussian) and toward the far end. Zero
 * upstream of the rider's back. Includes the low-airspeed fade.
 */
export function wakeStrength(shape: WakeShape, x: number, y: number, z: number): number {
  const behind = shape.originX - x;
  if (behind <= 0 || shape.presence <= 0) return 0;
  const along = behind / shape.length;
  if (along >= 1) return 0;
  const { ry, rz } = wakeRadii(shape, along);
  const dy = (y - shape.centerY) / ry;
  const dz = z / rz;
  const radial = Math.exp(-1.6 * (dy * dy + dz * dz));
  const rampIn = smooth(0, 0.12, behind);
  const tail = 1 - smooth(0.55, 1, along);
  return radial * rampIn * tail * shape.presence;
}

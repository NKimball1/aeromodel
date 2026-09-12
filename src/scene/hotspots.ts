/**
 * Local turbulence plumes, one per drag source on the rider and the bike.
 * Each sits where that part is and sheds downstream. Two numbers shape it:
 *
 *  - rank (0..1, from the UI): where the chosen option sits within that
 *    part's own options. Drives how the plume CHANGES when you swap gear.
 *  - weight (fixed, below): how much of the total drag that part is
 *    responsible for. Drives how BIG the plume is relative to the others,
 *    so the rider's body dominates and the bike's parts are secondary.
 *
 * No plume is ever zero: the best option still sheds a small one.
 * Pure math, no Three.js, unit-tested.
 */
import { HEAD_RADIUS, RIM_BEAD_RADIUS, type V3 } from './bikeGeometry';
import type { FrameLayout } from './bikeTypes';
import type { Skeleton } from './pose';

export type HotspotKey =
  | 'shoulders'
  | 'legs'
  | 'kit'
  | 'helmet'
  | 'frame'
  | 'frontWheel'
  | 'rearWheel'
  | 'tires';
export type HotspotLevels = Record<HotspotKey, number>;

export const HOTSPOT_KEYS: readonly HotspotKey[] = [
  'shoulders',
  'legs',
  'kit',
  'helmet',
  'frame',
  'frontWheel',
  'rearWheel',
  'tires',
];

/** Every part at its best option. Still sheds the minimum plume. */
export const CLEAN_HOTSPOTS: HotspotLevels = {
  shoulders: 0,
  legs: 0,
  kit: 0,
  helmet: 0,
  frame: 0,
  frontWheel: 0,
  rearWheel: 0,
  tires: 0,
};

export interface Emitter {
  key: HotspotKey;
  /** Where shedding starts (the trailing edge of the part). */
  x: number;
  y: number;
  z: number;
  /** Plume cross-section radius at its start, metres. */
  radius: number;
  /** How far downstream the plume reaches, metres. */
  length: number;
  /** 0..1 after the floor: how dirty this part's option is. */
  level: number;
  /** 0..1: this part's share of the drag picture (visual emphasis). */
  weight: number;
}

export const HOTSPOT_VISUAL = {
  /** Best option in a class still sheds this level of plume. */
  minLevel: 0.25,
  /**
   * Visual emphasis by drag share. The rider is roughly 75–80 % of total
   * drag (torso/shoulders and legs the biggest parts, then head); frame,
   * wheels and tires share the rest. Tuned for looks, ordered by physics.
   */
  weight: {
    shoulders: 1.0,
    legs: 0.85,
    kit: 0.8,
    helmet: 0.7,
    frame: 0.45,
    frontWheel: 0.4,
    rearWheel: 0.35,
    tires: 0.25,
  } as Record<HotspotKey, number>,
  /** Plume length at level 0 and 1 for a weight-1 part, metres. Exaggerated on purpose. */
  length: [0.9, 3.4] as const,
  /** Start radius at full weight and level, per part (they differ in physical size). */
  radius: {
    shoulders: 0.2,
    legs: 0.22,
    kit: 0.22,
    helmet: 0.17,
    frame: 0.17,
    frontWheel: 0.2,
    rearWheel: 0.2,
    tires: 0.07,
  } as Record<HotspotKey, number>,
  /** How much the plume widens by its far end (×). */
  spread: 2.2,
};

const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;

/** Rank 0..1 → level with the floor applied. */
export function flooredLevel(rank: number): number {
  const r = Math.min(1, Math.max(0, rank));
  return HOTSPOT_VISUAL.minLevel + (1 - HOTSPOT_VISUAL.minLevel) * r;
}

/** Place every emitter on the current pose and bike. None are ever omitted. */
export function hotspotEmitters(ranks: HotspotLevels, skeleton: Skeleton, layout: FrameLayout): Emitter[] {
  const s = skeleton;
  const back = { x: (s.pelvis.x + s.chest.x) / 2, y: (s.pelvis.y + s.chest.y) / 2 };
  const knees = { x: (s.left.knee.x + s.right.knee.x) / 2, y: (s.left.knee.y + s.right.knee.y) / 2 };
  const places: Record<HotspotKey, V3> = {
    // Shoulders and upper arms: the frontal-area driver that position changes most.
    // Kept below the head so the helmet's own plume stays readable above it.
    shoulders: { x: s.chest.x - 0.14, y: s.chest.y - 0.12, z: 0 },
    // Legs: pumping knees and thighs, a large and constantly disturbed part of rider drag.
    legs: { x: knees.x - 0.12, y: knees.y - 0.05, z: 0 },
    kit: { x: back.x - 0.16, y: back.y - 0.02, z: 0 },
    helmet: { x: s.head.x - HEAD_RADIUS * 0.9, y: s.head.y + 0.06, z: 0 },
    frame: { x: layout.seatCluster.x * 0.5 - 0.02, y: (layout.seatCluster.y + layout.rearAxle.y) / 2, z: 0 },
    frontWheel: { x: layout.frontAxle.x - RIM_BEAD_RADIUS * 0.6, y: layout.frontAxle.y, z: 0 },
    rearWheel: { x: layout.rearAxle.x - RIM_BEAD_RADIUS * 0.6, y: layout.rearAxle.y, z: 0 },
    tires: { x: layout.rearAxle.x - 0.05, y: 0.06, z: 0 },
  };
  return HOTSPOT_KEYS.map((key) => {
    const level = flooredLevel(ranks[key]);
    const weight = HOTSPOT_VISUAL.weight[key];
    const p = places[key];
    return {
      key,
      x: p.x,
      y: p.y,
      z: p.z,
      radius: HOTSPOT_VISUAL.radius[key] * (0.45 + 0.55 * level),
      length: lerp(HOTSPOT_VISUAL.length, level) * (0.35 + 0.65 * weight),
      level,
      weight,
    };
  });
}

/** Plume radius a fraction `along` of the way down its length. */
export function emitterRadius(e: Emitter, along: number): number {
  return e.radius * (1 + (HOTSPOT_VISUAL.spread - 1) * Math.sqrt(Math.min(1, Math.max(0, along))));
}

/**
 * Strongest plume influence at a point: 0..1, weighted by each plume's level
 * and drag share, plus that plume's level (for churn). Zero upstream of an
 * emitter and past its length.
 */
export function hotspotStrength(emitters: readonly Emitter[], x: number, y: number, z: number): { strength: number; level: number } {
  let best = 0;
  let bestLevel = 0;
  for (const e of emitters) {
    const behind = e.x - x;
    if (behind <= 0 || behind >= e.length) continue;
    const along = behind / e.length;
    const r = emitterRadius(e, along);
    const dy = (y - e.y) / r;
    const dz = (z - e.z) / r;
    const d2 = dy * dy + dz * dz;
    if (d2 > 9) continue;
    const ramp = Math.min(1, behind / 0.06);
    const tail = 1 - along * along;
    const s = Math.exp(-1.4 * d2) * ramp * tail * e.level * e.weight;
    if (s > best) {
      best = s;
      bestLevel = e.level;
    }
  }
  return { strength: best, level: bestLevel };
}

/**
 * Local turbulence plumes, one per aero component (helmet, kit, frame, each
 * wheel, tires). Each sits where that part of the bike or body is and sheds
 * downstream; its size, reach and churn scale with a 0..1 level the UI
 * derives from the physics. Pure math, no Three.js, unit-tested.
 */
import { HEAD_RADIUS, RIM_BEAD_RADIUS, type V3 } from './bikeGeometry';
import type { FrameLayout } from './bikeTypes';
import type { Skeleton } from './pose';

export type HotspotKey = 'helmet' | 'kit' | 'frame' | 'frontWheel' | 'rearWheel' | 'tires';
export type HotspotLevels = Record<HotspotKey, number>;

export const HOTSPOT_KEYS: readonly HotspotKey[] = ['helmet', 'kit', 'frame', 'frontWheel', 'rearWheel', 'tires'];

export const CLEAN_HOTSPOTS: HotspotLevels = {
  helmet: 0,
  kit: 0,
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
  /** 0..1 */
  level: number;
}

export const HOTSPOT_VISUAL = {
  /** Plume length at level 0 and 1, per emitter kind, metres. Exaggerated on purpose. */
  length: {
    helmet: [0.2, 2.4],
    kit: [0.3, 2.6],
    frame: [0.2, 1.9],
    frontWheel: [0.25, 2.0],
    rearWheel: [0.25, 2.2],
    tires: [0.1, 1.2],
  } as Record<HotspotKey, [number, number]>,
  /** Start radius at level 1; level 0 starts at 40% of this. */
  radius: {
    helmet: 0.16,
    kit: 0.24,
    frame: 0.2,
    frontWheel: 0.24,
    rearWheel: 0.24,
    tires: 0.07,
  } as Record<HotspotKey, number>,
  /** How much the plume widens by its far end (×). */
  spread: 2.2,
};

const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;

/** Place each emitter on the current pose and bike. Emitters at level 0 are omitted. */
export function hotspotEmitters(levels: HotspotLevels, skeleton: Skeleton, layout: FrameLayout): Emitter[] {
  const s = skeleton;
  const mid = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 });
  const back = mid(s.pelvis, s.chest);
  const places: Record<HotspotKey, V3> = {
    helmet: { x: s.head.x - HEAD_RADIUS * 0.9, y: s.head.y + 0.03, z: 0 },
    kit: { x: back.x - 0.16, y: back.y + 0.04, z: 0 },
    frame: { x: layout.seatCluster.x * 0.5 - 0.02, y: (layout.seatCluster.y + layout.rearAxle.y) / 2, z: 0 },
    frontWheel: { x: layout.frontAxle.x - RIM_BEAD_RADIUS * 0.6, y: layout.frontAxle.y, z: 0 },
    rearWheel: { x: layout.rearAxle.x - RIM_BEAD_RADIUS * 0.6, y: layout.rearAxle.y, z: 0 },
    tires: { x: layout.rearAxle.x - 0.05, y: 0.06, z: 0 },
  };
  const out: Emitter[] = [];
  for (const key of HOTSPOT_KEYS) {
    const level = Math.min(1, Math.max(0, levels[key]));
    if (level <= 0.001) continue;
    const p = places[key];
    out.push({
      key,
      x: p.x,
      y: p.y,
      z: p.z,
      radius: HOTSPOT_VISUAL.radius[key] * (0.4 + 0.6 * level),
      length: lerp(HOTSPOT_VISUAL.length[key], level),
      level,
    });
  }
  return out;
}

/** Plume radius a fraction `along` of the way down its length. */
export function emitterRadius(e: Emitter, along: number): number {
  return e.radius * (1 + (HOTSPOT_VISUAL.spread - 1) * Math.sqrt(Math.min(1, Math.max(0, along))));
}

/**
 * Strongest plume influence at a point: 0..1, already weighted by each
 * plume's level, plus that plume's level (for churn). Zero upstream of an
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
    const s = Math.exp(-1.4 * d2) * ramp * tail * e.level;
    if (s > best) {
      best = s;
      bestLevel = e.level;
    }
  }
  return { strength: best, level: bestLevel };
}

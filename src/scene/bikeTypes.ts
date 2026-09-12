/**
 * Frame styles per bike type, and the side-view layout they produce. Pure
 * data and math, no Three.js, so clearances can be unit-tested.
 *
 * The rider's contact points (bottom bracket, saddle, bar clamp) are shared by
 * every bike: the rider is "fitted" to the same position on each one, and the
 * frame, spacers and stem change around them. That is how a real bike fit
 * transfers between frames, and it keeps the pose presets valid for all types.
 *
 * Silhouettes are loosely inspired by modern race bikes (Cervélo S5 / Soloist
 * / R5 / Caledonia) without copying any one frame.
 */
import type { BikeType } from '../physics';
import { AXLE_Y, BAR_CLAMP, BB, SEAT_TUBE_ANGLE_DEG, type V2 } from './bikeGeometry';

const DEG = Math.PI / 180;

export type TubeProfile = 'round' | 'oval' | 'kamm';

export interface TubeSpec {
  profile: TubeProfile;
  /** Depth of the section in the side-view plane (fore-aft for upright tubes), metres. */
  chord: number;
  /** Lateral width of the section, metres. */
  width: number;
}

const round = (d: number): TubeSpec => ({ profile: 'round', chord: d, width: d });
const oval = (chord: number, width: number): TubeSpec => ({ profile: 'oval', chord, width });
/** Truncated airfoil ("Kammtail"): rounded leading edge, chopped-off tail. */
const kamm = (chord: number, width: number): TubeSpec => ({ profile: 'kamm', chord, width });

export type CockpitStyle = 'vStem' | 'integrated' | 'classic';

export interface FrameStyle {
  headTubeAngleDeg: number;
  headTubeLength: number;
  forkOffset: number;
  axleToCrown: number;
  frontAxleX: number;
  chainstayLength: number;
  /** Distance up the seat tube from the BB where the top tube joins. Lower = more slope. */
  topTubeJoin: number;
  /** Distance up the seat tube where the seat stays join. Well below the top tube = "dropped stays". */
  seatStayJoin: number;
  cockpit: CockpitStyle;
  /** Fork blade distance from centreline at the axle. */
  forkHalfWidth: number;
  color: number;
  tubes: {
    head: TubeSpec;
    top: TubeSpec;
    down: TubeSpec;
    seat: TubeSpec;
    seatpost: TubeSpec;
    chainstay: TubeSpec;
    seatstay: TubeSpec;
    fork: TubeSpec;
  };
}

export const FRAME_STYLES: Record<BikeType, FrameStyle> = {
  /** Deep Kammtail tubes, low stack, heavily dropped stays, split V-stem. */
  aero: {
    headTubeAngleDeg: 73.5,
    headTubeLength: 0.125,
    forkOffset: 0.043,
    axleToCrown: 0.365,
    frontAxleX: 0.59,
    chainstayLength: 0.415,
    topTubeJoin: 0.5,
    seatStayJoin: 0.39,
    cockpit: 'vStem',
    forkHalfWidth: 0.06,
    color: 0xc4552c,
    tubes: {
      head: kamm(0.075, 0.036),
      top: kamm(0.05, 0.026),
      down: kamm(0.07, 0.03),
      seat: kamm(0.048, 0.026),
      seatpost: kamm(0.055, 0.02),
      chainstay: oval(0.026, 0.018),
      seatstay: kamm(0.03, 0.013),
      fork: kamm(0.05, 0.017),
    },
  },
  /** Shallower truncated-aero tubes, dropped stays, one-piece cockpit. */
  allRound: {
    headTubeAngleDeg: 73,
    headTubeLength: 0.135,
    forkOffset: 0.045,
    axleToCrown: 0.367,
    frontAxleX: 0.59,
    chainstayLength: 0.41,
    topTubeJoin: 0.51,
    seatStayJoin: 0.43,
    cockpit: 'integrated',
    forkHalfWidth: 0.056,
    color: 0x8b2331,
    tubes: {
      head: kamm(0.06, 0.036),
      top: kamm(0.04, 0.026),
      down: kamm(0.058, 0.034),
      seat: kamm(0.042, 0.026),
      seatpost: kamm(0.045, 0.02),
      chainstay: oval(0.022, 0.018),
      seatstay: kamm(0.024, 0.013),
      fork: kamm(0.04, 0.018),
    },
  },
  /** Slim round tubes, flatter top tube, stays joining high, classic stem and bar. */
  climbing: {
    headTubeAngleDeg: 73,
    headTubeLength: 0.14,
    forkOffset: 0.045,
    axleToCrown: 0.367,
    frontAxleX: 0.585,
    chainstayLength: 0.41,
    topTubeJoin: 0.53,
    seatStayJoin: 0.5,
    cockpit: 'classic',
    forkHalfWidth: 0.052,
    color: 0xb59e74,
    tubes: {
      head: round(0.042),
      top: round(0.028),
      down: oval(0.04, 0.038),
      seat: round(0.029),
      seatpost: round(0.0272),
      chainstay: oval(0.018, 0.016),
      seatstay: round(0.012),
      fork: oval(0.026, 0.02),
    },
  },
  /** Tall head tube, slack front, long wheelbase, wide stance for big tires. */
  endurance: {
    headTubeAngleDeg: 72,
    headTubeLength: 0.17,
    forkOffset: 0.05,
    axleToCrown: 0.375,
    frontAxleX: 0.598,
    chainstayLength: 0.415,
    topTubeJoin: 0.49,
    seatStayJoin: 0.44,
    cockpit: 'integrated',
    forkHalfWidth: 0.06,
    color: 0x5d7a6b,
    tubes: {
      head: round(0.05),
      top: oval(0.034, 0.032),
      down: oval(0.05, 0.044),
      seat: oval(0.036, 0.032),
      seatpost: oval(0.03, 0.024),
      chainstay: oval(0.022, 0.019),
      seatstay: oval(0.016, 0.013),
      fork: oval(0.03, 0.022),
    },
  },
};

export interface FrameLayout {
  rearAxle: V2;
  frontAxle: V2;
  /** Unit vector up the steering axis (up and back). */
  steererDir: V2;
  headTubeBottom: V2;
  headTubeTop: V2;
  /** Where the stem clamps the steerer, above spacers and top cap. */
  stemBase: V2;
  spacerStack: number;
  seatCluster: V2;
  seatStayJoin: V2;
  downTubeStart: V2;
  downTubeEnd: V2;
  topTubeEnd: V2;
  stack: number;
  reach: number;
}

const LOWER_HEADSET = 0.012;
const TOP_CAP = 0.012;

const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });

export function frameLayout(style: FrameStyle): FrameLayout {
  const h = style.headTubeAngleDeg * DEG;
  const steererDir: V2 = { x: -Math.cos(h), y: Math.sin(h) };
  const forward: V2 = { x: Math.sin(h), y: Math.cos(h) };
  const seatDir: V2 = { x: -Math.cos(SEAT_TUBE_ANGLE_DEG * DEG), y: Math.sin(SEAT_TUBE_ANGLE_DEG * DEG) };

  const bbDrop = AXLE_Y - BB.y;
  const rearAxle: V2 = { x: BB.x - Math.sqrt(style.chainstayLength ** 2 - bbDrop ** 2), y: AXLE_Y };
  const frontAxle: V2 = { x: style.frontAxleX, y: AXLE_Y };

  // Steering axis passes `forkOffset` behind the axle, measured perpendicular to it.
  const axisAtAxle = add(frontAxle, mul(forward, -style.forkOffset));
  const headTubeBottom = add(axisAtAxle, mul(steererDir, style.axleToCrown + LOWER_HEADSET));
  const headTubeTop = add(headTubeBottom, mul(steererDir, style.headTubeLength));

  // Stem sits where a stem perpendicular to the steerer would reach the bar
  // clamp; if the bar is lower than that allows, slam it and angle the stem down.
  const toClamp = { x: BAR_CLAMP.x - headTubeTop.x, y: BAR_CLAMP.y - headTubeTop.y };
  const along = Math.max(TOP_CAP, toClamp.x * steererDir.x + toClamp.y * steererDir.y);
  const stemBase = add(headTubeTop, mul(steererDir, along));

  return {
    rearAxle,
    frontAxle,
    steererDir,
    headTubeBottom,
    headTubeTop,
    stemBase,
    spacerStack: along - TOP_CAP,
    seatCluster: add(BB, mul(seatDir, style.topTubeJoin)),
    seatStayJoin: add(BB, mul(seatDir, style.seatStayJoin)),
    // The down tube's centreline runs just above the BB and meets the head
    // tube a little above its bottom, which is what gives the front tire room.
    downTubeStart: add(BB, { x: 0.012, y: 0.02 }),
    downTubeEnd: add(headTubeBottom, mul(steererDir, 0.05)),
    topTubeEnd: add(headTubeTop, mul(steererDir, -0.022)),
    stack: headTubeTop.y - BB.y,
    reach: headTubeTop.x - BB.x,
  };
}

/** Perpendicular distance from point p to the infinite line through a→b. */
export function distanceToLine(p: V2, a: V2, b: V2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.hypot(dx, dy);
}

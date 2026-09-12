/**
 * Bike and body dimensions in metres, in the bike's side-view plane.
 *
 * Pure data, no Three.js, so the pose kinematics that depend on it can be
 * unit-tested. Coordinates: +X forward (into the wind), +Y up, +Z to the
 * rider's right. Ground is y = 0 for a 25 mm tire; the bike root group is
 * nudged up/down for other tire widths.
 *
 * These are "size 56 road bike, ~1.78 m rider" numbers chosen to look right,
 * not to match any particular frame.
 */

export interface V2 {
  x: number;
  y: number;
}

export interface V3 extends V2 {
  z: number;
}

const DEG = Math.PI / 180;

// --- Wheels -----------------------------------------------------------------

/** 700c bead-seat radius (622 mm ISO diameter). */
export const RIM_BEAD_RADIUS = 0.311;
/** Tire width the ground plane is referenced to. */
export const REFERENCE_TIRE_WIDTH_M = 0.025;
/** Axle height with the reference tire. Tire section is roughly as tall as it is wide. */
export const AXLE_Y = RIM_BEAD_RADIUS + REFERENCE_TIRE_WIDTH_M;
export const REAR_AXLE: V2 = { x: -0.41, y: AXLE_Y };
export const FRONT_AXLE: V2 = { x: 0.585, y: AXLE_Y };
/** Internal rim width, used for the rim cross-section. */
export const RIM_WIDTH = 0.026;

// --- Frame ------------------------------------------------------------------

/** Bottom bracket drop of 70 mm below the axles. */
export const BB: V2 = { x: 0, y: AXLE_Y - 0.07 };
export const CRANK_LENGTH = 0.1725;
/** Pedal spindle distance from the frame centreline. */
export const PEDAL_HALF_Q = 0.115;

export const SEAT_TUBE_ANGLE_DEG = 73.5;
/** BB centre to saddle top, along the seat tube. */
export const SADDLE_HEIGHT = 0.7;
export const SADDLE_TOP: V2 = {
  x: BB.x - SADDLE_HEIGHT * Math.cos(SEAT_TUBE_ANGLE_DEG * DEG),
  y: BB.y + SADDLE_HEIGHT * Math.sin(SEAT_TUBE_ANGLE_DEG * DEG),
};
/** Where the top tube meets the seat tube. */
export const SEAT_CLUSTER: V2 = {
  x: BB.x - 0.53 * Math.cos(SEAT_TUBE_ANGLE_DEG * DEG),
  y: BB.y + 0.53 * Math.sin(SEAT_TUBE_ANGLE_DEG * DEG),
};

export const HEAD_TUBE_TOP: V2 = { x: 0.4, y: BB.y + 0.54 };
export const HEAD_TUBE_BOTTOM: V2 = { x: 0.444, y: BB.y + 0.397 };
/** Stem clamp at the handlebar centre. ~9 cm below the saddle top. */
export const BAR_CLAMP: V2 = { x: 0.5, y: 0.85 };
export const BAR_HALF_WIDTH = 0.2;
export const BAR_TUBE_RADIUS = 0.012;

// --- Rider body segments ----------------------------------------------------

/** Hip joint relative to the saddle top: above the sit bones, slightly forward. */
export const HIP_OFFSET: V2 = { x: 0.03, y: 0.075 };
export const HIP_HALF_WIDTH = 0.09;
export const SHOULDER_HALF_WIDTH = 0.19;

export const THIGH_LENGTH = 0.44;
export const SHANK_LENGTH = 0.44;
export const TORSO_LENGTH = 0.54;
export const UPPER_ARM_LENGTH = 0.3;
/** Elbow to the centre of the gripping hand. */
export const FOREARM_LENGTH = 0.36;
/** Shoulder centre to head centre with the head fully raised. */
export const NECK_LENGTH = 0.25;
export const HEAD_RADIUS = 0.105;

/** Ankle joint relative to the pedal spindle with the foot roughly level. */
export const ANKLE_FROM_PEDAL: V2 = { x: -0.035, y: 0.085 };
/** Toe tip relative to the pedal spindle. */
export const TOE_FROM_PEDAL: V2 = { x: 0.09, y: 0.0 };

// --- Hand targets -----------------------------------------------------------

export type GripKind = 'tops' | 'hoods' | 'drops' | 'hoodsForearms' | 'aerobars';

export interface Grip {
  /** Target hand centre, side view. */
  x: number;
  y: number;
  /** Lateral distance of each hand from the centreline. */
  halfWidth: number;
  /**
   * True when the hand must actually land on this point because the bar is
   * fixed there. Aerobars are adjustable, so the rendered pads and
   * extensions follow wherever the arm puts the hand instead.
   */
  fixed: boolean;
}

export const GRIPS: Record<GripKind, Grip> = {
  tops: { x: 0.51, y: 0.875, halfWidth: 0.13, fixed: true },
  hoods: { x: 0.59, y: 0.885, halfWidth: 0.2, fixed: true },
  drops: { x: 0.535, y: 0.745, halfWidth: 0.205, fixed: true },
  /** Hands draped over the front of the hoods, forearms resting on the bar tops. */
  hoodsForearms: { x: 0.68, y: 0.89, halfWidth: 0.16, fixed: true },
  /** Nominal extension tip; pulls the hand forward. */
  aerobars: { x: 0.8, y: 0.93, halfWidth: 0.05, fixed: false },
};

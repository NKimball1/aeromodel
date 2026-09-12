import {
  G,
  SPEED_SOLVER_MAX_MS,
  SPEED_SOLVER_TOLERANCE_MS,
  SPEED_SOLVER_WALK_STEP_MS,
} from './constants';
import { computeCdA } from './cda';
import { computeCrr } from './crr';
import type { Environment, PowerBreakdown, RiderConfig } from './types';

/** The two coefficients the power equation actually needs. */
export interface DragCoefficients {
  cda: number;
  crr: number;
}

export function coefficientsFor(config: RiderConfig, yawDeg = 0): DragCoefficients {
  return { cda: computeCdA(config, yawDeg), crr: computeCrr(config) };
}

function resolve(coeffs: DragCoefficients | RiderConfig): DragCoefficients {
  return 'cda' in coeffs ? coeffs : coefficientsFor(coeffs);
}

/**
 * Power (W) required at the pedals to hold `env.speedMs` steady.
 *
 *   P_aero     = 0.5 · rho · CdA · v_air · |v_air| · v_ground
 *   P_rolling  = Crr · m · g · cos(theta) · v_ground
 *   P_gravity  = m · g · sin(theta) · v_ground
 *   P_drive    = (P_aero + P_rolling + P_gravity) · loss / (1 − loss)
 *
 * v_air = v_ground + headwind. The spec writes v_air², which is only right
 * when v_air ≥ 0; v_air·|v_air| keeps the sign so a tailwind faster than the
 * rider pushes them (negative aero power) instead of resisting.
 *
 * theta = atan(grade); grade is a fraction (0.05 = 5 %).
 *
 * The total can be negative on descents or with strong tailwinds. That is the
 * "you'd be coasting faster than this" regime; speedFromPower handles it.
 */
export function powerFromSpeed(
  env: Environment,
  coeffs: DragCoefficients | RiderConfig,
): PowerBreakdown {
  const { cda, crr } = resolve(coeffs);
  const v = env.speedMs;
  const vAir = v + env.headwindMs;
  const mass = env.riderMassKg + env.bikeMassKg;
  const theta = Math.atan(env.grade);

  const aero = 0.5 * env.rho * cda * vAir * Math.abs(vAir) * v;
  const rolling = crr * mass * G * Math.cos(theta) * v;
  const gravity = mass * G * Math.sin(theta) * v;
  const atWheel = aero + rolling + gravity;
  const loss = env.drivetrainLoss;
  const drivetrain = atWheel * (loss / (1 - loss));

  return { aero, rolling, gravity, drivetrain, total: atWheel + drivetrain };
}

/**
 * Steady-state ground speed (m/s) at which `targetPowerW` is exactly what the
 * rider must produce. Inverse of powerFromSpeed; `env.speedMs` is ignored.
 *
 * Bisection rather than Newton: P(v) is monotone on flat ground, but with a
 * tailwind or a descent it dips negative before rising, so there can be more
 * than one root. We want the LARGEST root, the stable equilibrium (e.g. the
 * terminal coasting speed when target = 0 W). The bracket is found by walking
 * down from a high speed where P > target until P < target, then bisecting.
 * That always converges and is cheap enough for interactive use.
 */
export function speedFromPower(
  targetPowerW: number,
  env: Omit<Environment, 'speedMs'>,
  coeffs: DragCoefficients | RiderConfig,
): number {
  const c = resolve(coeffs);
  const P = (v: number) => powerFromSpeed({ ...env, speedMs: v }, c).total;

  // Start from the cap, where aero drag dwarfs any realistic target, and walk
  // DOWN in fixed steps until P drops below the target. Walking down (rather
  // than doubling up from a low guess) is what guarantees we bracket the
  // LARGEST root: a descent or tailwind gives P(v) a local minimum at low
  // speed, and a bracket that starts below it can converge to 0 or to the
  // wrong root. 0.25 m/s steps are far finer than the spacing between
  // distinct roots of this cubic except when the target sits almost exactly
  // on that local extremum, where the two candidate roots nearly coincide
  // anyway. ~400 evaluations worst case, each a handful of multiplies.
  let hi = SPEED_SOLVER_MAX_MS;
  if (P(hi) <= targetPowerW) return hi;
  let lo = hi - SPEED_SOLVER_WALK_STEP_MS;
  while (lo > 0 && P(lo) >= targetPowerW) lo -= SPEED_SOLVER_WALK_STEP_MS;
  if (lo <= 0) {
    lo = 0;
    if (P(0) >= targetPowerW) return 0; // target ≤ 0 W and nothing pushes you: stopped.
  }
  hi = lo + SPEED_SOLVER_WALK_STEP_MS;

  while (hi - lo > SPEED_SOLVER_TOLERANCE_MS) {
    const mid = 0.5 * (lo + hi);
    if (P(mid) < targetPowerW) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

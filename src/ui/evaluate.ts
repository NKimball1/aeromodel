/**
 * Runs the physics for the current app state. Pure; the readout, the panel
 * and the scene all read from one Evaluation so their numbers always agree.
 */
import {
  airDensity,
  coefficientsFor,
  computeCdABreakdown,
  computeCrr,
  powerFromSpeed,
  speedFromPower,
  type CdABreakdown,
  type Environment,
  type PowerBreakdown,
} from '../physics';
import { currentSetup, type AppState, type HoldMode, type Setup } from './appState';

export interface Evaluation {
  env: Environment;
  cda: CdABreakdown;
  crr: number;
  power: PowerBreakdown;
  speedMs: number;
  /** The rider's output: the target in hold-power mode, the requirement in hold-speed mode. */
  powerW: number;
  /** Power per kg of rider (not bike), the usual convention. */
  wPerKg: number;
}

export function resolveRho(state: AppState): number {
  return state.rhoSource === 'altitude' ? airDensity(state.altitudeM, state.temperatureC) : state.rhoManual;
}

/** Ride conditions for a setup, minus the speed (which depends on hold mode). */
export function rideConditions(state: AppState, setup: Setup = currentSetup(state)): Omit<Environment, 'speedMs'> {
  return {
    rho: resolveRho(state),
    riderMassKg: state.riderMassKg,
    bikeMassKg: setup.bikeMassKg,
    headwindMs: state.headwindMs,
    grade: state.gradePct / 100,
    drivetrainLoss: state.drivetrainLossPct / 100,
  };
}

export function evaluate(state: AppState, setup: Setup = currentSetup(state)): Evaluation {
  const base = rideConditions(state, setup);
  const coeffs = coefficientsFor(setup.config);
  const speedMs = state.hold === 'power' ? speedFromPower(state.targetPowerW, base, coeffs) : state.speedMs;
  const env = { ...base, speedMs };
  const power = powerFromSpeed(env, coeffs);
  const powerW = state.hold === 'power' ? state.targetPowerW : power.total;
  return {
    env,
    cda: computeCdABreakdown(setup.config),
    crr: computeCrr(setup.config),
    power,
    speedMs,
    powerW,
    wPerKg: state.riderMassKg > 0 ? powerW / state.riderMassKg : 0,
  };
}

/**
 * Change hold mode without a jump: the value that was being solved becomes
 * the new fixed input, so the ride carries on at the same speed and power.
 */
export function switchHold(state: AppState, hold: HoldMode): AppState {
  if (hold === state.hold) return state;
  const ev = evaluate(state);
  return hold === 'speed'
    ? { ...state, hold, speedMs: ev.speedMs }
    : { ...state, hold, targetPowerW: Math.max(0, Math.round(ev.powerW)) };
}

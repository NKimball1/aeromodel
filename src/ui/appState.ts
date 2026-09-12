/**
 * Everything the user controls, in SI units. The control panel converts to
 * and from display units; nothing else needs to know about km/h or lb.
 */
import {
  BIKE_TYPE,
  RHO_DEFAULT,
  defaultConfig,
  defaultEnvironment,
  type BikeType,
  type RiderConfig,
} from '../physics';

/** Which ride input the user sets; the other is solved by the model. */
export type HoldMode = 'power' | 'speed';
export type SpeedUnit = 'kmh' | 'mph';
export type MassUnit = 'kg' | 'lb';
export type RhoSource = 'manual' | 'altitude';

export interface Units {
  speed: SpeedUnit;
  mass: MassUnit;
}

/** The equipment + position snapshot a comparison is made against. */
export interface Setup {
  config: RiderConfig;
  bikeMassKg: number;
}

export interface AppState {
  config: RiderConfig;
  hold: HoldMode;
  /** Used when hold = 'power'. */
  targetPowerW: number;
  /** Used when hold = 'speed'. */
  speedMs: number;
  riderMassKg: number;
  bikeMassKg: number;
  headwindMs: number;
  gradePct: number;
  drivetrainLossPct: number;
  rhoSource: RhoSource;
  rhoManual: number;
  altitudeM: number;
  temperatureC: number;
  units: Units;
  baseline: Setup | null;
}

export const initialAppState: AppState = {
  config: { ...defaultConfig },
  // Holding power makes aero changes show up as speed, which is the point.
  hold: 'power',
  targetPowerW: 200,
  speedMs: defaultEnvironment.speedMs,
  riderMassKg: defaultEnvironment.riderMassKg,
  bikeMassKg: defaultEnvironment.bikeMassKg,
  headwindMs: defaultEnvironment.headwindMs,
  gradePct: defaultEnvironment.grade * 100,
  drivetrainLossPct: defaultEnvironment.drivetrainLoss * 100,
  rhoSource: 'manual',
  rhoManual: RHO_DEFAULT,
  altitudeM: 0,
  temperatureC: 15,
  units: { speed: 'kmh', mass: 'kg' },
  baseline: null,
};

/** Switching bike type pre-fills a typical bike mass, which the user can then override. */
export function withBikeType(state: AppState, bikeType: BikeType): AppState {
  if (bikeType === state.config.bikeType) return state;
  return {
    ...state,
    config: { ...state.config, bikeType },
    bikeMassKg: BIKE_TYPE[bikeType].typicalMassKg,
  };
}

export function currentSetup(state: AppState): Setup {
  return { config: { ...state.config }, bikeMassKg: state.bikeMassKg };
}

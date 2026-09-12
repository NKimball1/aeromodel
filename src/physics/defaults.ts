import {
  BIKE_MASS_DEFAULT_KG,
  DRIVETRAIN_LOSS_DEFAULT,
  RHO_DEFAULT,
  RIDER_MASS_DEFAULT_KG,
} from './constants';
import type { Environment, RiderConfig } from './types';
import { kmhToMs } from './units';

/** The "typical club rider" baseline the UI starts from. */
export const defaultConfig: RiderConfig = {
  position: 'hoods',
  kit: 'tightJersey',
  helmet: 'road',
  frontWheel: 'box',
  rearWheel: 'box',
  tireWidthMm: 25,
  tireQuality: 'training',
};

export const defaultEnvironment: Environment = {
  rho: RHO_DEFAULT,
  riderMassKg: RIDER_MASS_DEFAULT_KG,
  bikeMassKg: BIKE_MASS_DEFAULT_KG,
  speedMs: kmhToMs(30),
  headwindMs: 0,
  grade: 0,
  drivetrainLoss: DRIVETRAIN_LOSS_DEFAULT,
};

import type {
  FrontWheelDepth,
  Helmet,
  Kit,
  Position,
  TireQuality,
  TireWidth,
  WheelDepth,
} from './constants';

/** Everything about the rider + equipment that affects CdA or Crr. */
export interface RiderConfig {
  position: Position;
  kit: Kit;
  helmet: Helmet;
  frontWheel: FrontWheelDepth;
  rearWheel: WheelDepth;
  tireWidthMm: TireWidth;
  tireQuality: TireQuality;
}

/** Everything about the ride conditions that affects power. */
export interface Environment {
  /** Air density, kg/m³. */
  rho: number;
  riderMassKg: number;
  bikeMassKg: number;
  /** Ground speed, m/s. Always stored in SI; the UI converts. */
  speedMs: number;
  /** Headwind along the direction of travel, m/s. Negative = tailwind. */
  headwindMs: number;
  /** Road grade as a fraction (0.05 = 5 %). */
  grade: number;
  /** Drivetrain loss as a fraction (0.03 = 3 %). */
  drivetrainLoss: number;
}

export interface PowerBreakdown {
  aero: number;
  rolling: number;
  gravity: number;
  drivetrain: number;
  total: number;
}

export interface CdABreakdown {
  position: number;
  kit: number;
  helmet: number;
  frontWheel: number;
  rearWheel: number;
  tireWidth: number;
  total: number;
}

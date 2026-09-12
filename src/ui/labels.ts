import {
  FRONT_WHEEL,
  REAR_WHEEL,
  type BikeType,
  type FrontWheelDepth,
  type Helmet,
  type Kit,
  type Position,
  type TireQuality,
  type WheelDepth,
} from '../physics';

export const POSITION_LABELS: Record<Position, string> = {
  tt: 'TT / aero bars',
  hoodsForearmsFlat: 'Hoods, forearms flat',
  drops: 'Drops',
  hoods: 'Hoods',
  upright: 'Upright',
};

export const BIKE_TYPE_LABELS: Record<BikeType, string> = {
  aero: 'Aero',
  allRound: 'All-round aero',
  climbing: 'Climbing',
  endurance: 'Endurance',
};

export const KIT_LABELS: Record<Kit, string> = {
  skinsuit: 'Skinsuit',
  tightJersey: 'Tight jersey',
  looseJersey: 'Loose jersey',
  baggyJacket: 'Baggy jacket',
};

export const HELMET_LABELS: Record<Helmet, string> = {
  aero: 'Aero',
  road: 'Road',
  none: 'None / cap',
};

export const TIRE_QUALITY_LABELS: Record<TireQuality, string> = {
  racing: 'Racing',
  training: 'Training',
  gravel: 'Gravel',
};

export const FRONT_WHEEL_LABELS = Object.fromEntries(
  Object.entries(FRONT_WHEEL).map(([k, v]) => [k, v.label]),
) as Record<FrontWheelDepth, string>;

export const REAR_WHEEL_LABELS = Object.fromEntries(
  Object.entries(REAR_WHEEL).map(([k, v]) => [k, v.label]),
) as Record<WheelDepth, string>;

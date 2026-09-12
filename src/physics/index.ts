// Public surface of the physics module. Pure functions only: no Three.js,
// no DOM. Everything the scene and UI need comes through here.
export * from './constants';
export * from './types';
export * from './units';
export * from './defaults';
export { computeCdA, computeCdABreakdown } from './cda';
export { computeCrr } from './crr';
export { airDensity } from './airDensity';
export { powerFromSpeed, speedFromPower, coefficientsFor } from './power';
export type { DragCoefficients } from './power';
export { REFERENCES, UNVALIDATED_NOTE, referenceById, type Reference, type ReferenceId } from './references';

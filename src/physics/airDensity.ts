import {
  BAROMETRIC_EXPONENT,
  LAPSE_RATE,
  P0_SEA_LEVEL,
  R_DRY_AIR,
  T0_SEA_LEVEL_K,
} from './constants';

/**
 * Air density (kg/m³) from altitude and ambient temperature.
 *
 * Pressure comes from the ISA barometric formula for the troposphere
 * (valid to ~11 km); density from the ideal gas law using the *actual*
 * temperature rather than the ISA one. Humidity is ignored (it lowers rho
 * by well under 1 % at normal conditions).
 *
 * Check: (0 m, 15 °C) → 1.225. (1500 m, 20 °C) → ≈1.01.
 */
export function airDensity(altitudeM: number, temperatureC: number): number {
  const pressure =
    P0_SEA_LEVEL * Math.pow(1 - (LAPSE_RATE * altitudeM) / T0_SEA_LEVEL_K, BAROMETRIC_EXPONENT);
  const temperatureK = temperatureC + 273.15;
  return pressure / (R_DRY_AIR * temperatureK);
}

/**
 * How speed is dramatised on screen. Illustrative only: nothing here feeds
 * the physics.
 *
 * Road, wheels and air all use the same time scale so they agree with each
 * other: in still air the streaks move exactly with the road, and a headwind
 * visibly makes them outrun it. Cadence stays real (it is tied to power).
 */
export const SPEED_VISUAL = {
  /** Displayed speed per real m/s. Above 1 exaggerates motion. */
  timeScale: 1.6,
  /** Streak length = displayed speed × this × (airspeed / reference). */
  trailSeconds: 0.05,
  /**
   * Streaks grow with airspeed on top of moving faster, so length goes with
   * speed², making a few km/h difference easy to see. 30 km/h reference.
   */
  trailReferenceMs: 30 / 3.6,
  /** Shortest streak, as a fraction of the reference length, so slow air still reads. */
  minTrailFactor: 0.25,
  /** Wheel angular speeds (rad/s, displayed) over which spokes fade into a blur disc. */
  wheelBlurStart: 14,
  wheelBlurFull: 36,
} as const;

/** 0 at or below `start`, 1 at or above `end`, smooth in between. */
export function smoothstep(start: number, end: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

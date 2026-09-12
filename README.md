# AeroModel — cycling aerodynamics visualizer

A browser-based 3D wind tunnel: a stationary, pedaling cyclist with animated
airflow, a control panel for rider and equipment variables, and a live readout
of the power required at a given speed (and speed at a given power). The flow
is illustrative, not CFD.

Vite + TypeScript + Three.js. No backend.

## Status

| Checkpoint | State |
| --- | --- |
| 1. Physics module + constants + tests | **done, awaiting validation against real rides** |
| 2. Primitive rider, pose presets, pedaling, basic particle flow | not started |
| 3. Controls wired to readout + baseline delta | not started |
| 4. Wake responding to CdA | not started |
| 5. Particle deflection, chart, polish | not started |

## Layout

```
src/
  physics/        pure functions, no Three.js, unit-tested
    constants.ts  EVERY tunable number, each with its source/reasoning
    cda.ts        computeCdA(config, yawDeg)  — yaw accepted, ignored (TODO)
    crr.ts        computeCrr(config)
    power.ts      powerFromSpeed(), speedFromPower()
    airDensity.ts rho from altitude + temperature
    units.ts      km/h, mph, lb conversions
    defaults.ts   default rider config + environment
    __tests__/    sanity points, monotonicity, inversion, real-ride validation
  scene/          (checkpoint 2) Three.js rider, wind particles, camera
  ui/             (checkpoint 3) controls, readouts
scripts/
  reference-table.test.ts   prints a watts-by-position table for eyeballing
```

## Commands

Use pnpm (via corepack).

```bash
corepack pnpm@latest install
corepack pnpm@latest test        # unit tests
corepack pnpm@latest ref         # print the reference table
corepack pnpm@latest dev         # dev server (nothing to see until checkpoint 2)
```

## Physics model

Standard steady-state cycling power equation:

```
P_aero     = 0.5 · rho · CdA · v_air · |v_air| · v_ground     v_air = v_ground + headwind
P_rolling  = Crr · m · g · cos(theta) · v_ground              theta = atan(grade)
P_gravity  = m · g · sin(theta) · v_ground
P_drive    = (P_aero + P_rolling + P_gravity) · loss / (1 − loss)
P_total    = sum
```

`v_air · |v_air|` instead of `v_air²` keeps the sign correct when a tailwind
exceeds ground speed.

`speedFromPower` inverts this by bisection. It deliberately finds the
**largest** root: on descents or with tailwinds the curve dips negative and
has more than one crossing, and the largest root is the stable one (terminal
coasting speed when the target is 0 W).

### CdA composition

`POSITION_CDA` gives the full rider+bike CdA in the baseline setup (tight
jersey, road helmet, box wheels, 25 mm tires). Everything else is an additive
delta from that baseline, so each modifier table has a 0 entry. Wheels are
per-wheel objects so a yaw-dependent curve can be added later without touching
the composition.

### Validating against real rides

Add rows to `RIDES` in `src/physics/__tests__/realRides.test.ts` (power,
speed, mass, grade, wind, altitude, temperature, config) and run the tests.
Each ride prints both directions of the model so a miss tells you which way
to tune. Then adjust `constants.ts`; values marked ⚠️ are the least certain.

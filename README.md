# AeroModel — cycling aerodynamics visualizer

A browser-based 3D wind tunnel: a stationary, pedaling cyclist with animated
airflow, a control panel for rider and equipment variables, and a live readout
of the power required at a given speed (and speed at a given power). The flow
is illustrative, not CFD.

Vite + TypeScript + Three.js. No backend.

## Status

| Checkpoint | State |
| --- | --- |
| 1. Physics module + constants + tests | done |
| 2. Primitive rider, pose presets, pedaling, basic particle flow | done |
| 3. Controls wired to readout + baseline delta | done |
| 4. Wake responding to CdA | done |
| 5. Particle deflection, chart, polish | done |

## Layout

```
src/
  physics/        pure functions, no Three.js, unit-tested
    constants.ts  EVERY tunable number, each with its source/reasoning
    references.ts published sources, shared by the literature tests and the Sources window
    cda.ts        computeCdA(config, yawDeg)  — yaw accepted, ignored (TODO)
    crr.ts        computeCrr(config)
    power.ts      powerFromSpeed(), speedFromPower()
    airDensity.ts rho from altitude + temperature
    units.ts      km/h, mph, lb conversions
    defaults.ts   default rider config + environment
    __tests__/    sanity points, monotonicity, inversion, literature + real-ride validation
  scene/          Three.js lives here and only here
    bikeGeometry.ts  rider fit: BB, saddle, bar clamp, body segments, grips (pure data)
    bikeTypes.ts     per-type frame styles + layout solver (pure, clearance-tested)
    speedVisuals.ts  shared time scale + streak/blur tuning for exaggerated speed
    pose.ts          pose params, presets, 2-bone IK skeleton solver (pure, tested)
    rider.ts         mannequin from capsules; kit inflate + fabric flutter shader; helmets
    bike.ts          frame per type (Kammtail/oval/round tubes), cockpit, disc brakes, drivetrain, aerobars
    wheel.ts         lathe rims by depth, disc, tire by width, rotors, spoke blur at speed
    wind.ts          streak particles +X to -X; slow, swirl and tint inside the wake
    deflection.ts    body capsules from the skeleton; pushes streaks around the rider; pure, tested
    hotspots.ts      per-part turbulence plumes (shoulders, legs, clothing, helmet, frame, wheels, tires); pure, tested
    hotspotSmoke.ts  smoke shed from each component, sized by how draggy that option is
    wake.ts          CdA -> wake shape (length, width, deficit, chaos, opacity); pure, tested
    wakeSmoke.ts     soft smoke puffs shed from the rider's back (custom point shader)
    environment.ts   tunnel, rolling tarmac road (procedural texture), lights, speed arrow
    cameraRig.ts     orbit camera + side / 3/4 front / rear-wake presets
    AeroScene.ts     render loop; takes a SceneState, never calls physics
  ui/             controls, readouts, and the physics-to-scene wiring
    appState.ts      everything the user controls, in SI units; baseline snapshot
    evaluate.ts      runs the physics for a state (hold power or hold speed); pure, tested
    baseline.ts      baseline comparison: watts saved / speed gained / time over 40 km; pure, tested
    format.ts        unit conversion + number formatting for display
    store.ts         tiny state container
    controlPanel.ts  lil-gui grouped controls (Ride, Rider, Position, Kit, Bike, Environment, Units & view)
    readout.ts       hero number, W/kg + CdA + Crr tiles, power breakdown bar, baseline delta
    chartModel.ts    power-vs-speed curves, axis ranges, ticks; pure, tested
    powerChart.ts    hand-built SVG chart with hover crosshair, tooltip and table view
    persist.ts       remembers setup + baseline in localStorage, validated on load; tested
    sourcesDialog.ts small "Sources & validation" window
    sceneMapping.ts  physics output to SceneState (cadence from power, airspeed)
    hotspots.ts      ranks each component's option within its class for the plumes; tested
    labels.ts        display names for presets
scripts/
  reference-table.test.ts   prints a watts-by-position table for eyeballing
```

## Commands

Requires Node 20+ and [pnpm](https://pnpm.io) (`corepack enable` provides it).

```bash
pnpm install
pnpm dev         # dev server at http://localhost:5173
pnpm test        # unit tests
pnpm ref         # print a watts-by-position reference table
pnpm build       # type-check + production build into dist/
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

## Using it

- **Ride mode.** "Hold power, solve speed" (default) fixes your watts and shows the speed
  your setup buys you, so aero changes make the road and airflow visibly speed up.
  "Hold speed, solve power" fixes the speed and shows the watts needed. Switching modes
  carries over the current values, so nothing jumps.
- **Baseline.** Pin a setup, then change position or equipment. The readout shows watts
  saved at the same speed, or speed gained at the same power plus time saved over 40 km
  (25 mi in imperial). The baseline covers position, kit, helmet, bike, wheels, tires and
  bike mass; ride conditions and rider mass are shared.
- **Bike type pre-fills bike mass** with a typical weight for that frame. Override it after.
- **W/kg** uses rider mass only.
- **Power vs speed chart.** The current setup's curve (blue) over the baseline's (gray),
  with dots where you're riding. Hover for both values and the difference at any speed;
  "Show as table" lists them every 5 or 10 units.
- **Your setup is remembered** in this browser, including the pinned baseline.
  "Units & view → Reset everything to defaults" starts over.

## Scene notes

- Coordinates: +X forward into the wind, +Y up, +Z rider's right. Air flows +X to -X.
- A position preset is a set of numbers in `POSE_PRESETS` (torso angle, elbow bend,
  neck angle, head drop, head pitch, hip forward, grip target). Switching presets
  eases between the numbers. The pose tests check that hands land on the bar,
  bones keep their length, and knee angles stay realistic, so retune there.
- Bike types (aero, all-round aero, climbing, endurance) share the rider's fit: BB,
  saddle and bar clamp never move, so every pose preset works on every bike. The frame,
  spacers and stem change around the rider. Frame type also adds a CdA delta in physics.
- Speed is deliberately exaggerated. Road scroll, wheel spin and air particles all run at
  `SPEED_VISUAL.timeScale` (1.6x real) so they agree with each other, and air streak
  length grows with airspeed squared. Cadence stays real.
- The wake is driven by total CdA, mapped to a 0..1 level across the model's range
  (full TT setup about 0.18 m², upright in a baggy jacket about 0.48 m²). Length, width,
  velocity deficit, turbulence and smoke opacity all scale with it, deliberately
  exaggerated. Its height comes from the rider's pose, so a tuck also lowers it. Tuning
  lives in `WAKE_VISUAL` (wake.ts), `WIND_VISUAL` (wind.ts) and `SMOKE_VISUAL` (wakeSmoke.ts).
- Every drag source has its own visible plume, not just the overall wake: the rider's
  shoulders, legs, clothing and helmet, and the bike's frame, wheels and tires. Two things
  set a plume. Its **rank** is where the chosen option sits within that part's options
  (from the physics constants), so every gear or position change visibly moves its plume.
  Its **weight** is that part's share of total drag, so the rider (roughly three quarters
  of the drag) dominates and the bike's plumes are smaller. Nothing is ever clean air: the
  best option still sheds a small plume. Tuning lives in `HOTSPOT_VISUAL` and
  `HOTSPOT_SMOKE_VISUAL`.
- Deflection is deliberately coarse: torso, head, arms and legs are capsules rebuilt from
  the skeleton each frame, and each streak end near one is pushed outward with a smooth
  falloff. No flow solving. Tuning lives in `DEFLECT_VISUAL` (deflection.ts).
- In dev builds `window.aero` is the scene. `aero.advance(seconds)` steps the
  simulation without animation frames, which helps when the tab is throttled.

## Validation against published data

`src/physics/__tests__/literature.test.ts` checks the model against published measurements.
The sources are listed in `src/physics/references.ts` and in the app under
"Sources & validation".

- **The equation.** Martin et al. (1998) measured road power with SRM power meters and
  wind-tunnel drag areas for the same riders. With their inputs, this model predicts their
  measured power to within 6.4 W RMS (their own model: 6.2 W), and matches their aero,
  rolling and gravity components bout by bout and their appendix example term by term.
- **Position CdA.** Checked against the wind-tunnel values compiled in Defraeye et al.
  (2010), Table 1: time trial 0.203–0.269 m² (median about 0.244), dropped 0.243–0.32,
  upright on the tops 0.270–0.358. This led to retuning upright from 0.42 to 0.36, time
  trial from 0.225 to 0.24, and hoods from 0.345 to 0.34.
- **Rolling resistance.** Racing-tire Crr is checked against drum tests of a
  Continental GP5000, including how it changes with width.
- **Drivetrain.** Martin et al. measured 2.3 % loss, so the default moved from 3 % to 2.5 %.
- **Still estimates.** Helmet, clothing, frame and wheel deltas have no single peer-reviewed
  benchmark; they stay flagged ⚠️ in `constants.ts`.

## Validating against real rides

Add rows to `RIDES` in `src/physics/__tests__/realRides.test.ts` (power,
speed, mass, grade, wind, altitude, temperature, config) and run the tests.
Each ride prints both directions of the model so a miss tells you which way
to tune. Then adjust `constants.ts`; values marked ⚠️ are the least certain.

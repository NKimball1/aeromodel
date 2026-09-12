/**
 * ALL physics constants live here. Every value carries a comment giving its
 * source or reasoning. Values marked ⚠️ are the ones I'm least sure of. Treat
 * every number here as a default to be tuned against real ride data.
 *
 * Convention for CdA composition:
 *   The POSITION table gives the CdA of a complete rider+bike in that
 *   position wearing the BASELINE setup: tight road jersey, vented road
 *   helmet, box-section wheels, 25 mm tires. Every other table is a *delta*
 *   from that baseline, so the baseline entry in each modifier table is 0.
 *   Deltas are additive at zero yaw (a simplification; interaction effects
 *   such as "aero helmet matters more in a TT tuck" are ignored).
 */

// ---------------------------------------------------------------------------
// Fundamental / environment
// ---------------------------------------------------------------------------

/** Standard gravity, m/s². */
export const G = 9.80665;

/** ISA sea-level air density at 15 °C, kg/m³. */
export const RHO_DEFAULT = 1.225;

/** ISA sea-level pressure, Pa. Used when deriving rho from altitude. */
export const P0_SEA_LEVEL = 101325;

/** ISA sea-level temperature, K (15 °C). */
export const T0_SEA_LEVEL_K = 288.15;

/** ISA tropospheric lapse rate, K/m. */
export const LAPSE_RATE = 0.0065;

/** Specific gas constant for dry air, J/(kg·K). */
export const R_DRY_AIR = 287.05;

/** Exponent in the barometric formula: g·M/(R·L) ≈ 5.2559 for the ISA. */
export const BAROMETRIC_EXPONENT = 5.2559;

// ---------------------------------------------------------------------------
// Rider / bike defaults
// ---------------------------------------------------------------------------

/** Spec default. */
export const RIDER_MASS_DEFAULT_KG = 75;

/** Spec default; a typical road bike with pedals and bottles. */
export const BIKE_MASS_DEFAULT_KG = 8;

/**
 * Fraction of crank power lost in the drivetrain. Retuned from the spec's
 * 3 % to 2.5 %: Martin et al. 1998 measured 97.7 % efficiency (2.3 % loss)
 * against a calibrated ergometer; Spicer et al. 2001 report chain-drive
 * efficiencies in the high 90s. Dirty or cross-chained can exceed 5 %.
 * See references.ts: martin1998, spicer2001.
 */
export const DRIVETRAIN_LOSS_DEFAULT = 0.025;

// ---------------------------------------------------------------------------
// CdA — position (m²). Full-system values, baseline kit/helmet/wheels.
// ---------------------------------------------------------------------------

export type Position = 'tt' | 'hoodsForearmsFlat' | 'drops' | 'hoods' | 'upright';

export const POSITIONS: readonly Position[] = ['tt', 'hoodsForearmsFlat', 'drops', 'hoods', 'upright'];

/**
 * Checked against the wind-tunnel drag areas compiled in Defraeye et al.
 * 2010, Table 1 (references.ts: defraeye2010), which the literature tests
 * enforce. Published values, rider + bike:
 *   time trial 0.203–0.269 m² (median ~0.244; Martin 1998 amateurs 0.269)
 *   dropped    0.243–0.32 m²
 *   upright    0.270–0.358 m² (hands on the tops)
 */
export const POSITION_CDA: Record<Position, number> = {
  /**
   * Retuned from 0.225 to 0.24: near the median of published time-trial
   * values (~0.244). 0.225 sat in the optimistic half; typical amateurs on
   * clip-ons measure higher.
   */
  tt: 0.24,
  /**
   * ⚠️ Not covered by the spec ranges. Forearms flat on the hoods (the now
   * UCI-banned "puppy paws" / aero-hoods position). Field tests with aero
   * sensors generally place it between the drops and a TT tuck, roughly
   * 0.26–0.30. Midpoint 0.28.
   */
  hoodsForearmsFlat: 0.28,
  /** Spec range 0.30–0.32; midpoint. Published dropped values 0.243–0.32 agree. */
  drops: 0.31,
  /**
   * Spec range 0.33–0.36. No study in the table isolates hands on the hoods;
   * it must sit between drops and tops. Moved from 0.345 to 0.34 (the spec's
   * own sanity value) to keep a gap below the retuned upright value.
   */
  hoods: 0.34,
  /**
   * Retuned from 0.42 to 0.36. The spec's "0.40+" was above every published
   * wind-tunnel value for sitting up with hands on the tops (0.270–0.358,
   * Jeukendrup & Martin 2001 via Defraeye 2010 at the top end).
   */
  upright: 0.36,
};

// ---------------------------------------------------------------------------
// CdA — kit (m²). Delta from a tight road jersey.
// ---------------------------------------------------------------------------

export type Kit = 'skinsuit' | 'tightJersey' | 'looseJersey' | 'baggyJacket';

export const KITS: readonly Kit[] = ['skinsuit', 'tightJersey', 'looseJersey', 'baggyJacket'];

export const KIT_CDA_DELTA: Record<Kit, number> = {
  /**
   * Skinsuit vs a good, tight jersey: wind-tunnel write-ups usually quote
   * 0.005–0.02 m² (a few to ~15 W at 40 km/h). Picked 0.012.
   */
  skinsuit: -0.012,
  /** Baseline. */
  tightJersey: 0,
  /**
   * Spec: loose clothing adds ~0.02–0.05. A loose (flapping) jersey sits in
   * the lower half of that range. Picked 0.03.
   */
  looseJersey: 0.03,
  /** Upper end of the spec's loose-clothing range. */
  baggyJacket: 0.05,
};

// ---------------------------------------------------------------------------
// CdA — helmet (m²). Delta from a vented road helmet.
// ---------------------------------------------------------------------------

export type Helmet = 'aero' | 'road' | 'none';

export const HELMETS: readonly Helmet[] = ['aero', 'road', 'none'];

export const HELMET_CDA_DELTA: Record<Helmet, number> = {
  /**
   * Aero road / short-tail TT helmet vs vented road helmet: commonly quoted
   * 0.005–0.015 m² (≈5–15 W at 40 km/h). Midpoint 0.01.
   */
  aero: -0.01,
  /** Baseline. */
  road: 0,
  /**
   * ⚠️ Very uncertain and small. Bare head / cap vs vented helmet: tests
   * disagree on the sign; hair and cap flapping tend to make it slightly
   * worse. Picked +0.005. Tune or zero this out.
   */
  none: 0.005,
};

// ---------------------------------------------------------------------------
// CdA — frame / bike type (m²). Delta from a round-tube climbing frame with a
// conventional stem and round bar, the kind of bike most published position
// CdA values were measured on. Rider fit (saddle and bar position) is held
// constant across bike types; only the bike changes.
// ---------------------------------------------------------------------------

export type BikeType = 'aero' | 'allRound' | 'climbing' | 'endurance';

export const BIKE_TYPES: readonly BikeType[] = ['aero', 'allRound', 'climbing', 'endurance'];

export interface BikeTypeSpec {
  /** CdA delta from the climbing-frame baseline, m². */
  cdaDelta: number;
  /**
   * ⚠️ Typical complete bike, size ~56, with pedals and cages, kg. Race bikes
   * sit near the UCI 6.8 kg limit before pedals; aero frames run roughly
   * 0.5–1 kg heavier; endurance bikes ~8–9 kg. NOT applied automatically:
   * physics uses Environment.bikeMassKg. The UI can offer this as a default.
   */
  typicalMassKg: number;
}

/**
 * ⚠️ Frame deltas are the most contested numbers in this file. Manufacturer
 * claims for aero road frames are large. Independent tunnel tests of complete
 * bikes with a dummy rider typically put aero road bikes roughly 10–20 W
 * ahead of round-tube bikes at 45 km/h. At 45 km/h and rho 1.225,
 * 1 W ≈ 0.00084 m², so that is ~0.008–0.017 m². Part of that saving is the
 * integrated cockpit and hidden cables, which this model folds into the frame.
 */
export const BIKE_TYPE: Record<BikeType, BikeTypeSpec> = {
  /** Kammtail tubes, dropped stays, integrated V-stem cockpit (think Cervélo S5). Lower half of the range. */
  aero: { cdaDelta: -0.01, typicalMassKg: 7.8 },
  /** ⚠️ Truncated-aero tubes on a lighter frame (think Cervélo Soloist). Guessed at half the aero saving. */
  allRound: { cdaDelta: -0.005, typicalMassKg: 7.4 },
  /** Baseline. Thin round tubes, conventional stem and bar (think Cervélo R5). */
  climbing: { cdaDelta: 0, typicalMassKg: 7.0 },
  /**
   * ⚠️ Taller head tube, wider tire clearance, fender mounts (think Cervélo
   * Caledonia). No good independent data; small penalty guessed at +0.003.
   */
  endurance: { cdaDelta: 0.003, typicalMassKg: 8.3 },
};

// ---------------------------------------------------------------------------
// CdA — wheels (m²). Per-wheel objects so a yaw-dependent drag curve can be
// added per wheel later without touching the composition logic in cda.ts.
// ---------------------------------------------------------------------------

export type WheelDepth = 'box' | 'mid' | 'deep' | 'disc';
export type FrontWheelDepth = Exclude<WheelDepth, 'disc'>;

export const FRONT_WHEEL_DEPTHS: readonly FrontWheelDepth[] = ['box', 'mid', 'deep'];
export const REAR_WHEEL_DEPTHS: readonly WheelDepth[] = ['box', 'mid', 'deep', 'disc'];

export interface WheelSpec {
  /** Human label for the UI. */
  label: string;
  /** Approximate rim depth in mm, for rendering. Disc = full radius. */
  depthMm: number;
  /** CdA delta from a box-section rim at zero yaw, m². */
  cdaDeltaZeroYaw: number;
  // TODO(yaw): add `cdaDeltaByYaw: Array<[yawDeg, delta]>`. Deep rims and
  // discs earn their real advantage at 5–15° yaw (the "sail effect").
}

/**
 * Spec: a deep front + rear pair saves roughly 0.005–0.010 m² vs box rims
 * at zero yaw. The front wheel sees clean air and matters more; the rear sits
 * in the wake of the seat tube and the rider's legs so its share is smaller.
 * Pair sums below: mid+mid 0.005, deep+deep 0.008, deep+disc 0.009.
 */
export const FRONT_WHEEL: Record<FrontWheelDepth, WheelSpec> = {
  box: { label: 'Box (~25 mm)', depthMm: 25, cdaDeltaZeroYaw: 0 },
  mid: { label: '40–50 mm', depthMm: 45, cdaDeltaZeroYaw: -0.003 },
  deep: { label: '60–80 mm', depthMm: 70, cdaDeltaZeroYaw: -0.005 },
};

export const REAR_WHEEL: Record<WheelDepth, WheelSpec> = {
  box: { label: 'Box (~25 mm)', depthMm: 25, cdaDeltaZeroYaw: 0 },
  mid: { label: '40–50 mm', depthMm: 45, cdaDeltaZeroYaw: -0.002 },
  deep: { label: '60–80 mm', depthMm: 70, cdaDeltaZeroYaw: -0.003 },
  /** ⚠️ Rear disc vs deep rear at zero yaw is a small step; ~0.001 more. */
  disc: { label: 'Disc', depthMm: 330, cdaDeltaZeroYaw: -0.004 },
};

// ---------------------------------------------------------------------------
// Tires. Width affects Crr primarily and CdA only slightly.
// ---------------------------------------------------------------------------

export type TireWidth = 23 | 25 | 28 | 32;

export const TIRE_WIDTHS: readonly TireWidth[] = [23, 25, 28, 32];

/**
 * ⚠️ CdA delta from 25 mm, m². Wider tires add frontal area and can spoil
 * rim aero ("rule of 105"). Wheel-maker tests quote a few watts at 40 km/h
 * per size step, i.e. ~0.001–0.002 m² per step.
 */
export const TIRE_WIDTH_CDA_DELTA: Record<TireWidth, number> = {
  23: -0.001,
  25: 0,
  28: 0.002,
  32: 0.004,
};

/**
 * ⚠️ Crr multiplier relative to 25 mm at sensible pressures on real roads.
 * Drum tests show wider tires roll slightly better at equal casing and
 * pressure (shorter, wider contact patch); on rough roads the gap grows
 * because wider tires run lower pressure and lose less to suspension losses.
 * The effect is a few percent, so this table is deliberately mild.
 */
export const TIRE_WIDTH_CRR_MULTIPLIER: Record<TireWidth, number> = {
  23: 1.03,
  25: 1.0,
  28: 0.98,
  32: 0.97,
};

// ---------------------------------------------------------------------------
// Crr — tire quality presets (dimensionless). Values at 25 mm.
// ---------------------------------------------------------------------------

export type TireQuality = 'racing' | 'training' | 'gravel';

export const TIRE_QUALITIES: readonly TireQuality[] = ['racing', 'training', 'gravel'];

export const TIRE_QUALITY_CRR: Record<TireQuality, number> = {
  /** Spec range 0.0030–0.0035 (GP5000 / Corsa Speed class on smooth road). */
  racing: 0.00325,
  /** Spec: ~0.0045 (puncture-resistant training tires). */
  training: 0.0045,
  /** Spec: ~0.006 (knobby / heavy-casing gravel tires on tarmac). */
  gravel: 0.006,
};

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

/** speedFromPower bisection tolerance, m/s (~0.004 km/h). */
export const SPEED_SOLVER_TOLERANCE_MS = 1e-3;

/** Hard cap on the solver's search bracket, m/s (≈360 km/h). */
export const SPEED_SOLVER_MAX_MS = 100;

/** Step used when walking down from the cap to bracket the largest root, m/s. */
export const SPEED_SOLVER_WALK_STEP_MS = 0.25;

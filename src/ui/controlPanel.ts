/**
 * Grouped controls (lil-gui). The panel edits AppState through the store and
 * shows solved values (speed when holding power, power when holding speed,
 * air density from altitude) as disabled read-outs.
 *
 * lil-gui binds to a plain object, so `view` holds values in display units;
 * onChange converts back to SI. A unit switch rebuilds the panel because
 * slider ranges and names change.
 */
import GUI, { type Controller } from 'lil-gui';
import {
  BIKE_TYPES,
  FRONT_WHEEL_DEPTHS,
  HELMETS,
  KITS,
  POSITIONS,
  REAR_WHEEL_DEPTHS,
  TIRE_QUALITIES,
  TIRE_WIDTHS,
  lbToKg,
  kmhToMs,
  mphToMs,
  type RiderConfig,
} from '../physics';
import { CAMERA_VIEWS, type CameraView } from '../scene';
import { withBikeType, type AppState, type Units } from './appState';
import { resolveRho, switchHold, type Evaluation } from './evaluate';
import { MASS_UNIT_LABEL, SPEED_UNIT_LABEL, toMassUnit, toSpeedUnit } from './format';
import {
  BIKE_TYPE_LABELS,
  FRONT_WHEEL_LABELS,
  HELMET_LABELS,
  KIT_LABELS,
  POSITION_LABELS,
  REAR_WHEEL_LABELS,
  TIRE_QUALITY_LABELS,
} from './labels';
import type { Store } from './store';

/** lil-gui dropdowns take { label: value }. */
function options<K extends string | number>(keys: readonly K[], labels: Record<string, string>): Record<string, K> {
  return Object.fromEntries(keys.map((k) => [labels[String(k)] ?? String(k), k]));
}

interface View {
  hold: AppState['hold'];
  speedUnit: Units['speed'];
  massUnit: Units['mass'];
  power: number;
  speed: number;
  riderMass: number;
  position: RiderConfig['position'];
  kit: RiderConfig['kit'];
  helmet: RiderConfig['helmet'];
  bikeType: RiderConfig['bikeType'];
  bikeMass: number;
  frontWheel: RiderConfig['frontWheel'];
  rearWheel: RiderConfig['rearWheel'];
  tireWidth: RiderConfig['tireWidthMm'];
  tireQuality: RiderConfig['tireQuality'];
  drivetrainLoss: number;
  headwind: number;
  grade: number;
  rhoSource: AppState['rhoSource'];
  altitude: number;
  temperature: number;
  rho: number;
  views: Record<CameraView, () => void>;
}

export class ControlPanel {
  private gui: GUI | null = null;
  private view!: View;
  private ctrl: Partial<Record<keyof View, Controller>> = {};
  private builtUnits: Units | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly store: Store<AppState>,
    private readonly onView: (view: CameraView) => void,
  ) {}

  get element(): HTMLElement | null {
    return this.gui?.domElement ?? null;
  }

  /** Push the latest state + solved values into the controls. */
  sync(state: AppState, ev: Evaluation): void {
    if (!this.builtUnits || this.builtUnits.speed !== state.units.speed || this.builtUnits.mass !== state.units.mass) {
      this.build(state, ev);
      return;
    }
    Object.assign(this.view, this.viewFor(state, ev));
    const holdingPower = state.hold === 'power';
    this.ctrl.power?.enable(holdingPower).name(holdingPower ? 'Power (W)' : 'Power needed (W)');
    this.ctrl.speed?.enable(!holdingPower).name(`${holdingPower ? 'Speed result' : 'Speed'} (${SPEED_UNIT_LABEL[state.units.speed]})`);
    const fromAltitude = state.rhoSource === 'altitude';
    this.ctrl.altitude?.enable(fromAltitude);
    this.ctrl.temperature?.enable(fromAltitude);
    this.ctrl.rho?.enable(!fromAltitude);
    for (const c of Object.values(this.ctrl)) c?.updateDisplay();
  }

  private viewFor(state: AppState, ev: Evaluation): Omit<View, 'views'> {
    const u = state.units;
    const c = state.config;
    return {
      hold: state.hold,
      speedUnit: u.speed,
      massUnit: u.mass,
      power: Math.round(ev.powerW),
      speed: Number(toSpeedUnit(ev.speedMs, u.speed).toFixed(1)),
      riderMass: Number(toMassUnit(state.riderMassKg, u.mass).toFixed(1)),
      position: c.position,
      kit: c.kit,
      helmet: c.helmet,
      bikeType: c.bikeType,
      bikeMass: Number(toMassUnit(state.bikeMassKg, u.mass).toFixed(2)),
      frontWheel: c.frontWheel,
      rearWheel: c.rearWheel,
      tireWidth: c.tireWidthMm,
      tireQuality: c.tireQuality,
      drivetrainLoss: state.drivetrainLossPct,
      headwind: state.headwindMs,
      grade: state.gradePct,
      rhoSource: state.rhoSource,
      altitude: state.altitudeM,
      temperature: state.temperatureC,
      rho: Number(resolveRho(state).toFixed(3)),
    };
  }

  private set(fn: (s: AppState) => AppState): void {
    this.store.update(fn);
  }

  private setConfig<K extends keyof RiderConfig>(key: K, value: RiderConfig[K]): void {
    this.set((s) => (s.config[key] === value ? s : { ...s, config: { ...s.config, [key]: value } }));
  }

  private build(state: AppState, ev: Evaluation): void {
    this.gui?.destroy();
    this.ctrl = {};
    this.builtUnits = { ...state.units };
    const su = state.units.speed;
    const mu = state.units.mass;
    const toMs = su === 'kmh' ? kmhToMs : mphToMs;
    const toKg = mu === 'kg' ? (v: number) => v : lbToKg;

    this.view = {
      ...this.viewFor(state, ev),
      views: Object.fromEntries(
        (Object.keys(CAMERA_VIEWS) as CameraView[]).map((v) => [v, () => this.onView(v)]),
      ) as Record<CameraView, () => void>,
    };
    const v = this.view;
    const gui = new GUI({ container: this.container, title: 'Setup', width: 300 });
    this.gui = gui;
    const c = this.ctrl;

    const ride = gui.addFolder('Ride');
    c.hold = ride
      .add(v, 'hold', { 'Hold power, solve speed': 'power', 'Hold speed, solve power': 'speed' })
      .name('Mode')
      .onChange((h: AppState['hold']) => this.set((s) => switchHold(s, h)));
    c.power = ride
      .add(v, 'power', 0, 700, 1)
      .name('Power (W)')
      .onChange((w: number) => this.set((s) => (s.hold === 'power' ? { ...s, targetPowerW: w } : s)));
    c.speed = ride
      .add(v, 'speed', 0, su === 'kmh' ? 70 : 45, 0.1)
      .name(`Speed (${SPEED_UNIT_LABEL[su]})`)
      .onChange((x: number) => this.set((s) => (s.hold === 'speed' ? { ...s, speedMs: toMs(x) } : s)));

    const rider = gui.addFolder('Rider');
    c.riderMass = rider
      .add(v, 'riderMass', mu === 'kg' ? 40 : 90, mu === 'kg' ? 130 : 285, mu === 'kg' ? 0.5 : 1)
      .name(`Rider mass (${MASS_UNIT_LABEL[mu]})`)
      .onChange((m: number) => this.set((s) => ({ ...s, riderMassKg: toKg(m) })));

    const position = gui.addFolder('Position');
    c.position = position
      .add(v, 'position', options(POSITIONS, POSITION_LABELS))
      .name('Position')
      .onChange((p: RiderConfig['position']) => this.setConfig('position', p));

    const kit = gui.addFolder('Kit');
    c.kit = kit
      .add(v, 'kit', options(KITS, KIT_LABELS))
      .name('Clothing')
      .onChange((k: RiderConfig['kit']) => this.setConfig('kit', k));
    c.helmet = kit
      .add(v, 'helmet', options(HELMETS, HELMET_LABELS))
      .name('Helmet')
      .onChange((h: RiderConfig['helmet']) => this.setConfig('helmet', h));

    const bike = gui.addFolder('Bike');
    c.bikeType = bike
      .add(v, 'bikeType', options(BIKE_TYPES, BIKE_TYPE_LABELS))
      .name('Frame')
      .onChange((t: RiderConfig['bikeType']) => this.set((s) => withBikeType(s, t)));
    c.bikeMass = bike
      .add(v, 'bikeMass', mu === 'kg' ? 5 : 11, mu === 'kg' ? 15 : 33, mu === 'kg' ? 0.1 : 0.2)
      .name(`Bike mass (${MASS_UNIT_LABEL[mu]})`)
      .onChange((m: number) => this.set((s) => ({ ...s, bikeMassKg: toKg(m) })));
    c.frontWheel = bike
      .add(v, 'frontWheel', options(FRONT_WHEEL_DEPTHS, FRONT_WHEEL_LABELS))
      .name('Front wheel')
      .onChange((w: RiderConfig['frontWheel']) => this.setConfig('frontWheel', w));
    c.rearWheel = bike
      .add(v, 'rearWheel', options(REAR_WHEEL_DEPTHS, REAR_WHEEL_LABELS))
      .name('Rear wheel')
      .onChange((w: RiderConfig['rearWheel']) => this.setConfig('rearWheel', w));
    c.tireWidth = bike
      .add(v, 'tireWidth', options(TIRE_WIDTHS, Object.fromEntries(TIRE_WIDTHS.map((w) => [String(w), `${w} mm`]))))
      .name('Tire width')
      .onChange((w: RiderConfig['tireWidthMm']) => this.setConfig('tireWidthMm', w));
    c.tireQuality = bike
      .add(v, 'tireQuality', options(TIRE_QUALITIES, TIRE_QUALITY_LABELS))
      .name('Tire type')
      .onChange((q: RiderConfig['tireQuality']) => this.setConfig('tireQuality', q));
    c.drivetrainLoss = bike
      .add(v, 'drivetrainLoss', 0, 10, 0.1)
      .name('Drivetrain loss (%)')
      .onChange((p: number) => this.set((s) => ({ ...s, drivetrainLossPct: p })));

    const env = gui.addFolder('Environment');
    c.headwind = env
      .add(v, 'headwind', -15, 15, 0.1)
      .name('Headwind (m/s)')
      .onChange((w: number) => this.set((s) => ({ ...s, headwindMs: w })));
    c.grade = env
      .add(v, 'grade', -15, 15, 0.1)
      .name('Grade (%)')
      .onChange((g: number) => this.set((s) => ({ ...s, gradePct: g })));
    c.rhoSource = env
      .add(v, 'rhoSource', { 'Set directly': 'manual', 'From altitude + temp': 'altitude' })
      .name('Air density')
      .onChange((r: AppState['rhoSource']) => this.set((s) => ({ ...s, rhoSource: r })));
    c.rho = env
      .add(v, 'rho', 0.8, 1.4, 0.001)
      .name('Density (kg/m³)')
      .onChange((r: number) => this.set((s) => (s.rhoSource === 'manual' ? { ...s, rhoManual: r } : s)));
    c.altitude = env
      .add(v, 'altitude', 0, 4000, 10)
      .name('Altitude (m)')
      .onChange((a: number) => this.set((s) => ({ ...s, altitudeM: a })));
    c.temperature = env
      .add(v, 'temperature', -10, 45, 1)
      .name('Temperature (°C)')
      .onChange((t: number) => this.set((s) => ({ ...s, temperatureC: t })));

    const units = gui.addFolder('Units & view');
    c.speedUnit = units
      .add(v, 'speedUnit', { 'km/h': 'kmh', mph: 'mph' })
      .name('Speed')
      .onChange((x: Units['speed']) => this.set((s) => ({ ...s, units: { ...s.units, speed: x } })));
    c.massUnit = units
      .add(v, 'massUnit', { kg: 'kg', lb: 'lb' })
      .name('Mass')
      .onChange((x: Units['mass']) => this.set((s) => ({ ...s, units: { ...s.units, mass: x } })));
    for (const key of Object.keys(CAMERA_VIEWS) as CameraView[]) {
      units.add(v.views, key).name(`Camera: ${CAMERA_VIEWS[key].label}`);
    }

    // Everything the user tunes often stays open; the rest starts folded.
    env.close();
    units.close();

    this.sync(state, ev);
  }
}

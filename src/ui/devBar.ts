/**
 * TEMPORARY checkpoint-2 controls: plain DOM, no dependencies. Enough to flip
 * through presets and equipment and see the geometry respond. Replaced by the
 * real grouped panel and readout in checkpoint 3.
 */
import {
  BIKE_TYPES,
  FRONT_WHEEL_DEPTHS,
  HELMETS,
  KITS,
  POSITIONS,
  REAR_WHEEL_DEPTHS,
  TIRE_WIDTHS,
  type RiderConfig,
} from '../physics';
import { CAMERA_VIEWS, type CameraView } from '../scene';
import {
  BIKE_TYPE_LABELS,
  FRONT_WHEEL_LABELS,
  HELMET_LABELS,
  KIT_LABELS,
  POSITION_LABELS,
  REAR_WHEEL_LABELS,
} from './labels';

export interface DevBarState {
  config: RiderConfig;
  speedKmh: number;
}

export function mountDevBar(
  root: HTMLElement,
  initial: DevBarState,
  onChange: (state: DevBarState) => void,
  onView: (view: CameraView) => void,
): void {
  const state: DevBarState = { config: { ...initial.config }, speedKmh: initial.speedKmh };
  const bar = document.createElement('div');
  bar.className = 'dev-bar';
  root.appendChild(bar);

  const row = (label: string, control: HTMLElement) => {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    l.append(span, control);
    bar.appendChild(l);
  };

  const select = <K extends keyof RiderConfig>(
    key: K,
    label: string,
    options: readonly RiderConfig[K][],
    names: Record<string, string>,
  ) => {
    const el = document.createElement('select');
    el.dataset.key = key;
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = String(o);
      opt.textContent = names[String(o)] ?? String(o);
      el.appendChild(opt);
    }
    el.value = String(state.config[key]);
    el.addEventListener('change', () => {
      const match = options.find((o) => String(o) === el.value);
      if (match === undefined) return;
      state.config = { ...state.config, [key]: match };
      onChange({ ...state });
    });
    row(label, el);
  };

  const title = document.createElement('div');
  title.className = 'dev-bar-title';
  title.textContent = 'Checkpoint 2 dev controls';
  bar.appendChild(title);

  select('bikeType', 'Bike', BIKE_TYPES, BIKE_TYPE_LABELS);
  select('position', 'Position', POSITIONS, POSITION_LABELS);
  select('kit', 'Kit', KITS, KIT_LABELS);
  select('helmet', 'Helmet', HELMETS, HELMET_LABELS);
  select('frontWheel', 'Front wheel', FRONT_WHEEL_DEPTHS, FRONT_WHEEL_LABELS);
  select('rearWheel', 'Rear wheel', REAR_WHEEL_DEPTHS, REAR_WHEEL_LABELS);
  select(
    'tireWidthMm',
    'Tire width',
    TIRE_WIDTHS,
    Object.fromEntries(TIRE_WIDTHS.map((w) => [String(w), `${w} mm`])),
  );

  const speed = document.createElement('input');
  speed.type = 'range';
  speed.min = '0';
  speed.max = '60';
  speed.step = '1';
  speed.value = String(state.speedKmh);
  speed.dataset.key = 'speed';
  const speedOut = document.createElement('output');
  speedOut.textContent = `${state.speedKmh} km/h`;
  speed.addEventListener('input', () => {
    state.speedKmh = Number(speed.value);
    speedOut.textContent = `${state.speedKmh} km/h`;
    onChange({ ...state });
  });
  const speedWrap = document.createElement('div');
  speedWrap.className = 'dev-bar-range';
  speedWrap.append(speed, speedOut);
  row('Speed', speedWrap);

  const views = document.createElement('div');
  views.className = 'dev-bar-views';
  for (const [key, v] of Object.entries(CAMERA_VIEWS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = v.label;
    b.dataset.view = key;
    b.addEventListener('click', () => onView(key as CameraView));
    views.appendChild(b);
  }
  bar.appendChild(views);
}

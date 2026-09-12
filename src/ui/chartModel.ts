/**
 * Data for the power-vs-speed chart. Pure: sampling, axis ranges and ticks.
 * The SVG renderer (powerChart.ts) only draws what this returns.
 */
import { coefficientsFor, kmhToMs, mphToMs, powerFromSpeed } from '../physics';
import { currentSetup, type AppState, type Setup } from './appState';
import { rideConditions, type Evaluation } from './evaluate';
import { toSpeedUnit } from './format';

export interface ChartPoint {
  /** Speed in the display unit (km/h or mph). */
  speed: number;
  powerW: number;
}

export interface ChartSeries {
  key: 'current' | 'baseline';
  label: string;
  points: ChartPoint[];
}

export interface ChartModel {
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  series: ChartSeries[];
  /** Where the rider is riding now, on each curve. */
  markers: Array<{ key: ChartSeries['key']; point: ChartPoint }>;
}

const SAMPLES = 72;

/** Nearest of 1, 2, 2.5, 5 or 10 × 10^n. */
export function niceStep(roughStep: number): number {
  const exp = Math.floor(Math.log10(roughStep));
  const f = roughStep / 10 ** exp;
  const nice = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return nice * 10 ** exp;
}

/** Evenly spaced round ticks covering [min, max], always including 0 when in range. */
export function niceTicks(min: number, max: number, target = 5): { ticks: number[]; min: number; max: number } {
  const step = niceStep(Math.max(1e-9, (max - min) / target));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Number(v.toFixed(6)));
  return { ticks, min: lo, max: hi };
}

/** Power needed at each sampled speed for one setup. */
export function powerCurve(state: AppState, setup: Setup, xMax: number): ChartPoint[] {
  const base = rideConditions(state, setup);
  const coeffs = coefficientsFor(setup.config);
  const toMs = state.units.speed === 'kmh' ? kmhToMs : mphToMs;
  const points: ChartPoint[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const speed = (xMax * i) / SAMPLES;
    points.push({ speed, powerW: powerFromSpeed({ ...base, speedMs: toMs(speed) }, coeffs).total });
  }
  return points;
}

export function buildChartModel(state: AppState, current: Evaluation, baseline: Evaluation | null): ChartModel {
  const unit = state.units.speed;
  const floor = unit === 'kmh' ? 40 : 25;
  const fastest = Math.max(current.speedMs, baseline?.speedMs ?? 0);
  // Leave headroom past the operating point so the curve's bend is visible.
  const x = niceTicks(0, Math.max(floor, toSpeedUnit(fastest, unit) * 1.3), 5);

  const series: ChartSeries[] = [{ key: 'current', label: 'Current', points: powerCurve(state, currentSetup(state), x.max) }];
  if (state.baseline && baseline) {
    series.push({ key: 'baseline', label: 'Baseline', points: powerCurve(state, state.baseline, x.max) });
  }

  const all = series.flatMap((s) => s.points.map((p) => p.powerW));
  const y = niceTicks(Math.min(0, ...all), Math.max(50, ...all), 4);

  const markers: ChartModel['markers'] = [
    { key: 'current', point: { speed: toSpeedUnit(current.speedMs, unit), powerW: current.powerW } },
  ];
  if (state.baseline && baseline) {
    markers.push({ key: 'baseline', point: { speed: toSpeedUnit(baseline.speedMs, unit), powerW: baseline.powerW } });
  }

  return { xMax: x.max, yMin: y.min, yMax: y.max, xTicks: x.ticks, yTicks: y.ticks, series, markers };
}

/** Linear interpolation of a sampled curve at a speed. */
export function valueAt(points: ChartPoint[], speed: number): number {
  if (points.length === 0) return 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (speed <= first.speed) return first.powerW;
  if (speed >= last.speed) return last.powerW;
  const step = last.speed / (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(speed / step));
  const a = points[i]!;
  const b = points[i + 1]!;
  return a.powerW + ((b.powerW - a.powerW) * (speed - a.speed)) / (b.speed - a.speed);
}

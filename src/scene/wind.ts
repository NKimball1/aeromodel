import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { PALETTE } from './materials';

const BASE_COLOR = new Color(PALETTE.wind);

/**
 * Visual tuning for the airflow. Illustrative only: nothing here is physics.
 */
export const WIND_VISUAL = {
  count: 1700,
  /** Upstream / downstream edges of the particle volume, metres. */
  xMax: 3.6,
  xMin: -5.2,
  yMin: 0.04,
  yMax: 2.1,
  zHalf: 1.3,
  /** Displayed particle speed per m/s of real airspeed. Real speed is too fast to read. */
  speedScale: 0.32,
  /** Streak length = displayed speed × this, seconds. */
  trailSeconds: 0.12,
  /** Distance over which particles fade in/out at the volume ends, metres. */
  edgeFade: 0.8,
  headAlpha: 0.55,
};

/**
 * Air particles flowing +X → −X as short fading streaks. At this checkpoint
 * the flow is uniform (no wake, no deflection); `update` is where both will
 * plug in.
 */
export class WindField {
  readonly object: LineSegments;
  private readonly heads: Float32Array;
  private readonly jitter: Float32Array;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: BufferGeometry;

  constructor(private readonly cfg = WIND_VISUAL) {
    const n = cfg.count;
    this.heads = new Float32Array(n * 3);
    this.jitter = new Float32Array(n);
    this.positions = new Float32Array(n * 6);
    this.colors = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      this.respawn(i, cfg.xMin + Math.random() * (cfg.xMax - cfg.xMin));
      this.jitter[i] = 0.88 + Math.random() * 0.24;
    }

    this.geometry = new BufferGeometry();
    const pos = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    const col = new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', pos);
    this.geometry.setAttribute('color', col);

    const material = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    this.object = new LineSegments(this.geometry, material);
    this.object.frustumCulled = false;
  }

  /** @param airSpeedMs apparent wind along −X; negative means air moving +X (tailwind faster than rider). */
  update(dt: number, airSpeedMs: number): void {
    const { cfg, heads, jitter, positions, colors } = this;
    const base = BASE_COLOR;
    const n = cfg.count;
    const flow = -airSpeedMs * cfg.speedScale;
    const span = cfg.xMax - cfg.xMin;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const vx = flow * jitter[i]!;
      let x = heads[i3]! + vx * dt;
      if (x < cfg.xMin) {
        this.respawn(i, x + span);
        x = heads[i3]!;
      } else if (x > cfg.xMax) {
        this.respawn(i, x - span);
        x = heads[i3]!;
      } else {
        heads[i3] = x;
      }
      const y = heads[i3 + 1]!;
      const z = heads[i3 + 2]!;

      // Tail trails upstream of the head. Keep a minimum so still air shows dots.
      const trail = -vx * cfg.trailSeconds;
      const tailX = x + (Math.abs(trail) < 0.015 ? 0.015 : trail);

      const i6 = i * 6;
      positions[i6] = x;
      positions[i6 + 1] = y;
      positions[i6 + 2] = z;
      positions[i6 + 3] = tailX;
      positions[i6 + 4] = y;
      positions[i6 + 5] = z;

      const fade = Math.min(1, (x - cfg.xMin) / cfg.edgeFade, (cfg.xMax - x) / cfg.edgeFade);
      const alpha = cfg.headAlpha * Math.max(0, fade);
      const i8 = i * 8;
      colors[i8] = base.r;
      colors[i8 + 1] = base.g;
      colors[i8 + 2] = base.b;
      colors[i8 + 3] = alpha;
      colors[i8 + 4] = base.r;
      colors[i8 + 5] = base.g;
      colors[i8 + 6] = base.b;
      colors[i8 + 7] = 0;
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
  }

  private respawn(i: number, x: number): void {
    const { cfg, heads } = this;
    const i3 = i * 3;
    heads[i3] = x;
    heads[i3 + 1] = cfg.yMin + Math.random() * (cfg.yMax - cfg.yMin);
    // Denser near the centreline, where the rider is.
    const u = Math.random() * 2 - 1;
    heads[i3 + 2] = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * cfg.zHalf;
  }
}

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { PALETTE } from './materials';
import { SPEED_VISUAL } from './speedVisuals';
import { deflect, type Capsule, type Deflected } from './deflection';
import { hotspotStrength, type Emitter } from './hotspots';
import { wakeStrength, type WakeShape } from './wake';

const FREE_COLOR = new Color(PALETTE.wind);
const WAKE_COLOR = new Color(PALETTE.wake);
const scratch: Deflected = { x: 0, y: 0, z: 0, amount: 0 };

/**
 * Visual tuning for the airflow. Illustrative only: nothing here is physics.
 */
export const WIND_VISUAL = {
  count: 1700,
  /** Upstream / downstream edges of the particle volume, metres. */
  xMax: 3.6,
  xMin: -5.6,
  yMin: 0.04,
  yMax: 2.1,
  zHalf: 1.3,
  /** Distance over which particles fade in/out at the volume ends, metres. */
  edgeFade: 0.8,
  headAlpha: 0.55,
  /** Extra opacity for streaks inside the wake (×, at full strength and drag). */
  wakeAlphaBoost: 0.8,
  /** Swirl amplitude at full wake strength and chaos, metres. */
  swirlAmplitude: 0.34,
  /** Swirl angular frequency range, rad/s at 30 km/h, from calm to chaotic wake. */
  swirlFrequency: [2.5, 11] as const,
};

/**
 * Air particles flowing +X → −X as short fading streaks. Streaks that pass
 * through the wake slow down (velocity deficit), swirl (turbulence) and shift
 * colour toward the wake colour, so the wake is visible in the flow itself.
 * Both ends of every streak are pushed around the rider's body capsules, so
 * streaks bend around the rider instead of passing through.
 */
export class WindField {
  readonly object: LineSegments;
  private readonly heads: Float32Array;
  private readonly jitter: Float32Array;
  private readonly phase: Float32Array;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: BufferGeometry;
  private time = 0;

  constructor(private readonly cfg = WIND_VISUAL) {
    const n = cfg.count;
    this.heads = new Float32Array(n * 3);
    this.jitter = new Float32Array(n);
    this.phase = new Float32Array(n * 2);
    this.positions = new Float32Array(n * 6);
    this.colors = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      this.respawn(i, cfg.xMin + Math.random() * (cfg.xMax - cfg.xMin));
      this.jitter[i] = 0.88 + Math.random() * 0.24;
      this.phase[i * 2] = Math.random() * Math.PI * 2;
      this.phase[i * 2 + 1] = Math.random() * Math.PI * 2;
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

  /**
   * @param airSpeedMs apparent wind along −X; negative means air moving +X (tailwind faster than rider).
   * @param wake current wake shape, or null for undisturbed flow.
   * @param colliders body capsules to deflect around; empty for no deflection.
   * @param emitters per-component turbulence plumes (helmet, wheels, ...).
   */
  update(
    dt: number,
    airSpeedMs: number,
    wake: WakeShape | null,
    colliders: readonly Capsule[] = [],
    emitters: readonly Emitter[] = [],
  ): void {
    const { cfg, heads, jitter, phase, positions, colors } = this;
    const n = cfg.count;
    const flow = -airSpeedMs * SPEED_VISUAL.timeScale;
    // Streaks lengthen with airspeed on top of moving faster: length ~ speed².
    const trailFactor = Math.max(SPEED_VISUAL.minTrailFactor, Math.abs(airSpeedMs) / SPEED_VISUAL.trailReferenceMs);
    const trailSeconds = SPEED_VISUAL.trailSeconds * trailFactor;
    const span = cfg.xMax - cfg.xMin;

    // Turbulence churns faster in faster air.
    const speedRatio = Math.min(1.8, Math.max(0.3, Math.abs(airSpeedMs) / SPEED_VISUAL.trailReferenceMs));
    this.time += dt * speedRatio;
    const chaos = wake?.chaos ?? 0;
    const level = wake?.level ?? 0;
    const deficit = wake?.deficit ?? 0;
    const omega = cfg.swirlFrequency[0] + (cfg.swirlFrequency[1] - cfg.swirlFrequency[0]) * chaos;
    const amplitude = cfg.swirlAmplitude * chaos;
    const t = this.time;
    const tTail = t - trailSeconds * speedRatio;
    // Long fast streaks overlap into a curtain; thin them out as they lengthen.
    const densityFade = 1 / Math.sqrt(Math.max(1, trailFactor));

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const hx = heads[i3]!;
      const hy = heads[i3 + 1]!;
      const hz = heads[i3 + 2]!;
      const sGlobal = wake ? wakeStrength(wake, hx, hy, hz) : 0;
      // Local plumes: each component's own dirty air, strong enough to see on its own.
      const local = emitters.length ? hotspotStrength(emitters, hx, hy, hz) : { strength: 0, level: 0 };
      const presence = wake?.presence ?? 1;
      const sLocal = local.strength * presence;
      const s = Math.max(sGlobal, sLocal);

      const vx = flow * jitter[i]! * (1 - Math.max(deficit * sGlobal, 0.7 * sLocal));
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
      const y0 = heads[i3 + 1]!;
      const z0 = heads[i3 + 2]!;

      // Tail trails upstream of the head. Keep a minimum so still air shows dots.
      const trail = -vx * trailSeconds;
      const tailX = x + (Math.abs(trail) < 0.015 ? 0.015 : trail);

      // Turbulent swirl: the offset depends on x and time, so head and tail
      // land in different places and the streak kinks inside the wake.
      const p1 = phase[i * 2]!;
      const p2 = phase[i * 2 + 1]!;
      const sTailGlobal = sGlobal > 0 && wake ? wakeStrength(wake, tailX, y0, z0) : 0;
      const sTailLocal = sLocal > 0 ? hotspotStrength(emitters, tailX, y0, z0).strength * presence : 0;
      // Local plumes churn hard regardless of the overall drag level.
      const aHead = Math.max(amplitude * sGlobal, cfg.swirlAmplitude * 1.2 * sLocal);
      const aTail = Math.max(amplitude * sTailGlobal, cfg.swirlAmplitude * 1.2 * sTailLocal);
      const omegaHere = sLocal > sGlobal ? cfg.swirlFrequency[1] * (0.6 + 0.4 * local.level) : omega;

      const i6 = i * 6;
      deflect(
        colliders,
        x,
        y0 + aHead * Math.sin(omegaHere * t + p1 + x * 3.1),
        z0 + aHead * Math.cos(omegaHere * 0.83 * t + p2 + x * 2.3),
        scratch,
      );
      positions[i6] = scratch.x;
      positions[i6 + 1] = scratch.y;
      positions[i6 + 2] = scratch.z;
      deflect(
        colliders,
        tailX,
        y0 + aTail * Math.sin(omegaHere * tTail + p1 + tailX * 3.1),
        z0 + aTail * Math.cos(omegaHere * 0.83 * tTail + p2 + tailX * 2.3),
        scratch,
      );
      positions[i6 + 3] = scratch.x;
      positions[i6 + 4] = scratch.y;
      positions[i6 + 5] = scratch.z;

      // Colour and opacity shift toward the wake colour with local strength and overall drag.
      const fade = Math.min(1, (x - cfg.xMin) / cfg.edgeFade, (cfg.xMax - x) / cfg.edgeFade);
      const tint = Math.min(1, Math.max(sGlobal * (0.45 + 0.55 * level) * 1.4, sLocal * 1.6));
      const alphaBoost = Math.max(cfg.wakeAlphaBoost * sGlobal * level, 1.2 * sLocal);
      const alpha = Math.min(1, cfg.headAlpha * densityFade * Math.max(0, fade) * (1 + alphaBoost));
      const r = FREE_COLOR.r + (WAKE_COLOR.r - FREE_COLOR.r) * tint;
      const g = FREE_COLOR.g + (WAKE_COLOR.g - FREE_COLOR.g) * tint;
      const b = FREE_COLOR.b + (WAKE_COLOR.b - FREE_COLOR.b) * tint;
      const i8 = i * 8;
      colors[i8] = r;
      colors[i8 + 1] = g;
      colors[i8 + 2] = b;
      colors[i8 + 3] = alpha;
      colors[i8 + 4] = r;
      colors[i8 + 5] = g;
      colors[i8 + 6] = b;
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

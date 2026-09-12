import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, type ShaderMaterial } from 'three';
import { HOTSPOT_KEYS, emitterRadius, type Emitter, type HotspotKey } from './hotspots';
import { SPEED_VISUAL } from './speedVisuals';
import { createSmokeMaterial, smokeScale } from './wakeSmoke';

export const HOTSPOT_SMOKE_VISUAL = {
  /** Puffs per component at level 1. Fewer as the level drops; none when clean. */
  poolPerEmitter: 260,
  /** Puff diameter at the emitter and at the plume's end, metres (× level factor). */
  size: [0.05, 0.3] as const,
  /** Peak opacity at level 1. Scales with level² so a clean part is truly clean. */
  opacity: 0.75,
  /** Drift speed as a fraction of airspeed: dirty air is slow air. */
  drift: [0.35, 0.8] as const,
  /** Swirl around the plume axis, rad/s at level 1. */
  swirl: 9,
  /** Random jitter amplitude at level 1, as a fraction of the plume radius. */
  jitter: 0.35,
};

/**
 * Smoke plumes shed from individual components (helmet, kit, frame, wheels,
 * tires). One pool per component; how many puffs are alive, how big, how
 * opaque and how violently they swirl all follow that component's level.
 */
export class HotspotSmoke {
  readonly object: Points;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly travel: Float32Array;
  private readonly radius: Float32Array;
  private readonly angle: Float32Array;
  private readonly speed: Float32Array;
  private readonly spin: Float32Array;
  private readonly phase: Float32Array;
  private time = 0;

  constructor(private readonly cfg = HOTSPOT_SMOKE_VISUAL) {
    const n = cfg.poolPerEmitter * HOTSPOT_KEYS.length;
    this.positions = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.alphas = new Float32Array(n);
    this.travel = new Float32Array(n);
    this.radius = new Float32Array(n);
    this.angle = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) this.respawn(i, Math.random());

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1).setUsage(DynamicDrawUsage));
    this.material = createSmokeMaterial();
    this.object = new Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
  }

  setScale(drawingBufferHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale!.value = smokeScale(drawingBufferHeight, fovDeg);
  }

  /** @param presence 0..1 low-airspeed fade shared with the main wake. */
  update(dt: number, airSpeedMs: number, emitters: readonly Emitter[], presence: number): void {
    const { cfg } = this;
    const pool = cfg.poolPerEmitter;
    const byKey = new Map<HotspotKey, Emitter>(emitters.map((e) => [e.key, e]));
    const air = Math.abs(airSpeedMs) * SPEED_VISUAL.timeScale;
    this.time += dt;

    HOTSPOT_KEYS.forEach((key, k) => {
      const e = byKey.get(key);
      const start = k * pool;
      const level = e ? e.level : 0;
      // Puff count grows with level; opacity with level² so clean parts go quiet fast.
      const active = e ? Math.round(pool * (0.15 + 0.85 * level)) : 0;
      const opacity = cfg.opacity * level * level * presence;
      const sizeFactor = 0.5 + 0.9 * level;

      for (let j = 0; j < pool; j++) {
        const i = start + j;
        if (!e || j >= active || opacity <= 0.002) {
          this.alphas[i] = 0;
          continue;
        }
        this.travel[i] = this.travel[i]! + air * this.speed[i]! * dt;
        let along = this.travel[i]! / e.length;
        if (along >= 1) {
          this.respawn(i, 0);
          along = 0;
        }
        this.angle[i] = this.angle[i]! + this.spin[i]! * cfg.swirl * level * dt;

        const r = emitterRadius(e, along) * this.radius[i]!;
        const wobble = cfg.jitter * level * emitterRadius(e, along);
        const ph = this.phase[i]!;
        const i3 = i * 3;
        this.positions[i3] = e.x - this.travel[i]!;
        this.positions[i3 + 1] = e.y + r * Math.sin(this.angle[i]!) + wobble * Math.sin(this.time * 7.3 + ph);
        this.positions[i3 + 2] = e.z + r * Math.cos(this.angle[i]!) + wobble * Math.cos(this.time * 6.1 + ph * 1.7);

        this.sizes[i] = (cfg.size[0] + (cfg.size[1] - cfg.size[0]) * along) * sizeFactor;
        const fadeIn = Math.min(1, along / 0.05);
        const fadeOut = Math.pow(1 - along, 1.2);
        this.alphas[i] = opacity * fadeIn * fadeOut;
      }
    });

    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.aSize!.needsUpdate = true;
    this.geometry.attributes.aAlpha!.needsUpdate = true;
  }

  private respawn(i: number, along: number): void {
    const [lo, hi] = this.cfg.drift;
    // `along` here is a travel fraction guess for the first frame; the real
    // length is applied on update.
    this.travel[i] = along;
    this.radius[i] = Math.sqrt(Math.random());
    this.angle[i] = Math.random() * Math.PI * 2;
    this.speed[i] = lo + Math.random() * (hi - lo);
    this.spin[i] = Math.random() < 0.5 ? -1 : 1;
    this.phase[i] = Math.random() * Math.PI * 2;
  }
}

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import { PALETTE } from './materials';
import { SPEED_VISUAL } from './speedVisuals';
import { wakeRadii, type WakeShape } from './wake';

export const SMOKE_VISUAL = {
  /** Pool size; how many are alive scales with drag level. */
  maxCount: 900,
  /** Fraction of the pool alive at drag level 0 and 1. */
  activeFraction: [0.3, 1] as const,
  /** Puff diameter at the rider and at the far end of the wake, metres. */
  size: [0.07, 0.42] as const,
  /** Puff speed as a fraction of the (deficit-reduced) wake speed, randomised. */
  speedJitter: [0.55, 1.1] as const,
  /** Swirl around the wake axis, rad/s at full chaos. */
  swirl: 5.5,
};

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5 || vAlpha <= 0.001) discard;
    float soft = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(uColor, vAlpha * soft * soft);
    #include <colorspace_fragment>
  }
`;

/** Soft round sprites with per-point size (metres) and alpha. Shared by all smoke. */
export function createSmokeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(PALETTE.wake) }, uScale: { value: 400 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
}

/** Pixels per metre at unit depth: drawing-buffer height / (2·tan(fov/2)). */
export function smokeScale(drawingBufferHeight: number, fovDeg: number): number {
  return drawingBufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * Soft smoke puffs shed from the rider's back. They drift downstream at the
 * wake's reduced speed, swirl around the wake axis, grow and fade out by the
 * end of the wake. More of them, bigger and more opaque, as drag rises.
 */
export class WakeSmoke {
  readonly object: Points;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  /** Per puff: travelled distance, radial position (0..1), angle, speed factor, swirl direction. */
  private readonly travel: Float32Array;
  private readonly radius: Float32Array;
  private readonly angle: Float32Array;
  private readonly speed: Float32Array;
  private readonly spin: Float32Array;

  constructor(private readonly cfg = SMOKE_VISUAL) {
    const n = cfg.maxCount;
    this.positions = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.alphas = new Float32Array(n);
    this.travel = new Float32Array(n);
    this.radius = new Float32Array(n);
    this.angle = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.spin = new Float32Array(n);
    // Start puffs spread along a nominal wake so the first frame isn't empty.
    for (let i = 0; i < n; i++) this.respawn(i, Math.random() * 3);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1).setUsage(DynamicDrawUsage));

    this.material = createSmokeMaterial();
    this.object = new Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  setScale(drawingBufferHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale!.value = smokeScale(drawingBufferHeight, fovDeg);
  }

  update(dt: number, airSpeedMs: number, wake: WakeShape): void {
    const { cfg } = this;
    const n = cfg.maxCount;
    const active = Math.round(
      n * (cfg.activeFraction[0] + (cfg.activeFraction[1] - cfg.activeFraction[0]) * wake.level),
    );
    const wakeSpeed = Math.abs(airSpeedMs) * SPEED_VISUAL.timeScale * (1 - wake.deficit * 0.75);
    const swirl = cfg.swirl * wake.chaos;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      if (i >= active) {
        this.alphas[i] = 0;
        continue;
      }
      this.travel[i] = this.travel[i]! + wakeSpeed * this.speed[i]! * dt;
      let along = this.travel[i]! / wake.length;
      if (along >= 1) {
        this.respawn(i, 0);
        along = 0;
      }
      this.angle[i] = this.angle[i]! + this.spin[i]! * swirl * dt;

      const { ry, rz } = wakeRadii(wake, along);
      const r = this.radius[i]! * (0.35 + 0.65 * Math.sqrt(along));
      this.positions[i3] = wake.originX - this.travel[i]!;
      this.positions[i3 + 1] = wake.centerY + ry * r * Math.sin(this.angle[i]!);
      this.positions[i3 + 2] = rz * r * Math.cos(this.angle[i]!);

      this.sizes[i] = (cfg.size[0] + (cfg.size[1] - cfg.size[0]) * along) * (0.6 + 0.6 * wake.level);
      const fadeIn = Math.min(1, along / 0.06);
      const fadeOut = Math.pow(1 - along, 1.3);
      this.alphas[i] = wake.opacity * fadeIn * fadeOut * (0.55 + 0.45 * (1 - r));
    }

    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.aSize!.needsUpdate = true;
    this.geometry.attributes.aAlpha!.needsUpdate = true;
  }

  private respawn(i: number, travel: number): void {
    const [lo, hi] = this.cfg.speedJitter;
    this.travel[i] = travel;
    // sqrt for an even spread over the disc rather than bunching at the centre.
    this.radius[i] = Math.sqrt(Math.random());
    this.angle[i] = Math.random() * Math.PI * 2;
    this.speed[i] = lo + Math.random() * (hi - lo);
    this.spin[i] = Math.random() < 0.5 ? -1 : 1;
  }
}

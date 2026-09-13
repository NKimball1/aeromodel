import {
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  NormalBlending,
  ShaderMaterial,
} from 'three';

/**
 * Renders air streaks as camera-facing ribbons with real width, a soft edge
 * and a tail that fades out, instead of 1-pixel GL lines. One instanced draw:
 * each instance is a head point, a tail point, a colour and an alpha.
 *
 * `positions` is laid out [hx, hy, hz, tx, ty, tz] per streak and `colors`
 * [r, g, b, a, r, g, b, 0] (the second half is ignored; kept so the
 * simulation code that fills it doesn't change).
 */
export class StreakMesh {
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly posBuffer: InstancedInterleavedBuffer;
  private readonly colBuffer: InstancedInterleavedBuffer;
  private readonly material: ShaderMaterial;

  constructor(count: number, positions: Float32Array, colors: Float32Array) {
    const g = new InstancedBufferGeometry();
    // A quad: t runs tail → head, side runs across the ribbon.
    g.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.posBuffer = new InstancedInterleavedBuffer(positions, 6).setUsage(DynamicDrawUsage);
    this.colBuffer = new InstancedInterleavedBuffer(colors, 8).setUsage(DynamicDrawUsage);
    g.setAttribute('aHead', new InterleavedBufferAttribute(this.posBuffer, 3, 0));
    g.setAttribute('aTail', new InterleavedBufferAttribute(this.posBuffer, 3, 3));
    g.setAttribute('aColor', new InterleavedBufferAttribute(this.colBuffer, 3, 0));
    g.setAttribute('aAlpha', new InterleavedBufferAttribute(this.colBuffer, 1, 3));
    g.instanceCount = count;
    this.geometry = g;

    this.material = new ShaderMaterial({
      uniforms: { uHalfWidth: { value: 0.0065 } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aHead;
        attribute vec3 aTail;
        attribute vec3 aColor;
        attribute float aAlpha;
        uniform float uHalfWidth;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          float t = position.x;
          float side = position.y;
          vec4 head = modelViewMatrix * vec4(aHead, 1.0);
          vec4 tail = modelViewMatrix * vec4(aTail, 1.0);
          vec4 p = mix(tail, head, t);
          vec2 dir = head.xy - tail.xy;
          float len = length(dir);
          vec2 perp = len > 1e-5 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
          // Slightly thinner toward the tail so the ribbon tapers.
          p.xy += perp * side * uHalfWidth * (0.55 + 0.45 * t);
          gl_Position = projectionMatrix * p;
          vColor = aColor;
          vAlpha = aAlpha;
          vUv = vec2(t, side);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          // Soft across the width, fading in from the tail, a brighter core near the head.
          float edge = 1.0 - smoothstep(0.35, 1.0, abs(vUv.y));
          float along = smoothstep(0.0, 0.7, vUv.x) * (1.0 - 0.35 * smoothstep(0.85, 1.0, vUv.x));
          float core = 1.0 - smoothstep(0.0, 0.5, abs(vUv.y));
          vec3 col = mix(vColor, vColor * 1.15 + 0.08, core * 0.5);
          gl_FragColor = vec4(col, vAlpha * edge * along);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Ribbon half-width in metres. */
  setHalfWidth(m: number): void {
    this.material.uniforms.uHalfWidth!.value = m;
  }

  markDirty(): void {
    this.posBuffer.needsUpdate = true;
    this.colBuffer.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

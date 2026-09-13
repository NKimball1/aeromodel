import {
  HalfFloatType,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const POST_VISUAL = {
  /** Ground-truth ambient occlusion: darkens creases and contact points (under the bike, between limbs). */
  ao: { radius: 0.35, thickness: 1, distanceExponent: 1.2, scale: 1.1, samples: 16, blendIntensity: 0.85 },
  /** Bloom only on the brightest highlights (clearcoat, alloy) so it never washes the scene. */
  bloom: { threshold: 0.92, strength: 0.18, radius: 0.5 },
  /** Anti-aliasing samples on the composer target (MSAA is lost otherwise). */
  msaaSamples: 4,
};

/**
 * GTAO renders the scene once more with an override material to get depth and
 * normals. Transparent effects (streak ribbons, smoke sprites, wheel blur)
 * must sit that render out: their custom shaders are bypassed, so their raw
 * geometry would land in the depth buffer as solid slabs.
 */
class MaskedGTAOPass extends GTAOPass {
  masked: Object3D[] = [];

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const wasVisible = this.masked.map((o) => o.visible);
    for (const o of this.masked) o.visible = false;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    this.masked.forEach((o, i) => (o.visible = wasVisible[i]!));
  }
}

/**
 * Render pipeline: scene → ambient occlusion → bloom → tone mapping + colour
 * space. Half-float target keeps highlights above 1.0 for bloom; MSAA on the
 * target keeps edges smooth.
 */
export class PostPipeline {
  private readonly composer: EffectComposer;
  private readonly gtao: MaskedGTAOPass;
  private readonly bloom: UnrealBloomPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: POST_VISUAL.msaaSamples });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new MaskedGTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    const { blendIntensity, ...aoParams } = POST_VISUAL.ao;
    this.gtao.updateGtaoMaterial(aoParams);
    this.gtao.blendIntensity = blendIntensity;
    this.composer.addPass(this.gtao);

    const b = POST_VISUAL.bloom;
    this.bloom = new UnrealBloomPass(size, b.strength, b.radius, b.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Objects the ambient-occlusion depth pass must ignore. */
  excludeFromAO(...objects: Object3D[]): void {
    this.gtao.masked.push(...objects);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.gtao.dispose();
    this.bloom.dispose();
  }
}

import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraView = 'side' | 'threeQuarter' | 'rearWake';

export const CAMERA_VIEWS: Record<CameraView, { label: string; position: Vector3; target: Vector3 }> = {
  side: { label: 'Side', position: new Vector3(0.1, 1.05, 4.3), target: new Vector3(0.05, 0.85, 0) },
  threeQuarter: { label: '¾ front', position: new Vector3(3.0, 1.55, 2.9), target: new Vector3(0.05, 0.85, 0) },
  rearWake: { label: 'Rear / wake', position: new Vector3(-4.6, 1.9, 2.1), target: new Vector3(-0.7, 0.85, 0) },
};

const TRANSITION_SECONDS = 0.8;
/** Presets are framed for this aspect ratio of the free (unpanelled) area; narrower views back the camera off. */
const DESIGN_ASPECT = 1.5;
const MAX_PULLBACK = 1.8;

/** Orbit camera with animated jumps between preset views. */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private transition: { fromPos: Vector3; fromTarget: Vector3; toPos: Vector3; toTarget: Vector3; t: number } | null = null;
  private view: CameraView;
  private pullback = 1;
  /** True once the user orbits; stops resizes from snapping the camera back to the preset. */
  private userMoved = false;

  constructor(domElement: HTMLElement, initial: CameraView) {
    this.camera = new PerspectiveCamera(40, 1, 0.05, 60);
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    // A drag cancels any in-flight preset transition.
    this.controls.addEventListener('start', () => {
      this.transition = null;
      this.userMoved = true;
    });

    this.view = initial;
    this.snapToView();
  }

  setView(view: CameraView): void {
    this.view = view;
    this.userMoved = false;
    const dest = this.presetPose(view);
    this.transition = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: dest.position,
      toTarget: dest.target,
      t: 0,
    };
  }

  /**
   * @param aspect full canvas aspect
   * @param freeAspect aspect of the area not covered by panels, used to decide how far to back off
   */
  setAspect(aspect: number, freeAspect = aspect): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // Square root: backing off fully for the narrow width over-shrinks the rider vertically.
    const pullback = Math.min(MAX_PULLBACK, Math.max(1, Math.sqrt(DESIGN_ASPECT / freeAspect)));
    if (Math.abs(pullback - this.pullback) < 1e-3) return;
    this.pullback = pullback;
    if (!this.userMoved && !this.transition) this.snapToView();
  }

  private presetPose(view: CameraView): { position: Vector3; target: Vector3 } {
    const v = CAMERA_VIEWS[view];
    const position = v.target.clone().add(v.position.clone().sub(v.target).multiplyScalar(this.pullback));
    return { position, target: v.target.clone() };
  }

  private snapToView(): void {
    const p = this.presetPose(this.view);
    this.camera.position.copy(p.position);
    this.controls.target.copy(p.target);
    this.controls.update();
  }

  update(dt: number): void {
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / TRANSITION_SECONDS);
      const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tr.fromPos, tr.toPos, e);
      this.controls.target.lerpVectors(tr.fromTarget, tr.toTarget, e);
      if (tr.t >= 1) this.transition = null;
    }
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}

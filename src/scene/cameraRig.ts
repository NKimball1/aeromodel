import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraView = 'side' | 'threeQuarter' | 'rearWake';

export const CAMERA_VIEWS: Record<CameraView, { label: string; position: Vector3; target: Vector3 }> = {
  side: { label: 'Side', position: new Vector3(0.1, 1.05, 4.3), target: new Vector3(0.05, 0.85, 0) },
  threeQuarter: { label: '¾ front', position: new Vector3(3.0, 1.55, 2.9), target: new Vector3(0.05, 0.85, 0) },
  rearWake: { label: 'Rear / wake', position: new Vector3(-4.6, 1.9, 2.1), target: new Vector3(-0.7, 0.85, 0) },
};

const TRANSITION_SECONDS = 0.8;

/** Orbit camera with animated jumps between preset views. */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private transition: { fromPos: Vector3; fromTarget: Vector3; to: CameraView; t: number } | null = null;

  constructor(domElement: HTMLElement, initial: CameraView) {
    this.camera = new PerspectiveCamera(40, 1, 0.05, 60);
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    // A drag cancels any in-flight preset transition.
    this.controls.addEventListener('start', () => (this.transition = null));

    const v = CAMERA_VIEWS[initial];
    this.camera.position.copy(v.position);
    this.controls.target.copy(v.target);
    this.controls.update();
  }

  setView(view: CameraView): void {
    this.transition = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      to: view,
      t: 0,
    };
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / TRANSITION_SECONDS);
      const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
      const dest = CAMERA_VIEWS[tr.to];
      this.camera.position.lerpVectors(tr.fromPos, dest.position, e);
      this.controls.target.lerpVectors(tr.fromTarget, dest.target, e);
      if (tr.t >= 1) this.transition = null;
    }
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}

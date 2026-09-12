import { Group, PCFSoftShadowMap, Scene, WebGLRenderer } from 'three';
import type { FrontWheelDepth, Helmet, Kit, Position, TireWidth, WheelDepth } from '../physics';
import { REFERENCE_TIRE_WIDTH_M } from './bikeGeometry';
import { BikeModel } from './bike';
import { CameraRig, type CameraView } from './cameraRig';
import { TunnelEnvironment } from './environment';
import { POSE_PRESETS, lerpPose, solveSkeleton, type PoseParams } from './pose';
import { RiderModel } from './rider';
import { WindField } from './wind';

/**
 * Everything the scene needs to draw a frame. The UI layer computes this from
 * the physics model; the scene never calls physics functions itself.
 */
export interface SceneState {
  position: Position;
  kit: Kit;
  helmet: Helmet;
  frontWheel: FrontWheelDepth;
  rearWheel: WheelDepth;
  tireWidthMm: TireWidth;
  /** Bike speed over the ground: drives wheel spin. */
  groundSpeedMs: number;
  /** Speed of the air past the rider (ground speed + headwind): drives particles and kit flutter. */
  airSpeedMs: number;
  cadenceRpm: number;
}

/** Seconds-ish time constant for easing between pose presets. */
const POSE_EASE_RATE = 5;

export class AeroScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly rig: CameraRig;
  private readonly env: TunnelEnvironment;
  private readonly bikeRoot = new Group();
  private readonly bike = new BikeModel();
  private readonly rider = new RiderModel();
  private readonly wind = new WindField();
  private readonly resizeObserver: ResizeObserver;

  private state: SceneState;
  private pose: PoseParams;
  private crankAngle = 0;
  private frameHandle = 0;
  private lastFrameMs = 0;

  constructor(private readonly container: HTMLElement, initial: SceneState) {
    this.state = initial;
    this.pose = { ...POSE_PRESETS[initial.position] };

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(this.renderer.domElement, 'threeQuarter');
    this.env = new TunnelEnvironment(this.scene);

    this.bikeRoot.add(this.bike.group, this.rider.group);
    this.scene.add(this.bikeRoot, this.wind.object);

    this.applyEquipment();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    const loop = (nowMs: number) => {
      this.frameHandle = requestAnimationFrame(loop);
      // Clamp so a backgrounded tab doesn't jump the animation on return.
      const dt = this.lastFrameMs ? Math.min((nowMs - this.lastFrameMs) / 1000, 1 / 20) : 0;
      this.lastFrameMs = nowMs;
      this.frame(dt);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  setState(patch: Partial<SceneState>): void {
    this.state = { ...this.state, ...patch };
    this.applyEquipment();
  }

  setView(view: CameraView): void {
    this.rig.setView(view);
  }

  /**
   * Run the simulation forward without waiting for animation frames: finishes
   * pose easing and camera transitions. For screenshots and debugging when
   * the tab is throttled; the render loop does the same thing live.
   */
  advance(seconds: number, step = 1 / 30): void {
    for (let t = 0; t < seconds; t += step) this.frame(step);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private applyEquipment(): void {
    const s = this.state;
    this.bike.setWheels(s.frontWheel, s.rearWheel);
    this.bike.setTireWidth(s.tireWidthMm);
    this.rider.setKit(s.kit);
    this.rider.setHelmet(s.helmet);
    // Keep the tire on the floor whatever its width.
    this.bikeRoot.position.y = s.tireWidthMm / 1000 - REFERENCE_TIRE_WIDTH_M;
    this.env.setAirSpeed(s.airSpeedMs);
  }

  private frame(dt: number): void {
    const s = this.state;

    const ease = 1 - Math.exp(-dt * POSE_EASE_RATE);
    this.pose = lerpPose(this.pose, POSE_PRESETS[s.position], ease);

    // Viewed from the drive side (+Z), cranks turn clockwise: decreasing angle.
    this.crankAngle -= dt * (s.cadenceRpm / 60) * Math.PI * 2;
    const skeleton = solveSkeleton(this.pose, this.crankAngle);

    this.rider.update(skeleton, dt, s.airSpeedMs);
    this.bike.update(dt, s.groundSpeedMs, skeleton, this.pose.aerobars);
    this.wind.update(dt, s.airSpeedMs);
    this.rig.update(dt);
    this.renderer.render(this.scene, this.rig.camera);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.rig.setAspect(w / h);
  }
}

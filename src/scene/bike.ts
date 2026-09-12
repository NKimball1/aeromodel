import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  TubeGeometry,
  Vector3,
} from 'three';
import {
  FRONT_WHEEL,
  REAR_WHEEL,
  type FrontWheelDepth,
  type WheelDepth,
} from '../physics';
import {
  BAR_CLAMP,
  BAR_HALF_WIDTH,
  BAR_TUBE_RADIUS,
  BB,
  FRONT_AXLE,
  HEAD_TUBE_BOTTOM,
  HEAD_TUBE_TOP,
  REAR_AXLE,
  SADDLE_TOP,
  SEAT_CLUSTER,
  type V2,
  type V3,
} from './bikeGeometry';
import { materials } from './materials';
import type { Skeleton } from './pose';
import { Segment, v3 } from './primitives';
import { WheelModel } from './wheel';

const at = (p: V2, z = 0): V3 => ({ x: p.x, y: p.y, z });

/** Road bike from primitives, plus clip-on aerobars that follow the rider's arms. */
export class BikeModel {
  readonly group = new Group();
  readonly frontWheel = new WheelModel();
  readonly rearWheel = new WheelModel();

  private readonly cranks: Segment[];
  private readonly pedals: Mesh[];
  private readonly chainring: Mesh;
  private readonly aerobars = new Group();
  private readonly pads: Mesh[];
  private readonly extensions: Segment[];
  private readonly risers: Segment[];

  constructor() {
    this.frontWheel.group.position.set(FRONT_AXLE.x, FRONT_AXLE.y, 0);
    this.rearWheel.group.position.set(REAR_AXLE.x, REAR_AXLE.y, 0);
    this.group.add(this.frontWheel.group, this.rearWheel.group);

    this.buildFrame();

    this.chainring = new Mesh(new CylinderGeometry(0.1, 0.1, 0.004, 40), materials.component);
    this.chainring.rotation.x = Math.PI / 2;
    this.chainring.position.set(BB.x, BB.y, 0.06);
    this.group.add(this.chainring);

    this.cranks = [1, -1].map(() => {
      const s = Segment.cylinder(0.011, materials.component, 8);
      this.group.add(s.mesh);
      return s;
    });
    this.pedals = [1, -1].map(() => {
      const m = new Mesh(new BoxGeometry(0.085, 0.018, 0.07), materials.component);
      m.castShadow = true;
      this.group.add(m);
      return m;
    });

    this.pads = [1, -1].map(() => {
      const m = new Mesh(new BoxGeometry(0.11, 0.018, 0.075), materials.pad);
      m.castShadow = true;
      this.aerobars.add(m);
      return m;
    });
    this.extensions = [1, -1].map(() => {
      const s = Segment.cylinder(0.011, materials.carbon, 10);
      this.aerobars.add(s.mesh);
      return s;
    });
    this.risers = [1, -1].map(() => {
      const s = Segment.cylinder(0.012, materials.component, 10);
      this.aerobars.add(s.mesh);
      return s;
    });
    this.group.add(this.aerobars);
  }

  setWheels(front: FrontWheelDepth, rear: WheelDepth): void {
    this.frontWheel.setRim(FRONT_WHEEL[front].depthMm, false);
    this.rearWheel.setRim(REAR_WHEEL[rear].depthMm, rear === 'disc');
  }

  setTireWidth(widthMm: number): void {
    this.frontWheel.setTireWidth(widthMm);
    this.rearWheel.setTireWidth(widthMm);
  }

  update(dt: number, groundSpeedMs: number, skeleton: Skeleton, aerobarVisibility: number): void {
    this.frontWheel.roll(dt, groundSpeedMs);
    this.rearWheel.roll(dt, groundSpeedMs);

    const sides = [skeleton.right, skeleton.left];
    sides.forEach((side, i) => {
      const z = side.pedal.z > 0 ? 0.085 : -0.085;
      this.cranks[i]!.set(v3(BB.x, BB.y, z), v3(side.pedal.x, side.pedal.y, z), 1.4, 0.8);
      this.pedals[i]!.position.set(side.pedal.x, side.pedal.y, side.pedal.z);
    });
    const r = skeleton.right.pedal;
    this.chainring.rotation.y = Math.atan2(r.y - BB.y, r.x - BB.x);

    this.aerobars.visible = aerobarVisibility > 0.5;
    if (this.aerobars.visible) {
      sides.forEach((side, i) => {
        const sign = side.elbow.z > 0 ? 1 : -1;
        const padY = side.elbow.y - 0.052;
        const padZ = sign * 0.09;
        this.pads[i]!.position.set(side.elbow.x + 0.02, padY, padZ);
        this.risers[i]!.set(v3(side.elbow.x + 0.02, padY - 0.01, padZ), v3(BAR_CLAMP.x, BAR_CLAMP.y, padZ));
        this.extensions[i]!.set(
          v3(side.elbow.x + 0.02, padY + 0.005, sign * 0.07),
          v3(side.hand.x + 0.07, side.hand.y - 0.02, side.hand.z),
        );
      });
    }
  }

  private tube(from: V3, to: V3, radius: number, material = materials.frame): void {
    const s = Segment.cylinder(radius, material);
    s.set(from, to);
    this.group.add(s.mesh);
  }

  private buildFrame(): void {
    const htDir = new Vector3(HEAD_TUBE_TOP.x - HEAD_TUBE_BOTTOM.x, HEAD_TUBE_TOP.y - HEAD_TUBE_BOTTOM.y, 0).normalize();
    const alongHt = (d: number): V2 => ({ x: HEAD_TUBE_TOP.x + htDir.x * d, y: HEAD_TUBE_TOP.y + htDir.y * d });

    this.tube(at(BB), at(SEAT_CLUSTER), 0.017);
    this.tube(at(SEAT_CLUSTER), at({ x: SADDLE_TOP.x, y: SADDLE_TOP.y - 0.03 }), 0.0135, materials.alloy);
    this.tube(at(SEAT_CLUSTER), at(alongHt(-0.025)), 0.016);
    this.tube(at(HEAD_TUBE_BOTTOM), at(HEAD_TUBE_TOP), 0.022);
    this.tube(at(BB), at({ x: HEAD_TUBE_BOTTOM.x - 0.01, y: HEAD_TUBE_BOTTOM.y + 0.03 }), 0.021);
    for (const s of [1, -1]) {
      this.tube(at(BB, s * 0.035), at(REAR_AXLE, s * 0.065), 0.01);
      this.tube(at(SEAT_CLUSTER, s * 0.02), at(REAR_AXLE, s * 0.065), 0.0095);
      this.tube(at(HEAD_TUBE_BOTTOM, s * 0.03), at(FRONT_AXLE, s * 0.05), 0.012);
    }

    // Spacers + stem.
    const spacerTop = alongHt(0.03);
    this.tube(at(HEAD_TUBE_TOP), at(spacerTop), 0.018, materials.component);
    this.tube(at(spacerTop), at(BAR_CLAMP), 0.018, materials.component);

    // Handlebar: straight tops plus a drop curve each side.
    this.tube(at(BAR_CLAMP, -BAR_HALF_WIDTH), at(BAR_CLAMP, BAR_HALF_WIDTH), BAR_TUBE_RADIUS, materials.component);
    for (const s of [1, -1]) {
      const z = s * BAR_HALF_WIDTH;
      const curve = new CatmullRomCurve3([
        new Vector3(BAR_CLAMP.x, BAR_CLAMP.y, z),
        new Vector3(BAR_CLAMP.x + 0.06, BAR_CLAMP.y + 0.004, z),
        new Vector3(BAR_CLAMP.x + 0.105, BAR_CLAMP.y - 0.02, z),
        new Vector3(BAR_CLAMP.x + 0.105, BAR_CLAMP.y - 0.08, z),
        new Vector3(BAR_CLAMP.x + 0.075, BAR_CLAMP.y - 0.113, z),
        new Vector3(BAR_CLAMP.x - 0.005, BAR_CLAMP.y - 0.115, z),
      ]);
      const drop = new Mesh(new TubeGeometry(curve, 32, BAR_TUBE_RADIUS, 10), materials.component);
      drop.castShadow = true;
      this.group.add(drop);
      // Brake hood sitting on the forward bend.
      this.tube(
        v3(BAR_CLAMP.x + 0.065, BAR_CLAMP.y + 0.008, z),
        v3(BAR_CLAMP.x + 0.12, BAR_CLAMP.y + 0.022, z),
        0.017,
        materials.component,
      );
    }

    const saddle = new Mesh(new BoxGeometry(0.26, 0.028, 0.12), materials.component);
    saddle.position.set(SADDLE_TOP.x - 0.01, SADDLE_TOP.y - 0.014, 0);
    saddle.castShadow = true;
    this.group.add(saddle);

    const bbShell = new Mesh(new CylinderGeometry(0.024, 0.024, 0.09, 16), materials.frame);
    bbShell.rotation.x = Math.PI / 2;
    bbShell.position.set(BB.x, BB.y, 0);
    this.group.add(bbShell);
  }
}

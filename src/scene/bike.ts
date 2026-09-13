import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import {
  FRONT_WHEEL,
  REAR_WHEEL,
  type BikeType,
  type FrontWheelDepth,
  type WheelDepth,
} from '../physics';
import {
  BAR_CLAMP,
  BAR_HALF_WIDTH,
  BAR_TUBE_RADIUS,
  BB,
  SADDLE_TOP,
  type V2,
  type V3,
} from './bikeGeometry';
import { FRAME_STYLES, frameLayout, type FrameLayout, type FrameStyle, type TubeSpec } from './bikeTypes';
import { createFramePaint, materials } from './materials';
import type { Skeleton } from './pose';
import { Segment, v3 } from './primitives';
import { WheelModel } from './wheel';

const at = (p: V2, z = 0): V3 => ({ x: p.x, y: p.y, z });
const BAR_TAPE = new MeshStandardMaterial({ color: 0x141518, roughness: 0.95 });
const SADDLE = new MeshPhysicalMaterial({ color: 0x1b1d21, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5 });
const BOTTLE = new MeshPhysicalMaterial({ color: 0xf2f2ef, roughness: 0.4, clearcoat: 0.5 });
const BOTTLE_CAP = new MeshStandardMaterial({ color: 0x2f62ad, roughness: 0.6 });
const round = (d: number): TubeSpec => ({ profile: 'round', chord: d, width: d });
const kamm = (chord: number, width: number): TubeSpec => ({ profile: 'kamm', chord, width });

/** Modern disc-brake road bike from primitives. Frame rebuilds per bike type. */
export class BikeModel {
  readonly group = new Group();
  readonly frontWheel = new WheelModel(0.08);
  readonly rearWheel = new WheelModel(0.07);

  private frame = new Group();
  private frameMaterial: Material | null = null;
  private type: BikeType | null = null;

  private readonly spider: Group;
  private readonly cranks: Segment[];
  private readonly pedals: Mesh[];
  private readonly aerobars = new Group();
  private readonly pads: Mesh[];
  private readonly extensions: Segment[];
  private readonly risers: Segment[];

  constructor() {
    this.group.add(this.frontWheel.group, this.rearWheel.group, this.frame);

    // Chainrings don't depend on frame type: the BB is shared. Thin rings on a spider.
    for (const [radius, z] of [
      [0.105, 0.062],
      [0.082, 0.055],
    ] as const) {
      const ring = new Mesh(new TorusGeometry(radius - 0.006, 0.006, 6, 64), materials.component);
      ring.scale.z = 0.4;
      ring.position.set(BB.x, BB.y, z);
      ring.castShadow = true;
      this.group.add(ring);
    }
    this.spider = new Group();
    this.spider.position.set(BB.x, BB.y, 0.058);
    for (let i = 0; i < 4; i++) {
      const arm = new Mesh(new BoxGeometry(0.2, 0.016, 0.006), materials.component);
      arm.rotation.z = (i * Math.PI) / 4;
      this.spider.add(arm);
    }
    this.group.add(this.spider);

    this.cranks = [1, -1].map(() => {
      const s = new Segment(new BoxGeometry(0.03, 1, 0.014), materials.carbon, 1);
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

  setType(type: BikeType): void {
    if (type === this.type) return;
    this.type = type;
    this.disposeFrame();
    const style = FRAME_STYLES[type];
    const layout = frameLayout(style);
    this.frameMaterial = createFramePaint(style.color);
    this.frontWheel.group.position.set(layout.frontAxle.x, layout.frontAxle.y, 0);
    this.rearWheel.group.position.set(layout.rearAxle.x, layout.rearAxle.y, 0);
    new FrameBuilder(this.frame, style, layout, this.frameMaterial).build();
  }

  setWheels(front: FrontWheelDepth, rear: WheelDepth): void {
    this.frontWheel.setRim(FRONT_WHEEL[front].depthMm, false);
    this.rearWheel.setRim(REAR_WHEEL[rear].depthMm, rear === 'disc');
  }

  setTireWidth(widthMm: number): void {
    this.frontWheel.setTireWidth(widthMm);
    this.rearWheel.setTireWidth(widthMm);
  }

  /** @param displayedGroundSpeedMs ground speed after the visual time scale. */
  update(dt: number, displayedGroundSpeedMs: number, skeleton: Skeleton, aerobarVisibility: number): void {
    this.frontWheel.roll(dt, displayedGroundSpeedMs);
    this.rearWheel.roll(dt, displayedGroundSpeedMs);

    const sides = [skeleton.right, skeleton.left];
    sides.forEach((side, i) => {
      const z = side.pedal.z > 0 ? 0.085 : -0.085;
      this.cranks[i]!.set(v3(BB.x, BB.y, z), v3(side.pedal.x, side.pedal.y, z));
      this.pedals[i]!.position.set(side.pedal.x, side.pedal.y, side.pedal.z);
    });
    const r = skeleton.right.pedal;
    this.spider.rotation.z = Math.atan2(r.y - BB.y, r.x - BB.x);

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

  private disposeFrame(): void {
    this.frame.traverse((obj) => {
      if (obj instanceof Mesh) obj.geometry.dispose();
    });
    this.frame.clear();
    this.frameMaterial?.dispose();
    this.frameMaterial = null;
  }
}

/** Builds one frame + cockpit + drivetrain into a group. */
class FrameBuilder {
  constructor(
    private readonly group: Group,
    private readonly style: FrameStyle,
    private readonly L: FrameLayout,
    private readonly paint: Material,
  ) {}

  build(): void {
    this.frameTubes();
    this.cockpit();
    this.drivetrain();
    this.brakes();
    this.saddle();
    this.bottle();
  }

  /** A paint-coloured sphere that hides a tube junction. */
  private blend(p: V2, rx: number, ry: number, rz: number, z = 0): void {
    const b = this.mesh(new Mesh(new SphereGeometry(1, 16, 12), this.paint));
    b.position.set(p.x, p.y, z);
    b.scale.set(rx, ry, rz);
  }

  private tube(spec: TubeSpec, from: V3, to: V3, material: Material = this.paint): void {
    const s = Segment.tube(spec, material).set(from, to, 1, 1, true);
    this.group.add(s.mesh);
  }

  private mesh(m: Mesh): Mesh {
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  private along(p: V2, d: number): V2 {
    return { x: p.x + this.L.steererDir.x * d, y: p.y + this.L.steererDir.y * d };
  }

  private frameTubes(): void {
    const { L, style } = this;
    const t = style.tubes;
    const seatDir = { x: SADDLE_TOP.x - BB.x, y: SADDLE_TOP.y - BB.y };
    const seatLen = Math.hypot(seatDir.x, seatDir.y);
    const seatTop: V2 = {
      x: L.seatCluster.x + (seatDir.x / seatLen) * 0.025,
      y: L.seatCluster.y + (seatDir.y / seatLen) * 0.025,
    };

    this.tube(t.head, at(this.along(L.headTubeBottom, -0.01)), at(this.along(L.headTubeTop, 0.004)));
    this.tube(t.top, at(L.seatCluster), at(L.topTubeEnd));
    this.tube(t.down, at(L.downTubeStart), at(L.downTubeEnd));
    this.tube(t.seat, at(BB), at(seatTop));
    this.tube(t.seatpost, at(L.seatCluster), at({ x: SADDLE_TOP.x, y: SADDLE_TOP.y - 0.03 }), materials.carbon);

    // Smooth the junctions: seat cluster, top and down tube at the head tube.
    this.blend(L.seatCluster, Math.max(t.seat.chord, t.top.chord) * 0.55, 0.03, Math.max(t.seat.width, t.top.width) * 0.55);
    this.blend(L.topTubeEnd, t.top.chord * 0.55, t.top.chord * 0.5, t.top.width * 0.52);
    this.blend(L.downTubeEnd, t.down.chord * 0.55, t.down.chord * 0.5, t.down.width * 0.52);

    for (const s of [1, -1]) {
      this.tube(t.chainstay, at(BB, s * 0.04), at(L.rearAxle, s * 0.064));
      this.tube(t.seatstay, at(L.seatStayJoin, s * 0.022), at(L.rearAxle, s * 0.062));
      this.tube(t.fork, at(L.headTubeBottom, s * 0.034), at(L.frontAxle, s * style.forkHalfWidth));
      // Dropouts.
      for (const axle of [L.rearAxle, L.frontAxle]) {
        const drop = this.mesh(new Mesh(new BoxGeometry(0.03, 0.03, 0.008), this.paint));
        drop.position.set(axle.x, axle.y, s * 0.064);
      }
    }

    const crown = this.mesh(new Mesh(new BoxGeometry(t.fork.chord * 1.1, 0.03, 0.09), this.paint));
    crown.position.set(L.headTubeBottom.x, L.headTubeBottom.y - 0.012, 0);
    crown.rotation.z = Math.atan2(L.steererDir.y, L.steererDir.x) - Math.PI / 2;

    const bbShell = this.mesh(new Mesh(new CylinderGeometry(0.028, 0.028, 0.09, 20), this.paint));
    bbShell.rotation.x = Math.PI / 2;
    bbShell.position.set(BB.x, BB.y, 0);
  }

  private cockpit(): void {
    const { L, style } = this;
    const clamp = BAR_CLAMP;

    // Spacers + top cap, hidden-cable style: one smooth sleeve.
    if (L.spacerStack > 0.002 || style.cockpit !== 'vStem') {
      this.tube(round(0.034), at(L.headTubeTop), at(L.stemBase), style.cockpit === 'classic' ? materials.component : this.paint);
    }

    switch (style.cockpit) {
      case 'classic':
        this.tube(round(0.032), at(L.stemBase), at(clamp), materials.component);
        this.tube(round(BAR_TUBE_RADIUS * 2.1), at(clamp, -BAR_HALF_WIDTH), at(clamp, BAR_HALF_WIDTH), materials.component);
        break;
      case 'integrated':
        this.tube(kamm(0.044, 0.032), at(L.stemBase), at(clamp), materials.carbon);
        this.tube(kamm(0.046, 0.013), at(clamp, -BAR_HALF_WIDTH), at(clamp, BAR_HALF_WIDTH), materials.carbon);
        break;
      case 'vStem': {
        // Split stem: two slim arms spreading from the steerer to the bar.
        const cap = this.mesh(new Mesh(new BoxGeometry(0.05, 0.022, 0.034), materials.carbon));
        cap.position.set(L.stemBase.x, L.stemBase.y, 0);
        for (const s of [1, -1]) {
          this.tube(kamm(0.03, 0.013), at(L.stemBase, s * 0.012), at(clamp, s * 0.06), materials.carbon);
        }
        this.tube(kamm(0.048, 0.013), at(clamp, -BAR_HALF_WIDTH), at(clamp, BAR_HALF_WIDTH), materials.carbon);
        break;
      }
    }

    const drops = style.cockpit === 'classic' ? materials.component : materials.carbon;
    for (const s of [1, -1]) {
      const z = s * BAR_HALF_WIDTH;
      // Endurance-style bars flare the drops outward a little.
      const flare = style.headTubeLength > 0.16 ? s * 0.02 : 0;
      const curve = new CatmullRomCurve3([
        new Vector3(clamp.x, clamp.y, z),
        new Vector3(clamp.x + 0.06, clamp.y + 0.004, z),
        new Vector3(clamp.x + 0.105, clamp.y - 0.02, z),
        new Vector3(clamp.x + 0.105, clamp.y - 0.08, z + flare * 0.6),
        new Vector3(clamp.x + 0.075, clamp.y - 0.113, z + flare),
        new Vector3(clamp.x - 0.005, clamp.y - 0.115, z + flare),
      ]);
      this.mesh(new Mesh(new TubeGeometry(curve, 32, BAR_TUBE_RADIUS, 10), drops));
      // Bar tape: a slightly fatter, matte wrap from the bend round the drop.
      const tapeCurve = new CatmullRomCurve3(curve.getPoints(40).slice(8));
      this.mesh(new Mesh(new TubeGeometry(tapeCurve, 32, BAR_TUBE_RADIUS * 1.28, 12), BAR_TAPE));
      // Brake/shift hood: a rubber body over the bend with a lever blade hanging forward-down.
      const hood = Segment.taperedCapsule(0.02, 0.016, 0.075, materials.component).set(
        v3(clamp.x + 0.062, clamp.y + 0.012, z),
        v3(clamp.x + 0.13, clamp.y + 0.03, z),
      );
      this.group.add(hood.mesh);
      const blade = this.mesh(new Mesh(new BoxGeometry(0.012, 0.09, 0.02), materials.carbon));
      blade.position.set(clamp.x + 0.128, clamp.y - 0.02, z);
      blade.rotation.z = 0.25;
    }
  }

  private drivetrain(): void {
    const { L } = this;
    const r = L.rearAxle;

    // Cassette: 11 stacked sprockets, small on the outside.
    for (let i = 0; i < 11; i++) {
      const radius = 0.022 + (0.052 - 0.022) * (i / 10);
      const sprocket = this.mesh(new Mesh(new CylinderGeometry(radius, radius, 0.0018, 32), materials.alloy));
      sprocket.rotation.x = Math.PI / 2;
      sprocket.position.set(r.x, r.y, 0.06 - i * 0.0038);
    }

    const pulley = v3(r.x + 0.012, r.y - 0.088, 0.052);
    const chain = round(0.007);
    this.tube(chain, v3(BB.x, BB.y + 0.105, 0.062), v3(r.x, r.y + 0.036, 0.048), materials.component);
    this.tube(chain, v3(BB.x, BB.y - 0.105, 0.062), pulley, materials.component);
    // Rear derailleur cage hanging below the axle.
    this.tube(kamm(0.03, 0.012), v3(r.x + 0.004, r.y - 0.02, 0.058), pulley, materials.component);
    const wheel = this.mesh(new Mesh(new CylinderGeometry(0.014, 0.014, 0.008, 14), materials.component));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(pulley.x, pulley.y, pulley.z);
  }

  private brakes(): void {
    const { L } = this;
    const caliper = (x: number, y: number, angle: number) => {
      const m = this.mesh(new Mesh(new BoxGeometry(0.05, 0.026, 0.024), materials.component));
      m.position.set(x, y, -0.064);
      m.rotation.z = angle;
    };
    // Front caliper on the back of the left fork leg; rear flat-mount on the chainstay.
    caliper(L.frontAxle.x - 0.045, L.frontAxle.y + 0.068, -0.6);
    caliper(L.rearAxle.x + 0.064, L.rearAxle.y + 0.03, 0.4);
  }

  private saddle(): void {
    // Short-nose race saddle: outline drawn in top view (x forward, y = sideways), extruded thin.
    const outline = new Shape();
    outline.moveTo(-0.11, -0.065);
    outline.quadraticCurveTo(-0.13, 0, -0.11, 0.065);
    outline.quadraticCurveTo(-0.02, 0.06, 0.06, 0.028);
    outline.quadraticCurveTo(0.12, 0.02, 0.135, 0);
    outline.quadraticCurveTo(0.12, -0.02, 0.06, -0.028);
    outline.quadraticCurveTo(-0.02, -0.06, -0.11, -0.065);
    const geo = new ExtrudeGeometry(outline, {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.006,
      bevelSegments: 3,
    });
    geo.rotateX(Math.PI / 2); // lie flat: extrusion (z) becomes vertical
    const shell = this.mesh(new Mesh(geo, SADDLE));
    shell.position.set(SADDLE_TOP.x - 0.01, SADDLE_TOP.y - 0.004, 0);
    // Rails and clamp.
    for (const s of [1, -1]) {
      this.tube(
        round(0.007),
        v3(SADDLE_TOP.x - 0.1, SADDLE_TOP.y - 0.03, s * 0.022),
        v3(SADDLE_TOP.x + 0.06, SADDLE_TOP.y - 0.03, s * 0.022),
        materials.alloy,
      );
    }
    const clampBox = this.mesh(new Mesh(new BoxGeometry(0.04, 0.02, 0.05), materials.component));
    clampBox.position.set(SADDLE_TOP.x - 0.025, SADDLE_TOP.y - 0.04, 0);
  }

  private bottle(): void {
    // One bottle in a cage on the down tube, a third of the way up.
    const { L } = this;
    const a = L.downTubeStart;
    const b = L.downTubeEnd;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    // Outward normal: up and back, toward the inside of the main triangle.
    const nx = -dy / len;
    const ny = dx / len;
    const lift = this.style.tubes.down.chord / 2 + 0.036;
    const pt = (t: number): V3 => v3(a.x + dx * t + nx * lift, a.y + dy * t + ny * lift, 0);
    const from = pt(0.3);
    const to = pt(0.62);
    const body = Segment.cylinder(0.035, BOTTLE, 20).set(from, to);
    this.group.add(body.mesh);
    const cap = Segment.taperedCapsule(0.03, 0.012, 0.03, BOTTLE_CAP).set(
      to,
      v3(to.x + (dx / len) * 0.035, to.y + (dy / len) * 0.035, 0),
    );
    this.group.add(cap.mesh);
    // Cage: a ring around the bottle's middle and a strut down to the tube.
    const mid = v3((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
    const ring = this.mesh(new Mesh(new TorusGeometry(0.038, 0.003, 8, 32), materials.component));
    ring.position.set(mid.x, mid.y, 0);
    ring.rotation.z = Math.atan2(dy, dx) + Math.PI / 2;
    ring.rotation.x = Math.PI / 2;
    this.tube(
      round(0.006),
      v3(mid.x - nx * 0.038, mid.y - ny * 0.038, 0),
      v3(mid.x - nx * lift, mid.y - ny * lift, 0),
      materials.component,
    );
  }
}

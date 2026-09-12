import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  TorusGeometry,
  Vector2,
} from 'three';
import { RIM_BEAD_RADIUS, RIM_WIDTH } from './bikeGeometry';
import { materials } from './materials';

const HUB_FLANGE_RADIUS = 0.028;
const HUB_FLANGE_OFFSET = 0.032;
const DISC_HUB_RADIUS = 0.035;

/**
 * A wheel built in the XY plane with its axle along Z. Rim depth and tire
 * width can be changed at runtime; geometry is rebuilt on change.
 */
export class WheelModel {
  readonly group = new Group();
  private readonly spinGroup = new Group();
  private rim: Mesh | null = null;
  private tire: Mesh | null = null;
  private spokes: LineSegments | null = null;
  private decals: Mesh[] = [];
  private angle = 0;
  private depthMm = -1;
  private disc = false;
  private tireWidthMm = -1;

  constructor() {
    this.group.add(this.spinGroup);
    const hub = new Mesh(new CylinderGeometry(0.018, 0.018, 0.1, 16), materials.alloy);
    hub.rotation.x = Math.PI / 2;
    hub.castShadow = true;
    this.spinGroup.add(hub);
  }

  /** Outer tire radius, for converting ground speed to wheel spin. */
  get outerRadius(): number {
    return RIM_BEAD_RADIUS + this.tireWidthMm / 1000;
  }

  setRim(depthMm: number, disc: boolean): void {
    if (depthMm === this.depthMm && disc === this.disc) return;
    this.depthMm = depthMm;
    this.disc = disc;
    this.disposeMesh(this.rim);
    this.disposeSpokes();
    for (const d of this.decals) this.disposeMesh(d);
    this.decals = [];

    const depth = disc ? RIM_BEAD_RADIUS - DISC_HUB_RADIUS : depthMm / 1000;
    const deep = depthMm >= 35 || disc;
    const rimGeo = new LatheGeometry(rimProfile(depth, disc), 72);
    // Lathe revolves around Y; turn it so the axle is Z.
    rimGeo.rotateX(Math.PI / 2);
    this.rim = new Mesh(rimGeo, deep ? materials.carbon : materials.alloy);
    this.rim.castShadow = true;
    this.spinGroup.add(this.rim);

    if (!disc) {
      this.spokes = buildSpokes(depth, depthMm <= 30 ? 28 : depthMm <= 50 ? 24 : 20);
      this.spinGroup.add(this.spokes);
    }

    // A pale decal on each rim face so rotation is visible on deep rims and discs.
    if (deep) {
      const midR = RIM_BEAD_RADIUS - Math.min(depth, 0.08) * 0.5;
      for (const side of [1, -1]) {
        const decal = new Mesh(new BoxGeometry(0.09, Math.min(depth, 0.08) * 0.35, 0.002), materials.decal);
        decal.position.set(0, midR, side * (RIM_WIDTH * 0.55 + (disc ? 0.004 : 0.002)));
        this.decals.push(decal);
        this.spinGroup.add(decal);
      }
    }
  }

  setTireWidth(widthMm: number): void {
    if (widthMm === this.tireWidthMm) return;
    this.tireWidthMm = widthMm;
    this.disposeMesh(this.tire);
    const w = widthMm / 1000;
    // Tire section roughly as tall as it is wide, sitting on the bead seat.
    const geo = new TorusGeometry(RIM_BEAD_RADIUS + w / 2, w / 2, 14, 96);
    this.tire = new Mesh(geo, materials.tire);
    this.tire.castShadow = true;
    this.spinGroup.add(this.tire);
  }

  /** Advance rotation for a bike moving +X at `groundSpeedMs`. */
  roll(dt: number, groundSpeedMs: number): void {
    this.angle += (dt * groundSpeedMs) / this.outerRadius;
    // Moving +X, viewed from +Z, a wheel turns clockwise: negative about Z.
    this.spinGroup.rotation.z = -this.angle;
  }

  private disposeMesh(mesh: Mesh | null): void {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }

  private disposeSpokes(): void {
    if (!this.spokes) return;
    this.spokes.removeFromParent();
    this.spokes.geometry.dispose();
    this.spokes = null;
  }
}

/** Rim cross-section, as (radius, axial offset) points revolved by LatheGeometry. */
function rimProfile(depth: number, disc: boolean): Vector2[] {
  const R = RIM_BEAD_RADIUS;
  const h = RIM_WIDTH / 2;
  if (disc) {
    // Lens: full width at the rim, tapering to a thin hub.
    const hubR = R - depth;
    return [
      new Vector2(R, -h),
      new Vector2(R - depth * 0.3, -h * 0.85),
      new Vector2(hubR, -0.012),
      new Vector2(hubR, 0.012),
      new Vector2(R - depth * 0.3, h * 0.85),
      new Vector2(R, h),
      new Vector2(R, -h),
    ];
  }
  // Aero section: widest in the outer third, rounded toward the spoke bed.
  return [
    new Vector2(R, -h),
    new Vector2(R - depth * 0.4, -h * 1.1),
    new Vector2(R - depth * 0.85, -h * 0.65),
    new Vector2(R - depth, 0),
    new Vector2(R - depth * 0.85, h * 0.65),
    new Vector2(R - depth * 0.4, h * 1.1),
    new Vector2(R, h),
    new Vector2(R, -h),
  ];
}

function buildSpokes(depth: number, count: number): LineSegments {
  const inner = RIM_BEAD_RADIUS - depth;
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // Tangential-ish lacing: the hub end leads the rim end slightly.
    const hubA = a + (i % 2 === 0 ? 0.35 : -0.35);
    const side = i % 2 === 0 ? 1 : -1;
    pts.push(
      Math.cos(hubA) * HUB_FLANGE_RADIUS,
      Math.sin(hubA) * HUB_FLANGE_RADIUS,
      side * HUB_FLANGE_OFFSET,
      Math.cos(a) * inner,
      Math.sin(a) * inner,
      0,
    );
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: 0x55595f }));
}

import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RIM_BEAD_RADIUS, RIM_WIDTH } from './bikeGeometry';
import { PALETTE, materials } from './materials';
import { SPEED_VISUAL, smoothstep } from './speedVisuals';

const HUB_FLANGE_RADIUS = 0.028;
const HUB_FLANGE_OFFSET = 0.032;
const DISC_HUB_RADIUS = 0.035;
/** Brake rotors sit on the non-drive (left, −Z) side. */
const ROTOR_Z = -0.058;

/**
 * A wheel built in the XY plane with its axle along Z. Rim depth and tire
 * width can be changed at runtime; geometry is rebuilt on change. Spokes and
 * decals fade into a translucent blur disc as the wheel spins faster.
 */
export class WheelModel {
  readonly group = new Group();
  /** Holds the translucent spin-blur disc; kept separate so post-processing can skip it. */
  readonly blurObject = new Group();
  private readonly spinGroup = new Group();
  private rim: Mesh | null = null;
  private tire: Mesh | null = null;
  private spokes: InstancedMesh | null = null;
  private blur: Mesh | null = null;
  private decals: Mesh[] = [];
  private readonly spokeMaterial = new MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.35, metalness: 0.8, transparent: true });
  private readonly decalMaterial = new MeshStandardMaterial({ color: PALETTE.decal, roughness: 0.6, transparent: true });
  private readonly blurMaterial = new MeshBasicMaterial({
    color: 0x6a6f76,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  private angle = 0;
  private depthMm = -1;
  private disc = false;
  private tireWidthMm = -1;

  constructor(rotorRadius: number) {
    this.group.add(this.spinGroup, this.blurObject);
    const hub = new Mesh(new CylinderGeometry(0.018, 0.018, 0.1, 16), materials.alloy);
    hub.rotation.x = Math.PI / 2;
    hub.castShadow = true;
    this.spinGroup.add(hub);

    const rotor = new Mesh(new RingGeometry(rotorRadius - 0.017, rotorRadius, 48), materials.alloy);
    rotor.position.z = ROTOR_Z;
    const carrier = new Mesh(new RingGeometry(0.02, rotorRadius - 0.017, 6), materials.component);
    carrier.position.z = ROTOR_Z;
    this.spinGroup.add(rotor, carrier);
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
    this.disposeMesh(this.blur);
    this.blur = null;
    if (this.spokes) {
      this.spokes.removeFromParent();
      this.spokes.geometry.dispose();
      this.spokes = null;
    }
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
      this.spokes = buildSpokes(depth, depthMm <= 30 ? 28 : depthMm <= 50 ? 24 : 20, this.spokeMaterial);
      this.spinGroup.add(this.spokes);
      this.blur = new Mesh(new RingGeometry(0.03, RIM_BEAD_RADIUS - depth, 48), this.blurMaterial);
      this.blur.renderOrder = 1;
      this.blurObject.add(this.blur);
    }

    // A pale decal on each rim face so rotation is visible on deep rims and discs.
    if (deep) {
      const band = Math.min(depth, 0.08);
      for (const side of [1, -1]) {
        const decal = new Mesh(new BoxGeometry(0.09, band * 0.35, 0.002), this.decalMaterial);
        decal.position.set(0, RIM_BEAD_RADIUS - band * 0.5, side * (RIM_WIDTH * 0.55 + (disc ? 0.004 : 0.002)));
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
    this.tire = new Mesh(new TorusGeometry(RIM_BEAD_RADIUS + w / 2, w / 2, 14, 96), materials.tire);
    this.tire.castShadow = true;
    this.spinGroup.add(this.tire);
  }

  /** Advance rotation for a bike moving +X at the displayed ground speed. */
  roll(dt: number, displayedSpeedMs: number): void {
    const omega = displayedSpeedMs / this.outerRadius;
    this.angle += dt * omega;
    // Moving +X, viewed from +Z, a wheel turns clockwise: negative about Z.
    this.spinGroup.rotation.z = -this.angle;

    const blur = smoothstep(SPEED_VISUAL.wheelBlurStart, SPEED_VISUAL.wheelBlurFull, Math.abs(omega));
    this.spokeMaterial.opacity = 1 - 0.85 * blur;
    this.decalMaterial.opacity = 1 - 0.9 * blur;
    this.blurMaterial.opacity = 0.3 * blur;
  }

  private disposeMesh(mesh: Mesh | null): void {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
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

const SPOKE_RADIUS = 0.0011;
const UP = new Vector3(0, 1, 0);

/** Real thin cylinders, one instance per spoke, laced two-cross-ish between hub flanges and rim. */
function buildSpokes(depth: number, count: number, material: MeshStandardMaterial): InstancedMesh {
  const inner = RIM_BEAD_RADIUS - depth;
  const geo = new CylinderGeometry(SPOKE_RADIUS, SPOKE_RADIUS, 1, 6, 1, true);
  const mesh = new InstancedMesh(geo, material, count);
  const a = new Vector3();
  const b = new Vector3();
  const dir = new Vector3();
  const m = new Matrix4();
  const q = new Quaternion();
  const scale = new Vector3();
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    // Tangential-ish lacing: the hub end leads the rim end slightly.
    const hubA = ang + (i % 2 === 0 ? 0.35 : -0.35);
    const side = i % 2 === 0 ? 1 : -1;
    a.set(Math.cos(hubA) * HUB_FLANGE_RADIUS, Math.sin(hubA) * HUB_FLANGE_RADIUS, side * HUB_FLANGE_OFFSET);
    b.set(Math.cos(ang) * inner, Math.sin(ang) * inner, 0);
    dir.subVectors(b, a);
    const len = dir.length();
    q.setFromUnitVectors(UP, dir.divideScalar(len));
    scale.set(1, len, 1);
    m.compose(a.lerp(b, 0.5), q, scale);
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = true;
  return mesh;
}

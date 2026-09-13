import {
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  SphereGeometry,
  Vector2,
} from 'three';
import type { Helmet, Kit } from '../physics';
import {
  FOREARM_LENGTH,
  HEAD_RADIUS,
  SHANK_LENGTH,
  THIGH_LENGTH,
  TORSO_LENGTH,
  UPPER_ARM_LENGTH,
  type V3,
} from './bikeGeometry';
import { createKitMaterial, materials, type FlutterUniforms } from './materials';
import type { Skeleton } from './pose';
import { Segment } from './primitives';

/**
 * How each kit looks. `inflate` scales torso and sleeve girth, `flutter` is
 * the fabric ripple amplitude in metres at ~30 km/h of airspeed.
 */
export const KIT_LOOK: Record<Kit, { inflate: number; flutter: number; longSleeves: boolean }> = {
  skinsuit: { inflate: 0.96, flutter: 0, longSleeves: false },
  tightJersey: { inflate: 1.02, flutter: 0.002, longSleeves: false },
  looseJersey: { inflate: 1.12, flutter: 0.011, longSleeves: false },
  baggyJacket: { inflate: 1.22, flutter: 0.018, longSleeves: true },
};

const TORSO_RADIUS = 0.105;

/** Stylised mannequin rider driven entirely by a Skeleton. */
export class RiderModel {
  readonly group = new Group();

  private readonly kitUniforms: FlutterUniforms;
  private readonly kitMaterial;
  private kit: Kit = 'tightJersey';
  private kitTime = 0;

  private readonly pelvis: Mesh;
  private readonly torso: Segment;
  private readonly neck: Segment;
  private readonly headGroup = new Group();
  private readonly helmets: Record<Helmet, Group>;
  private readonly chest: Mesh;
  private readonly shoulders: Mesh[];
  private readonly elbows: Mesh[];
  private readonly knees: Mesh[];
  private readonly ankles: Mesh[];
  private readonly upperArms: Segment[];
  private readonly forearms: Segment[];
  private readonly hands: Mesh[];
  private readonly thighs: Segment[];
  private readonly shanks: Segment[];
  private readonly feet: Segment[];

  constructor() {
    const { material, uniforms } = createKitMaterial();
    this.kitMaterial = material;
    this.kitUniforms = uniforms;

    this.pelvis = this.addMesh(new Mesh(new SphereGeometry(1, 20, 14), materials.shorts));
    this.pelvis.scale.set(0.13, 0.09, 0.165);

    this.torso = this.addSeg(Segment.capsule(TORSO_RADIUS, TORSO_LENGTH, material));
    this.neck = this.addSeg(Segment.capsule(0.056, 0.2, materials.skin));

    const head = new Mesh(new SphereGeometry(HEAD_RADIUS, 24, 16), materials.skin);
    head.castShadow = true;
    this.headGroup.add(head);
    this.helmets = { aero: aeroHelmet(), road: roadHelmet(), none: cap() };
    for (const h of Object.values(this.helmets)) this.headGroup.add(h);
    this.group.add(this.headGroup);

    // A rounded chest/shoulder mass so the torso doesn't end in a bare capsule cap.
    this.chest = this.addMesh(new Mesh(new SphereGeometry(1, 24, 16), material));

    const pair = <T>(make: () => T): T[] => [make(), make()];
    this.shoulders = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.058, 20, 14), material)));
    // Joint spheres hide the seams where capsules meet at an angle.
    this.elbows = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.04, 16, 12), materials.skin)));
    this.knees = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.052, 16, 12), materials.skin)));
    this.ankles = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.036, 14, 10), materials.shoe)));
    this.upperArms = pair(() => this.addSeg(Segment.capsule(0.043, UPPER_ARM_LENGTH, material)));
    this.forearms = pair(() => this.addSeg(Segment.capsule(0.035, FOREARM_LENGTH, materials.skin)));
    this.hands = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.042, 14, 10), materials.glove)));
    this.thighs = pair(() => this.addSeg(Segment.capsule(0.068, THIGH_LENGTH, materials.shorts)));
    this.shanks = pair(() => this.addSeg(Segment.capsule(0.046, SHANK_LENGTH, materials.skin)));
    this.feet = pair(() => this.addSeg(Segment.capsule(0.034, 0.15, materials.shoe)));

    this.setKit('tightJersey');
    this.setHelmet('road');
  }

  setKit(kit: Kit): void {
    this.kit = kit;
    const sleeve = KIT_LOOK[kit].longSleeves ? this.kitMaterial : materials.skin;
    for (const f of this.forearms) f.mesh.material = sleeve;
    for (const e of this.elbows) e.material = sleeve;
  }

  setHelmet(helmet: Helmet): void {
    for (const [key, group] of Object.entries(this.helmets)) group.visible = key === helmet;
  }

  update(s: Skeleton, dt: number, airSpeedMs: number): void {
    const look = KIT_LOOK[this.kit];
    const windFactor = Math.min(1.5, Math.abs(airSpeedMs) / 8);
    this.kitTime += dt * (0.4 + Math.abs(airSpeedMs) / 5);
    this.kitUniforms.uTime.value = this.kitTime;
    this.kitUniforms.uFlutter.value = look.flutter * windFactor;
    // Low-frequency billow on top of the shader ripple for loose kit.
    const billow = 1 + look.flutter * 2.5 * windFactor * Math.sin(this.kitTime * 5.3);
    const girth = look.inflate * billow;

    // Torso: stop short of the shoulder joints so the cap doesn't poke past them.
    const tx = s.chest.x - s.pelvis.x;
    const ty = s.chest.y - s.pelvis.y;
    const tl = Math.hypot(tx, ty);
    const chestEnd: V3 = { x: s.chest.x - (tx / tl) * 0.04, y: s.chest.y - (ty / tl) * 0.04, z: 0 };
    this.torso.set(s.pelvis, chestEnd, 1.1 * girth, 1.55 * girth);
    this.pelvis.position.set(s.pelvis.x, s.pelvis.y, 0);
    this.pelvis.rotation.z = Math.atan2(ty, tx);
    this.chest.position.set(chestEnd.x, chestEnd.y, 0);
    this.chest.rotation.z = Math.atan2(ty, tx);
    this.chest.scale.set(0.11 * girth, 0.115 * girth, 0.2 * girth);

    this.neck.set({ x: s.chest.x, y: s.chest.y, z: 0 }, s.head);
    this.headGroup.position.set(s.head.x, s.head.y, s.head.z);
    this.headGroup.rotation.z = -s.headPitchRad;

    const sleeveGirth = look.longSleeves ? girth : 1;
    [s.right, s.left].forEach((side, i) => {
      this.shoulders[i]!.position.set(side.shoulder.x, side.shoulder.y, side.shoulder.z);
      this.shoulders[i]!.scale.setScalar(girth);
      this.upperArms[i]!.set(side.shoulder, side.elbow, girth);
      this.forearms[i]!.set(side.elbow, side.hand, sleeveGirth);
      this.elbows[i]!.position.set(side.elbow.x, side.elbow.y, side.elbow.z);
      this.elbows[i]!.scale.setScalar(sleeveGirth);
      this.knees[i]!.position.set(side.knee.x, side.knee.y, side.knee.z);
      this.ankles[i]!.position.set(side.ankle.x, side.ankle.y, side.ankle.z);
      this.hands[i]!.position.set(side.hand.x, side.hand.y, side.hand.z);
      this.thighs[i]!.set(side.hip, side.knee);
      this.shanks[i]!.set(side.knee, side.ankle);
      this.feet[i]!.set(side.ankle, side.toe);
    });
  }

  private addSeg(s: Segment): Segment {
    this.group.add(s.mesh);
    return s;
  }

  private addMesh(m: Mesh): Mesh {
    m.castShadow = true;
    this.group.add(m);
    return m;
  }
}

// --- Helmets, in head-local space: origin at head centre, +X forward. -------

function roadHelmet(): Group {
  const g = new Group();
  const shell = new Mesh(new SphereGeometry(0.128, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), materials.helmet);
  shell.scale.set(1.18, 0.95, 0.98);
  shell.position.set(-0.012, 0.012, 0);
  shell.rotation.z = 0.12;
  shell.castShadow = true;
  g.add(shell);
  return g;
}

function aeroHelmet(): Group {
  // Teardrop revolved around its long axis. Profile runs tail (−) → nose (+);
  // LatheGeometry needs increasing y for outward-facing normals.
  const profile = [
    new Vector2(0.0, -0.3),
    new Vector2(0.045, -0.24),
    new Vector2(0.095, -0.15),
    new Vector2(0.126, -0.06),
    new Vector2(0.134, 0.0),
    new Vector2(0.124, 0.06),
    new Vector2(0.09, 0.11),
    new Vector2(0.0, 0.135),
  ];
  const g = new Group();
  const shell = new Mesh(new LatheGeometry(profile, 32), materials.helmet);
  // Lathe axis is +Y; point the nose along +X, then tilt the tail down so it
  // lies along the back when the head is pitched in a tuck.
  shell.rotation.z = -Math.PI / 2 + 0.38;
  shell.castShadow = true;
  const squash = new Group();
  squash.scale.set(1, 0.88, 0.92);
  // Up and back so the shell covers crown and occiput and leaves the face clear.
  squash.position.set(-0.02, 0.045, 0);
  squash.add(shell);
  g.add(squash);
  return g;
}

function cap(): Group {
  const g = new Group();
  const crown = new Mesh(new SphereGeometry(0.109, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), materials.cap);
  crown.position.y = 0.008;
  crown.castShadow = true;
  // Half-disc brim facing +X (CylinderGeometry theta 0..π spans +X).
  const brim = new Mesh(new CylinderGeometry(0.075, 0.075, 0.005, 20, 1, false, 0, Math.PI), materials.cap);
  brim.position.set(0.075, 0.045, 0);
  brim.rotation.z = -0.25;
  g.add(crown, brim);
  return g;
}

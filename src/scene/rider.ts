import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
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
export const KIT_LOOK: Record<Kit, { inflate: number; flutter: number; longSleeves: boolean; onePiece: boolean }> = {
  skinsuit: { inflate: 0.96, flutter: 0, longSleeves: false, onePiece: true },
  tightJersey: { inflate: 1.02, flutter: 0.002, longSleeves: false, onePiece: false },
  looseJersey: { inflate: 1.12, flutter: 0.011, longSleeves: false, onePiece: false },
  baggyJacket: { inflate: 1.22, flutter: 0.018, longSleeves: true, onePiece: false },
};

const SHOE_WHITE = new MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.3 });
const SOLE = new MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5, metalness: 0.2 });
const SOCK = new MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.9 });
const VISOR = new MeshPhysicalMaterial({
  color: 0x121418,
  roughness: 0.12,
  metalness: 0.4,
  transparent: true,
  opacity: 0.72,
  clearcoat: 1,
});
const VENT = new MeshStandardMaterial({ color: 0x0f1114, roughness: 0.8 });

/** Stylised mannequin rider driven entirely by a Skeleton. */
export class RiderModel {
  readonly group = new Group();

  private readonly kitUniforms: FlutterUniforms;
  private readonly kitMaterial: Material;
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
  private readonly socks: Segment[];
  private readonly shoes: Segment[];
  private readonly soles: Segment[];

  constructor() {
    const { material, uniforms } = createKitMaterial();
    this.kitMaterial = material;
    this.kitUniforms = uniforms;

    this.pelvis = this.addMesh(new Mesh(new SphereGeometry(1, 20, 14), materials.shorts));
    this.pelvis.scale.set(0.13, 0.09, 0.165);

    // Torso narrows at the waist and widens to the chest; chest mass rounds it off.
    this.torso = this.addSeg(Segment.taperedCapsule(0.095, 0.112, TORSO_LENGTH, material));
    this.chest = this.addMesh(new Mesh(new SphereGeometry(1, 24, 16), material));
    this.neck = this.addSeg(Segment.taperedCapsule(0.058, 0.05, 0.2, materials.skin));

    const head = new Mesh(new SphereGeometry(HEAD_RADIUS, 28, 20), materials.skin);
    head.scale.set(0.96, 1.08, 0.92);
    head.castShadow = true;
    this.headGroup.add(head);
    this.helmets = { aero: aeroHelmet(), road: roadHelmet(), none: cap() };
    for (const h of Object.values(this.helmets)) this.headGroup.add(h);
    this.group.add(this.headGroup);

    const pair = <T>(make: () => T): T[] => [make(), make()];
    this.shoulders = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.06, 20, 14), material)));
    // Joint spheres hide the seams where capsules meet at an angle.
    this.elbows = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.038, 16, 12), materials.skin)));
    this.knees = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.052, 16, 12), materials.skin)));
    this.ankles = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.034, 14, 10), SOCK)));
    // Limbs taper toward the extremities; calves and thighs carry a muscle bulge.
    this.upperArms = pair(() => this.addSeg(Segment.taperedCapsule(0.05, 0.038, UPPER_ARM_LENGTH, material, { extra: 0.006, at: 0.4 })));
    this.forearms = pair(() => this.addSeg(Segment.taperedCapsule(0.037, 0.028, FOREARM_LENGTH, materials.skin, { extra: 0.005, at: 0.3 })));
    this.hands = pair(() => this.addMesh(new Mesh(new SphereGeometry(0.04, 14, 10), materials.glove)));
    this.thighs = pair(() => this.addSeg(Segment.taperedCapsule(0.078, 0.055, THIGH_LENGTH, materials.shorts, { extra: 0.008, at: 0.45, width: 0.3 })));
    this.shanks = pair(() => this.addSeg(Segment.taperedCapsule(0.05, 0.034, SHANK_LENGTH, materials.skin, { extra: 0.012, at: 0.3, width: 0.2 })));
    this.socks = pair(() => this.addSeg(Segment.cylinder(0.036, SOCK, 14)));
    this.shoes = pair(() => this.addSeg(Segment.taperedCapsule(0.038, 0.028, 0.15, SHOE_WHITE)));
    this.soles = pair(() => {
      const s = new Segment(new BoxGeometry(0.02, 1, 0.07), SOLE, 1);
      this.group.add(s.mesh);
      return s;
    });

    this.setKit('tightJersey');
    this.setHelmet('road');
  }

  setKit(kit: Kit): void {
    this.kit = kit;
    const look = KIT_LOOK[kit];
    const sleeve = look.longSleeves ? this.kitMaterial : materials.skin;
    for (const f of this.forearms) f.mesh.material = sleeve;
    for (const e of this.elbows) e.material = sleeve;
    // A skinsuit is one piece: the shorts take the jersey colour.
    const lower = look.onePiece ? this.kitMaterial : materials.shorts;
    this.pelvis.material = lower;
    for (const t of this.thighs) t.mesh.material = lower;
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
    // Gradient runs from just below the hips to the top of the shoulders, whatever the pose.
    this.kitUniforms.uGradY0.value = s.pelvis.y - 0.08;
    this.kitUniforms.uGradY1.value = s.chest.y + 0.08;
    // Low-frequency billow on top of the shader ripple for loose kit.
    const billow = 1 + look.flutter * 2.5 * windFactor * Math.sin(this.kitTime * 5.3);
    const girth = look.inflate * billow;

    // Torso: stop short of the shoulder joints so the cap doesn't poke past them.
    const tx = s.chest.x - s.pelvis.x;
    const ty = s.chest.y - s.pelvis.y;
    const tl = Math.hypot(tx, ty);
    const chestEnd: V3 = { x: s.chest.x - (tx / tl) * 0.04, y: s.chest.y - (ty / tl) * 0.04, z: 0 };
    this.torso.set(s.pelvis, chestEnd, 1.05 * girth, 1.5 * girth);
    this.pelvis.position.set(s.pelvis.x, s.pelvis.y, 0);
    this.pelvis.rotation.z = Math.atan2(ty, tx);
    this.chest.position.set(chestEnd.x, chestEnd.y, 0);
    this.chest.rotation.z = Math.atan2(ty, tx);
    this.chest.scale.set(0.115 * girth, 0.12 * girth, 0.2 * girth);

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
      // Sock: the last stretch of the shank above the ankle.
      const sx = side.ankle.x + (side.knee.x - side.ankle.x) * 0.2;
      const sy = side.ankle.y + (side.knee.y - side.ankle.y) * 0.2;
      this.socks[i]!.set(side.ankle, { x: sx, y: sy, z: side.ankle.z });
      // Shoe from heel (just behind the ankle) to toe, with a sole plate under it.
      const heel: V3 = { x: side.ankle.x - 0.03, y: side.ankle.y - 0.035, z: side.ankle.z };
      const toe: V3 = { x: side.toe.x + 0.015, y: side.toe.y + 0.005, z: side.toe.z };
      this.shoes[i]!.set(heel, toe);
      this.soles[i]!.set({ ...heel, y: heel.y - 0.03 }, { ...toe, y: toe.y - 0.028 });
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

/** Shell: a sphere segment stretched front-to-back, open at the bottom. */
function shell(radius: number, sx: number, sy: number, sz: number, coverage: number): Mesh {
  const m = new Mesh(new SphereGeometry(radius, 36, 20, 0, Math.PI * 2, 0, Math.PI * coverage), materials.helmet);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

/** Vented road helmet: stretched shell with dark vent slots along the crown and a rear taper. */
function roadHelmet(): Group {
  const g = new Group();
  const body = new Group();
  body.position.set(-0.015, 0.014, 0);
  body.rotation.z = 0.1;
  body.add(shell(0.124, 1.22, 0.98, 1.0, 0.56));
  // Rear taper so the back sits lower and longer than a plain dome.
  const tail = shell(0.105, 1.3, 0.88, 0.93, 0.54);
  tail.position.set(-0.04, 0.004, 0);
  body.add(tail);
  // Vent slots: dark strips lying on the crown, fanned across the top.
  for (const k of [-2, -1, 0, 1, 2]) {
    const angle = k * 0.34;
    const r = 0.124;
    const vent = new Mesh(new BoxGeometry(0.11, 0.008, 0.016), VENT);
    vent.position.set(0.01, r * 0.98 * Math.cos(angle) * 0.98, r * Math.sin(angle) * 1.0);
    vent.rotation.x = angle;
    body.add(vent);
    const rear = new Mesh(new BoxGeometry(0.06, 0.008, 0.014), VENT);
    rear.position.set(-0.1, r * 0.72 * Math.cos(angle * 0.9), r * 0.78 * Math.sin(angle * 0.9));
    rear.rotation.x = angle * 0.9;
    rear.rotation.z = 0.5;
    body.add(rear);
  }
  g.add(body);
  return g;
}

/** Aero road helmet: smooth vent-free shell with a short tail and a wraparound visor. */
function aeroHelmet(): Group {
  const g = new Group();
  const body = new Group();
  body.position.set(-0.02, 0.018, 0);
  body.rotation.z = 0.12;
  body.add(shell(0.124, 1.3, 0.98, 0.98, 0.58));
  const tail = shell(0.11, 1.28, 0.9, 0.92, 0.55);
  tail.position.set(-0.035, 0.002, 0);
  body.add(tail);
  g.add(body);
  // Visor: a band of the head sphere just in front of the eyes (three.js +X front is phi = π).
  const visor = new Mesh(
    new SphereGeometry(HEAD_RADIUS * 1.13, 32, 12, Math.PI - 1.05, 2.1, Math.PI * 0.4, Math.PI * 0.2),
    VISOR,
  );
  visor.position.set(0.005, 0.01, 0);
  g.add(visor);
  return g;
}

/** Cycling cap: shallow crown, short upturned brim. */
function cap(): Group {
  const g = new Group();
  const crown = new Mesh(new SphereGeometry(0.109, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), materials.cap);
  crown.position.y = 0.008;
  crown.castShadow = true;
  const band = new Mesh(new CylinderGeometry(0.109, 0.111, 0.014, 32, 1, true), materials.cap);
  band.position.y = 0.042;
  // Half-disc brim facing +X (CylinderGeometry theta 0..π spans +X).
  const brim = new Mesh(new CylinderGeometry(0.075, 0.075, 0.005, 20, 1, false, 0, Math.PI), materials.cap);
  brim.position.set(0.078, 0.052, 0);
  brim.rotation.z = 0.35;
  g.add(crown, band, brim);
  return g;
}

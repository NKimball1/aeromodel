import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Vector2,
  Material,
  Mesh,
  Quaternion,
  Shape,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from './bikeGeometry';
import type { TubeSpec } from './bikeTypes';

const UP = new Vector3(0, 1, 0);
const LOCAL_X = new Vector3();
const FLIP_ABOUT_AXIS = new Quaternion().setFromAxisAngle(UP, Math.PI);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpDir = new Vector3();

/**
 * A mesh stretched between two points: a limb, a frame tube, a crank arm.
 * The geometry is built along +Y with a rest length; `set` positions,
 * orients, and scales it so it spans `from` → `to`.
 */
export class Segment {
  readonly mesh: Mesh;

  constructor(
    geometry: BufferGeometry,
    material: Material,
    private readonly restLength: number,
  ) {
    this.mesh = new Mesh(geometry, material);
    this.mesh.castShadow = true;
  }

  static capsule(radius: number, length: number, material: Material): Segment {
    return new Segment(new CapsuleGeometry(radius, length, 5, 16), material, length);
  }

  /**
   * A capsule whose radius changes along its length: `r0` at the start,
   * `r1` at the end, with an optional muscle bulge (extra radius, fraction
   * along) between. Built along +Y like the other segments.
   */
  static taperedCapsule(
    r0: number,
    r1: number,
    length: number,
    material: Material,
    bulge?: { extra: number; at: number; width?: number },
  ): Segment {
    return new Segment(taperedCapsuleGeometry(r0, r1, length, bulge), material, length);
  }

  static cylinder(radius: number, material: Material, radialSegments = 12): Segment {
    return new Segment(new CylinderGeometry(radius, radius, 1, radialSegments), material, 1);
  }

  /** A frame tube with a round, oval, or truncated-airfoil section. */
  static tube(spec: TubeSpec, material: Material): Segment {
    return new Segment(tubeGeometry(spec), material, 1);
  }

  /**
   * @param girthX thickness scale across the segment in its bend plane
   * @param girthZ thickness scale across the segment sideways. For segments
   *   lying in the side-view plane (the torso), local Z stays world Z, so this
   *   is the body's width.
   * @param faceForward spin the section about its axis so its local +X (an
   *   airfoil's leading edge) faces into the wind at +X.
   */
  set(from: V3, to: V3, girthX = 1, girthZ = girthX, faceForward = false): this {
    tmpA.set(from.x, from.y, from.z);
    tmpB.set(to.x, to.y, to.z);
    tmpDir.subVectors(tmpB, tmpA);
    const dist = tmpDir.length();
    if (dist < 1e-9) return this;
    this.mesh.position.addVectors(tmpA, tmpB).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, tmpDir.divideScalar(dist));
    if (faceForward) {
      LOCAL_X.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);
      if (LOCAL_X.x < 0) this.mesh.quaternion.multiply(FLIP_ABOUT_AXIS);
    }
    this.mesh.scale.set(girthX, dist / this.restLength, girthZ);
    return this;
  }
}

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** Unit-length tube along +Y with the given cross-section; leading edge at +X. */
export function tubeGeometry(spec: TubeSpec): BufferGeometry {
  if (spec.profile !== 'kamm') {
    const geo = new CylinderGeometry(0.5, 0.5, 1, 20);
    geo.scale(spec.chord, 1, spec.width);
    return geo;
  }
  const extruded = new ExtrudeGeometry(kammShape(spec.chord, spec.width), {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 6,
  });
  extruded.translate(0, 0, -0.5);
  // Extrusion runs along Z; turn it to run along Y (the section's width ends up on Z).
  extruded.rotateX(-Math.PI / 2);
  // Weld the side walls so the airfoil shades smoothly instead of faceted.
  extruded.deleteAttribute('normal');
  extruded.deleteAttribute('uv');
  const welded = mergeVertices(extruded, 1e-5);
  welded.computeVertexNormals();
  extruded.dispose();
  return welded;
}

/** Truncated airfoil section: elliptical nose, straight taper, flat tail. */
function kammShape(chord: number, width: number): Shape {
  const half = width / 2;
  const c = chord / 2;
  const tail = half * 0.6;
  const noseLen = chord * 0.38;
  const noseX = c - noseLen;
  const s = new Shape();
  const steps = 14;
  s.moveTo(noseX, -half);
  for (let i = 1; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;
    s.lineTo(noseX + noseLen * Math.cos(a), half * Math.sin(a));
  }
  s.quadraticCurveTo(-c * 0.35, half, -c, tail);
  s.lineTo(-c, -tail);
  s.quadraticCurveTo(-c * 0.35, -half, noseX, -half);
  return s;
}

/** Profile-revolved capsule from y = −length/2 to +length/2, radius r0 → r1 with an optional bulge. */
export function taperedCapsuleGeometry(
  r0: number,
  r1: number,
  length: number,
  bulge?: { extra: number; at: number; width?: number },
): BufferGeometry {
  const pts: Vector2[] = [];
  const half = length / 2;
  // Bottom cap.
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / 6);
    pts.push(new Vector2(Math.max(0.0005, r0 * Math.cos(a)), -half + r0 * Math.sin(a)));
  }
  // Body, with taper and bulge.
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    let r = r0 + (r1 - r0) * t;
    if (bulge) {
      const w = bulge.width ?? 0.25;
      r += bulge.extra * Math.exp(-((t - bulge.at) ** 2) / (2 * w * w));
    }
    pts.push(new Vector2(r, -half + length * t));
  }
  // Top cap.
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 2) * (i / 6);
    pts.push(new Vector2(Math.max(0.0005, r1 * Math.cos(a)), half + r1 * Math.sin(a)));
  }
  return new LatheGeometry(pts, 20);
}

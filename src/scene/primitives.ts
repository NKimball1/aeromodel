import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Material,
  Mesh,
  Vector3,
} from 'three';
import type { V3 } from './bikeGeometry';

const UP = new Vector3(0, 1, 0);
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

  static cylinder(radius: number, material: Material, radialSegments = 12): Segment {
    return new Segment(new CylinderGeometry(radius, radius, 1, radialSegments), material, 1);
  }

  /**
   * @param girthX thickness scale across the segment in its bend plane
   * @param girthZ thickness scale across the segment sideways. For segments
   *   lying in the side-view plane (the torso), local Z stays world Z, so this
   *   is the body's width.
   */
  set(from: V3, to: V3, girthX = 1, girthZ = girthX): this {
    tmpA.set(from.x, from.y, from.z);
    tmpB.set(to.x, to.y, to.z);
    tmpDir.subVectors(tmpB, tmpA);
    const dist = tmpDir.length();
    if (dist < 1e-9) return this;
    this.mesh.position.addVectors(tmpA, tmpB).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, tmpDir.divideScalar(dist));
    this.mesh.scale.set(girthX, dist / this.restLength, girthZ);
    return this;
  }
}

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

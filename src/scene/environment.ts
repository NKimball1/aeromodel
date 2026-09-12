import {
  ArrowHelper,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import { PALETTE } from './materials';

const ARROW_ORIGIN = new Vector3(2.5, 1.95, 0);
const ARROW_DIR_NEG_X = new Vector3(-1, 0, 0);
const ARROW_DIR_POS_X = new Vector3(1, 0, 0);

/** Light-gray wind tunnel: floor, grid, balance plate, lights, speed arrow. */
export class TunnelEnvironment {
  private readonly arrow: ArrowHelper;

  constructor(scene: Scene) {
    scene.background = new Color(PALETTE.background);
    scene.fog = new Fog(PALETTE.background, 7, 18);

    const floor = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ color: PALETTE.floor, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new GridHelper(24, 48, PALETTE.gridMajor, PALETTE.gridMinor);
    grid.position.y = 0.001;
    scene.add(grid);

    const plate = new Mesh(new CircleGeometry(1.15, 64), new MeshStandardMaterial({ color: PALETTE.balancePlate, roughness: 0.9 }));
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(0.08, 0.002, 0);
    plate.receiveShadow = true;
    scene.add(plate);

    scene.add(new HemisphereLight(0xffffff, 0xaab1b9, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.9);
    sun.position.set(2.5, 6, 3.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -2.5;
    sc.right = 2.5;
    sc.top = 2.5;
    sc.bottom = -2.5;
    sc.near = 1;
    sc.far = 15;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.015;
    sun.shadow.radius = 3;
    scene.add(sun);

    this.arrow = new ArrowHelper(ARROW_DIR_NEG_X, ARROW_ORIGIN, 0.5, PALETTE.arrow, 0.12, 0.07);
    scene.add(this.arrow);
  }

  /** Arrow points the way the air moves; length grows with airspeed. */
  setAirSpeed(airSpeedMs: number): void {
    const len = Math.min(1.8, 0.18 + Math.abs(airSpeedMs) * 0.07);
    this.arrow.setDirection(airSpeedMs >= 0 ? ARROW_DIR_NEG_X : ARROW_DIR_POS_X);
    this.arrow.setLength(len, Math.min(0.14, len * 0.4), 0.07);
  }
}

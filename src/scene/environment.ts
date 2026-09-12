import {
  ArrowHelper,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector3,
} from 'three';
import { PALETTE } from './materials';

const ARROW_ORIGIN = new Vector3(2.5, 1.95, 0);
const ARROW_DIR_NEG_X = new Vector3(-1, 0, 0);
const ARROW_DIR_POS_X = new Vector3(1, 0, 0);

/**
 * A rolling road: a strip of tarmac through the tunnel that scrolls under the
 * wheels. The rider sits in the centre of the right-hand lane.
 */
const ROAD = {
  length: 60,
  /** Lateral extent, world Z (rider's left is −Z). */
  zMin: -5.2,
  zMax: 2.25,
  /** Length of road one texture tile covers, metres. Dash pattern must fit it. */
  tileLength: 8,
  edgeLineZ: 2.0,
  centreLineZ: -1.6,
  lineWidth: 0.12,
  dashLength: 2.5,
};

/** Light-gray wind tunnel with a rolling tarmac road, lights and a speed arrow. */
export class TunnelEnvironment {
  private readonly arrow: ArrowHelper;
  private readonly roadTexture: CanvasTexture;

  constructor(scene: Scene, maxAnisotropy: number) {
    scene.background = new Color(PALETTE.background);
    scene.fog = new Fog(PALETTE.background, 8, 22);

    const floor = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: PALETTE.floor, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.004;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new GridHelper(30, 60, PALETTE.gridMajor, PALETTE.gridMinor);
    grid.position.y = -0.002;
    scene.add(grid);

    this.roadTexture = buildRoadTexture(maxAnisotropy);
    const roadWidth = ROAD.zMax - ROAD.zMin;
    const road = new Mesh(
      new PlaneGeometry(ROAD.length, roadWidth),
      new MeshStandardMaterial({ map: this.roadTexture, roughness: 0.95, metalness: 0 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, (ROAD.zMin + ROAD.zMax) / 2);
    road.receiveShadow = true;
    scene.add(road);

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

  /** Scroll the road backwards (−X) at the displayed ground speed. */
  update(dt: number, displayedGroundSpeedMs: number): void {
    const t = this.roadTexture;
    t.offset.x = (t.offset.x + (displayedGroundSpeedMs * dt) / ROAD.tileLength) % 1;
  }
}

/** Procedural asphalt with lane markings. No image files. */
function buildRoadTexture(maxAnisotropy: number): CanvasTexture {
  const W = 1024;
  const H = 1024;
  const pxPerMetreX = W / ROAD.tileLength;
  const pxPerMetreZ = H / (ROAD.zMax - ROAD.zMin);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Deterministic grain so the road looks the same on every load.
  let seed = 20260912;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 84 + (rand() - 0.5) * 22;
    const speck = rand();
    if (speck < 0.03) v += 38 + rand() * 30; // light aggregate
    else if (speck < 0.06) v -= 26; // dark pits
    d[i] = v;
    d[i + 1] = v + 1;
    d[i + 2] = v + 4;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Canvas row 0 is world zMin (the plane's +Y edge after rotation, with flipY).
  const row = (z: number) => (z - ROAD.zMin) * pxPerMetreZ;
  const lineH = ROAD.lineWidth * pxPerMetreZ;
  ctx.fillStyle = 'rgba(236, 234, 226, 0.92)';
  ctx.fillRect(0, row(ROAD.edgeLineZ) - lineH / 2, W, lineH);
  ctx.fillStyle = 'rgba(232, 196, 92, 0.9)';
  ctx.fillRect(0, row(ROAD.centreLineZ) - lineH / 2, ROAD.dashLength * pxPerMetreX, lineH);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.repeat.set(ROAD.length / ROAD.tileLength, 1);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

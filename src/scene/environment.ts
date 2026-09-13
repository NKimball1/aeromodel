import {
  ArrowHelper,
  BackSide,
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
  ShaderMaterial,
  SphereGeometry,
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
  length: 80,
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

/** Overcast-bright outdoor light: sky dome, tarmac road, soft sun, speed arrow. */
export class TunnelEnvironment {
  private readonly arrow: ArrowHelper;
  private readonly roadTexture: CanvasTexture;

  constructor(scene: Scene, maxAnisotropy: number) {
    scene.background = new Color(PALETTE.skyHorizon);
    scene.fog = new Fog(PALETTE.fog, 10, 34);
    scene.add(skyDome());

    const floor = new Mesh(
      new PlaneGeometry(120, 120),
      new MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.95, map: buildFloorTexture(maxAnisotropy) }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.004;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new GridHelper(40, 80, PALETTE.gridMajor, PALETTE.gridMinor);
    (grid.material as { transparent: boolean; opacity: number }).transparent = true;
    (grid.material as { transparent: boolean; opacity: number }).opacity = 0.45;
    grid.position.y = -0.002;
    scene.add(grid);

    this.roadTexture = buildRoadTexture(maxAnisotropy);
    const roadWidth = ROAD.zMax - ROAD.zMin;
    const road = new Mesh(
      new PlaneGeometry(ROAD.length, roadWidth),
      new MeshStandardMaterial({ map: this.roadTexture, roughness: 0.9, metalness: 0 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, (ROAD.zMin + ROAD.zMax) / 2);
    road.receiveShadow = true;
    scene.add(road);

    // Sky/ground bounce plus a warm, high sun. Intensities are for ACES tone mapping.
    scene.add(new HemisphereLight(0xdfe8f5, 0x9a9590, 1.1));
    const sun = new DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(3.5, 7, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -3;
    sc.right = 3;
    sc.top = 3;
    sc.bottom = -3;
    sc.near = 1;
    sc.far = 20;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 6;
    scene.add(sun);
    // Cool fill from the sky side so shadowed surfaces keep their colour.
    const fill = new DirectionalLight(0xcfe0ff, 0.5);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

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

/** Gradient sky on the inside of a big sphere. Fog-free so the horizon stays crisp. */
function skyDome(): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color(PALETTE.skyTop) },
      uHorizon: { value: new Color(PALETTE.skyHorizon) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        // Most of the gradient happens low in the sky, like a real hazy day.
        float t = pow(h, 0.45);
        gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(200, 32, 16), material);
  dome.renderOrder = -1;
  return dome;
}

/** Deterministic pseudo-random for textures, so every load looks the same. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Faint concrete grain for the floor beside the road. */
function buildFloorTexture(maxAnisotropy: number): CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(7);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 236 + (rand() - 0.5) * 14;
    d[i] = v;
    d[i + 1] = v + 1;
    d[i + 2] = v + 3;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(30, 30);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** Procedural asphalt with lane markings, tyre-polished wheel tracks and worn paint. */
function buildRoadTexture(maxAnisotropy: number): CanvasTexture {
  const W = 1024;
  const H = 1024;
  const pxPerMetreX = W / ROAD.tileLength;
  const pxPerMetreZ = H / (ROAD.zMax - ROAD.zMin);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const rand = rng(20260912);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  // Canvas row 0 is world zMin. Wheel tracks in the lane the rider uses (z ≈ 0) sit a little darker.
  const row = (z: number) => (z - ROAD.zMin) * pxPerMetreZ;
  const trackRows = [row(-0.35), row(0.35)];
  for (let y = 0; y < H; y++) {
    let track = 0;
    for (const tr of trackRows) track = Math.max(track, Math.exp(-((y - tr) ** 2) / (2 * (0.22 * pxPerMetreZ) ** 2)));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let v = 96 + (rand() - 0.5) * 26 - track * 9;
      const speck = rand();
      if (speck < 0.035) v += 30 + rand() * 34; // light aggregate
      else if (speck < 0.07) v -= 24; // dark pits
      d[i] = v;
      d[i + 1] = v + 1;
      d[i + 2] = v + 4;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Paint with a worn edge: slightly transparent, with a speckled mask.
  const lineH = ROAD.lineWidth * pxPerMetreZ;
  const paint = (y: number, x0: number, x1: number, rgb: string) => {
    ctx.fillStyle = rgb;
    ctx.fillRect(x0, y - lineH / 2, x1 - x0, lineH);
    for (let k = 0; k < 900; k++) {
      const px = x0 + rand() * (x1 - x0);
      const py = y - lineH / 2 + rand() * lineH;
      ctx.fillStyle = `rgba(90,90,92,${(0.15 + rand() * 0.35).toFixed(2)})`;
      ctx.fillRect(px, py, 1 + rand() * 2, 1 + rand() * 2);
    }
  };
  paint(row(ROAD.edgeLineZ), 0, W, 'rgba(238, 236, 228, 0.9)');
  paint(row(ROAD.centreLineZ), 0, ROAD.dashLength * pxPerMetreX, 'rgba(236, 200, 96, 0.9)');

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.repeat.set(ROAD.length / ROAD.tileLength, 1);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

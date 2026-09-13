import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

/** Stylised wind-tunnel mannequin palette. */
export const PALETTE = {
  /** Sky gradient, zenith → horizon, and the ground haze. */
  skyTop: 0xbfd0e4,
  skyHorizon: 0xeef1f4,
  fog: 0xe4e8ed,
  floor: 0xcfd3d8,
  gridMajor: 0xb6bcc4,
  gridMinor: 0xc4c9cf,
  skin: 0xf2e9df,
  kit: 0x2f62ad,
  shorts: 0x23262c,
  shoe: 0x1e2126,
  glove: 0x2c2f35,
  helmet: 0x30353c,
  cap: 0xc2453b,
  component: 0x17191d,
  alloy: 0xc9ccd1,
  carbon: 0x24262b,
  tire: 0x1a1b1e,
  tireWall: 0x2b2c30,
  decal: 0xefefef,
  pad: 0x3c4048,
  wind: 0x3b78c9,
  /** Wake smoke and slowed, turbulent air. Warm raspberry: reads as 'lost energy' and stays clear of the readout's series colours. */
  wake: 0xd1467c,
  arrow: 0xd4553f,
} as const;

/** Carbon/plastic parts get a light clearcoat so highlights read as glossy, not chalky. */
const gloss = (color: number, roughness: number, metalness = 0, clearcoat = 0.6) =>
  new MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness: 0.3 });

export const materials = {
  skin: new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.65 }),
  shorts: new MeshStandardMaterial({ color: PALETTE.shorts, roughness: 0.72 }),
  shoe: gloss(PALETTE.shoe, 0.4, 0, 0.8),
  glove: new MeshStandardMaterial({ color: PALETTE.glove, roughness: 0.8 }),
  helmet: gloss(PALETTE.helmet, 0.35, 0, 1),
  cap: new MeshStandardMaterial({ color: PALETTE.cap, roughness: 0.9 }),
  component: new MeshStandardMaterial({ color: PALETTE.component, roughness: 0.45, metalness: 0.5 }),
  alloy: new MeshStandardMaterial({ color: PALETTE.alloy, roughness: 0.28, metalness: 0.85, side: DoubleSide }),
  carbon: new MeshPhysicalMaterial({
    color: PALETTE.carbon,
    roughness: 0.32,
    metalness: 0.1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.25,
    side: DoubleSide,
  }),
  tire: new MeshStandardMaterial({ color: PALETTE.tire, roughness: 0.92 }),
  decal: new MeshStandardMaterial({ color: PALETTE.decal, roughness: 0.5 }),
  pad: new MeshStandardMaterial({ color: PALETTE.pad, roughness: 0.9 }),
};

/** Frame paint: glossy clearcoated colour. Built per bike type. */
export function createFramePaint(color: number): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: 0.3,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  });
}

export interface FlutterUniforms {
  uTime: { value: number };
  uFlutter: { value: number };
}

/**
 * Kit fabric: a standard material whose vertices ripple along their normals.
 * `uFlutter` is the ripple amplitude in metres (0 = skin-tight), `uTime`
 * advances faster in stronger wind.
 */
export function createKitMaterial(): { material: MeshPhysicalMaterial; uniforms: FlutterUniforms } {
  const uniforms: FlutterUniforms = { uTime: { value: 0 }, uFlutter: { value: 0 } };
  // Sheen gives lycra its soft edge highlight.
  const material = new MeshPhysicalMaterial({ color: PALETTE.kit, roughness: 0.7, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new Color(0x6f9be0) });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlutter = uniforms.uFlutter;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uFlutter;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ripple = 0.6 * sin(position.y * 38.0 - uTime * 9.0 + position.z * 21.0)
                     + 0.4 * sin(position.x * 45.0 + position.y * 17.0 - uTime * 13.0);
        transformed += objectNormal * uFlutter * ripple;`,
      );
  };
  return { material, uniforms };
}

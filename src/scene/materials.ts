import { DoubleSide, MeshStandardMaterial } from 'three';

/** Stylised wind-tunnel mannequin palette. */
export const PALETTE = {
  background: 0xdde1e6,
  floor: 0xd2d6db,
  gridMajor: 0xb3b9c1,
  gridMinor: 0xc6cbd1,
  balancePlate: 0xc4c9cf,
  skin: 0xf1eee9,
  kit: 0x2f62ad,
  shorts: 0x2a2d33,
  shoe: 0x24272c,
  glove: 0x35383e,
  helmet: 0x3a3f47,
  cap: 0xc2453b,
  frame: 0x2b2f36,
  component: 0x1d1f23,
  alloy: 0xb9bdc3,
  carbon: 0x2a2c31,
  tire: 0x1c1d20,
  decal: 0xe8e8e8,
  pad: 0x3c4048,
  wind: 0x2c64a8,
  /** Wake smoke and slowed, turbulent air. Warm raspberry: reads as 'lost energy' and stays clear of the readout's series colours. */
  wake: 0xc23b6e,
  arrow: 0xd4553f,
} as const;

export const materials = {
  skin: new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.85 }),
  shorts: new MeshStandardMaterial({ color: PALETTE.shorts, roughness: 0.8 }),
  shoe: new MeshStandardMaterial({ color: PALETTE.shoe, roughness: 0.5 }),
  glove: new MeshStandardMaterial({ color: PALETTE.glove, roughness: 0.8 }),
  helmet: new MeshStandardMaterial({ color: PALETTE.helmet, roughness: 0.45 }),
  cap: new MeshStandardMaterial({ color: PALETTE.cap, roughness: 0.9 }),
  frame: new MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.4, metalness: 0.2 }),
  component: new MeshStandardMaterial({ color: PALETTE.component, roughness: 0.5, metalness: 0.3 }),
  alloy: new MeshStandardMaterial({ color: PALETTE.alloy, roughness: 0.35, metalness: 0.7, side: DoubleSide }),
  carbon: new MeshStandardMaterial({ color: PALETTE.carbon, roughness: 0.35, metalness: 0.2, side: DoubleSide }),
  tire: new MeshStandardMaterial({ color: PALETTE.tire, roughness: 0.9 }),
  decal: new MeshStandardMaterial({ color: PALETTE.decal, roughness: 0.6 }),
  pad: new MeshStandardMaterial({ color: PALETTE.pad, roughness: 0.9 }),
};

export interface FlutterUniforms {
  uTime: { value: number };
  uFlutter: { value: number };
}

/**
 * Kit fabric: a standard material whose vertices ripple along their normals.
 * `uFlutter` is the ripple amplitude in metres (0 = skin-tight), `uTime`
 * advances faster in stronger wind.
 */
export function createKitMaterial(): { material: MeshStandardMaterial; uniforms: FlutterUniforms } {
  const uniforms: FlutterUniforms = { uTime: { value: 0 }, uFlutter: { value: 0 } };
  const material = new MeshStandardMaterial({ color: PALETTE.kit, roughness: 0.75 });
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

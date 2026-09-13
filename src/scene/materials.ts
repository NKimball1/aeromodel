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
  wake: 0xe42f74,
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
  /** World-space heights the kit gradient runs between (hips → shoulders). Set per frame from the pose. */
  uGradY0: { value: number };
  uGradY1: { value: number };
}

/** Kit gradient stops, bottom → top. Cool: navy, electric blue, aqua. */
export const KIT_GRADIENT = {
  low: 0x14306e,
  mid: 0x2b6cd4,
  high: 0x3fd0d6,
} as const;

/**
 * Kit fabric: a physical material whose vertices ripple along their normals
 * and whose colour runs through a vertical gradient. `uFlutter` is the
 * ripple amplitude in metres (0 = skin-tight), `uTime` advances faster in
 * stronger wind, `uGradY0/1` frame the gradient on the body.
 */
export function createKitMaterial(): { material: MeshPhysicalMaterial; uniforms: FlutterUniforms } {
  const uniforms: FlutterUniforms = {
    uTime: { value: 0 },
    uFlutter: { value: 0 },
    uGradY0: { value: 0.8 },
    uGradY1: { value: 1.4 },
  };
  // Sheen gives lycra its soft edge highlight.
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.7,
    sheen: 0.6,
    sheenRoughness: 0.6,
    sheenColor: new Color(0x8fb6ea),
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlutter = uniforms.uFlutter;
    shader.uniforms.uGradY0 = uniforms.uGradY0;
    shader.uniforms.uGradY1 = uniforms.uGradY1;
    shader.uniforms.uGradLow = { value: new Color(KIT_GRADIENT.low) };
    shader.uniforms.uGradMid = { value: new Color(KIT_GRADIENT.mid) };
    shader.uniforms.uGradHigh = { value: new Color(KIT_GRADIENT.high) };
    shader.vertexShader =
      ['uniform float uTime;', 'uniform float uFlutter;', 'varying vec3 vKitPos;', ''].join(String.fromCharCode(10)) +
      shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        float ripple = 0.6 * sin(position.y * 38.0 - uTime * 9.0 + position.z * 21.0)
                     + 0.4 * sin(position.x * 45.0 + position.y * 17.0 - uTime * 13.0);
        transformed += objectNormal * uFlutter * ripple;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
        vKitPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
    shader.fragmentShader =
      [
        'uniform float uGradY0;',
        'uniform float uGradY1;',
        'uniform vec3 uGradLow;',
        'uniform vec3 uGradMid;',
        'uniform vec3 uGradHigh;',
        'varying vec3 vKitPos;',
        '',
      ].join(String.fromCharCode(10)) +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Height up the body, with a slight lean so the bands run diagonally like a printed panel.
        float t = clamp((vKitPos.y - uGradY0 + vKitPos.x * 0.12) / max(0.05, uGradY1 - uGradY0), 0.0, 1.0);
        vec3 grad = t < 0.55 ? mix(uGradLow, uGradMid, smoothstep(0.0, 0.55, t))
                             : mix(uGradMid, uGradHigh, smoothstep(0.55, 1.0, t));
        diffuseColor.rgb *= grad;`,
      );
  };
  return { material, uniforms };
}

/**
 * Prints a quick reference table of the model's output so the constants can
 * be sanity-checked by eye. Run with:  corepack pnpm@latest ref
 */
import { it } from 'vitest';
import {
  POSITIONS,
  computeCdA,
  computeCrr,
  defaultConfig,
  defaultEnvironment,
  kmhToMs,
  msToKmh,
  powerFromSpeed,
  speedFromPower,
} from '../src/physics';

it('prints the reference table', () => {
  const speeds = [20, 25, 30, 35, 40, 45];
  const { speedMs: _s, ...env } = defaultEnvironment;

  console.log(`Rider ${env.riderMassKg} kg + bike ${env.bikeMassKg} kg, rho ${env.rho}, flat, still air, ` +
    `${defaultConfig.tireQuality} tires ${defaultConfig.tireWidthMm} mm, ${(env.drivetrainLoss * 100).toFixed(0)} % drivetrain loss\n`);

  console.log('Watts required by position (baseline kit/helmet/wheels):');
  console.log('position           CdA     Crr     ' + speeds.map((s) => `${s} km/h`.padStart(9)).join(''));
  for (const position of POSITIONS) {
    const cfg = { ...defaultConfig, position };
    const row = speeds
      .map((s) => powerFromSpeed({ ...env, speedMs: kmhToMs(s) }, cfg).total.toFixed(0).padStart(9))
      .join('');
    console.log(
      `${position.padEnd(18)} ${computeCdA(cfg).toFixed(3)}   ${computeCrr(cfg).toFixed(4)}  ${row}`,
    );
  }

  console.log('\nSpeed at fixed power on the hoods (km/h):');
  for (const w of [100, 150, 200, 250, 300]) {
    console.log(`  ${String(w).padStart(3)} W → ${msToKmh(speedFromPower(w, env, defaultConfig)).toFixed(1)} km/h`);
  }

  console.log('\nEquipment deltas at 40 km/h on the hoods (W saved vs baseline):');
  const base40 = powerFromSpeed({ ...env, speedMs: kmhToMs(40) }, defaultConfig).total;
  const variants: Array<[string, Partial<typeof defaultConfig>]> = [
    ['skinsuit', { kit: 'skinsuit' }],
    ['loose jersey', { kit: 'looseJersey' }],
    ['baggy jacket', { kit: 'baggyJacket' }],
    ['aero helmet', { helmet: 'aero' }],
    ['no helmet', { helmet: 'none' }],
    ['mid wheels f+r', { frontWheel: 'mid', rearWheel: 'mid' }],
    ['deep f + disc r', { frontWheel: 'deep', rearWheel: 'disc' }],
    ['racing tires', { tireQuality: 'racing' }],
    ['32 mm tires', { tireWidthMm: 32 }],
  ];
  for (const [label, over] of variants) {
    const w = powerFromSpeed({ ...env, speedMs: kmhToMs(40) }, { ...defaultConfig, ...over }).total;
    console.log(`  ${label.padEnd(16)} ${(base40 - w).toFixed(1).padStart(6)} W`);
  }
});

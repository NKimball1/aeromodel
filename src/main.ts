// Checkpoint 1: physics only. Scene + UI arrive in later checkpoints.
import { powerFromSpeed, defaultConfig, defaultEnvironment, kmhToMs } from './physics';

const p = powerFromSpeed({ ...defaultEnvironment, speedMs: kmhToMs(30) }, defaultConfig);
document.getElementById('app')!.textContent =
  `Physics smoke test: default rider at 30 km/h needs ${p.total.toFixed(0)} W`;

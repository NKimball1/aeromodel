import './style.css';
import {
  defaultConfig,
  defaultEnvironment,
  kmhToMs,
  msToKmh,
  type Environment,
  type RiderConfig,
} from './physics';
import { AeroScene } from './scene';
import { mountDevBar } from './ui/devBar';
import { sceneStateFor } from './ui/sceneMapping';

const app = document.getElementById('app')!;

let config: RiderConfig = { ...defaultConfig };
let env: Environment = { ...defaultEnvironment };

const scene = new AeroScene(app, sceneStateFor(config, env));

mountDevBar(
  app,
  { config, speedKmh: Math.round(msToKmh(env.speedMs)) },
  (next) => {
    config = next.config;
    env = { ...env, speedMs: kmhToMs(next.speedKmh) };
    scene.setState(sceneStateFor(config, env));
  },
  (view) => scene.setView(view),
);

if (import.meta.env.DEV) (window as unknown as { aero: AeroScene }).aero = scene;
if (import.meta.hot) import.meta.hot.dispose(() => scene.dispose());

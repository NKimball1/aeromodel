import './style.css';
import { AeroScene } from './scene';
import { currentSetup, initialAppState, type AppState } from './ui/appState';
import { compare } from './ui/baseline';
import { ControlPanel } from './ui/controlPanel';
import { evaluate } from './ui/evaluate';
import { Readout } from './ui/readout';
import { sceneStateFor } from './ui/sceneMapping';
import { Store } from './ui/store';

const app = document.getElementById('app')!;
const store = new Store<AppState>(initialAppState);

const firstEval = evaluate(store.get());
const scene = new AeroScene(app, sceneStateFor(store.get().config, firstEval.env));

const controlsHost = document.createElement('div');
controlsHost.className = 'panel-controls';
app.appendChild(controlsHost);
const panel = new ControlPanel(controlsHost, store, (view) => scene.setView(view));

const readout = new Readout(app, {
  onPin: () => store.update((s) => ({ ...s, baseline: currentSetup(s) })),
  onClear: () => store.update((s) => ({ ...s, baseline: null })),
});

function render(state: AppState): void {
  const ev = evaluate(state);
  scene.setState(sceneStateFor(state.config, ev.env));
  panel.sync(state, ev);
  readout.update(state, ev, compare(state));
}

store.subscribe(render);
render(store.get());

// Keep the rider centred in the space the panels leave free.
const insets = new ResizeObserver(() => {
  const appBox = app.getBoundingClientRect();
  const c = controlsHost.getBoundingClientRect();
  const r = readout.element.getBoundingClientRect();
  const docked = getComputedStyle(readout.element).getPropertyValue('--docked').trim() === '1';
  scene.setInsets({
    left: c.width > 0 ? c.right - appBox.left : 0,
    right: docked ? 0 : appBox.right - r.left,
    bottom: docked ? appBox.bottom - r.top : 0,
  });
});
insets.observe(controlsHost);
insets.observe(readout.element);
insets.observe(app);

if (import.meta.env.DEV) Object.assign(window, { aero: scene, store });
if (import.meta.hot) import.meta.hot.dispose(() => scene.dispose());

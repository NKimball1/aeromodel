/**
 * The numbers panel: hero figure, stat tiles, power breakdown stacked bar,
 * and the pinned-baseline comparison. Plain DOM, rebuilt in place each update.
 */
import type { AppState } from './appState';
import type { Comparison } from './baseline';
import type { Evaluation } from './evaluate';
import { SPEED_UNIT_LABEL, signed, speedText, toSpeedUnit } from './format';

/**
 * Categorical slots 1–4 of the validated reference palette, in fixed order.
 * Adjacent-pair CVD/normal-vision checks pass; aqua and yellow are under 3:1
 * on the surface, so every segment's value is also printed in the legend.
 */
export const BREAKDOWN_SERIES = [
  { key: 'aero', label: 'Aero', color: '#2a78d6' },
  { key: 'rolling', label: 'Rolling', color: '#eb6834' },
  { key: 'gravity', label: 'Gravity', color: '#1baf7a' },
  { key: 'drivetrain', label: 'Drivetrain', color: '#eda100' },
] as const;

export interface ReadoutActions {
  onPin: () => void;
  onClear: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class Readout {
  readonly element = el('section', 'readout');
  private readonly heroValue = el('div', 'hero-value');
  private readonly heroUnit = el('span', 'hero-unit');
  private readonly heroCaption = el('div', 'hero-caption');
  private readonly tiles = el('div', 'tiles');
  private readonly bar = el('div', 'stack-bar');
  private readonly legend = el('ul', 'stack-legend');
  private readonly tooltip = el('div', 'stack-tooltip');
  private readonly baseline = el('div', 'baseline');

  constructor(container: HTMLElement, private readonly actions: ReadoutActions) {
    this.element.setAttribute('aria-live', 'polite');

    const hero = el('div', 'hero');
    const heroLine = el('div', 'hero-line');
    heroLine.append(this.heroValue, this.heroUnit);
    hero.append(heroLine, this.heroCaption);

    const breakdown = el('div', 'breakdown');
    const title = el('div', 'section-title', 'Where the power goes');
    this.bar.setAttribute('role', 'img');
    const barWrap = el('div', 'stack-wrap');
    barWrap.append(this.bar, this.tooltip);
    this.tooltip.hidden = true;
    breakdown.append(title, barWrap, this.legend);

    this.element.append(hero, this.tiles, breakdown, this.baseline);
    container.appendChild(this.element);
  }

  update(state: AppState, ev: Evaluation, cmp: Comparison | null): void {
    const su = state.units.speed;
    if (state.hold === 'power') {
      this.heroValue.textContent = toSpeedUnit(ev.speedMs, su).toFixed(1);
      this.heroUnit.textContent = SPEED_UNIT_LABEL[su];
      this.heroCaption.textContent = `at ${Math.round(ev.powerW)} W · ${ev.wPerKg.toFixed(2)} W/kg`;
    } else {
      this.heroValue.textContent = String(Math.round(ev.powerW));
      this.heroUnit.textContent = 'W';
      this.heroCaption.textContent = `to hold ${speedText(ev.speedMs, su)} · ${ev.wPerKg.toFixed(2)} W/kg`;
    }

    this.renderTiles(state, ev);
    this.renderBreakdown(ev);
    this.renderBaseline(state, cmp);
  }

  private renderTiles(state: AppState, ev: Evaluation): void {
    const su = state.units.speed;
    const tiles: Array<[string, string, string]> =
      state.hold === 'power'
        ? [
            ['Power', String(Math.round(ev.powerW)), 'W'],
            ['W/kg', ev.wPerKg.toFixed(2), ''],
          ]
        : [
            ['Speed', toSpeedUnit(ev.speedMs, su).toFixed(1), SPEED_UNIT_LABEL[su]],
            ['W/kg', ev.wPerKg.toFixed(2), ''],
          ];
    tiles.push(['CdA', ev.cda.total.toFixed(3), 'm²'], ['Crr', ev.crr.toFixed(4), '']);
    this.tiles.replaceChildren(
      ...tiles.map(([label, value, unit]) => {
        const tile = el('div', 'tile');
        const v = el('div', 'tile-value', value);
        if (unit) v.append(el('span', 'tile-unit', ` ${unit}`));
        tile.append(el('div', 'tile-label', label), v);
        return tile;
      }),
    );
  }

  private renderBreakdown(ev: Evaluation): void {
    const values = BREAKDOWN_SERIES.map((s) => ({ ...s, value: ev.power[s.key] }));
    const positiveTotal = values.reduce((sum, s) => sum + Math.max(0, s.value), 0);

    this.bar.replaceChildren();
    this.bar.setAttribute(
      'aria-label',
      values.map((s) => `${s.label} ${Math.round(s.value)} watts`).join(', '),
    );
    for (const s of values) {
      if (s.value <= 0 || positiveTotal <= 0) continue;
      const share = s.value / positiveTotal;
      const seg = el('div', 'stack-seg');
      seg.style.flexGrow = String(share);
      seg.style.background = s.color;
      seg.tabIndex = 0;
      const tip = `${Math.round(s.value)} W · ${Math.round(share * 100)}%`;
      const show = () => this.showTooltip(seg, tip, s.label);
      seg.addEventListener('pointerenter', show);
      seg.addEventListener('focus', show);
      seg.addEventListener('pointerleave', () => (this.tooltip.hidden = true));
      seg.addEventListener('blur', () => (this.tooltip.hidden = true));
      this.bar.appendChild(seg);
    }
    if (positiveTotal <= 0) this.bar.appendChild(el('div', 'stack-empty', 'Coasting: nothing to overcome'));

    this.legend.replaceChildren(
      ...values.map((s) => {
        const li = el('li');
        const swatch = el('span', 'swatch');
        swatch.style.background = s.color;
        const name = el('span', 'legend-name', s.label);
        const assisting = s.value < -0.5;
        const val = el(
          'span',
          'legend-value',
          assisting ? `${signed(Math.round(s.value), 0)} W (assisting)` : `${Math.round(Math.max(0, s.value))} W`,
        );
        li.append(swatch, name, val);
        return li;
      }),
    );
  }

  private showTooltip(seg: HTMLElement, value: string, label: string): void {
    const t = this.tooltip;
    t.replaceChildren(el('strong', undefined, value), el('span', undefined, label));
    t.hidden = false;
    const barBox = this.bar.getBoundingClientRect();
    const segBox = seg.getBoundingClientRect();
    const centre = segBox.left + segBox.width / 2 - barBox.left;
    t.style.left = `${Math.min(Math.max(centre, 40), barBox.width - 40)}px`;
  }

  private renderBaseline(state: AppState, cmp: Comparison | null): void {
    const b = this.baseline;
    b.replaceChildren();
    if (!cmp) {
      const pin = el('button', 'btn btn-primary', 'Pin current setup as baseline');
      pin.type = 'button';
      pin.addEventListener('click', this.actions.onPin);
      b.append(
        el('div', 'section-title', 'Compare'),
        el('p', 'hint', 'Pin a setup, then change position or gear to see what it is worth.'),
        pin,
      );
      return;
    }

    const delta = el('div', `delta delta-${cmp.direction}`);
    const icon = el('span', 'delta-icon', cmp.direction === 'better' ? '▲' : cmp.direction === 'worse' ? '▼' : '●');
    icon.setAttribute('aria-hidden', 'true');
    const status = el('span', 'sr-only', cmp.direction === 'better' ? 'Better: ' : cmp.direction === 'worse' ? 'Worse: ' : '');
    delta.append(icon, status, el('span', 'delta-text', cmp.headline));

    const lines = el('div', 'delta-lines');
    if (cmp.detail) lines.append(el('div', undefined, cmp.detail));
    const su = state.units.speed;
    lines.append(
      el(
        'div',
        undefined,
        state.hold === 'power'
          ? `Baseline ${speedText(cmp.baseline.speedMs, su)} → now ${speedText(cmp.current.speedMs, su)}`
          : `Baseline ${Math.round(cmp.baseline.powerW)} W → now ${Math.round(cmp.current.powerW)} W`,
      ),
      el('div', undefined, `CdA ${cmp.baseline.cda.total.toFixed(3)} → ${cmp.current.cda.total.toFixed(3)} (${signed(cmp.deltaCdA, 3)} m²)`),
    );

    const changes = el(
      'div',
      'changes',
      cmp.changes.length ? `Changed: ${cmp.changes.join(' · ')}` : 'No changes from the baseline yet.',
    );

    const buttons = el('div', 'baseline-buttons');
    const repin = el('button', 'btn', 'Pin current');
    repin.type = 'button';
    repin.addEventListener('click', this.actions.onPin);
    const clear = el('button', 'btn', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', this.actions.onClear);
    buttons.append(repin, clear);

    b.append(
      el('div', 'section-title', 'Compared with baseline'),
      el('p', 'baseline-desc', cmp.baselineDescription),
      delta,
      lines,
      changes,
      buttons,
    );
  }
}

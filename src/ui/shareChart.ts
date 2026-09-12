/**
 * "Where the power goes as speed rises": a 100 % stacked area chart of each
 * power sink's share of the rider's effort across speed. Hand-built SVG.
 *
 * Same colours as the breakdown bar (colour follows the entity), 2px surface
 * lines between layers, a marker at the current speed, selective direct
 * labels inside the biggest band near each end, a legend, a hover crosshair with a
 * tooltip listing every share, and a table view.
 */
import type { AppState } from './appState';
import { BREAKDOWN_SERIES, textOn, type ShareKey } from './breakdownSeries';
import { nearestPoint, type ShareModel, type SharePoint } from './chartModel';
import { SPEED_UNIT_LABEL, signed } from './format';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 150;
const M = { top: 8, right: 10, bottom: 24, left: 34 };
const COLOR = Object.fromEntries(BREAKDOWN_SERIES.map((s) => [s.key, s.color])) as Record<ShareKey, string>;
const LABEL = Object.fromEntries(BREAKDOWN_SERIES.map((s) => [s.key, s.label])) as Record<ShareKey, string>;
/** Bottom to top: the air sits on the baseline because it's the story. */
const STACK: readonly ShareKey[] = ['aero', 'rolling', 'gravity', 'drivetrain'];

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const html = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export class ShareChart {
  readonly element = html('div', 'chart');
  private readonly headline = html('p', 'chart-headline');
  private readonly detail = html('p', 'chart-detail');
  private readonly legend = html('div', 'chart-legend');
  private readonly plot = html('div', 'chart-plot');
  private readonly tooltip = html('div', 'chart-tooltip');
  private readonly savings = html('div', 'chart-savings');
  private readonly table = html('details', 'chart-table');
  private model: ShareModel | null = null;
  private unitLabel = 'km/h';
  private hoverX: number | null = null;
  private width = 280;

  constructor(container: HTMLElement) {
    const title = html('div', 'section-title', 'Where the power goes as speed rises');
    this.tooltip.hidden = true;
    this.plot.append(this.tooltip);
    this.element.append(title, this.headline, this.detail, this.legend, this.plot, this.savings, this.table);
    container.appendChild(this.element);

    new ResizeObserver(() => {
      const w = Math.round(this.plot.clientWidth);
      if (w > 0 && w !== this.width) {
        this.width = w;
        this.render();
      }
    }).observe(this.plot);

    this.plot.addEventListener('pointermove', (e) => {
      this.hoverX = e.clientX - this.plot.getBoundingClientRect().left;
      this.renderHover();
    });
    this.plot.addEventListener('pointerleave', () => {
      this.hoverX = null;
      this.renderHover();
    });
  }

  update(state: AppState, model: ShareModel): void {
    this.model = model;
    this.unitLabel = SPEED_UNIT_LABEL[state.units.speed];
    this.headline.textContent = model.headline;
    this.detail.textContent = model.detail;
    this.render();
    this.renderSavings();
  }

  private scales() {
    const m = this.model!;
    const innerW = Math.max(40, this.width - M.left - M.right);
    const innerH = HEIGHT - M.top - M.bottom;
    const x = (speed: number) => M.left + (speed / m.xMax) * innerW;
    const y = (share: number) => M.top + (1 - share) * innerH;
    const speedAt = (px: number) => Math.min(m.xMax, Math.max(0, ((px - M.left) / innerW) * m.xMax));
    return { x, y, speedAt, innerW, innerH };
  }

  private render(): void {
    const m = this.model;
    if (!m) return;
    const { x, y, innerW } = this.scales();
    const pts = m.points;

    // Only sinks that matter anywhere get a legend entry (gravity vanishes on the flat).
    const present = STACK.filter((k) => pts.some((p) => p.shares[k] > 0.005));
    this.legend.replaceChildren(
      ...present.map((k) => {
        const item = html('span', 'chart-legend-item');
        const sw = html('span', 'swatch');
        sw.style.background = COLOR[k];
        item.append(sw, document.createTextNode(LABEL[k]));
        return item;
      }),
    );

    const root = svg('svg', { width: this.width, height: HEIGHT, viewBox: `0 0 ${this.width} ${HEIGHT}`, role: 'img' });
    root.setAttribute('aria-label', `${m.headline} ${m.detail}`);

    // Cumulative boundaries, bottom to top.
    const lower = pts.map(() => 0);
    const boundaries: number[][] = [];
    for (const key of STACK) {
      const upper = pts.map((p, i) => lower[i]! + p.shares[key]);
      if (present.includes(key)) {
        const top = pts.map((p, i) => `${x(p.speed).toFixed(1)},${y(upper[i]!).toFixed(1)}`);
        const bottom = pts.map((p, i) => `${x(p.speed).toFixed(1)},${y(lower[i]!).toFixed(1)}`).reverse();
        root.append(svg('polygon', { points: [...top, ...bottom].join(' '), fill: COLOR[key] }));
        boundaries.push(upper);
      }
      for (let i = 0; i < pts.length; i++) lower[i] = upper[i]!;
    }
    // 2px surface lines between layers (not along the 100 % top edge).
    for (const upper of boundaries.slice(0, -1)) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.speed).toFixed(1)},${y(upper[i]!).toFixed(1)}`).join('');
      root.append(svg('path', { d, class: 'layer-gap' }));
    }

    // Direct labels: the biggest band near each end of the chart, where it has room.
    const biggestAt = (fraction: number) => {
      const p = pts[Math.round((pts.length - 1) * fraction)]!;
      return STACK.reduce((a, b) => (p.shares[b] > p.shares[a] ? b : a));
    };
    const right = biggestAt(0.82);
    const left = biggestAt(0.1);
    this.labelBand(root, pts, right, 0.82);
    if (left !== right) this.labelBand(root, pts, left, 0.1);

    // Axes: 0/50/100 % and speed ticks.
    for (const t of [0, 0.5, 1]) {
      root.append(
        Object.assign(svg('text', { x: M.left - 6, y: y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }), {
          textContent: pct(t),
        }),
      );
    }
    for (const t of m.xTicks) {
      root.append(
        Object.assign(svg('text', { x: x(t), y: HEIGHT - M.bottom + 14, class: 'tick', 'text-anchor': 'middle' }), {
          textContent: String(t),
        }),
      );
    }
    root.append(
      Object.assign(svg('text', { x: M.left + innerW, y: HEIGHT - 1, class: 'axis-title', 'text-anchor': 'end' }), {
        textContent: this.unitLabel,
      }),
    );

    // Where you are riding now.
    const cur = m.current;
    if (cur.speed > 0 && cur.speed <= m.xMax) {
      const cx = x(cur.speed);
      root.append(
        svg('line', { x1: cx, x2: cx, y1: M.top, y2: HEIGHT - M.bottom, class: 'now-line' }),
        svg('circle', { cx, cy: y(cur.shares.aero), r: 4.5, fill: COLOR.aero, class: 'marker' }),
        Object.assign(svg('text', { x: cx, y: M.top + 9, class: 'now-label', 'text-anchor': cx > this.width - 40 ? 'end' : 'middle' }), {
          textContent: 'You',
        }),
      );
    }

    root.append(svg('line', { class: 'crosshair', y1: M.top, y2: HEIGHT - M.bottom, x1: -10, x2: -10, visibility: 'hidden' }));
    this.plot.querySelector('svg')?.remove();
    this.plot.prepend(root);
    this.renderHover();
    this.renderTable();
  }

  /** Label a band at a fraction of the x-axis if the band is tall enough there. */
  private labelBand(root: SVGSVGElement, pts: SharePoint[], key: ShareKey, atFraction: number): void {
    const { x, y } = this.scales();
    const p = pts[Math.round((pts.length - 1) * atFraction)]!;
    let below = 0;
    for (const k of STACK) {
      if (k === key) break;
      below += p.shares[k];
    }
    const top = y(below + p.shares[key]);
    const bottom = y(below);
    if (bottom - top < 18) return;
    const text = svg('text', {
      x: x(p.speed),
      y: (top + bottom) / 2 + 4,
      class: 'band-label',
      'text-anchor': atFraction > 0.5 ? 'end' : 'start',
      fill: textOn(COLOR[key]),
    });
    text.textContent = LABEL[key];
    root.append(text);
  }

  private renderHover(): void {
    const m = this.model;
    const root = this.plot.querySelector('svg');
    if (!m || !root) return;
    const cross = root.querySelector('.crosshair')!;
    const { x, speedAt, innerW } = this.scales();
    if (this.hoverX === null || this.hoverX < M.left - 4 || this.hoverX > M.left + innerW + 4) {
      cross.setAttribute('visibility', 'hidden');
      this.tooltip.hidden = true;
      return;
    }
    const p = nearestPoint(m.points, speedAt(this.hoverX));
    const px = x(p.speed);
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    cross.setAttribute('visibility', 'visible');

    this.tooltip.replaceChildren(html('div', 'chart-tooltip-title', `${p.speed.toFixed(0)} ${this.unitLabel}`));
    for (const key of STACK) {
      if (p.shares[key] <= 0.001) continue;
      const row = html('div', 'chart-tooltip-row');
      const sw = html('span', 'swatch');
      sw.style.background = COLOR[key];
      row.append(sw, html('strong', undefined, pct(p.shares[key])), html('span', undefined, `${LABEL[key]} · ${Math.round(p.watts[key])} W`));
      this.tooltip.append(row);
    }
    this.tooltip.hidden = false;
    const flip = px > this.width / 2;
    this.tooltip.style.left = flip ? '' : `${px + 10}px`;
    this.tooltip.style.right = flip ? `${this.width - px + 10}px` : '';
  }

  private renderSavings(): void {
    const m = this.model!;
    this.savings.replaceChildren();
    this.savings.hidden = !m.savings;
    if (!m.savings) return;
    const meaningful = m.savings.some((s) => Math.abs(s.watts) >= 0.5);
    this.savings.append(html('div', 'chart-savings-title', 'Your changes vs baseline, same speed'));
    if (!meaningful) {
      this.savings.append(html('div', 'chart-savings-empty', 'No difference yet.'));
      return;
    }
    const row = html('div', 'chart-savings-row');
    for (const s of m.savings) {
      const cell = html('div', 'chart-savings-cell');
      const value = html('div', `chart-savings-value ${s.watts >= 0.5 ? 'is-better' : s.watts <= -0.5 ? 'is-worse' : ''}`);
      // Positive = saves watts, shown as a negative power change.
      value.textContent = `${signed(-s.watts, 0)} W`;
      cell.append(value, html('div', 'chart-savings-speed', `${s.speed} ${this.unitLabel}`));
      row.append(cell);
    }
    this.savings.append(row);
  }

  private renderTable(): void {
    const m = this.model!;
    const step = m.xMax <= 50 ? 5 : 10;
    const table = html('table');
    const head = html('tr');
    head.append(html('th', undefined, `Speed (${this.unitLabel})`), ...STACK.map((k) => html('th', undefined, LABEL[k])));
    table.append(head);
    for (let v = step; v <= m.xMax + 1e-6; v += step) {
      const p = nearestPoint(m.points, v);
      const tr = html('tr');
      tr.append(html('td', undefined, String(v)), ...STACK.map((k) => html('td', undefined, pct(p.shares[k]))));
      table.append(tr);
    }
    const wasOpen = this.table.open;
    this.table.replaceChildren(html('summary', undefined, 'Show as table'), table);
    this.table.open = wasOpen;
  }
}

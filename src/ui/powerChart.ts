/**
 * Power-vs-speed chart, hand-built SVG (no chart library).
 *
 * Current setup in the accent blue, baseline in a de-emphasis gray, one
 * y-axis, hairline grid, 2px lines, >=8px markers with a surface ring, a
 * legend, a hover crosshair with a tooltip that lists both curves, and a
 * table view so no value depends on hovering.
 */
import type { AppState } from './appState';
import { valueAt, type ChartModel, type ChartSeries } from './chartModel';
import { SPEED_UNIT_LABEL } from './format';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const CHART_SERIES_STYLE: Record<ChartSeries['key'], { color: string; label: string }> = {
  current: { color: '#2a78d6', label: 'Current' },
  baseline: { color: '#898781', label: 'Baseline' },
};

const HEIGHT = 170;
const M = { top: 10, right: 12, bottom: 26, left: 40 };

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

export class PowerChart {
  readonly element = html('div', 'chart');
  private readonly legend = html('div', 'chart-legend');
  private readonly plot = html('div', 'chart-plot');
  private readonly tooltip = html('div', 'chart-tooltip');
  private readonly table = html('details', 'chart-table');
  private model: ChartModel | null = null;
  private unitLabel = 'km/h';
  private hoverX: number | null = null;
  private width = 280;

  constructor(container: HTMLElement) {
    const title = html('div', 'section-title', 'Power needed vs speed');
    this.tooltip.hidden = true;
    this.plot.append(this.tooltip);
    this.element.append(title, this.legend, this.plot, this.table);
    container.appendChild(this.element);

    new ResizeObserver(() => {
      const w = Math.round(this.plot.clientWidth);
      if (w > 0 && w !== this.width) {
        this.width = w;
        this.render();
      }
    }).observe(this.plot);

    this.plot.addEventListener('pointermove', (e) => {
      const box = this.plot.getBoundingClientRect();
      this.hoverX = e.clientX - box.left;
      this.renderHover();
    });
    this.plot.addEventListener('pointerleave', () => {
      this.hoverX = null;
      this.renderHover();
    });
  }

  update(state: AppState, model: ChartModel): void {
    this.model = model;
    this.unitLabel = SPEED_UNIT_LABEL[state.units.speed];
    this.render();
  }

  private scales() {
    const m = this.model!;
    const innerW = Math.max(40, this.width - M.left - M.right);
    const innerH = HEIGHT - M.top - M.bottom;
    const x = (speed: number) => M.left + (speed / m.xMax) * innerW;
    const y = (w: number) => M.top + (1 - (w - m.yMin) / (m.yMax - m.yMin)) * innerH;
    const speedAt = (px: number) => Math.min(m.xMax, Math.max(0, ((px - M.left) / innerW) * m.xMax));
    return { x, y, speedAt, innerW, innerH };
  }

  private render(): void {
    const m = this.model;
    if (!m) return;
    const { x, y, innerW } = this.scales();

    this.legend.replaceChildren(
      ...m.series.map((s) => {
        const item = html('span', 'chart-legend-item');
        const key = html('span', 'line-key');
        key.style.background = CHART_SERIES_STYLE[s.key].color;
        item.append(key, document.createTextNode(CHART_SERIES_STYLE[s.key].label));
        return item;
      }),
    );

    const root = svg('svg', { width: this.width, height: HEIGHT, viewBox: `0 0 ${this.width} ${HEIGHT}`, role: 'img' });
    root.setAttribute(
      'aria-label',
      `Power needed from 0 to ${m.xMax} ${this.unitLabel}. ` +
        m.markers.map((mk) => `${CHART_SERIES_STYLE[mk.key].label}: ${Math.round(mk.point.powerW)} W at ${mk.point.speed.toFixed(1)} ${this.unitLabel}`).join('. '),
    );

    // Grid + y ticks.
    for (const t of m.yTicks) {
      const gy = y(t);
      root.append(
        svg('line', { x1: M.left, x2: M.left + innerW, y1: gy, y2: gy, class: t === 0 ? 'axis-base' : 'grid' }),
        Object.assign(svg('text', { x: M.left - 6, y: gy + 3.5, class: 'tick', 'text-anchor': 'end' }), {
          textContent: t.toLocaleString(),
        }),
      );
    }
    // X ticks.
    for (const t of m.xTicks) {
      root.append(
        Object.assign(svg('text', { x: x(t), y: HEIGHT - M.bottom + 15, class: 'tick', 'text-anchor': 'middle' }), {
          textContent: String(t),
        }),
      );
    }
    root.append(
      Object.assign(svg('text', { x: M.left + innerW, y: HEIGHT - 2, class: 'axis-title', 'text-anchor': 'end' }), {
        textContent: this.unitLabel,
      }),
      Object.assign(svg('text', { x: 2, y: M.top + 3, class: 'axis-title' }), { textContent: 'W' }),
    );

    // Baseline drawn first so the current curve sits on top.
    for (const s of [...m.series].reverse()) {
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.speed).toFixed(1)},${y(p.powerW).toFixed(1)}`).join('');
      root.append(svg('path', { d, class: 'series', stroke: CHART_SERIES_STYLE[s.key].color }));
    }
    for (const mk of [...m.markers].reverse()) {
      if (mk.point.speed > m.xMax) continue;
      root.append(
        svg('circle', {
          cx: x(mk.point.speed),
          cy: y(mk.point.powerW),
          r: 4.5,
          fill: CHART_SERIES_STYLE[mk.key].color,
          class: 'marker',
        }),
      );
    }

    // Hover layer.
    root.append(svg('line', { class: 'crosshair', y1: M.top, y2: HEIGHT - M.bottom, x1: -10, x2: -10, visibility: 'hidden' }));
    root.append(svg('g', { class: 'hover-dots' }));

    this.plot.querySelector('svg')?.remove();
    this.plot.prepend(root);
    this.renderHover();
    this.renderTable();
  }

  private renderHover(): void {
    const m = this.model;
    const root = this.plot.querySelector('svg');
    if (!m || !root) return;
    const cross = root.querySelector('.crosshair')!;
    const dots = root.querySelector('.hover-dots')!;
    dots.replaceChildren();
    const { x, y, speedAt, innerW } = this.scales();
    if (this.hoverX === null || this.hoverX < M.left - 4 || this.hoverX > M.left + innerW + 4) {
      cross.setAttribute('visibility', 'hidden');
      this.tooltip.hidden = true;
      return;
    }
    // Snap to half-unit speeds so the readout doesn't jitter.
    const speed = Math.round(speedAt(this.hoverX) * 2) / 2;
    const px = x(speed);
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    cross.setAttribute('visibility', 'visible');

    const rows = m.series.map((s) => ({ s, w: valueAt(s.points, speed) }));
    for (const { s, w } of rows) {
      dots.append(svg('circle', { cx: px, cy: y(w), r: 4, fill: CHART_SERIES_STYLE[s.key].color, class: 'marker' }));
    }

    this.tooltip.replaceChildren(html('div', 'chart-tooltip-title', `${speed.toFixed(1)} ${this.unitLabel}`));
    for (const { s, w } of rows) {
      const row = html('div', 'chart-tooltip-row');
      const key = html('span', 'line-key');
      key.style.background = CHART_SERIES_STYLE[s.key].color;
      row.append(key, html('strong', undefined, `${Math.round(w)} W`), html('span', undefined, CHART_SERIES_STYLE[s.key].label));
      this.tooltip.append(row);
    }
    if (rows.length === 2) {
      const diff = rows[0]!.w - rows[1]!.w;
      this.tooltip.append(html('div', 'chart-tooltip-diff', `${diff <= 0 ? 'Saves' : 'Costs'} ${Math.abs(Math.round(diff))} W`));
    }
    this.tooltip.hidden = false;
    const flip = px > this.width / 2;
    this.tooltip.style.left = flip ? '' : `${px + 10}px`;
    this.tooltip.style.right = flip ? `${this.width - px + 10}px` : '';
  }

  private renderTable(): void {
    const m = this.model!;
    const step = m.xMax <= 50 ? 5 : 10;
    const summary = html('summary', undefined, 'Show as table');
    const table = html('table');
    const head = html('tr');
    head.append(html('th', undefined, `Speed (${this.unitLabel})`), ...m.series.map((s) => html('th', undefined, `${CHART_SERIES_STYLE[s.key].label} (W)`)));
    table.append(head);
    for (let v = step; v <= m.xMax + 1e-6; v += step) {
      const tr = html('tr');
      tr.append(html('td', undefined, String(v)), ...m.series.map((s) => html('td', undefined, String(Math.round(valueAt(s.points, v))))));
      table.append(tr);
    }
    const wasOpen = this.table.open;
    this.table.replaceChildren(summary, table);
    this.table.open = wasOpen;
  }
}

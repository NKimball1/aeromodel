import { describe, expect, it } from 'vitest';
import { BIKE_TYPES } from '../../physics';
import { BAR_CLAMP, BB, RIM_BEAD_RADIUS, SADDLE_TOP } from '../bikeGeometry';
import { FRAME_STYLES, distanceToLine, frameLayout } from '../bikeTypes';

/** Widest tire the UI offers; its section is about as tall as it is wide. */
const WIDEST_TIRE_RADIUS = RIM_BEAD_RADIUS + 0.032;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('frame layouts', () => {
  for (const type of BIKE_TYPES) {
    const style = FRAME_STYLES[type];
    const L = frameLayout(style);

    describe(type, () => {
      it('has realistic stack (0.52–0.60 m) and reach (0.36–0.42 m) for a size ~56', () => {
        expect(L.stack).toBeGreaterThan(0.52);
        expect(L.stack).toBeLessThan(0.6);
        expect(L.reach).toBeGreaterThan(0.36);
        expect(L.reach).toBeLessThan(0.42);
      });

      it('reaches the shared bar clamp with a plausible stem (80–140 mm, −30° to +20°)', () => {
        const len = dist(L.stemBase, BAR_CLAMP);
        const angle = (Math.atan2(BAR_CLAMP.y - L.stemBase.y, BAR_CLAMP.x - L.stemBase.x) * 180) / Math.PI;
        expect(len).toBeGreaterThan(0.08);
        expect(len).toBeLessThan(0.14);
        expect(angle).toBeGreaterThan(-30);
        expect(angle).toBeLessThan(20);
        expect(L.spacerStack).toBeGreaterThanOrEqual(0);
      });

      it('clears a 32 mm front tire at the down tube by at least 10 mm', () => {
        const gap =
          distanceToLine(L.frontAxle, L.downTubeStart, L.downTubeEnd) - style.tubes.down.chord / 2 - WIDEST_TIRE_RADIUS;
        expect(gap).toBeGreaterThan(0.01);
      });

      it('clears a 32 mm rear tire at the seat tube by at least 3 mm', () => {
        const gap = distanceToLine(L.rearAxle, BB, SADDLE_TOP) - style.tubes.seat.chord / 2 - WIDEST_TIRE_RADIUS;
        expect(gap).toBeGreaterThan(0.003);
      });

      it('has a realistic fork (axle to head tube bottom 0.36–0.40 m)', () => {
        const d = dist(L.frontAxle, L.headTubeBottom);
        expect(d).toBeGreaterThan(0.36);
        expect(d).toBeLessThan(0.4);
      });

      it('puts seat stays at or below the top tube junction', () => {
        expect(L.seatStayJoin.y).toBeLessThanOrEqual(L.seatCluster.y);
      });
    });
  }

  it('endurance has the tallest stack and longest wheelbase; aero the lowest stack', () => {
    const layouts = Object.fromEntries(BIKE_TYPES.map((t) => [t, frameLayout(FRAME_STYLES[t])]));
    const wheelbase = (t: string) => layouts[t]!.frontAxle.x - layouts[t]!.rearAxle.x;
    for (const t of BIKE_TYPES) {
      if (t !== 'endurance') {
        expect(layouts.endurance!.stack).toBeGreaterThan(layouts[t]!.stack);
        expect(wheelbase('endurance')).toBeGreaterThan(wheelbase(t));
      }
      if (t !== 'aero') expect(layouts.aero!.stack).toBeLessThan(layouts[t]!.stack);
    }
  });

  it('aero-type frames have more dropped seat stays than the climbing frame', () => {
    const drop = (t: 'aero' | 'allRound' | 'climbing') => FRAME_STYLES[t].topTubeJoin - FRAME_STYLES[t].seatStayJoin;
    expect(drop('aero')).toBeGreaterThan(drop('climbing'));
    expect(drop('allRound')).toBeGreaterThan(drop('climbing'));
    expect(BB.x).toBe(0);
  });
});

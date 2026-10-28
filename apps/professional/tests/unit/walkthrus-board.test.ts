import { describe, expect, it } from 'vitest';
import { CATALOGUE, SERIES } from '../../../../packages/walkthrus/catalogue.mjs';
import { SETS } from '../../../../packages/walkthrus/sets.mjs';
import { axialToPixel, directionBetween, hexCorners, hitTest, pixelToAxial, sharedEdge, spiralCells, neighbours, pointInPolygon } from '../../../../packages/walkthrus/board/hex';
import { boardLayout, clusterFrame, fitFrame, type BoardEntry, type BoardLayout, type Box } from '../../../../packages/walkthrus/board/layout';
import { pathHitsBox, routeArrows, segmentHitsBox, type BoardArrow } from '../../../../packages/walkthrus/board/route';
import { labelLevel } from '../../../../packages/walkthrus/board/labels';

const entries = CATALOGUE as unknown as BoardEntry[];
const id = (name: string) => `w1-${name}`;
const demoArrows: BoardArrow[] = [
  { id: 'a1', from: id('think-pair-share'), to: id('cold-calling'), type: 'leads_to' },
  { id: 'a2', from: id('cold-calling'), to: id('check-for-understanding'), type: 'leads_to' },
  { id: 'a3', from: id('check-for-understanding'), to: id('quizzing'), type: 'leads_to', label: 'then retrieve' },
  { id: 'a4', from: id('live-modelling'), to: id('worked-examples-and-backward-fading'), type: 'leads_to' },
  { id: 'a5', from: id('rehearse-routines'), to: id('think-pair-share'), type: 'free', label: 'routine first' },
  { id: 'a6', from: id('quizzing'), to: id('weekly-and-monthly-review'), type: 'pairs_with' }
];
const crowded: BoardArrow[] = ['cold-calling', 'show-me-boards', 'think-pair-share', 'say-it-again-better', 'probing-questions', 'process-questions', 'whole-class-feedback', 'feedback-as-actions'].map((to, i) => ({
  id: `c${i}`, from: id('check-for-understanding'), to: id(to), type: i % 3 === 0 ? 'pairs_with' : 'leads_to', label: i % 2 ? 'then' : undefined
}));
const set2: BoardEntry[] = ['Make everyone think', 'No opt out', 'Normalise error', 'Randomised questioning'].map((name, i) => ({
  id: `w2-${name.toLowerCase().replace(/\W+/g, '-')}`, set: 2, kind: 'technique', series: i === 0 ? 'PR' : 'QF', code: i === 0 ? 'P&R' : 'Q&F', page: 20 + i * 2, name
}));
const make = (extra: BoardEntry[] = [], opened?: number[]) =>
  boardLayout({ entries: [...entries, ...extra], sets: SETS as never, series: SERIES as never, opened });

const tileBoxes = (l: BoardLayout): Box[] => l.tiles.flatMap((t) => [t.tab, t.glyph, t.title, t.badge]);
const shuffled = <T,>(xs: T[]): T[] => xs.map((x, i) => [x, (i * 7919) % 13] as const).sort((a, b) => a[1] - b[1]).map((p) => p[0]);

describe('hex maths', () => {
  it('round-trips axial and pixel and finds neighbours at one cell distance', () => {
    for (const c of spiralCells(19)) {
      const p = axialToPixel(c, 50);
      expect(pixelToAxial(p, 50)).toEqual(c);
      for (const n of neighbours(c)) {
        const q = axialToPixel(n, 50);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(50 * Math.sqrt(3), 6);
      }
    }
  });
  it('the shared edge sits half way between two touching centres', () => {
    const a = { q: 2, r: -1 };
    for (const b of neighbours(a)) {
      const e = sharedEdge(a, b, 50)!;
      const pa = axialToPixel(a, 50);
      const pb = axialToPixel(b, 50);
      expect(e.mid.x).toBeCloseTo((pa.x + pb.x) / 2, 6);
      expect(e.mid.y).toBeCloseTo((pa.y + pb.y) / 2, 6);
      expect(directionBetween(a, b)).toBeGreaterThanOrEqual(0);
    }
    expect(sharedEdge({ q: 0, r: 0 }, { q: 2, r: 0 }, 50)).toBeNull();
  });
  it('hit tests the drawn hexagon, not just the cell', () => {
    const c = { q: 1, r: 0 };
    const p = axialToPixel(c, 50);
    expect(hitTest(p, [c], 50, 47)).toEqual(c);
    expect(hitTest({ x: p.x + 49, y: p.y }, [c], 50, 47)).toBeNull();
    expect(pointInPolygon(p, hexCorners(p, 47))).toBe(true);
  });
  it('spiral fills outwards without repeating a cell', () => {
    const cells = spiralCells(19);
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(19);
    expect(cells[0]).toEqual({ q: 0, r: 0 });
  });
});

describe('board layout', () => {
  it('puts every set 1 technique on its own cell, in clusters with white gaps', () => {
    const l = make();
    expect(l.tiles.length).toBe(entries.filter((e) => e.kind === 'technique').length);
    expect(new Set(l.tiles.map((t) => `${t.cell.q},${t.cell.r}`)).size).toBe(l.tiles.length);
    expect(l.clusters.length).toBe(SERIES.length);
    for (const c of l.clusters) for (const o of l.clusters) {
      if (c === o) continue;
      const apart = c.frame.x + c.frame.w < o.frame.x || o.frame.x + o.frame.w < c.frame.x || c.frame.y + c.frame.h < o.frame.y || o.frame.y + o.frame.h < c.frame.y;
      expect(apart, `${c.key} / ${o.key}`).toBe(true);
    }
  });
  it('is deterministic, in any input order', () => {
    const a = JSON.stringify(make());
    expect(JSON.stringify(make())).toBe(a);
    const shuffledLayout = boardLayout({ entries: shuffled(entries), sets: SETS as never, series: SERIES as never });
    expect(JSON.stringify(shuffledLayout)).toBe(a);
  });
  it('layout_reflow: opening set 2 leaves every set 1 tile where it was', () => {
    const before = make(set2, [1]);
    const after = make(set2, [1, 2]);
    expect(after.tiles.length).toBeGreaterThan(before.tiles.length);
    for (const t of before.tiles) {
      const same = after.tiles.find((x) => x.id === t.id)!;
      expect(same.cell).toEqual(t.cell);
      expect({ x: same.x, y: same.y }).toEqual({ x: t.x, y: t.y });
    }
    expect(before.boxSlots.map((b) => b.set)).toEqual([2, 3]);
    expect(after.boxSlots.map((b) => b.set)).toEqual([3]);
  });
  it('cluster labels clear every tile', () => {
    const l = make(set2, [1, 2]);
    for (const c of l.clusters) for (const t of l.tiles) {
      const gapX = Math.abs(c.label.x - t.box.x) * 2 - (c.label.w + t.box.w);
      const gapY = Math.abs(c.label.y - t.box.y) * 2 - (c.label.h + t.box.h);
      expect(gapX >= 0 || gapY >= 0, `${c.key} label over ${t.id}`).toBe(true);
    }
  });
  it('an empty board has bounds, and a phone viewport fits the whole board', () => {
    const empty = boardLayout({ entries: [], sets: SETS as never, series: SERIES as never, opened: [] });
    expect(empty.tiles).toEqual([]);
    expect(empty.bounds.w).toBeGreaterThan(0);
    const l = make();
    const fit = fitFrame(l.bounds, { w: 390, h: 700 }, 8);
    expect(l.bounds.w * fit.scale).toBeLessThanOrEqual(390 - 16 + 0.01);
    expect(l.bounds.h * fit.scale).toBeLessThanOrEqual(700 - 16 + 0.01);
    const cf = clusterFrame(l, l.clusters[0]!.key)!;
    expect(fitFrame(cf, { w: 390, h: 700 }).scale).toBeGreaterThan(fit.scale);
  });
  it('labels hide with zoom, with hysteresis', () => {
    expect(labelLevel(0.2)).toBe('clusters');
    expect(labelLevel(0.6)).toBe('tabs');
    expect(labelLevel(1)).toBe('full');
    expect(labelLevel(0.82, 'full')).toBe('full');
    expect(labelLevel(0.82, 'tabs')).toBe('tabs');
  });
});

describe('arrow routing', () => {
  const boards: Array<[string, BoardLayout, BoardArrow[]]> = [
    ['demo', make(), demoArrows],
    ['crowded cluster', make(), crowded],
    ['set 2 opened', make(set2, [1, 2]), [...demoArrows, { id: 'z1', from: id('quizzing'), to: 'w2-make-everyone-think', type: 'leads_to', label: 'then' }]]
  ];

  for (const [name, layout, arrows] of boards) {
    describe(name, () => {
      const routed = routeArrows(layout, arrows);
      it('routes every arrow', () => expect(routed.length).toBe(arrows.length));

      it('arrow_crosses_text: no path meets a tab, title, badge, cluster label or another arrow’s label', () => {
        for (const r of routed) {
          if (r.kind === 'knot') continue;
          for (const box of [...tileBoxes(layout), ...layout.labels]) expect(pathHitsBox(r.points, box), `${r.id} over a box`).toBe(false);
          for (const o of routed) if (o.id !== r.id && o.label) expect(pathHitsBox(r.points, o.label), `${r.id} through ${o.id}'s label`).toBe(false);
        }
      });

      it('arrows never run through a hexagon', () => {
        for (const r of routed) for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1]!;
          const b = r.points[i]!;
          for (let k = 1; k < 10; k++) {
            const p = { x: a.x + ((b.x - a.x) * k) / 10, y: a.y + ((b.y - a.y) * k) / 10 };
            const cell = pixelToAxial(p, layout.size);
            const tile = layout.tiles.find((t) => t.cell.q === cell.q && t.cell.r === cell.r);
            if (tile) expect(pointInPolygon(p, tile.corners), `${r.id} inside ${tile.id}`).toBe(false);
          }
        }
      });

      it('label_overlaps: no label meets a hexagon, a cluster label or another label', () => {
        const labels = routed.filter((r) => r.label).map((r) => r.label!);
        for (const l of labels) {
          for (const t of layout.tiles) expect(Math.abs(l.x - t.box.x) * 2 >= l.w + t.box.w || Math.abs(l.y - t.box.y) * 2 >= l.h + t.box.h, `label ${l.text} over ${t.id}`).toBe(true);
          for (const c of layout.labels) expect(Math.abs(l.x - c.x) * 2 >= l.w + c.w || Math.abs(l.y - c.y) * 2 >= l.h + c.h).toBe(true);
          for (const o of labels) if (o !== l) expect(Math.abs(l.x - o.x) * 2 >= l.w + o.w || Math.abs(l.y - o.y) * 2 >= l.h + o.h).toBe(true);
        }
      });

      it('knot_off_edge: every knot sits on its shared edge, clear of every tab, title and badge', () => {
        for (const r of routed) {
          if (!r.knot) continue;
          const k = r.knot;
          const [a, b] = k.edge;
          expect(Math.hypot(k.x - (a.x + b.x) / 2, k.y - (a.y + b.y) / 2)).toBeLessThan(0.01);
          const reach = layout.size * 0.14;
          for (const box of tileBoxes(layout)) expect(segmentHitsBox({ x: k.x, y: k.y }, { x: k.x, y: k.y }, box, reach), `${r.id} knot on a box`).toBe(false);
        }
      });

      it('is byte-identical twice and in shuffled arrow order', () => {
        const json = JSON.stringify(routed);
        expect(JSON.stringify(routeArrows(layout, arrows))).toBe(json);
        expect(JSON.stringify(routeArrows(layout, shuffled(arrows)))).toBe(json);
      });
    });
  }

  it('touching tiles get a knot with the right chevrons; others get a path with heads', () => {
    const l = make();
    const routed = routeArrows(l, demoArrows);
    const byId = new Map(routed.map((r) => [r.id, r]));
    const touching = (a: string, b: string) => {
      const ta = l.tiles.find((t) => t.id === a)!;
      const tb = l.tiles.find((t) => t.id === b)!;
      return directionBetween(ta.cell, tb.cell) >= 0;
    };
    for (const a of demoArrows) {
      const r = byId.get(a.id)!;
      expect(r.kind).toBe(touching(a.from, a.to) ? 'knot' : 'path');
      if (r.kind === 'path') expect(r.heads.length).toBe(a.type === 'pairs_with' ? 2 : 1);
      if (r.knot) expect(r.knot.chevrons).toBe(a.type === 'leads_to' ? 1 : a.type === 'pairs_with' ? 2 : 0);
      expect(r.dashed).toBe(a.type === 'free');
    }
  });

  it('skips arrows whose tiles are not on the board', () => {
    expect(routeArrows(make(), [{ id: 'x', from: 'nope', to: id('quizzing'), type: 'leads_to' }])).toEqual([]);
  });
});

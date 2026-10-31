import { describe, expect, it } from 'vitest';
import { CATALOGUE, SERIES } from '../../../../packages/walkthrus/catalogue.mjs';
import { SETS } from '../../../../packages/walkthrus/sets.mjs';
import { axialToPixel, directionBetween, hexCorners, hitTest, pixelToAxial, sharedEdge, spiralCells, neighbours, pointInPolygon } from '../../../../packages/walkthrus/board/hex';
import { boardLayout, clusterFrame, clusterOriginPx, clustersLayout, fitFrame, type BoardEntry, type BoardLayout, type Box, type ClusterData } from '../../../../packages/walkthrus/board/layout';
import { distToPolygon, LANE_GAP, pathHitsBox, routeArrows, segmentHitsBox, type BoardArrow, type RoutedArrow } from '../../../../packages/walkthrus/board/route';
import { clustersFromPicked } from '../../../../packages/walkthrus/clusters.mjs';
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

const tileBoxes = (l: BoardLayout): Box[] => l.tiles.flatMap((t) => [t.tab, t.glyph, t.title]);
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

const byIdEntry = new Map(entries.map((e) => [e.id, e]));
const mine = (clusters: ClusterData[]) => clustersLayout({ clusters, entryOf: (x) => byIdEntry.get(x) ?? null });
const techniques = entries.filter((e) => e.kind === 'technique').map((e) => e.id);
/** Three clusters of Adam's, spaced apart, with a tile in two of them. */
const myClusters = (): ClusterData[] => {
  const [a] = clustersFromPicked(techniques.slice(0, 7)) as ClusterData[];
  const [b] = clustersFromPicked(techniques.slice(7, 12)) as ClusterData[];
  const [c] = clustersFromPicked([techniques[0]!, ...techniques.slice(12, 15)]) as ClusterData[];
  return [{ ...a!, id: 'cl_a', name: 'Starts' }, { ...b!, id: 'cl_b', name: 'Checks', x: 640, y: 40 }, { ...c!, id: 'cl_c', name: 'Endings', x: 260, y: 560 }];
};

describe('my board layout', () => {
  it('hangs each cluster’s tiles under its title, at the title’s place', () => {
    const l = mine(myClusters());
    expect(l.clusters.map((c) => c.name)).toEqual(['Starts', 'Checks', 'Endings']);
    for (const c of l.clusters) {
      const tiles = l.tiles.filter((t) => t.cluster === c.key);
      for (const t of tiles) expect(t.box.y - t.box.h / 2, `${t.id} under ${c.name}`).toBeGreaterThan(c.label.y + c.label.h / 2);
    }
    const o = clusterOriginPx({ x: 640, y: 40 });
    const first = l.tiles.find((t) => t.cluster === 'cl_b')!;
    expect({ x: first.x, y: first.y }).toEqual(o);
  });
  it('keys each placement, so a tile may sit in two clusters', () => {
    const l = mine(myClusters());
    const twice = l.tiles.filter((t) => t.id === techniques[0]);
    expect(twice.map((t) => t.key)).toEqual([`cl_a/${techniques[0]}`, `cl_c/${techniques[0]}`]);
    expect(new Set(l.tiles.map((t) => t.key)).size).toBe(l.tiles.length);
  });
  it('an empty cluster keeps its title and a place for its first tile', () => {
    const l = mine([{ id: 'cl_new', name: 'New', x: 0, y: 0, tiles: [] }]);
    expect(l.tiles).toEqual([]);
    expect(l.clusters[0]!.empty).toBe(true);
  });
});

/** Every segment of a routed path keeps clear of every hexagon (and so of the gaps between touching ones). */
function expectClearOfTiles(layout: BoardLayout, r: RoutedArrow, margin: number): void {
  if (r.kind !== 'path') return;
  const endKeys = new Set([r.fromKey, r.toKey]);
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1]!;
    const b = r.points[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      for (const t of layout.tiles) {
        // The stubs at either end run up to their own tile's edge; a surrounded tile's stub crosses one neighbour.
        if (endKeys.has(t.key) && (i === 1 || i === r.points.length - 1)) continue;
        if ((i === 1 && r.over.start) || (i === r.points.length - 1 && r.over.end)) continue;
        expect(distToPolygon(p, t.corners), `${r.id} segment ${i} into ${t.key}`).toBeGreaterThanOrEqual(margin);
      }
    }
  }
}

describe('arrow routing', () => {
  const boards: Array<[string, BoardLayout, BoardArrow[]]> = [
    ['demo', make(), demoArrows],
    ['crowded cluster', make(), crowded],
    ['set 2 opened', make(set2, [1, 2]), [...demoArrows, { id: 'z1', from: id('quizzing'), to: 'w2-make-everyone-think', type: 'leads_to', label: 'then' }]],
    ['my clusters', mine(myClusters()), techniques.slice(1, 15).map((from, i) => ({ id: `m${i}`, from, to: techniques[(i * 5 + 3) % 15]!, type: 'leads_to' as const, label: i % 2 ? 'before the hinge' : undefined })).filter((a) => a.from !== a.to)]
  ];

  for (const [name, layout, arrows] of boards) {
    describe(name, () => {
      const routed = routeArrows(layout, arrows);
      it('routes every arrow, round the clusters rather than straight across', () => {
        expect(routed.length).toBe(arrows.length);
        for (const r of routed) if (r.kind === 'path') expect(r.over.start && r.over.end && r.points.length === 2, `${r.id} fell back to a straight line`).toBe(false);
      });

      it('runs only horizontal and vertical lines between its end stubs', () => {
        for (const r of routed) {
          if (r.kind !== 'path') continue;
          expect(r.points.length).toBeGreaterThanOrEqual(2);
          for (let i = 2; i < r.points.length - 1; i++) {
            const a = r.points[i - 1]!;
            const b = r.points[i]!;
            expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, `${r.id} segment ${i} is orthogonal`).toBe(true);
          }
        }
      });

      it('no segment crosses a tile, or the gap between two touching tiles', () => {
        for (const r of routed) expectClearOfTiles(layout, r, 2);
      });

      it('no path crosses a tab, title or cluster label of another tile', () => {
        for (const r of routed) {
          if (r.kind === 'knot') continue;
          const ends = new Set([r.fromKey, r.toKey]);
          const boxes = [...layout.tiles.filter((t) => !ends.has(t.key)).flatMap((t) => [t.tab, t.glyph, t.title]), ...layout.labels];
          const pts = r.points.slice(r.over.start ? 1 : 0, r.over.end ? -1 : undefined);
          for (const box of boxes) expect(pathHitsBox(pts, box), `${r.id} over a box`).toBe(false);
        }
      });

      it('corners are rounded, starts get a circle and ends a long head', () => {
        for (const r of routed) {
          if (r.kind !== 'path') continue;
          if (r.points.length > 2) expect(r.d).toContain('Q');
          expect(r.heads.length).toBe(r.type === 'pairs_with' ? 2 : 1);
          if (r.type !== 'pairs_with') expect(r.start).toEqual(r.points[0]);
        }
      });

      it('labels read TYPE | text and keep off every hexagon, title and other label', () => {
        const labels = routed.filter((r) => r.label).map((r) => r.label!);
        for (const l of labels) {
          expect(l.type).toMatch(/^[A-Z ]+$/);
          for (const t of layout.tiles) for (const k of t.corners) expect(Math.abs(k.x - l.x) <= l.w / 2 && Math.abs(k.y - l.y) <= l.h / 2, `label ${l.text} over ${t.id}`).toBe(false);
          for (const c of layout.labels) expect(Math.abs(l.x - c.x) * 2 >= l.w + c.w || Math.abs(l.y - c.y) * 2 >= l.h + c.h).toBe(true);
          for (const o of labels) if (o !== l) expect(Math.abs(l.x - o.x) * 2 >= l.w + o.w || Math.abs(l.y - o.y) * 2 >= l.h + o.h).toBe(true);
        }
      });

      it('knot_off_edge: every knot sits on its shared edge, clear of every tab and title', () => {
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
      if (r.knot) expect(r.knot.chevrons).toBe(a.type === 'leads_to' ? 1 : a.type === 'pairs_with' ? 2 : 0);
      expect(r.dashed).toBe(a.type === 'free');
    }
  });

  it('arrows sharing a lane run on parallel lanes', () => {
    // Several arrows from one cluster to another far cluster all want the same corridor.
    const clusters: ClusterData[] = [
      { id: 'cl_l', name: 'Left', x: 0, y: 0, tiles: techniques.slice(0, 3).map((t, i) => ({ id: t, q: 0, r: i })) },
      { id: 'cl_r', name: 'Right', x: 900, y: 0, tiles: techniques.slice(3, 6).map((t, i) => ({ id: t, q: 0, r: i })) }
    ];
    const l = mine(clusters);
    const arrows: BoardArrow[] = [0, 1, 2].map((i) => ({ id: `p${i}`, from: techniques[i]!, to: techniques[3 + i]!, type: 'leads_to', quiet: true }));
    const routed = routeArrows(l, arrows);
    const horizontal = routed.flatMap((r) => r.points.slice(1).map((b, i) => ({ id: r.id, a: r.points[i]!, b }))).filter((s) => Math.abs(s.a.y - s.b.y) < 0.01 && Math.abs(s.a.x - s.b.x) > 200);
    expect(horizontal.length).toBeGreaterThanOrEqual(3);
    // No two long horizontal runs of different arrows lie on top of each other.
    for (const s of horizontal) for (const o of horizontal) {
      if (s.id === o.id) continue;
      const overlapX = Math.min(Math.max(s.a.x, s.b.x), Math.max(o.a.x, o.b.x)) - Math.max(Math.min(s.a.x, s.b.x), Math.min(o.a.x, o.b.x));
      if (overlapX > 1) expect(Math.abs(s.a.y - o.a.y), `${s.id} / ${o.id}`).toBeGreaterThanOrEqual(LANE_GAP - 0.01);
    }
    for (const r of routed) expectClearOfTiles(l, r, 2);
  });

  it('routes 30 tiles and 40 arrows quickly', () => {
    const many: ClusterData[] = [0, 1, 2, 3, 4].map((k) => {
      const [c] = clustersFromPicked(techniques.slice(k * 6, k * 6 + 6)) as ClusterData[];
      return { ...c!, id: `cl_${k}`, name: `Group ${k}`, x: (k % 3) * 560, y: Math.floor(k / 3) * 560 };
    });
    const l = mine(many);
    const ids = l.tiles.map((t) => t.id);
    const arrows: BoardArrow[] = Array.from({ length: 40 }, (_, i) => ({ id: `q${i}`, from: ids[i % ids.length]!, to: ids[(i * 7 + 11) % ids.length]!, type: (i % 4 ? 'leads_to' : 'pairs_with') as BoardArrow['type'], label: i % 3 ? undefined : 'then' })).filter((a) => a.from !== a.to);
    routeArrows(l, arrows);
    const t0 = performance.now();
    const routed = routeArrows(l, arrows);
    const ms = performance.now() - t0;
    expect(routed.length).toBe(arrows.length);
    expect(ms).toBeLessThan(150);
  });

  it('skips arrows whose tiles are not on the board', () => {
    expect(routeArrows(make(), [{ id: 'x', from: 'nope', to: id('quizzing'), type: 'leads_to' }])).toEqual([]);
  });
});

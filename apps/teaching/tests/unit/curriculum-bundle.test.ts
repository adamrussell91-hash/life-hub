import { describe, it, expect } from 'vitest';
import type { CurriculumLinesV2Content, NetworkLine } from '@/schemas/block';
import { gatherStops } from '@/network/bundle';
import { buildFlow, linkProblem, lessonsBefore, type FlowItem, type FlowSeq } from '@/network/flow';
import { chooseNetworkOrientation, layoutNetwork, type NetLayout, type PathView } from '@/network/layout';
import { buildUnitNetwork, type NetLesson } from '@/network/model';

/* Invented names only: this repository is public. */
const LINES: NetworkLine[] = [
  { id: 'read', mode: 'train', name: 'Reading', short: 'RD', colour: 'wave' },
  { id: 'write', mode: 'train', name: 'Writing', short: 'WR', colour: 'navy' },
  { id: 'place', mode: 'metro', name: 'Place', short: 'PL', colour: 'green' },
  { id: 'craft', mode: 'light_rail', name: 'Craft', short: 'CR', colour: 'amber' },
  { id: 'voice', mode: 'light_rail', name: 'Voice', short: 'VO', colour: 'lilac' }
];
const at = (...ids: string[]) => ids.map((id) => ({ line_id: id }));

const LESSONS: NetLesson[] = [
  { id: 'a', title: 'Harbour poems', line_stops: at('read', 'write') },
  { id: 'b', title: 'Lighthouse letters', line_stops: at('read', 'write', 'place') },
  { id: 'c', title: 'Salt and stone', line_stops: at('read', 'place') },
  { id: 'd', title: 'Quiet week', line_stops: [] },
  { id: 'e', title: 'Tide tables', line_stops: at('craft', 'read', 'write', 'place') },
  { id: 'f', title: 'Breakwater', line_stops: at('read', 'write', 'place', 'voice') },
  { id: 'g', title: 'Storm diary', line_stops: at('read', 'place', 'craft', 'voice') }
];

function content(overrides: Partial<CurriculumLinesV2Content> = {}): CurriculumLinesV2Content {
  return { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' }, ...overrides };
}
const layout = (lessons = LESSONS, overrides: Partial<CurriculumLinesV2Content> = {}, width = 900): NetLayout =>
  layoutNetwork(buildUnitNetwork(content(overrides), LINES, lessons), 'vertical', { width });

/** Where a path crosses height y (undefined when it doesn't reach it). */
function xAt(path: PathView, y: number): number | undefined {
  const pts = path.points;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!, q = pts[i]!;
    if ((p.y - y) * (q.y - y) <= 0 && p.y !== q.y) return p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x);
    if (p.y === y) return p.x;
  }
  return undefined;
}

describe('Unit map: the bundle', () => {
  it('gathers the stopping lines together, moving the others to the nearer edge', () => {
    expect(gatherStops(['a', 'b', 'c'], (id) => id !== 'b')).toEqual(['a', 'c', 'b']);
    expect(gatherStops(['a', 'b', 'c', 'd'], (id) => id === 'a' || id === 'd')).toEqual(['a', 'd', 'b', 'c']);
    expect(gatherStops(['x', 'a', 'b', 'y'], (id) => id === 'a' || id === 'b')).toEqual(['x', 'a', 'b', 'y']);
    expect(gatherStops(['a', 'b'], () => false)).toEqual(['a', 'b']);
  });

  it('draws one capsule per lesson over only the lines that stop, with their dots inside', () => {
    const L = layout();
    expect(L.style).toBe('bundle');
    expect(L.pills).toHaveLength(LESSONS.length);
    for (const pill of L.pills) {
      const lesson = LESSONS.find((l) => l.id === pill.rowId)!;
      expect(pill.markers.map((m) => m.lineId).sort()).toEqual((lesson.line_stops ?? []).map((s) => s.line_id).sort());
      for (const m of pill.markers) {
        expect(m.x).toBeGreaterThan(pill.x);
        expect(m.x).toBeLessThan(pill.x + pill.w);
      }
      // No line that skips this lesson runs through its capsule (a dashed station has no stops: all pass).
      if (!pill.markers.length) continue;
      const mid = pill.y + pill.h / 2;
      for (const path of L.paths.filter((p) => p.style === 'main' && !pill.markers.some((m) => m.lineId === p.lineId))) {
        const x = xAt(path, mid);
        if (x === undefined) continue;
        expect(x < pill.x || x > pill.x + pill.w).toBe(true);
      }
    }
  });

  it('puts names beside the stations, never inside, and bolds the busy ones', () => {
    const L = layout();
    for (const pill of L.pills) {
      expect(pill.label.x > pill.x + pill.w || pill.label.x < pill.x).toBe(true);
      expect(pill.label.bold).toBe(pill.markers.length >= 3);
    }
  });

  it('draws every bend at 45°', () => {
    const L = layout();
    for (const path of L.paths) {
      for (let i = 1; i < path.points.length; i++) {
        const dx = Math.abs(path.points[i]!.x - path.points[i - 1]!.x);
        const dy = Math.abs(path.points[i]!.y - path.points[i - 1]!.y);
        expect(dx < 0.01 || dy < 0.01 || Math.abs(dx - dy) < 0.01).toBe(true);
      }
    }
  });

  it('fits a phone upright, wrapping long names', () => {
    const input = buildUnitNetwork(content(), LINES, LESSONS);
    expect(chooseNetworkOrientation(390, input)).toBe('vertical');
    const L = layoutNetwork(input, 'vertical', { width: 390 });
    expect(L.width).toBeLessThanOrEqual(390);
  });

  it('dashes a lesson no line stops at', () => {
    const quiet = layout().pills.find((p) => p.rowId === 'd')!;
    expect(quiet.markers).toHaveLength(0);
  });

  it('forks a skill line round an optional detour, with the skip rule under its name', () => {
    const L = layout(LESSONS, {
      rail_stops: [{ id: 'drill', line_id: 'craft', after_lesson_id: 'e', kind: 'support', label: 'Image drill', skip_rule: '90%+ on the tide quiz' }]
    });
    const fork = L.paths.find((p) => p.style === 'loop' && p.lineId === 'craft')!;
    expect(fork.points[0]!.x).toBe(fork.points.at(-1)!.x);
    const dot = L.dots.find((d) => d.id === 'drill')!;
    expect(fork.points.some((p) => p.x === dot.x)).toBe(true);
    expect(dot.label.text).toBe('Image drill');
    expect(dot.label.note).toBe('Skip: 90%+ on the tide quiz');
  });

  it('lets a station be dragged; its lines follow', () => {
    const plain = layout();
    const moved = layout(LESSONS, { nudges: { b: { dx: 20, dy: 12 } } });
    const p0 = plain.pills.find((p) => p.rowId === 'b')!;
    const p1 = moved.pills.find((p) => p.rowId === 'b')!;
    expect([p1.x - p0.x, p1.y - p0.y]).toEqual([20, 12]);
    const m = p1.markers[0]!;
    const track = moved.paths.find((p) => p.lineId === m.lineId && p.style === 'main')!;
    expect(xAt(track, m.y)).toBeCloseTo(m.x);
  });
});

describe('Unit map: splits from before and after', () => {
  const split: NetLesson[] = [
    { id: 'a', title: 'Harbour poems', line_stops: at('read', 'write', 'place') },
    { id: 'b', title: 'Close study', after: ['d'], line_stops: at('read', 'write') },
    { id: 'c', title: 'Wide reading', after: ['d'], line_stops: at('read', 'place') },
    { id: 'd', title: 'Storm diary', line_stops: at('read', 'write', 'place') }
  ].map((l, i) => (i === 0 ? { ...l, after: ['b', 'c'] } : l));

  it('puts the two options side by side, and runs a line that serves both down both branches', () => {
    const L = layout(split);
    const b = L.pills.find((p) => p.rowId === 'b')!;
    const c = L.pills.find((p) => p.rowId === 'c')!;
    expect(b.y).toBe(c.y);
    expect(Math.abs(b.x - c.x)).toBeGreaterThan(b.w);
    // Reading stops at both: two tracks.
    expect(L.paths.filter((p) => p.lineId === 'read' && p.style === 'main')).toHaveLength(2);
    expect(L.paths.filter((p) => p.lineId === 'write' && p.style === 'main')).toHaveLength(1);
    // The left option is named on the left, the right one on the right.
    const [left, right] = b.x < c.x ? [b, c] : [c, b];
    expect(left.label.anchor).toBe('end');
    expect(left.label.x).toBeLessThan(left.x);
    expect(right.label.x).toBeGreaterThan(right.x + right.w);
  });

  it('gives a bypass its own straight track: lines that skip the option take it', () => {
    const lessons: NetLesson[] = [
      { id: 'a', title: 'Harbour poems', after: ['w', 'z'], line_stops: at('read', 'write') },
      { id: 'w', title: 'Workshop', kind: 'workshop', after: ['z'], line_stops: at('write') },
      { id: 'z', title: 'Storm diary', line_stops: at('read', 'write') }
    ];
    const L = layout(lessons);
    const w = L.pills.find((p) => p.rowId === 'w')!;
    const read = L.paths.find((p) => p.lineId === 'read' && p.style === 'main')!;
    const x = xAt(read, w.y + w.h / 2)!;
    expect(x < w.x || x > w.x + w.w).toBe(true);
  });
});

describe('Lesson flow', () => {
  const ids = (seq: FlowSeq): unknown[] => seq.map((item: FlowItem) => ('row' in item ? item.row : { split: item.split.map(ids) }));

  it('follows the order when nothing is set, and ends the unit on an empty list', () => {
    expect(ids(buildFlow([{ id: 'a' }, { id: 'b' }, { id: 'c' }]).seq)).toEqual(['a', 'b', 'c']);
    const f = buildFlow([{ id: 'a', after: [] }, { id: 'b' }]);
    expect(f.next.get('a')).toEqual([]);
  });

  it('splits on a choice and rejoins where the branches meet, unequal branches allowed', () => {
    const f = buildFlow([
      { id: 'a', after: ['b1', 'c'] }, { id: 'b1' }, { id: 'b2', after: ['d'] }, { id: 'c', after: ['d'] }, { id: 'd' }
    ]);
    expect(ids(f.seq)).toEqual(['a', { split: [['b1', 'b2'], ['c']] }, 'd']);
    expect(f.problems).toEqual([]);
  });

  it('makes a bypass an empty branch, and splits three ways', () => {
    expect(ids(buildFlow([{ id: 'a', after: ['w', 'z'] }, { id: 'w', after: ['z'] }, { id: 'z' }]).seq))
      .toEqual(['a', { split: [['w'], []] }, 'z']);
    expect(ids(buildFlow([{ id: 'a', after: ['x', 'y', 'z'] }, { id: 'x', after: ['e'] }, { id: 'y', after: ['e'] }, { id: 'z', after: ['e'] }, { id: 'e' }]).seq))
      .toEqual(['a', { split: [['x'], ['y'], ['z']] }, 'e']);
  });

  it('asks an option where it goes when the order would run it into the other option, and suggests one', () => {
    const f = buildFlow([{ id: 'a', after: ['b', 'c'] }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    const ask = f.problems.find((p) => p.kind === 'needs_next')!;
    expect(ask.lessonId).toBe('b');
    expect(ask.suggestion).toBe('d');
    // Until then the order holds: b is a detour before c, which never tangles the branches.
    expect(ids(f.seq)).toEqual(['a', { split: [['b'], []] }, 'c', 'd']);
    expect(f.problems.filter((p) => p.kind !== 'needs_next')).toEqual([]);
  });

  it('suggests the bypass target for a detour with nothing after it', () => {
    const f = buildFlow([{ id: 'a', after: ['w', 'z'] }, { id: 'w' }, { id: 'z' }]);
    expect(f.problems.find((p) => p.lessonId === 'w')?.suggestion).toBe('z');
    expect(ids(f.seq)).toEqual(['a', { split: [['w'], []] }, 'z']);
  });

  it('refuses a link from one branch into the other', () => {
    const f = buildFlow([{ id: 'a', after: ['b', 'c'] }, { id: 'b', after: ['c', 'd'] }, { id: 'c', after: ['d'] }, { id: 'd' }]);
    expect(f.problems.some((p) => p.kind === 'cross_link')).toBe(true);
    expect(f.order.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('nests splits two deep and refuses a third', () => {
    const two = buildFlow([
      { id: 'a', after: ['b', 'c'] }, { id: 'b', after: ['b1', 'b2'] }, { id: 'b1', after: ['d'] }, { id: 'b2', after: ['d'] }, { id: 'c', after: ['d'] }, { id: 'd' }
    ]);
    expect(two.problems).toEqual([]);
    const three = buildFlow([
      { id: 'a', after: ['b', 'c'] }, { id: 'b', after: ['b1', 'b2'] }, { id: 'b1', after: ['x', 'y'] }, { id: 'x', after: ['d'] }, { id: 'y', after: ['d'] },
      { id: 'b2', after: ['d'] }, { id: 'c', after: ['d'] }, { id: 'd' }
    ]);
    expect(three.problems.some((p) => p.kind === 'too_deep')).toBe(true);
  });

  it('drops loops and links to lessons that left the unit', () => {
    const f = buildFlow([{ id: 'a', after: ['gone', 'b'] }, { id: 'b' }, { id: 'c', after: ['a'] }]);
    expect(f.problems.map((p) => p.kind).sort()).toEqual(['loop', 'missing']);
    expect(f.next.get('a')).toEqual(['b']);
  });

  it('passes a hidden lesson’s links through', () => {
    const f = buildFlow([{ id: 'a', after: ['b', 'c'] }, { id: 'b', after: ['d'] }, { id: 'c', after: ['h'] }, { id: 'h', after: ['d'] }, { id: 'd' }], { hidden: new Set(['h']) });
    expect(ids(f.seq)).toEqual(['a', { split: [['b'], ['c']] }, 'd']);
    expect(lessonsBefore(f, 'd').sort()).toEqual(['b', 'c']);
  });

  it('lets a lesson offer a detour before the next one without tangling a later split', () => {
    const lessons = [{ id: '1' }, { id: '2', after: ['3', '4'] }, { id: '3' }, { id: '4', after: ['5', '6'] }, { id: '5', after: ['7'] }, { id: '6', after: ['7'] }, { id: '7' }];
    const f = buildFlow(lessons);
    expect(f.problems.filter((p) => p.kind !== 'needs_next')).toEqual([]);
    expect(ids(f.seq)).toEqual(['1', '2', { split: [['3'], []] }, '4', { split: [['5'], ['6']] }, '7']);
    // Lesson 5 sits inside the later split, so the suggestion for 3 is to rejoin at 4.
    expect(f.problems.find((p) => p.lessonId === '3')?.suggestion).toBe('4');
  });

  it('says which new link would break the map, for the editor', () => {
    const lessons = [{ id: 'a', after: ['b', 'c'] }, { id: 'b', after: ['d'] }, { id: 'c', after: ['d'] }, { id: 'd' }];
    expect(linkProblem(lessons, 'b', ['c', 'd'])?.kind).toBe('cross_link');
    // b → c makes b an optional detour before c: allowed.
    expect(linkProblem(lessons, 'b', ['c'])).toBeUndefined();
    expect(linkProblem(lessons, 'd', ['a'])?.kind).toBe('loop');
    expect(linkProblem(lessons, 'a', ['b', 'c', 'd'])).toBeUndefined();
  });
});

describe('Lesson flow for students', () => {
  it('passes links through lessons students cannot see, and leaves unset links unset', async () => {
    const { publicAfterLinks, publicLessonKind } = await import('../../../../netlify/functions/_shared/teaching-network.mjs');
    const drafts = new Map<string, { after_lesson_ids?: string[] | null }>([
      ['a', { after_lesson_ids: ['draft', 'c'] }], ['draft', {}], ['b', {}], ['c', { after_lesson_ids: null }]
    ]);
    const links = publicAfterLinks(['a', 'draft', 'b', 'c'], drafts, new Set(['a', 'b', 'c']));
    // a → draft (unpublished, follows order to b) | c
    expect(links.get('a')).toEqual(['b', 'c']);
    expect(links.has('b')).toBe(false);
    expect(links.has('c')).toBe(false);
    expect(publicLessonKind('workshop')).toBe('workshop');
    expect(publicLessonKind('lesson')).toBeUndefined();
  });
});

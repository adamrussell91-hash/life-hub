import { describe, it, expect } from 'vitest';
import { BlockSchema, type CurriculumLinesV1Content, type CurriculumLinesV2Content, type NetworkLine } from '@/schemas/block';
import { SubjectSchema } from '@/schemas/subject';
import { createBlock, HOMEPAGE_BLOCK_GROUPS, LESSON_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { lineColour, nextColour } from '@/network/colour';
import { connect, layoutNetwork, liveNudges, type NetInput, type NetLevel, type Pt } from '@/network/layout';
import { buildUnitNetwork, convertV1, type NetLesson } from '@/network/model';
import { buildYearNetwork, classNow, outcomeCoverage, unitStops } from '@/network/year';

/* Invented names only: this repository is public. */
const LINES: NetworkLine[] = [
  { id: 'understand', mode: 'train', name: 'Understanding', colour: 'wave' },
  { id: 'respond', mode: 'train', name: 'Responding', colour: 'amber' },
  { id: 'represent', mode: 'metro', name: 'Representation', colour: 'green' },
  { id: 'analytic', mode: 'light_rail', name: 'Analytical writing', colour: 'lilac' },
  { id: 'oral', mode: 'light_rail', name: 'Oral skills', colour: 'navy' }
];

const LESSONS: NetLesson[] = [
  { id: 'l1', title: 'Harbour poems', href: '/lessons/l1', line_stops: [{ line_id: 'understand', level: 'introduced' }, { line_id: 'represent', level: 'introduced' }] },
  { id: 'l2', title: 'Lighthouse letters', href: '/lessons/l2', line_stops: [{ line_id: 'respond', level: 'introduced' }, { line_id: 'analytic' }] },
  { id: 'l3', title: 'Salt and stone', href: '/lessons/l3', line_stops: [{ line_id: 'respond', level: 'reinforced' }] },
  { id: 'l4', title: 'Tide tables', line_stops: [{ line_id: 'understand', level: 'mastered' }, { line_id: 'represent', level: 'mastered' }, { line_id: 'oral' }] }
];

function v2(overrides: Partial<CurriculumLinesV2Content> = {}): CurriculumLinesV2Content {
  return { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' }, ...overrides };
}

function input(overrides: Partial<CurriculumLinesV2Content> = {}, lessons = LESSONS): NetInput {
  return buildUnitNetwork(v2(overrides), LINES, lessons);
}

const xs = (pts: Pt[]) => [...new Set(pts.map((p) => Math.round(p.x)))];

describe('Curriculum lines block: schema', () => {
  it('is a unit plan block only; new blocks are version 2 and version 1 still parses', () => {
    const block = createBlock('curriculum_lines', 'cl1');
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'curriculum_lines') throw new Error('Expected curriculum_lines');
    expect((parsed.content as { version?: number }).version).toBe(2);
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).toContain('curriculum_lines');
    expect(LESSON_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('curriculum_lines');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('curriculum_lines');
    expect(blockRegistry.curriculum_lines).toBeDefined();
    const v1 = BlockSchema.parse({ ...block, content: { weeks: 2, strands: [{ id: 'a', name: 'A', colour: 'wave' }], stations: [], checkpoints: [], terminus: { label: 'Task' } } });
    expect((v1.content as { strands?: unknown[] }).strands).toHaveLength(1);
  });

  it('keeps network lines on the subject', () => {
    const subject = SubjectSchema.parse({
      id: 's1', type: 'subject', title: 'English', slug: 'english', status: 'active',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
      display_title: 'English', unit_ids: [], outcome_ids: [], class_ids: [],
      network_lines: LINES
    });
    expect(subject.network_lines).toHaveLength(5);
  });

  it('uses the transit map line colours as tokens', () => {
    expect(lineColour('wave')).toBe('var(--wave, #376fb7)');
    expect(lineColour('green_deep')).toContain('color-mix');
    expect(nextColour(['wave', 'green'])).toBe('amber');
  });
});

describe('Network layout', () => {
  it('joins two points with one 45° bend next to a near point', () => {
    expect(connect({ a: 0, c: 0 }, { a: 100, c: 40, near: true })).toEqual([{ a: 60, c: 0 }, { a: 100, c: 40, near: true }]);
    expect(connect({ a: 0, c: 0, near: true }, { a: 100, c: 40 })).toEqual([{ a: 40, c: 40 }, { a: 100, c: 40 }]);
    expect(connect({ a: 0, c: 5 }, { a: 50, c: 5 })).toEqual([{ a: 50, c: 5 }]);
  });

  it('runs metro straight under every station', () => {
    const L = layoutNetwork(input(), 'vertical');
    const metro = L.paths.find((p) => p.lineId === 'represent')!;
    expect(xs(metro.points)).toHaveLength(1);
    // Two stops, two markers: it passes under the other lessons.
    const markers = L.pills.flatMap((p) => p.markers.filter((m) => m.lineId === 'represent'));
    expect(markers.map((m) => m.level)).toEqual(['introduced', 'mastered']);
  });

  it('bends a train round a station it does not serve, sharing one detour for consecutive skips', () => {
    const L = layoutNetwork(input(), 'vertical');
    const understanding = L.paths.find((p) => p.lineId === 'understand')!;
    const col = L.pills[0]!.markers.find((m) => m.lineId === 'understand')!.x;
    const lanes = xs(understanding.points).filter((x) => x !== Math.round(col));
    // Skips lessons 2 and 3: one detour lane, left of the corridor.
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!).toBeLessThan(L.pills[0]!.x);
    // Every bend is 45°.
    const pts = understanding.points;
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i]!.x - pts[i - 1]!.x), dy = Math.abs(pts[i]!.y - pts[i - 1]!.y);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 0.01).toBe(true);
    }
  });

  it('bends trains that skip a station round its nearer side; on the phone map they nest, left train outside', () => {
    const lessons: NetLesson[] = [
      { id: 'a', title: 'A', line_stops: [{ line_id: 'understand' }, { line_id: 'respond' }] },
      { id: 'b', title: 'B', line_stops: [{ line_id: 'represent' }] },
      { id: 'c', title: 'C', line_stops: [{ line_id: 'understand' }, { line_id: 'respond' }] }
    ];
    const L = layoutNetwork(input({}, lessons), 'vertical');
    const pill = L.pills[1]!;
    const mid = pill.y + pill.h / 2;
    const near = (id: string) => L.paths.find((p) => p.lineId === id)!.points.filter((p) => Math.abs(p.y - mid) < pill.h).map((p) => p.x);
    expect(Math.min(...near('understand'))).toBeLessThan(pill.x);
    expect(Math.max(...near('respond'))).toBeGreaterThan(pill.x + pill.w);
    const H = layoutNetwork(input({}, lessons), 'horizontal');
    const hp = H.pills[1]!;
    const hmid = hp.x + hp.w / 2;
    const top = (id: string) => Math.min(...H.paths.find((p) => p.lineId === id)!.points.filter((p) => Math.abs(p.x - hmid) < hp.w).map((p) => p.y));
    expect(top('understand')).toBeLessThan(top('respond'));
    expect(top('respond')).toBeLessThan(hp.y);
  });

  it('joins light rail at the station edge and hangs extension spurs and support loops off it', () => {
    const L = layoutNetwork(input({
      rail_stops: [
        { id: 'r1', line_id: 'analytic', after_lesson_id: 'l2', kind: 'stop', label: 'Paragraph drill' },
        { id: 'r2', line_id: 'analytic', after_lesson_id: 'l2', kind: 'extension', label: 'Wider reading' },
        { id: 'r3', line_id: 'analytic', after_lesson_id: 'l3', kind: 'support', label: 'Sentence starters' }
      ]
    }), 'vertical');
    const main = L.paths.find((p) => p.lineId === 'analytic' && p.style === 'main')!;
    const pill = L.pills[1]!;
    // Touches lesson 2's pill edge.
    expect(main.points.some((p) => Math.abs(p.x - (pill.x + pill.w)) < 1)).toBe(true);
    const spur = L.paths.find((p) => p.style === 'spur')!;
    const loop = L.paths.find((p) => p.style === 'loop')!;
    const dot = (id: string) => L.dots.find((d) => d.id === id)!;
    expect(spur.points.at(-1)).toEqual({ x: dot('r2').x, y: dot('r2').y });
    // The loop leaves the line and comes back to the same lane.
    expect(loop.points[0]!.x).toBe(loop.points.at(-1)!.x);
    expect(loop.points.some((p) => p.x === dot('r3').x)).toBe(true);
    expect(dot('r1').label.text).toBe('Paragraph drill');
  });

  it('places light rail lanes right, then left of the corridor', () => {
    const L = layoutNetwork(input(), 'vertical');
    const laneX = (id: string) => L.header.find((h) => h.lineId === id)!.x;
    const pill = L.pills[0]!;
    expect(laneX('analytic')).toBeGreaterThan(pill.x + pill.w);
    expect(laneX('oral')).toBeLessThan(pill.x);
  });

  it('applies nudges across and along, in either orientation, and drops stale ones', () => {
    const stops = { rail_stops: [{ id: 'r1', line_id: 'analytic', after_lesson_id: 'l2', kind: 'stop' as const, label: 'Drill' }] };
    const plain = layoutNetwork(input(stops), 'vertical').dots[0]!;
    const moved = layoutNetwork(input({ ...stops, nudges: { r1: { dx: 10, dy: 4 } } }), 'vertical').dots[0]!;
    expect([moved.x - plain.x, moved.y - plain.y]).toEqual([10, 4]);
    const h0 = layoutNetwork(input(stops), 'horizontal').dots[0]!;
    const h1 = layoutNetwork(input({ ...stops, nudges: { r1: { dx: 10, dy: 4 } } }), 'horizontal').dots[0]!;
    expect([h1.x - h0.x, h1.y - h0.y]).toEqual([4, 10]);
    expect(liveNudges({ r1: { dx: 3, dy: 0 }, gone: { dx: 9, dy: 9 }, zero: { dx: 0, dy: 0 } }, ['r1', 'zero'])).toEqual({ r1: { dx: 3, dy: 0 } });
  });

  it('keeps a stop whose lesson left the unit, at the end', () => {
    const net = input({ rail_stops: [{ id: 'r1', line_id: 'oral', after_lesson_id: 'gone', kind: 'stop', label: 'Speech' }] });
    expect(net.railStops[0]!.afterRow).toBe(LESSONS.length - 1);
  });

  it('links lessons and block stops the viewer may open, and shows the rest as text', () => {
    const net = input({
      rail_stops: [
        { id: 'r1', line_id: 'analytic', after_lesson_id: 'l1', kind: 'stop', lesson_id: 'l1', block_id: 'b9', label: '' },
        { id: 'r2', line_id: 'analytic', after_lesson_id: 'l3', kind: 'stop', lesson_id: 'l4', label: '' }
      ]
    });
    expect(net.rows[0]!.target).toEqual({ text: 'Harbour poems', href: '/lessons/l1' });
    expect(net.rows[3]!.target).toEqual({ text: 'Tide tables' });
    expect(net.railStops[0]!.target).toEqual({ text: 'Harbour poems', href: '/lessons/l1#block=b9' });
    expect(net.railStops[1]!.target).toEqual({ text: 'Tide tables' });
  });

  it('turns metro and train stops in the gap into plain stops; only light rail branches', () => {
    const net = input({ rail_stops: [{ id: 'r1', line_id: 'represent', after_lesson_id: 'l1', kind: 'support', label: 'x' }] });
    expect(net.railStops[0]!.kind).toBe('stop');
  });

  it('puts each lesson name inside its station, in both orientations', () => {
    for (const o of ['vertical', 'horizontal'] as const) {
      const L = layoutNetwork(input(), o);
      for (const pill of L.pills) {
        expect(pill.label.text).toBe(LESSONS.find((l) => l.id === pill.rowId)!.title);
        expect(pill.label.x).toBeGreaterThan(pill.x);
        expect(pill.label.x).toBeLessThan(pill.x + pill.w);
        expect(pill.label.y).toBeGreaterThan(pill.y);
        expect(pill.label.y).toBeLessThan(pill.y + pill.h);
        expect(pill.label.maxW).toBeLessThan(o === 'vertical' ? pill.w : pill.w);
      }
    }
  });

  it('sizes a vertical station to its longest name, not the room, and centres the map', () => {
    const narrow = layoutNetwork(input(), 'vertical');
    const wide = layoutNetwork(input(), 'vertical', { width: 1400 });
    expect(wide.pills[0]!.w).toBe(narrow.pills[0]!.w);
    expect(narrow.pills[0]!.w).toBeLessThan(260);
    expect(wide.width).toBeLessThanOrEqual(1400);
    expect(wide.pills[0]!.x).toBeGreaterThan(narrow.pills[0]!.x);
  });

  it('centres the name in a vertical station with its stop markers either side, on the centre line', () => {
    const L = layoutNetwork(input(), 'vertical');
    for (const pill of L.pills) {
      const mid = pill.x + pill.w / 2;
      expect(pill.label.x).toBeCloseTo(mid);
      expect(pill.label.y - 4.5).toBeCloseTo(pill.y + pill.h / 2);
      for (const m of pill.markers) {
        expect(m.y).toBeCloseTo(pill.y + pill.h / 2);
        expect(Math.abs(m.x - mid)).toBeGreaterThan(pill.label.maxW / 2);
      }
    }
  });

  it('wraps a name too long for the widest station onto two lines', () => {
    const long = [{ ...LESSONS[0]!, title: 'A very long lesson name about harbours, lighthouses, salt and the stone of the sea wall' }, ...LESSONS.slice(1)];
    const L = layoutNetwork(input({}, long), 'vertical');
    expect(L.pills[0]!.label.maxW).toBeLessThanOrEqual(282);
    expect(L.pills[0]!.label.wrap).toBe(true);
    expect(L.pills[1]!.label.wrap).toBe(false);
  });

  it('marks a light rail stop where it joins the station', () => {
    const L = layoutNetwork(input(), 'vertical');
    const rail = L.pills[1]!.markers.find((m) => m.lineId === 'analytic')!;
    expect(rail).toBeDefined();
    expect(rail.x === L.pills[1]!.x || rail.x === L.pills[1]!.x + L.pills[1]!.w).toBe(true);
    expect(L.paths.find((p) => p.lineId === 'analytic' && p.style === 'main')!.points.some((p) => p.x === rail.x)).toBe(true);
    expect(L.pills[0]!.markers.some((m) => m.lineId === 'analytic')).toBe(false);
  });

  it('lets a lesson station be dragged; its lines bend to follow', () => {
    const plain = layoutNetwork(input(), 'vertical');
    const moved = layoutNetwork(input({ nudges: { l2: { dx: 30, dy: 12 } } }), 'vertical');
    expect(moved.pills[1]!.x - plain.pills[1]!.x).toBe(30);
    expect(moved.pills[1]!.y - plain.pills[1]!.y).toBe(12);
    const respond = moved.pills[1]!.markers.find((m) => m.lineId === 'respond')!;
    expect(moved.paths.find((p) => p.lineId === 'respond')!.points.some((p) => p.x === respond.x && p.y === respond.y)).toBe(true);
  });

  it('is wider than a phone when vertical, so phones get the horizontal map', () => {
    const L = layoutNetwork(input(), 'vertical');
    expect(L.width).toBeGreaterThan(390);
    const H = layoutNetwork(input(), 'horizontal');
    expect(H.height).toBeLessThan(L.width);
  });
});

describe('Version 1 conversion', () => {
  const v1: CurriculumLinesV1Content = {
    title: 'Coastlines',
    weeks: 3,
    strands: [
      { id: 's_resp', name: 'responding', colour: 'amber' },
      { id: 's_new', name: 'Close reading', colour: 'green' }
    ],
    stations: [
      { id: 'st1', strand_id: 's_resp', week: 1, level: 'mastered', label: '', lesson_id: 'l1' },
      { id: 'st2', strand_id: 's_new', week: 1, level: 'introduced', label: '', lesson_id: 'l1' },
      { id: 'st3', strand_id: 's_new', week: 2, level: 'reinforced', label: 'Reading circle' },
      { id: 'st4', strand_id: 's_resp', week: 3, level: 'reinforced', label: '', lesson_id: 'l3' },
      { id: 'st5', strand_id: 's_resp', week: 9, level: 'reinforced', label: 'Out of range' }
    ],
    checkpoints: [{ id: 'cp1', week: 2, label: 'Quick quiz', strand_ids: ['s_resp', 's_new'] }],
    terminus: { label: 'Essay', when: 'Wk 4' }
  };

  it('matches strands to subject lines by name, else makes a train line', () => {
    const out = convertV1(v1, LINES, LESSONS, 'blk');
    expect(out.added).toHaveLength(1);
    expect(out.added[0]).toMatchObject({ mode: 'train', name: 'Close reading', colour: 'green' });
    expect(out.lines).toHaveLength(LINES.length + 1);
  });

  it('turns lesson stations into lesson stops, keeping depth', () => {
    const out = convertV1(v1, LINES, LESSONS, 'blk');
    const newId = out.added[0]!.id;
    expect(out.lessonStops.get('l1')).toEqual([
      { line_id: 'understand', level: 'introduced' },
      { line_id: 'represent', level: 'introduced' },
      { line_id: 'respond', level: 'mastered' },
      { line_id: newId, level: 'introduced' }
    ]);
    // l3 already stops on Responding at reinforced: unchanged, so not written.
    expect(out.lessonStops.has('l3')).toBe(false);
  });

  it('places stations without a lesson after the last lesson of their week, and checkpoints become gates', () => {
    const out = convertV1(v1, LINES, LESSONS, 'blk');
    expect(out.content.rail_stops).toEqual([
      { id: 'stop_st3', line_id: out.added[0]!.id, after_lesson_id: 'l1', kind: 'stop', label: 'Reading circle' }
    ]);
    expect(out.content.gates).toEqual([
      { id: 'gate_cp1', after_lesson_id: 'l1', label: 'Quick quiz', line_ids: ['respond', out.added[0]!.id] }
    ]);
    expect(out.content.terminus).toEqual({ label: 'Essay', when: 'Wk 4' });
    expect(out.content.title).toBe('Coastlines');
    expect(BlockSchema.parse({ ...createBlock('curriculum_lines', 'x'), content: out.content })).toBeTruthy();
  });
});

describe('Year network', () => {
  const units = [
    { id: 'u1', title: 'Coastlines', href: '/units/u1', lessons: LESSONS.slice(0, 2).map((l) => ({ ...l, outcome_ids: ['o1'] })) },
    { id: 'u2', title: 'Night voices', lessons: LESSONS.slice(2), railLineIds: ['analytic'] }
  ];

  it('derives unit stops and the highest depth among its lessons', () => {
    const lines = new Map(LINES.map((l) => [l.id, l]));
    const a = unitStops(units[0]!, lines);
    expect(a.get('understand')).toBe('introduced');
    expect(a.get('analytic')).toBeNull();
    const b = unitStops(units[1]!, lines);
    expect(b.get('represent')).toBe('mastered' satisfies NetLevel);
    expect(b.get('respond')).toBe('reinforced');
    expect(b.has('analytic')).toBe(true);
  });

  it('lays units on a zigzag trunk to an HSC terminus, with the class-now dot', () => {
    const now = classNow([{ id: 'u1', lesson_ids: ['l1', 'l2'] }, { id: 'u2', lesson_ids: ['l3', 'l4'] }],
      [{ lesson_id: 'l3', unit_id: 'u2', date: '2026-05-01' }, { lesson_id: 'l4', unit_id: 'u2', date: '2026-09-01' }], '2026-06-01');
    expect(now).toEqual({ row: 1, frac: 0, label: 'Class now' });
    const L = layoutNetwork(buildYearNetwork(LINES, units, { now }), 'vertical');
    expect(L.rowKind).toBe('unit');
    expect(L.terminus.target.text).toBe('HSC');
    expect(L.pills[0]!.x).not.toBe(L.pills[1]!.x);
    expect(L.now).toBeDefined();
  });

  it('flags outcomes no lesson tags, and reports the depth reached', () => {
    const rows = outcomeCoverage([{ id: 'o1', code: 'EN12-1' }, { id: 'o2', code: 'EN12-2' }], units, LINES);
    expect(rows[0]).toMatchObject({ units: [{ id: 'u1', title: 'Coastlines' }], level: 'introduced', flagged: false });
    expect(rows[1]).toMatchObject({ units: [], flagged: true });
  });
});

describe('Curriculum lines block: render', () => {
  it('draws a version 1 block through the network, with links only to lessons the viewer can open', () => {
    const block = createBlock('curriculum_lines', 'cl1');
    if (block.block_type !== 'curriculum_lines') throw new Error('x');
    const v1Block = { ...block, content: { weeks: 1, strands: [{ id: 'a', name: 'Understanding', colour: 'wave' as const }], stations: [{ id: 's', strand_id: 'a', week: 1, level: 'introduced' as const, label: '', lesson_id: 'l1' }], checkpoints: [], terminus: { label: 'Essay' } } };
    const el = renderBlock(v1Block, 'print', { network: { lines: LINES, lessons: [LESSONS[0]!, { id: 'l4', title: 'Tide tables' }] } });
    expect(el.querySelector('svg')).not.toBeNull();
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/lessons/l1');
    expect(el.textContent).toContain('Tide tables');
    expect(hrefs.some((h) => h?.includes('l4'))).toBe(false);
  });

  it('asks for lines and lessons when it has neither', () => {
    const el = renderBlock(createBlock('curriculum_lines', 'cl2'), 'teacher', {});
    expect(el.querySelector('.block-empty')?.textContent).toContain('lines');
  });
});

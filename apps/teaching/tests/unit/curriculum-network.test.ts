import { describe, it, expect } from 'vitest';
import { BlockSchema, type CurriculumLinesV1Content, type CurriculumLinesV2Content, type NetworkLine } from '@/schemas/block';
import { SubjectSchema } from '@/schemas/subject';
import { createBlock, HOMEPAGE_BLOCK_GROUPS, LESSON_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { lineColour, nextColour } from '@/network/colour';
import { connect, layoutNetwork, liveNudges, type NetInput, type NetLevel, type Pt } from '@/network/layout';
import { buildUnitNetwork, convertV1, placeByDate, type NetLesson } from '@/network/model';
import { createCurriculumLinesEditor } from '@/blocks/curriculum-lines/editor';
import type { CurriculumLinesBlock } from '@/schemas/block';
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

  it('puts stations in the map’s own order, leaves hidden lessons off, and hands their gaps back', () => {
    const net = input({
      station_order: ['l3', 'l1'],
      hidden_lessons: ['l2'],
      rail_stops: [{ id: 'r1', line_id: 'oral', after_lesson_id: 'l2', kind: 'stop', label: 'Speech' }]
    });
    expect(net.rows.map((r) => r.id)).toEqual(['l3', 'l1', 'l4']);
    // l2 sat after l1 in the map's order, so its stop follows l1.
    expect(net.railStops[0]!.afterRow).toBe(1);
    const firstHidden = input({ hidden_lessons: ['l1'], gates: [{ id: 'g', after_lesson_id: 'l1', label: 'Quiz', line_ids: [] }] });
    expect(firstHidden.gates[0]!.afterRow).toBe(-1);
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

describe('Curriculum lines block: station editor', () => {
  function mountEditor(content: CurriculumLinesV2Content = v2()) {
    const block = { ...createBlock('curriculum_lines', 'map'), content } as CurriculumLinesBlock;
    let latest = block;
    const host = createCurriculumLinesEditor(block, (next) => { latest = next; }, {
      lines: LINES,
      lessons: LESSONS,
      saveLessonStops: async () => {}
    });
    document.body.append(host);
    const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const rowNames = () => [...host.querySelectorAll('.cl-editor__grid tr')].slice(1).map((tr) => tr.querySelector('th')?.textContent);
    return { host, button, rowNames, content: () => latest.content as CurriculumLinesV2Content };
  }

  it('moves a station up and down on this map without touching the unit', () => {
    const { button, rowNames, content } = mountEditor();
    expect(button('Move Harbour poems up').disabled).toBe(true);
    button('Move Salt and stone up').click();
    expect(content().station_order).toEqual(['l1', 'l3', 'l2', 'l4']);
    expect(rowNames()).toEqual(['Harbour poems', 'Salt and stone', 'Lighthouse letters', 'Tide tables']);
    button('Move Salt and stone down').click();
    expect(content().station_order).toBeUndefined();
  });

  it('leaves a lesson off the map and brings it back', () => {
    const { host, content } = mountEditor();
    const box = () => host.querySelector<HTMLInputElement>('input[aria-label="Show Lighthouse letters on this map"]')!;
    box().checked = false;
    box().dispatchEvent(new Event('change'));
    expect(content().hidden_lessons).toEqual(['l2']);
    expect(box().checked).toBe(false);
    box().checked = true;
    box().dispatchEvent(new Event('change'));
    expect(content().hidden_lessons).toBeUndefined();
  });
});

describe('Unit map: lessons placed by calendar date', () => {
  const ids = (lessons: readonly { id: string }[]) => lessons.map((l) => l.id);
  const row = (id: string) => ({ id });

  it('keeps an undated lesson after the lesson it follows', () => {
    // b and c have no date: they follow a, which moves after d.
    const order = [row('z'), row('a'), row('b'), row('c'), row('d')];
    const dates = new Map([['a', '2026-10-24'], ['d', '2026-10-20']]);
    expect(ids(placeByDate(order, dates))).toEqual(['z', 'd', 'a', 'b', 'c']);
  });

  it('places a dated quiz between the lessons either side of its date', () => {
    // l3 is a quiz dated before l2; x is an undated extension after l1.
    const order = [row('l1'), row('x'), row('l2'), row('l3')];
    const dates = new Map([['l1', '2026-10-20T09:00'], ['l2', '2026-10-24T09:00'], ['l3', '2026-10-22T09:00']]);
    expect(ids(placeByDate(order, dates))).toEqual(['l1', 'x', 'l3', 'l2']);
  });

  it('keeps the given order for lessons on the same day and time', () => {
    const dates = new Map([['a', '2026-10-20T00:00'], ['b', '2026-10-20T00:00']]);
    expect(ids(placeByDate([row('b'), row('a')], dates))).toEqual(['b', 'a']);
  });

  it('puts the earlier period first on the same day', () => {
    const dates = new Map([['a', '2026-10-20T13:00'], ['b', '2026-10-20T09:00']]);
    expect(ids(placeByDate([row('a'), row('b')], dates))).toEqual(['b', 'a']);
  });

  it('changes nothing without dates', () => {
    expect(ids(placeByDate([row('b'), row('a')], undefined))).toEqual(['b', 'a']);
  });

  it('orders the map rows by date, after any custom station order', () => {
    const dates = new Map([['l1', '2026-10-27'], ['l2', '2026-10-20'], ['l3', '2026-10-21'], ['l4', '2026-10-22']]);
    const net = buildUnitNetwork(v2({ station_order: ['l4', 'l3', 'l2', 'l1'] }), LINES, LESSONS, undefined, dates);
    expect(net.rows.map((r) => r.id)).toEqual(['l2', 'l3', 'l4', 'l1']);
  });

  it('drops week bands when a split runs the rows back through the weeks', () => {
    const bands = new Map([['l1', 'Wk 1'], ['l2', 'Wk 2'], ['l3', 'Wk 1'], ['l4', 'Wk 3']]);
    expect(buildUnitNetwork(v2(), LINES, LESSONS, bands).rows.some((r) => r.band)).toBe(false);
    const inOrder = new Map([['l1', 'Wk 1'], ['l2', 'Wk 1'], ['l3', 'Wk 2'], ['l4', 'Wk 3']]);
    expect(buildUnitNetwork(v2(), LINES, LESSONS, inOrder).rows.map((r) => r.band)).toEqual(['Wk 1', 'Wk 1', 'Wk 2', 'Wk 3']);
  });
});

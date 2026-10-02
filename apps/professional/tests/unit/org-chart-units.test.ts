/**
 * One chart: faculty / team containers, drop-into-a-container rules and
 * "your lines" — shared by Edit chart and the organisation page.
 */
import { describe, expect, it } from 'vitest';
import type { OrgStructurePayload } from '@/api/org-structure';
import {
  BOX_H,
  BOX_W,
  UNIT_LABEL_H,
  UNIT_PAD,
  buildChartModel,
  dragFrames,
  frameAt,
  unitForDrop,
  unitFrames
} from '@/domain/org-chart-model';
import { createBoardDom, paintBoxes, paintFrames, paintLines, yourLines } from '@/components/org-chart-board';

const ORG = 'shared:organisation:organisation_1';
const SCI = 'shared:unit:u_sci';
const ENG = 'shared:unit:u_eng';
const P = (id: string) => `shared:position:${id}`;

function payload(): OrgStructurePayload {
  const position = (id: string, title: string, unit: string | null) => ({
    id,
    kind: 'position' as const,
    title,
    organisation_ref: ORG,
    unit_ref: unit,
    is_head: false,
    lifecycle_status: 'active'
  });
  const unit = (id: string, name: string, order: number, lifecycle = 'active') => ({
    id,
    kind: 'unit' as const,
    name,
    organisation_ref: ORG,
    unit_kind: 'faculty',
    order,
    lifecycle_status: lifecycle
  });
  const link = (id: string, type: string, source: string, target: string) => ({
    id,
    relationship_type: type,
    source_ref: source,
    target_ref: target,
    status: 'current'
  });
  return {
    organisation_ref: ORG,
    units: [unit('u_sci', 'Science', 0), unit('u_eng', 'English', 1), unit('u_old', 'Old', 2, 'archived')],
    positions: [
      position('boss', 'Principal', null),
      position('a', 'Teacher A', SCI),
      position('b', 'Teacher B', SCI),
      position('me', 'Gifted Ed', null)
    ],
    links: [
      link('h1', 'holds_position', 'shared:person:adam', P('me')),
      link('r1', 'reports_to', P('a'), P('boss')),
      link('r2', 'reports_to', P('me'), P('a')),
      link('w1', 'works_with', P('a'), P('b'))
    ],
    layout: {},
    graph: {
      organisation_ref: ORG,
      nodes: [],
      edges: [],
      members_by_unit: { [SCI]: [{ person_ref: 'shared:person:kim', role: null, link_id: 'm1' }] },
      memberships_by_person: {},
      member_person_ids: [],
      member_count: 0,
      cycles: []
    }
  };
}

const positions = {
  [P('boss')]: { x: 200, y: 0 },
  [P('a')]: { x: 0, y: 200 },
  [P('b')]: { x: 240, y: 200 },
  [P('me')]: { x: 600, y: 200 }
};

describe('unit containers', () => {
  it('builds active units only, with members who have no box listed by name', () => {
    const { units } = buildChartModel(payload(), { kim: 'Kim Lee' });
    expect(units.map((u) => u.name)).toEqual(['Science', 'English']);
    expect(units[0]!.memberNames).toEqual(['Kim Lee']);
  });

  it('wraps a unit’s boxes with padding and a name strip; an empty unit is a block below', () => {
    const model = buildChartModel(payload());
    const frames = unitFrames(model.units, model.boxes, positions);
    const sci = frames.find((f) => f.ref === SCI)!;
    expect(sci.empty).toBe(false);
    expect(sci.memberRefs.sort()).toEqual([P('a'), P('b')]);
    expect(sci.x).toBe(-UNIT_PAD);
    expect(sci.y).toBe(200 - UNIT_PAD - UNIT_LABEL_H);
    expect(sci.x + sci.width).toBe(240 + BOX_W + UNIT_PAD);
    const eng = frames.find((f) => f.ref === ENG)!;
    expect(eng.empty).toBe(true);
    expect(eng.y).toBeGreaterThan(200 + BOX_H);
  });

  it('an empty unit sits at its saved spot', () => {
    const model = buildChartModel(payload());
    const eng = unitFrames(model.units, model.boxes, positions, { [ENG]: { x: 800, y: 600 } }).find(
      (f) => f.ref === ENG
    )!;
    expect(eng.x).toBe(800 - UNIT_PAD);
    expect(eng.y).toBe(600 - UNIT_PAD - UNIT_LABEL_H);
  });

  it('frameAt picks the innermost container under a point', () => {
    const model = buildChartModel(payload());
    const frames = unitFrames(model.units, model.boxes, positions);
    expect(frameAt(frames, { x: 10, y: 220 })?.ref).toBe(SCI);
    expect(frameAt(frames, { x: 700, y: 220 })).toBeNull();
  });
});

describe('dropping a box', () => {
  const model = buildChartModel(payload());
  const box = (id: string) => model.boxes.find((b) => b.id === id)!;

  it('into a container joins it', () => {
    expect(unitForDrop(box('me'), { x: 120, y: 200 }, model.units, model.boxes, positions)).toBe(SCI);
  });

  it('into an empty container joins it', () => {
    const eng = unitFrames(model.units, model.boxes, positions).find((f) => f.ref === ENG)!;
    const at = { x: eng.x + UNIT_PAD, y: eng.y + UNIT_PAD + UNIT_LABEL_H };
    expect(unitForDrop(box('me'), at, model.units, model.boxes, positions)).toBe(ENG);
  });

  it('out of every container leaves its old one; staying inside changes nothing', () => {
    expect(unitForDrop(box('a'), { x: 0, y: 800 }, model.units, model.boxes, positions)).toBeNull();
    expect(unitForDrop(box('a'), { x: 8, y: 208 }, model.units, model.boxes, positions)).toBeUndefined();
    expect(unitForDrop(box('me'), { x: 600, y: 600 }, model.units, model.boxes, positions)).toBeUndefined();
  });

  it('while dragging, the box’s own container keeps its outline and others do not stretch', () => {
    const moved = { ...positions, [P('a')]: { x: 0, y: 900 }, [P('me')]: { x: 600, y: 900 } };
    const frames = dragFrames(model.units, model.boxes, moved, {}, box('a'), positions[P('a')]!);
    const sci = frames.find((f) => f.ref === SCI)!;
    expect(sci.y + sci.height).toBe(200 + BOX_H + UNIT_PAD + 22);
    // Dragging someone in from outside: Science is drawn without them.
    const dragIn = dragFrames(model.units, model.boxes, { ...positions, [P('me')]: { x: 0, y: 900 } }, {}, box('me'), positions[P('me')]!);
    expect(dragIn.find((f) => f.ref === SCI)!.memberRefs.sort()).toEqual([P('a'), P('b')]);
  });

  it('the last person dragged out leaves the group (the group stays behind)', () => {
    const lone = { ...payload(), positions: payload().positions.filter((p) => p.id !== 'b') };
    const m = buildChartModel(lone);
    const solo = m.boxes.find((b) => b.id === 'a')!;
    expect(unitForDrop(solo, { x: 400, y: 900 }, m.units, m.boxes, positions)).toBeNull();
    expect(unitForDrop(solo, { x: 16, y: 216 }, m.units, m.boxes, positions)).toBeUndefined();
  });
});

describe('your lines', () => {
  it('your box, everyone above you, and the lines that touch you', () => {
    const model = buildChartModel(payload());
    const mine = yourLines(model, 'shared:person:adam')!;
    expect([...mine.self]).toEqual([P('me')]);
    expect([...mine.boxes].sort()).toEqual([P('a'), P('boss'), P('me')].sort());
    expect([...mine.lines].sort()).toEqual(['r1', 'r2']);
    expect(yourLines(model, 'shared:person:nobody')).toBeNull();
  });
});

describe('shared board, read-only (organisation page)', () => {
  it('draws containers, boxes as profile links / vacant buttons, styled lines, no drag handles', () => {
    const model = buildChartModel(payload());
    const frames = unitFrames(model.units, model.boxes, positions);
    const dom = createBoardDom();
    const opened: string[] = [];
    const state = {
      model,
      positions,
      frames,
      readOnly: true,
      mine: yourLines(model, 'shared:person:adam'),
      boxHref: (b: { holderRef: string | null }) => (b.holderRef ? `#/people/${b.holderRef.split(':')[2]}` : null),
      onActivateBox: (b: { id: string }) => opened.push(b.id)
    };
    paintFrames(dom, state);
    paintLines(dom, state);
    paintBoxes(dom, state);
    expect([...dom.unitLayer.querySelectorAll('.org-chart__unit-label')].map((n) => n.textContent)).toEqual([
      'Science',
      'English'
    ]);
    expect(dom.unitLayer.textContent).toContain('Also: Someone');
    const me = dom.boxLayer.querySelector(`[data-box="${P('me')}"]`) as HTMLAnchorElement;
    expect(me.tagName).toBe('A');
    expect(me.getAttribute('href')).toBe('#/people/adam');
    expect(me.classList.contains('is-self')).toBe(true);
    expect(me.textContent).toContain('· You');
    const vacant = dom.boxLayer.querySelector(`[data-box="${P('b')}"]`) as HTMLButtonElement;
    expect(vacant.tagName).toBe('BUTTON');
    vacant.click();
    expect(opened).toEqual(['b']);
    expect(dom.boxLayer.querySelector('.org-chart__handle')).toBeNull();
    expect(dom.svg.querySelectorAll('.org-chart__line--works_with').length).toBe(1);
    expect(dom.svg.querySelectorAll('.org-chart__line.is-mine').length).toBe(2);
    expect(dom.svg.querySelector('.org-chart__line-hit')).toBeNull();
  });
});

describe('outline (phone default) matches the chart', () => {
  it('lists boxes under their faculty, then everyone not in a group, with who they report to', async () => {
    const { chartOutline } = await import('@/components/org-chart-board');
    const model = buildChartModel(payload(), { kim: 'Kim Lee' });
    const outline = chartOutline(model, 'shared:person:adam');
    const groups = [...outline.querySelectorAll('.orgs-outline__unit')].map((g) => ({
      name: g.querySelector('.orgs-outline__unit-name')?.textContent,
      rows: [...g.querySelectorAll('.orgs-outline__member')].map((r) => r.textContent)
    }));
    expect(groups.map((g) => g.name)).toEqual(['Science', 'English', 'Not in a group']);
    expect(groups[0]!.rows).toEqual([
      'Vacant · Teacher Areports to Principal',
      'Vacant · Teacher B',
      'Also: Kim Lee'
    ]);
    expect(groups[1]!.rows).toEqual([]);
    expect(groups[2]!.rows).toEqual(['Vacant · Principal', 'You · Gifted Edreports to Teacher A']);
  });
});

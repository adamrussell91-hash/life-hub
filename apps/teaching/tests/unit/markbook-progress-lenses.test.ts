import { describe, expect, it, vi } from 'vitest';
import type { Alignment } from '@/alignment/schema';
import type { InsightContext } from '@/evidence/context';
import type { Evidence } from '@/evidence/types';
import type { DeepUnderstanding } from '@/deep/schema';
import type { Unit } from '@/schemas';
import type { MarkbookView, RosterStudent } from '@/markbook/types';
import { createDeepLens, monitorUnit } from '@/markbook/deep-lens';
import { circleClass, circleText, piecesByPoint } from '@/markbook/point-pieces';
import { newSyllabusGridState, renderSyllabusGrid, type SyllabusGridActions } from '@/markbook/syllabus-grid';

const alignment = {
  outcomes: [{ n: 3, code: 'EN12-3', text: 'x' }],
  concepts: [],
  focus_areas: [
    { id: 'texts', name: 'Texts', points: [
      { id: 'U1', kind: 'U', short: 'Language shapes meaning', text: 'a', outcomes: [{ n: 3, link: 'shared' }], concepts: [], processes: [] },
      { id: 'R2', kind: 'R', short: 'Compose a response', text: 'b', outcomes: [], concepts: [], processes: [] }
    ] },
    { id: 'craft', name: 'Craft', points: [{ id: 'U1', kind: 'U', short: 'Form', text: 'c', outcomes: [], concepts: [], processes: [] }] }
  ]
} as unknown as Alignment;
const ctx: InsightContext = { table: null, skills: null, codes: [], outcomes: [], alignment };
const du = (over: Partial<DeepUnderstanding> = {}): DeepUnderstanding => ({
  id: 'du_aaaa11', claim: 'c', why: '', dot_points: ['texts:U1'], concept_bullets: [], shared_piece_ids: [], steps: [],
  pieces: [
    { id: 'kp_linked', text: 'Verbs carry the claim', tier: 'essential', dot_point: 'texts:U1' },
    { id: 'kp_loose', text: 'A label is a choice', tier: 'strong' },
    { id: 'kp_gone', text: 'Points at a missing dot point', tier: 'strong', dot_point: 'texts:U9' }
  ],
  ...over
}) as DeepUnderstanding;

const roster = (n: number): RosterStudent[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Student ${i}`, initials: `S${i}` }));
const ev = (student: string, item: string, day: string): Evidence => ({ item, tags: ['kp:kp_linked', 'dp:texts:U1'], share: 1, why: [], student, source: 'quiz:l1', date: day, confidence: null });
const view: MarkbookView = { markbook: { columns: [], hidden_quizzes: [], marks: {}, focus: {}, took: {}, groups: [], history: [], updated_at: '' }, students: roster(3), quizzes: [] } as unknown as MarkbookView;
const actions = (over: Partial<SyllabusGridActions> = {}): SyllabusGridActions => ({ openStudent: vi.fn(), repaint: vi.fn(), ...over });

describe('pieces under dot points', () => {
  it('files a piece under its dot point, and gathers the rest by focus area so none is lost', () => {
    const { byPoint, loose } = piecesByPoint([du()], alignment);
    expect(byPoint.get('dp:texts:U1')!.map((p) => p.id)).toEqual(['kp_linked']);
    expect(loose.map((g) => [g.areaName, g.pieces.map((p) => p.id)])).toEqual([['Texts', ['kp_loose', 'kp_gone']]]);
  });

  it('names circles in words as well as colour', () => {
    expect(circleClass({ fill: 'full', amber: true, faded: false, ring: 'none' })).toBe('du-c amb');
    expect(circleText({ fill: 'half', amber: false, faded: true, ring: 'used' })).toBe('right once, no check in four weeks, used in writing');
  });
});

describe('Grid lenses', () => {
  const kp = (student: string) => [ev(student, 'q1', '2026-10-01'), ev(student, 'q2', '2026-10-08')];
  const render = (students: RosterStudent[], state = newSyllabusGridState(), over: Partial<SyllabusGridActions> = {}, narrow = false) => {
    // classEvidence reads the view, so give the quiz column the marks.
    const v = { ...view, students, quizzes: [{ kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Q', date: '2026-10-01', hidden: false, confidence: false, questions: [], scores: Object.fromEntries(students.slice(0, 2).map((s) => [s.id, { attempt_id: 'a', submitted_at: '2026-10-08T00:00:00Z', score: 2, max: 2, pending: 0, rows: [{ items: kp(s.id).map(({ item, tags, share, why }) => ({ item, tags, share, why })), confidence: null }] }])) }] } as unknown as MarkbookView;
    return renderSyllabusGrid(v, students, ctx, state, actions({ pieces: { ...piecesByPoint([du()], alignment), today: '2026-10-09' }, ...over }), narrow);
  };

  it('opens on dot points, with a lens toggle', () => {
    const root = render(roster(3));
    expect([...root.querySelectorAll<HTMLElement>('.mbg__lens button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['By dot point', 'true'], ['By deep understanding', 'false']]);
    expect(root.querySelector('.mbg__lens button')!.tagName).toBe('BUTTON');
  });

  it('opens a U row into its pieces with each student’s circle, and keeps no-dot-point pieces at the end', () => {
    const state = newSyllabusGridState();
    state.open.add('dp:texts:U1');
    state.open.add('loose:texts');
    const root = render(roster(3), state);
    const rows = [...root.querySelectorAll('tbody tr')].map((r) => r.querySelector('.mbg-line__label, .mbg-row__label')?.textContent);
    expect(rows).toContain('Verbs carry the claim');
    const piece = [...root.querySelectorAll('.mbg-line-row--piece')][0]!;
    expect([...piece.querySelectorAll('.du-c')].map((c) => c.className)).toEqual(['du-c half', 'du-c half', 'du-c none']);
    expect([...piece.querySelectorAll('[role="img"]')][2]!.getAttribute('aria-label')).toContain('not checked yet');
    const labels = [...root.querySelectorAll('tbody .mbg-line__label, tbody .mbg-row__label')].map((n) => n.textContent);
    expect(labels.slice(-2)).toEqual(['A label is a choice', 'Points at a missing dot point']);
    expect(labels.indexOf('No dot point yet')).toBeGreaterThan(labels.indexOf('Verbs carry the claim'));
  });

  it('shows pieces as chips on the phone', () => {
    const state = newSyllabusGridState();
    state.open.add('dp:texts:U1');
    const root = render(roster(3), state, {}, true);
    expect(root.querySelectorAll('.mbg-piece__chip')).toHaveLength(3);
    expect(root.querySelector('.mbg-card .mbg-piece__text')!.textContent).toBe('Verbs carry the claim');
  });

  it('keeps 60 students inside the scroll box, so the page never widens', () => {
    const state = newSyllabusGridState();
    state.open.add('dp:texts:U1');
    const root = render(roster(60), state);
    const box = root.querySelector('.mbg__scroll')!;
    expect(box.querySelectorAll('thead th')).toHaveLength(62);
    expect(box.querySelector('table')!.parentElement).toBe(box);
    expect(root.querySelectorAll('.mbg-line-row--piece td.mbg__cell')).toHaveLength(60);
  });

  it('draws the deep understanding pane on the second lens, and a button switches lens', () => {
    const repaint = vi.fn();
    const state = newSyllabusGridState();
    const pane = document.createElement('div');
    pane.className = 'the-pane';
    const root = render(roster(3), state, { repaint, deepPane: () => pane });
    document.body.append(root);
    root.querySelector<HTMLButtonElement>('[data-lens="du"]')!.click();
    expect(state.lens).toBe('du');
    expect(repaint).toHaveBeenCalled();
    const second = render(roster(3), state, { deepPane: () => pane });
    expect(second.querySelector('.the-pane')).toBe(pane);
    expect(second.querySelector('.mbg__scroll')).toBeNull();
    root.remove();
  });
});

describe('deep understanding lens pane', () => {
  const unit = (id: string, withDeep: boolean): Unit => ({ id, title: `Unit ${id}`, lesson_ids: ['l1'], deep_understandings: withDeep ? [du()] : [] }) as unknown as Unit;
  const base = { classId: 'c1', classLabel: '12ENX', scheduled: [] };

  it('picks the asked-for unit, else the current one, else the first with deep understandings', () => {
    const units = [unit('a', false), unit('b', true), unit('c', true)];
    expect(monitorUnit(units, 'c')!.id).toBe('c');
    expect(monitorUnit(units, 'a')!.id).toBe('b');
    expect(monitorUnit(units, 'c', 'b')!.id).toBe('b');
    expect(monitorUnit([unit('a', false)], 'a')).toBeNull();
  });

  it('says so when no unit has deep understandings, and loads nothing', () => {
    const loadLessons = vi.fn();
    const lens = createDeepLens({ ...base, units: [unit('a', false)], loadLessons });
    lens.open();
    expect(lens.pane.textContent).toContain('No unit this class is teaching has deep understandings yet');
    expect(loadLessons).not.toHaveBeenCalled();
  });

  it('loads lazily on first open, mounts Monitoring once, and offers a unit picker when there are several', async () => {
    const destroy = vi.fn();
    const mount = vi.fn(() => ({ destroy }));
    const loadLessons = vi.fn(async () => [{ id: 'l1' }]);
    const lens = createDeepLens({ ...base, units: [unit('a', true), unit('b', true)], currentUnitId: 'b', loadLessons, mount });
    expect(loadLessons).not.toHaveBeenCalled();
    lens.open();
    lens.open();
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(loadLessons).toHaveBeenCalledTimes(1);
    expect((mount.mock.calls[0] as unknown as [unknown, { unit: Unit; classes: unknown }])[1].unit.id).toBe('b');
    const pills = [...lens.pane.querySelectorAll<HTMLButtonElement>('.mbg-deep__units button')];
    expect(pills.map((p) => [p.textContent, p.getAttribute('aria-pressed')])).toEqual([['Unit a', 'false'], ['Unit b', 'true']]);
    pills[0]!.click();
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

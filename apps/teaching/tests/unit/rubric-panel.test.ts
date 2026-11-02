import { afterEach, describe, expect, it, vi } from 'vitest';
import { voiceReadForRubric } from '@/marking/ai-read';
import { rubricRows } from '@/marking/rubric-model';
import { mountRubricPanel, skillReach, type RubricSetup } from '@/marking/rubric-panel';
import { loadRubricSetup } from '@/marking/rubric-setup';
import { openMarkPiece, type MarkPieceData } from '@/marking/mark-piece';
import { returnedRubric } from '@/student/returned-rubric';
import { pieceView } from '@/student/returned-view';

const rung = (text: string, next = `${text} next`) => ({ i_can: text, indicators: [{ group: 'g', text: `Look ${text}` }], build: { next_move: next } });
const sub = (id: string, name: string, point: string) => ({
  id, name, outcomes: [1], points: [{ area: 'area-one', point, link: 'shared' }, { area: 'area-two', point: 'R9', link: 'related' }],
  rungs: { capable: rung('capable'), skilled: rung('skilled'), accomplished: rung('accomplished'), excellent: rung('excellent') }
});
const continuum = { strands: [{ strand: 'reading', name: 'Reading', sub_strands: [sub('technique', 'Technique and effect', 'R1'), sub('thesis', 'Thesis', 'R3')] }] } as never;
const deep = [{
  id: 'du_salted', claim: 'Form carries it.', dot_points: ['area-one:R1', 'area-one:R3'], steps: [],
  pieces: [{ id: 'kp_aaaa', text: 'Form acts out', tier: 'essential' }, { id: 'kp_bbbb', text: 'Familiar made strange', tier: 'essential' }, { id: 'kp_cccc', text: 'Borrowed names', tier: 'extension' }]
}] as never;
const tags = {
  skills: ['reading.technique', 'reading.thesis'],
  pieces: ['kp_aaaa', 'kp_bbbb'],
  steps: [{ du: 'du_salted', step: '2b' as const, checks: ['Names the form', 'Uses a moment'] }]
};
const setup = (over: Partial<RubricSetup> = {}): RubricSetup => ({
  rows: rubricRows(tags, { continuum, deep }),
  unitPieces: (deep as unknown as { pieces: RubricSetup['unitPieces'] }[])[0]!.pieces,
  deep, continuum, codes: [],
  ...over
});
const KEY = 'du_salted:2b';
const rungBtn = (root: HTMLElement, skill: string, id: string) => root.querySelector<HTMLButtonElement>(`[data-rung="${skill}:${id}"]`)!;
const piece = (root: HTMLElement, id: string, mark: string) => root.querySelector<HTMLButtonElement>(`[data-piece="${id}"] [data-mark="${mark}"]`)!;
const byText = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;

afterEach(() => { document.body.replaceChildren(); });

describe('rubric panel', () => {
  it('draws five real rung buttons per skill, with its reach and what to look for on tap', () => {
    const p = mountRubricPanel(setup());
    expect(p.el.querySelectorAll('.rb-rung')).toHaveLength(10);
    expect(p.el.querySelector('.rb-reach')!.textContent).toBe('R1 · Outcome 1');
    const b = rungBtn(p.el, 'reading.technique', 'skilled');
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(p.el.querySelector('.rb-look')!.textContent).toBe('Tap a rung to see what to look for.');
    b.click();
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(p.el.querySelector('.rb-look')!.textContent).toBe('Look for: Look skilled');
    rungBtn(p.el, 'reading.technique', 'below').click();
    expect(p.el.querySelector('.rb-look')!.textContent).toBe('Look for, at Capable: Look capable');
  });

  it('reads the reach across areas only when the unit names none of them', () => {
    expect(skillReach('reading.technique', continuum, [])).toBe('R1, R9 · Outcome 1');
    expect(skillReach('reading.gone', continuum, deep)).toBe('');
  });

  it('suggests the mark once every skill has a rung, and a rung never overwrites a hand-edited mark', () => {
    const p = mountRubricPanel(setup(), { marks: { max: 8 } });
    const input = p.el.querySelector<HTMLInputElement>('.rb-mark__input')!;
    rungBtn(p.el, 'reading.technique', 'accomplished').click();
    expect(p.mark()).toBeNull();
    rungBtn(p.el, 'reading.thesis', 'skilled').click();
    expect(p.mark()).toBe(5.5);
    expect(input.value).toBe('5.5');
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    rungBtn(p.el, 'reading.thesis', 'excellent').click();
    expect(p.mark()).toBe(7);
    expect(input.value).toBe('7');
    expect(p.el.querySelector('.rb-mark__note')!.textContent).toContain('You set this');
  });

  it('suggests the next step from the lowest rung, and keeps one written by hand', () => {
    const p = mountRubricPanel(setup());
    const box = p.el.querySelector<HTMLTextAreaElement>('.rb-next')!;
    rungBtn(p.el, 'reading.technique', 'accomplished').click();
    rungBtn(p.el, 'reading.thesis', 'capable').click();
    expect(box.value).toBe('skilled next');
    expect(p.value()!.next_step).toEqual({ text: 'skilled next' });
    box.value = 'My own step.';
    box.dispatchEvent(new Event('input'));
    rungBtn(p.el, 'reading.thesis', 'skilled').click();
    expect(box.value).toBe('My own step.');
    expect(p.value()!.next_step).toEqual({ text: 'My own step.' });
  });

  it('keeps a live tally', () => {
    const p = mountRubricPanel(setup());
    const line = () => p.el.querySelector('.rb-tally')!.textContent;
    expect(line()).toBe('This answer records 0 skill rungs, 0 pieces and 0 DU steps.');
    rungBtn(p.el, 'reading.technique', 'skilled').click();
    piece(p.el, 'kp_aaaa', 'used').click();
    byText(p.el, 'Pass on Step 2B').click();
    expect(line()).toBe('This answer records 1 skill rung, 1 piece and 1 DU step.');
  });

  it('adds any other unit piece as used, and never offers the expected ones', () => {
    const p = mountRubricPanel(setup());
    byText(p.el, 'Add a piece').click();
    const picker = p.el.querySelector<HTMLSelectElement>('.rb-picker')!;
    expect([...picker.options].map((o) => o.value)).toEqual(['', 'kp_cccc']);
    picker.value = 'kp_cccc';
    picker.dispatchEvent(new Event('change'));
    expect(p.value()!.pieces).toEqual({ kp_cccc: 'used' });
    expect(p.el.querySelector('[data-piece="kp_cccc"]')!.textContent).toContain('Used without being asked');
    expect(byText(p.el, 'Add a piece').hidden).toBe(true);
  });

  it('shows an AI read dashed, counts none of it, and keeps it without ever passing', () => {
    const ai = voiceReadForRubric({ checks: [{ met: true, quote: 'the short line' }, { met: false, why: 'No moment' }], pieces: { kp_aaaa: true, kp_bbbb: false } }, setup().rows);
    const p = mountRubricPanel(setup(), { ai });
    expect(piece(p.el, 'kp_aaaa', 'used').classList.contains('is-ai')).toBe(true);
    expect(piece(p.el, 'kp_aaaa', 'used').getAttribute('aria-pressed')).toBe('false');
    expect(piece(p.el, 'kp_bbbb', 'missed').classList.contains('is-ai')).toBe(true);
    expect(p.el.querySelector('.rb-check')!.classList.contains('is-ai')).toBe(true);
    expect(p.el.querySelector('.rb-check')!.textContent).toContain('“the short line”');
    // No rungs in this read, so none are dashed.
    expect(p.el.querySelector('.rb-rung.is-ai')).toBeNull();
    expect(p.value()).toBeNull();
    expect(p.saveFields()).toEqual({});

    byText(p.el, 'Keep the AI').click();
    const kept = p.value()!;
    expect(kept.pieces).toEqual({ kp_aaaa: 'used', kp_bbbb: 'missed' });
    expect(kept.steps[KEY]).toEqual({ checks: [true, false], pass: false });
    expect(p.el.querySelector('.rb-keep')!.hasAttribute('hidden')).toBe(true);
    expect(byText(p.el, 'Pass on Step 2B').getAttribute('aria-pressed')).toBe('false');
  });

  it('dashes rungs when a read supplies them', () => {
    const p = mountRubricPanel(setup(), { ai: { skills: { 'reading.thesis': 'skilled' } } });
    const b = rungBtn(p.el, 'reading.thesis', 'skilled');
    expect(b.classList.contains('is-ai')).toBe(true);
    expect(p.value()).toBeNull();
    byText(p.el, 'Keep the AI').click();
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });

  it('sends nothing until something changes, and sends it again after a failed save', () => {
    const p = mountRubricPanel(setup(), { saved: { skills: { 'reading.thesis': 'skilled' }, pieces: {}, steps: {} } });
    expect(p.saveFields()).toEqual({});
    rungBtn(p.el, 'reading.thesis', 'skilled').click();
    const first = p.saveFields();
    expect(first.rubric).toBeNull();
    expect(first.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.saveFields()).toEqual({});
    p.failed();
    expect(p.saveFields().rubric).toBeNull();
  });

  it('keeps a saved step with no row, so a removed tag does not take a pass back', () => {
    const saved = { skills: {}, pieces: {}, steps: { 'du_other:3': { checks: [], pass: true } } };
    const p = mountRubricPanel(setup(), { saved });
    piece(p.el, 'kp_aaaa', 'used').click();
    expect(p.value()!.steps['du_other:3']).toEqual({ checks: [], pass: true });
  });

  it('says plainly when the server keeps a step as practice', () => {
    const p = mountRubricPanel(setup(), { studentId: 'st1' });
    byText(p.el, 'Pass on Step 2B').click();
    expect(p.applyReply({ blocked: [KEY] })).toBe(true);
    expect(p.el.querySelector('.rb-step__note')!.textContent).toBe('Step 2B stays as practice. Pass Step 2A first.');
    expect(p.value()).toBeNull();
    expect(byText(p.el, 'Pass on Step 2B').getAttribute('aria-pressed')).toBe('false');
  });

  it('holds Pass back where the student’s place is known', () => {
    const p = mountRubricPanel(setup({ passed: {} }));
    const pass = p.el.querySelector<HTMLButtonElement>('.rb-pass')!;
    expect(pass.hidden).toBe(true);
    expect(p.el.querySelector('.rb-step__note')!.textContent).toBe('Pass Step 2A first. This stays as practice.');
    p.setPassed({ du_salted: '2a' });
    expect(pass.hidden).toBe(false);
    p.setPassed({ du_salted: '3' });
    expect(pass.hidden).toBe(true);
    expect(p.el.querySelector('.rb-step__note')!.textContent).toBe('Already passed Step 3.');
  });
});

describe('finding a rubric', () => {
  const lesson = (settings: object, question: object = { id: 'q1', skills: ['reading.thesis'] }) => ({ unit_id: 'unit_a', blocks: [{ id: 'b1', block_type: 'quiz_question', content: { question }, settings }] }) as never;
  const deps = (l: never) => ({ lesson: async () => l, unit: async () => ({ deep_understandings: deep as never }), continuum: async () => continuum, codes: async () => [], progress: vi.fn(async () => ({ steps: { st1: { du_salted: { step: '2a' } } } })) });

  it('is null for untagged work, so it keeps its existing marking', async () => {
    expect(await loadRubricSetup({ lessonId: 'l', questionId: 'q1' }, deps(lesson({}, { id: 'q1' })))).toBeNull();
    expect(await loadRubricSetup({ lessonId: 'l', blockId: 'nope' }, deps(lesson({})))).toBeNull();
  });

  it('reads a question’s tags with its block’s, and the student’s place', async () => {
    const got = await loadRubricSetup({ lessonId: 'l', questionId: 'q1', who: { classId: 'c', studentId: 'st1' } }, deps(lesson({ deep_targets: ['kp_aaaa'], deep_step: [{ du: 'du_salted', step: '2b', checks: [] }] })));
    expect(got!.rows.skills.map((s) => s.name)).toEqual(['Thesis']);
    expect(got!.rows.pieces.map((p) => p.text)).toEqual(['Form acts out']);
    expect(got!.passed).toEqual({ du_salted: '2a' });
  });
});

describe('the rubric in the piece marker', () => {
  const data: MarkPieceData = {
    column: { id: 'col1', title: 'Road', criteria: [{ id: 'c1', label: 'Argument', outcomes: ['out_a'], concepts: [] }, { id: 'c2', label: 'Thesis', outcomes: [], concepts: [], skill: 'reading.thesis' }] },
    student: { id: 'st_ava', initials: 'AN', name: 'Ava Nguyen' },
    text: { answers: { q1: 'The road is a grey ribbon.' } },
    feedback: null, mark: null, codes: [], recent_codes: [], position: { index: 0, total: 1 }
  };
  const acts = (save = vi.fn().mockResolvedValue({})) => ({ save, returnIt: vi.fn().mockResolvedValue({}), takeBack: vi.fn(), move: vi.fn() });

  it('adds no panel for untagged work, and sends no rubric', async () => {
    const a = acts();
    const view = openMarkPiece(data, a);
    expect(view.el.querySelector('.rb')).toBeNull();
    expect(view.el.querySelector('.mk-rubric')).not.toBeNull();
    await view.save();
    expect(a.save.mock.calls[0]![0]).not.toHaveProperty('rubric');
  });

  it('sets criteria in the panel, a shared skill following its rung, and saves both', async () => {
    const a = acts();
    const view = openMarkPiece(data, a, { rubric: setup() });
    const panel = view.el.querySelector<HTMLElement>('.rb')!;
    expect(panel.querySelector('[data-step="c1:building"]')).not.toBeNull();
    expect(panel.querySelector('[data-step^="c2:"]')).toBeNull();
    (panel.querySelector('[data-step="c1:building"]') as HTMLButtonElement).click();
    rungBtn(panel, 'reading.thesis', 'skilled').click();
    expect(panel.querySelector('.rb-tally')!.textContent).toContain('1 criterion');
    await view.save();
    const body = a.save.mock.calls[0]![0];
    expect(body.steps).toEqual({ c1: 'building', c2: 'skilled' });
    expect(body.rubric.skills).toEqual({ 'reading.thesis': 'skilled' });
  });

  it('stays on the work when a step stays practice, then returns on the next press', async () => {
    const save = vi.fn().mockResolvedValueOnce({ blocked: [KEY] }).mockResolvedValue({});
    const a = acts(save);
    const view = openMarkPiece(data, a, { rubric: setup() });
    byText(view.el, 'Pass on Step 2B').click();
    expect(await view.finish()).toBe(false);
    expect(a.returnIt).not.toHaveBeenCalled();
    expect(view.el.querySelector('.rb-step__note')!.textContent).toContain('stays as practice');
    expect(await view.finish()).toBe(true);
    expect(a.returnIt).toHaveBeenCalledTimes(1);
  });

  it('Keep the AI’s read keeps the suggested codes too', async () => {
    const a = acts();
    const coded = { ...data, codes: [{ id: 'ts', code: 'TS', label: 'Topic', colour: 'peach', group: 'composition', descriptor: 'd' }] };
    const view = openMarkPiece(coded, a, { rubric: setup(), suggested: [{ code_id: 'ts', part: 'answers', field: 'q1', start: 0, end: 8 }] });
    byText(view.el, 'Keep the AI').click();
    await view.save();
    expect(a.save.mock.calls[0]![0].tags).toHaveLength(1);
  });
});

describe('what a student reads', () => {
  const rubric = { skills: [{ ref: 'reading.thesis', name: 'Thesis', rung: 'skilled' }, { ref: 'reading.technique', name: 'Technique', rung: 'below' }], pieces_used: [{ id: 'kp_aaaa', text: 'Form acts out' }], next_step: 'Sharpen your claim.' };

  it('shows rungs, pieces used and the next step', () => {
    const box = returnedRubric(rubric)!;
    expect(box.textContent).toContain('Your next step');
    expect(box.textContent).toContain('Sharpen your claim.');
    expect(box.textContent).toContain('Skilled');
    expect(box.textContent).toContain('On the way to Capable');
    expect(box.textContent).toContain('Knowledge you used');
    expect(box.textContent).not.toMatch(/missed|pass/i);
    expect(returnedRubric({ skills: [], pieces_used: [], next_step: null })).toBeNull();
  });

  it('sits on the returned piece, with no second next step from the codes', () => {
    const code = { id: 'ts', code: 'TS', label: 'Topic', colour: 'peach', group: 'composition', descriptor: 'Open with a claim.', ladder: ['a', 'b', 'c', 'd', 'e'] };
    const base = { id: 'p', kind: 'answer', title: 'T', date: 'd', comment: '', text: null, tags: [{ code_id: 'ts', part: '', field: '', start: 0, end: 1, positive: false, code: 'TS', label: 'Topic', colour: 'peach', action: 'x' }], criteria: [], codes: [code] } as never;
    const plain = pieceView(base, () => undefined);
    expect(plain.querySelector('.rr')).toBeNull();
    expect(plain.querySelector('.voice-focus')).not.toBeNull();
    const view = pieceView({ ...(base as object), rubric } as never, () => undefined);
    expect(view.querySelector('.rr')).not.toBeNull();
    expect(view.querySelector('.voice-focus')).toBeNull();
  });
});

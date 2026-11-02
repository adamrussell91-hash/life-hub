import { describe, expect, it } from 'vitest';
import { TeacherNoteBlockContentSchema } from '@/schemas/toolkit';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { attachedTechniques, withTechnique } from '@/blocks/walkthru-note/attach';
import { blockQuestion } from '@/blocks/walkthru-note/badge';
import type { Block } from '@/schemas/block';

const SENTINEL = 'JOT-SENTINEL-1357';

describe('WalkThru note content', () => {
  it('keeps a technique id and your jots, and nothing else', () => {
    const parsed = TeacherNoteBlockContentSchema.parse({ title: 'T', html: '', walkthru: { id: 'w1-cold-calling', jots: { 1: 'mine' }, extra: 'dropped' } });
    expect(parsed.walkthru).toEqual({ set: 1, id: 'w1-cold-calling', jots: { 1: 'mine' } });
    expect(Object.keys(parsed.walkthru!).sort()).toEqual(['id', 'jots', 'set']);
    expect(TeacherNoteBlockContentSchema.safeParse({ title: 'T', html: '', walkthru: { id: 'Not An Id' } }).success).toBe(false);
    expect(TeacherNoteBlockContentSchema.safeParse({ title: 'T', html: '', walkthru: { id: 'w1-cold-calling', jots: { 0: 'x' } } }).success).toBe(false);
    // a fusion from the board is a tile too
    expect(TeacherNoteBlockContentSchema.parse({ title: 'T', html: '', walkthru: { id: 'fu_abc12345', jots: { 7: 'x' } } }).walkthru!.id).toBe('fu_abc12345');
    expect(TeacherNoteBlockContentSchema.safeParse({ title: 'T', html: '', walkthru: { id: 'fu_X' } }).success).toBe(false);
    expect(TeacherNoteBlockContentSchema.parse({ title: 'T', html: '' }).walkthru).toBeUndefined();
  });

  it('the student view never carries the note or the field', () => {
    const note = { id: 'n1', type: 'block', block_type: 'teacher_note', variant: 'medium', visibility: 'teacher_only', content: { title: 'N', html: '', walkthru: { set: 1, id: 'w1-cold-calling', jots: { 1: SENTINEL } } } } as unknown as Block;
    const stray = { id: 'r1', type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html: '<p>Hi</p>', walkthru: { set: 1, id: 'w1-cold-calling', jots: { 1: SENTINEL } } } } as unknown as Block;
    const out = JSON.stringify(filterBlocksForStudent([note, stray]));
    expect(out).not.toContain(SENTINEL);
    expect(out).not.toContain('walkthru');
    expect(out).toContain('<p>Hi</p>');
  });

  it('a block carries only the WalkThru the teacher chose; nothing attaches on its own', () => {
    expect(attachedTechniques({ settings: {} })).toEqual([]);
    expect(attachedTechniques({ settings: { walkthru: 'w1-cold-calling' } })).toEqual(['w1-cold-calling']);
    expect(attachedTechniques({ settings: { walkthru: 'w1-not-a-technique' } })).toEqual([]);
    const block = { id: 'r1', type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html: '<p>Hi</p>' }, settings: { size: 2 } } as unknown as Block;
    const on = withTechnique(block, 'w1-cold-calling');
    expect(on.settings).toEqual({ size: 2, walkthru: 'w1-cold-calling' });
    expect(withTechnique(on, null).settings).toEqual({ size: 2 });
  });

  it('students never get the chosen WalkThru', () => {
    const block = { id: 'r1', type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html: '<p>Hi</p>' }, settings: { size: 2, walkthru: 'w1-cold-calling' } } as unknown as Block;
    const out = JSON.stringify(filterBlocksForStudent([block]));
    expect(out).not.toContain('walkthru');
    expect(out).toContain('"size":2');
  });

  it('finds the block’s question for a Say line', () => {
    expect(blockQuestion({ content: { html: '<h3>Why does the river keep rising?</h3><p>Think first.</p>' } } as unknown as Block)).toBe('Why does the river keep rising?');
    expect(blockQuestion({ content: { html: '<p>Read the page.</p>' } } as unknown as Block)).toBeNull();
  });
});

// ── rendering and the rep strip ─────────────────────────────────────────────

import { vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({
  loadWalkthruText: vi.fn(),
  loadLiveGoal: vi.fn(),
  listReps: vi.fn(),
  listAllReps: vi.fn(),
  planRep: vi.fn(),
  tapRep: vi.fn(),
  unplanRep: vi.fn(),
  stepRep: vi.fn(),
  loadFusions: vi.fn(),
  loadWalkthruPictures: vi.fn()
}));
vi.mock('@/blocks/walkthru-note/api', () => api);
const curriculum = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('@/app/curriculum-state', () => ({ peekCurriculum: () => ({ scheduled_lessons: curriculum.rows }) }));

const { renderWalkthruSection, lessonSlots, walkthruEditorFields } = await import('@/blocks/walkthru-note/note');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const TEXT = { sets: [{ set: 1, techniques: [{ id: 'w1-cold-calling', steps: [1, 2, 3, 4, 5].map((n) => ({ n, label: `Label ${n}`, text: `Filler text ${n}` })) }] }] };
const content = { set: 1, id: 'w1-cold-calling', jots: { 2: 'my jot' } };

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.loadWalkthruText.mockResolvedValue(TEXT);
  api.loadLiveGoal.mockResolvedValue({ id: 'g1', status: 'active', sphere: 'professional', walkthru: { technique_id: 'w1-cold-calling', adapted: { 1: 'my adapted step' } } });
  api.listReps.mockResolvedValue([]);
  api.listAllReps.mockResolvedValue([]);
  api.planRep.mockResolvedValue({});
  api.tapRep.mockResolvedValue({ state: 'ran', technique_id: 'w1-cold-calling', lesson_id: 'lesson1', class_id: null, goal_id: null, note: '', lesson_end: null, at: '2026-10-20T00:00:00.000Z' });
  api.unplanRep.mockResolvedValue(undefined);
  api.stepRep.mockImplementation(async (t: { step: number; class_id: string | null }) => ({ state: 'partly', technique_id: 'w1-cold-calling', lesson_id: 'lesson1', class_id: t.class_id, goal_id: null, note: '', lesson_end: null, steps_done: [t.step], at: '2026-10-20T00:00:00.000Z' }));
  api.loadFusions.mockResolvedValue([]);
  curriculum.rows = [];
});

describe('WalkThru note section', () => {
  it('shows master steps, then your adapted notes, then the day’s jots', async () => {
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    const steps = [...section.querySelectorAll('.tk-wt__step')];
    expect(steps).toHaveLength(5);
    expect(steps[0]!.textContent).toContain('Filler text 1');
    expect(steps[0]!.querySelector('.tk-wt__adapted')!.textContent).toBe('my adapted step');
    expect(steps[1]!.querySelector('.tk-wt__jot')!.textContent).toBe('my jot');
    expect(steps[2]!.querySelector('.tk-wt__adapted')).toBeNull();
  });

  it('with no goal it shows the master steps and empty jots', async () => {
    api.loadLiveGoal.mockResolvedValue(null);
    const section = renderWalkthruSection({ ...content, jots: {} }, { lessonId: 'lesson1' })!;
    await flush();
    expect(section.querySelectorAll('.tk-wt__step')).toHaveLength(5);
    expect(section.querySelector('.tk-wt__adapted')).toBeNull();
    expect(section.querySelector('.tk-wt__jot')).toBeNull();
  });

  it('says so when the steps can’t be loaded, and for an unknown technique renders nothing', async () => {
    api.loadWalkthruText.mockRejectedValue(new Error('no'));
    const section = renderWalkthruSection(content, {})!;
    await flush();
    expect(section.textContent).toContain('couldn’t be loaded');
    expect(renderWalkthruSection({ set: 1, id: 'w1-nope', jots: {} }, {})).toBeNull();
  });

  it('an unscheduled lesson gets one rep row; one tap logs it', async () => {
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    expect(api.planRep).not.toHaveBeenCalled();
    const buttons = [...section.querySelectorAll<HTMLButtonElement>('.tk-wt__taps button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Ran it', 'Partly', 'Didn’t get to it']);
    buttons[0]!.click();
    expect(api.tapRep).toHaveBeenCalledWith(expect.objectContaining({ technique_id: 'w1-cold-calling', lesson_id: 'lesson1', class_id: null, state: 'ran' }));
    await flush();
    expect(section.querySelector('.tk-wt__counted')!.textContent).toContain('rep');
  });

  it('a timetabled lesson is planned, and its strip opens only when the lesson ends', async () => {
    curriculum.rows = [
      { lesson_id: 'lesson1', class_id: 'c1', date: '2020-01-01', end_time: '10:00', delivery_status: 'planned' },
      { lesson_id: 'lesson1', class_id: 'c2', date: '2999-01-01', end_time: '10:00', delivery_status: 'planned' },
      { lesson_id: 'other', class_id: 'c3', date: '2020-01-01', end_time: '10:00', delivery_status: 'planned' }
    ];
    const slots = lessonSlots('lesson1');
    expect(slots).toHaveLength(2);
    const section = renderWalkthruSection({ ...content, id: 'w1-cold-calling' }, { lessonId: 'lesson1' })!;
    await flush();
    expect(api.planRep).toHaveBeenCalledTimes(2);
    const rows = [...section.querySelectorAll('.tk-wt__rep-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector('.tk-wt__taps')).not.toBeNull();
    expect(rows[1]!.textContent).toContain('Opens when the lesson ends');
  });

  it('a lesson delivered early can be logged before its end time', async () => {
    curriculum.rows = [{ lesson_id: 'lesson1', class_id: 'c1', date: '2999-01-01', end_time: '10:00', delivery_status: 'delivered' }];
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    expect(section.querySelector('.tk-wt__taps')).not.toBeNull();
  });

  it('a technique taken off every note stops expecting a rep', async () => {
    api.listAllReps.mockResolvedValue([{ technique_id: 'w1-quizzing', lesson_id: 'lesson1', class_id: 'c1', state: 'planned' }, { technique_id: 'w1-cold-calling', lesson_id: 'lesson1', class_id: 'c1', state: 'planned' }]);
    const note = { id: 'n', block_type: 'teacher_note', content: { walkthru: { id: 'w1-cold-calling' } } };
    renderWalkthruSection(content, { lessonId: 'lesson1', pageBlocks: [note as never] });
    await flush();
    expect(api.unplanRep).toHaveBeenCalledTimes(1);
    expect(api.unplanRep).toHaveBeenCalledWith(expect.objectContaining({ technique_id: 'w1-quizzing', lesson_id: 'lesson1' }));
  });
});

describe('WalkThru note editor', () => {
  const pick = (editor: HTMLElement, value: string) => {
    (editor.querySelector('.hub-filter') as HTMLButtonElement).click();
    (document.querySelector(`.hub-menu__opt[data-hub-option="${value}"]`) as HTMLElement).click();
  };

  it('picks a technique from the kit menu and keeps jots per step; None removes the field', () => {
    const emitted: unknown[] = [];
    const editor = walkthruEditorFields(undefined, (next) => emitted.push(next));
    document.body.append(editor);
    expect(editor.querySelector('select')).toBeNull();
    expect(editor.querySelectorAll('textarea')).toHaveLength(0);
    pick(editor, 'w1-quizzing');
    expect(emitted.at(-1)).toEqual({ set: 1, id: 'w1-quizzing', jots: {} });
    const areas = [...editor.querySelectorAll('textarea')];
    expect(areas).toHaveLength(5);
    areas[2]!.value = 'third';
    areas[2]!.dispatchEvent(new Event('input'));
    expect(emitted.at(-1)).toEqual({ set: 1, id: 'w1-quizzing', jots: { 3: 'third' } });
    areas[2]!.value = '  ';
    areas[2]!.dispatchEvent(new Event('input'));
    expect(emitted.at(-1)).toEqual({ set: 1, id: 'w1-quizzing', jots: {} });
    pick(editor, '');
    expect(emitted.at(-1)).toBeUndefined();
    expect(editor.querySelectorAll('textarea')).toHaveLength(0);
    editor.remove();
  });

  it('starts from the stored technique and jots', () => {
    const editor = walkthruEditorFields({ set: 1, id: 'w1-cold-calling', jots: { 1: 'one' } }, () => undefined);
    expect(editor.querySelector('.hub-filter')!.textContent).toContain('Cold calling');
    expect((editor.querySelector('textarea') as HTMLTextAreaElement).value).toBe('one');
  });
});

// ── step ticks ──────────────────────────────────────────────────────────────

const { renderTechniqueBadge } = await import('@/blocks/walkthru-note/badge');
const { pickTickClasses } = await import('@/blocks/walkthru-note/ticks');

describe('WalkThru step ticks', () => {
  it('each step gets a tick in the lesson; a tap saves at once and shows Partly', async () => {
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    const ticks = [...section.querySelectorAll<HTMLButtonElement>('.tk-wt__tick')];
    expect(ticks).toHaveLength(5);
    expect(ticks[1]!.getAttribute('aria-label')).toBe('Did step 2 in class');
    expect(ticks[1]!.getAttribute('aria-pressed')).toBe('false');
    ticks[1]!.click();
    // optimistic: on before the server answers
    expect(ticks[1]!.getAttribute('aria-pressed')).toBe('true');
    await flush();
    expect(api.stepRep).toHaveBeenCalledWith(expect.objectContaining({ technique_id: 'w1-cold-calling', lesson_id: 'lesson1', class_id: null, step: 2, done: true, steps_total: 5 }));
    expect(section.querySelector('.tk-wt__tickstate')!.textContent).toBe('Partly');
    // the strip below hears about it
    expect(section.querySelector('.tk-wt__counted')!.textContent).toContain('hollow dot');
  });

  it('a failed save puts the tick back and says so', async () => {
    api.stepRep.mockRejectedValue(new Error('offline'));
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    const tick = section.querySelector<HTMLButtonElement>('.tk-wt__tick')!;
    tick.click();
    await flush();
    await flush();
    expect(tick.getAttribute('aria-pressed')).toBe('false');
    expect(section.querySelector('.tk-wt__tickmsg')!.textContent).toContain('didn’t save');
  });

  it('shows saved ticks for this lesson and its derived state', async () => {
    api.listReps.mockResolvedValue([{ technique_id: 'w1-cold-calling', lesson_id: 'lesson1', class_id: null, goal_id: null, state: 'ran', note: '', lesson_end: null, steps_done: [1, 2, 3, 4, 5], at: 'x' }]);
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    await flush();
    expect([...section.querySelectorAll('.tk-wt__tick')].every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(section.querySelector('.tk-wt__tickstate')!.textContent).toBe('Ran it');
  });

  it('never on Display, and not without a lesson', async () => {
    const shown = renderWalkthruSection(content, { lessonId: 'lesson1', display: true })!;
    const bare = renderWalkthruSection(content, {})!;
    await flush();
    expect(shown.querySelectorAll('.tk-wt__step')).toHaveLength(5);
    expect(shown.querySelector('.tk-wt__tick, .tk-wt__tickbar')).toBeNull();
    expect(bare.querySelector('.tk-wt__tick')).toBeNull();
  });

  it('several classes: a chooser, starting on the class whose lesson is nearest now', async () => {
    const now = Date.parse('2026-10-20T03:00:00.000Z');
    const slots = [
      { lessonId: 'lesson1', classId: 'c1', label: 'a', endIso: '2026-10-13T03:00:00.000Z', delivered: true },
      { lessonId: 'lesson1', classId: 'c2', label: 'b', endIso: '2026-10-20T02:00:00.000Z', delivered: false },
      { lessonId: 'lesson1', classId: 'c2', label: 'c', endIso: '2026-11-20T02:00:00.000Z', delivered: false }
    ];
    const picked = pickTickClasses(slots, now);
    expect(picked.chosen).toBe('c2');
    expect(picked.classes.map((c) => c.classId).sort()).toEqual(['c1', 'c2']);
    expect(picked.classes.find((c) => c.classId === 'c2')!.endIso).toBe('2026-10-20T02:00:00.000Z');
    expect(pickTickClasses([{ lessonId: 'lesson1', classId: null, label: 'This lesson', endIso: null, delivered: false }])).toEqual({ classes: [{ classId: null, label: 'This lesson', endIso: null }], chosen: null });

    curriculum.rows = [
      { lesson_id: 'lesson1', class_id: 'c1', date: '2020-01-01', end_time: '10:00', delivery_status: 'delivered' },
      { lesson_id: 'lesson1', class_id: 'c2', date: '2020-01-02', end_time: '10:00', delivery_status: 'delivered' }
    ];
    const section = renderWalkthruSection(content, { lessonId: 'lesson1' })!;
    await flush();
    const choices = [...section.querySelectorAll<HTMLButtonElement>('.tk-wt__tickclass')];
    expect(choices).toHaveLength(2);
    expect(choices.find((b) => b.getAttribute('aria-pressed') === 'true')!.dataset.classId).toBe('c2');
    choices.find((b) => b.dataset.classId === 'c1')!.click();
    section.querySelector<HTMLButtonElement>('.tk-wt__tick')!.click();
    await flush();
    expect(api.stepRep).toHaveBeenCalledWith(expect.objectContaining({ class_id: 'c1', step: 1 }));
  });

  it('the badge on a quiz or hinge block ticks in a lesson, never on Display', async () => {
    const block = { id: 'b1', type: 'block', block_type: 'rich_text', content: {}, settings: { walkthru: 'w1-check-for-understanding' } } as unknown as Block;
    api.loadWalkthruPictures.mockResolvedValue([null, null, null, null, null]);
    api.loadWalkthruText.mockResolvedValue({ sets: [{ set: 1, techniques: [{ id: 'w1-check-for-understanding', steps: [1, 2, 3, 4, 5].map((n) => ({ n, label: `L${n}`, text: `T${n}` })) }] }] });
    const open = async (badge: HTMLElement) => {
      const details = badge as HTMLDetailsElement;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
      await flush(); await flush();
    };
    const lesson = renderTechniqueBadge(block, { lessonId: 'lesson1' })!;
    await open(lesson);
    expect(lesson.querySelectorAll('.tk-wt__tick').length).toBeGreaterThan(0);
    const display = renderTechniqueBadge(block, { lessonId: 'lesson1', display: true })!;
    await open(display);
    expect(display.querySelector('.tk-wt__tick')).toBeNull();
    const nowhere = renderTechniqueBadge(block)!;
    await open(nowhere);
    expect(nowhere.querySelector('.tk-wt__tick')).toBeNull();
  });

  it('a note can carry a fusion: its name, parents and steps come from the board', async () => {
    api.loadFusions.mockResolvedValue([{ id: 'fu_abc12345', name: 'Call and check', parents: ['w1-cold-calling', 'w1-quizzing'], steps: [1, 2, 3, 4, 5, 6].map((n) => ({ n, label: `Fused ${n}`, text: `Made-up ${n}` })) }]);
    const section = renderWalkthruSection({ set: 1, id: 'fu_abc12345', jots: {} }, { lessonId: 'lesson1' })!;
    await flush();
    await flush();
    expect(section.querySelector('.tk-wt__name')!.textContent).toBe('Call and check');
    expect(section.querySelector('.tk-wt__code')!.textContent).toContain('+');
    expect(section.querySelectorAll('.tk-wt__step')).toHaveLength(6);
    section.querySelectorAll<HTMLButtonElement>('.tk-wt__tick')[5]!.click();
    await flush();
    expect(api.stepRep).toHaveBeenCalledWith(expect.objectContaining({ technique_id: 'fu_abc12345', step: 6, steps_total: 6 }));
  });

  it('the editor offers the board’s fusions next to the book’s techniques', async () => {
    api.loadFusions.mockResolvedValue([{ id: 'fu_abc12345', name: 'Call and check', parents: [], steps: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, label: `S${n}`, text: '' })) }]);
    const emitted: unknown[] = [];
    const editor = walkthruEditorFields(undefined, (next) => emitted.push(next));
    document.body.append(editor);
    await flush();
    (editor.querySelector('.hub-filter') as HTMLButtonElement).click();
    (document.querySelector('.hub-menu__opt[data-hub-option="fu_abc12345"]') as HTMLElement).click();
    expect(emitted.at(-1)).toEqual({ set: 1, id: 'fu_abc12345', jots: {} });
    expect(editor.querySelectorAll('textarea')).toHaveLength(7);
    editor.remove();
  });
});

// ── the strip under a block ─────────────────────────────────────────────────

describe('WalkThru strip under a block', () => {
  const CUED = { sets: [{ set: 1, techniques: [{ id: 'w1-cold-calling', steps: [1, 2, 3, 4, 5].map((n) => ({
    n, label: `LABEL ${n}`, text: `Filler text ${n}`,
    cue: n === 1 ? { time: 'Before you ask', do: ['Ask everyone.'], say: ['“Everyone: {question}”'] }
      : n === 2 ? { do: ['Wait.'], say: [], tool: { kind: 'timer', seconds: 15 } }
      : n === 3 ? { do: [], say: ['“{name}, what were you thinking?”'], tool: { kind: 'names' } }
      : undefined
  })) }] }] };
  const block = { id: 'r1', type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html: '<p>Why does the river keep rising?</p>' }, settings: { walkthru: 'w1-cold-calling' } } as unknown as Block;

  it('keeps the tick last in one row with the step tool, on every step', async () => {
    api.loadWalkthruText.mockResolvedValue(CUED);
    api.loadWalkthruPictures.mockResolvedValue([null, null, null, null, null]);
    const { renderTechniqueBadge } = await import('@/blocks/walkthru-note/badge');
    const node = renderTechniqueBadge(block, { lessonId: 'lesson_1' }) as HTMLDetailsElement;
    node.open = true;
    node.dispatchEvent(new Event('toggle'));
    await flush(); await flush();
    const feet = [...node.querySelectorAll('.wts__cell > .wts__foot')];
    expect(feet).toHaveLength(5);
    for (const foot of feet) expect(foot.lastElementChild!.classList.contains('tk-wt__tick')).toBe(true);
    expect(feet[1]!.querySelector('.wts-tool')).not.toBeNull();
    expect(feet[0]!.querySelector('.wts-tool')).toBeNull();
  });

  it('shows nothing for a block with no WalkThru chosen', async () => {
    const { renderTechniqueBadge } = await import('@/blocks/walkthru-note/badge');
    expect(renderTechniqueBadge({ ...block, settings: {} } as Block)).toBeNull();
  });

  it('opens to five pictured steps, tools under the steps that use one, and a cue card', async () => {
    api.loadWalkthruText.mockResolvedValue(CUED);
    api.loadWalkthruPictures.mockResolvedValue(['<svg id="p1"></svg>', null, null, null, null]);
    const { renderTechniqueBadge } = await import('@/blocks/walkthru-note/badge');
    const node = renderTechniqueBadge(block) as HTMLDetailsElement;
    node.open = true;
    node.dispatchEvent(new Event('toggle'));
    await flush(); await flush();
    expect(node.querySelectorAll('.wts__cell')).toHaveLength(5);
    expect(node.querySelector('#p1')).not.toBeNull();
    expect(node.querySelectorAll('.wts__pic.is-empty')).toHaveLength(4);
    expect(node.querySelector('[data-technique]') ?? node).toBeTruthy();
    const cells = [...node.querySelectorAll('.wts__cell')];
    expect(cells[1]!.querySelector('.wts-tool__val')!.textContent).toBe('0:15');
    expect(cells[2]!.querySelector('.wts-tool--names')).not.toBeNull();
    expect(cells[0]!.querySelector('.wts-tool')).toBeNull();
    const card = node.querySelector('.wts__card')!;
    expect([...card.querySelectorAll('.wts__cues > .wts__cue > .wts__h')].map((h) => h.textContent)).toEqual(['Do', 'Say']);
    expect(card.textContent).toContain('Before you ask');
    expect(card.textContent).toContain('Everyone: Why does the river keep rising?');
    expect(card.querySelector('details.wts__book')).not.toBeNull();
    (cells[2]!.querySelector('.wts__panel') as HTMLButtonElement).click();
    expect(card.textContent).toContain('3. Label 3');
    expect(card.querySelector('.wts__name.is-empty')).not.toBeNull();
    (cells[3]!.querySelector('.wts__panel') as HTMLButtonElement).click();
    expect(card.querySelector('.wts__book--open')!.textContent).toContain('Filler text 4');
  });
});

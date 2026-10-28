import { describe, expect, it } from 'vitest';
import { TeacherNoteBlockContentSchema } from '@/schemas/toolkit';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { attachedTechniques } from '@/blocks/walkthru-note/attach';
import type { Block } from '@/schemas/block';

const SENTINEL = 'JOT-SENTINEL-1357';

describe('WalkThru note content', () => {
  it('keeps a technique id and your jots, and nothing else', () => {
    const parsed = TeacherNoteBlockContentSchema.parse({ title: 'T', html: '', walkthru: { id: 'w1-cold-calling', jots: { 1: 'mine' }, extra: 'dropped' } });
    expect(parsed.walkthru).toEqual({ set: 1, id: 'w1-cold-calling', jots: { 1: 'mine' } });
    expect(Object.keys(parsed.walkthru!).sort()).toEqual(['id', 'jots', 'set']);
    expect(TeacherNoteBlockContentSchema.safeParse({ title: 'T', html: '', walkthru: { id: 'Not An Id' } }).success).toBe(false);
    expect(TeacherNoteBlockContentSchema.safeParse({ title: 'T', html: '', walkthru: { id: 'w1-cold-calling', jots: { 9: 'x' } } }).success).toBe(false);
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

  it('blocks that embody a technique attach it, teacher-side only', () => {
    expect(attachedTechniques({ block_type: 'hinge_question' })).toEqual(['w1-check-for-understanding']);
    expect(attachedTechniques({ block_type: 'question_set' })).toEqual(['w1-quizzing']);
    expect(attachedTechniques({ block_type: 'faded_example' })).toEqual(['w1-worked-examples-and-backward-fading']);
    expect(attachedTechniques({ block_type: 'rich_text' })).toEqual([]);
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
  unplanRep: vi.fn()
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

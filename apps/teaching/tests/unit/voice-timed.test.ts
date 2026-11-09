import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() };
});

import { apiGet, apiPost } from '@/api/client';
import { drawFollowUps, followUpPoint, followUpsOf, isFollowUpPoint, phaseAt, pressureOf, sandText } from '@/blocks/voice-timed';
import { speakingSeconds } from '@/blocks/voice-student';
import { renderVoiceTask } from '@/blocks/voice-block';
import { createBlockEditor } from '@/blocks/editors';
import { BlockSchema, type Block } from '@/schemas/block';

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;

const QUESTION = 'Why does the poem end in silence?';
const voice = (content: Record<string, unknown> = {}) =>
  BlockSchema.parse({
    id: 'viva1',
    type: 'block',
    block_type: 'audio',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { url: '', mode: 'viva', prompt: QUESTION, time_limit_s: 60, ...content },
    created_at: '2026-10-16T00:00:00.000Z',
    updated_at: '2026-10-16T00:00:00.000Z',
    schema_version: 1
  }) as VoiceBlock;

const timed = (extra: Record<string, unknown> = {}) => voice({ pressure: { enabled: true, prep_s: 45 }, ...extra });

describe('time pressure settings', () => {
  it('is on only when enabled, never for Recite, and fills in the defaults', () => {
    expect(pressureOf(voice())).toBeNull();
    expect(pressureOf(timed())).toEqual({ prep_s: 45, countdown_s: 10, grace_s: 10 });
    expect(pressureOf(timed({ oracy: 'recite' }))).toBeNull();
  });
  it('speaks for the set time; a student’s choice or no limit gives way to a fixed time', () => {
    expect(speakingSeconds(timed(), { points: [] })).toBe(60);
    expect(speakingSeconds(timed({ student_chooses_time: true }), { points: [], seconds: 120 })).toBe(60);
    expect(speakingSeconds(timed({ mode: 'respond', time_limit_s: undefined }), { points: [] })).toBe(90);
  });
  it('resumes prep from the server’s count, and is over once prep has run out', () => {
    const p = pressureOf(timed())!;
    expect(phaseAt(p, 5)).toEqual({ phase: 'prep', left: 40 });
    expect(phaseAt(p, 44.5)).toEqual({ phase: 'over' });
    expect(phaseAt(p, 300)).toEqual({ phase: 'over' });
  });
  it('keeps the question’s shape but none of its letters', () => {
    const sand = sandText(QUESTION, () => 0);
    expect(sand).toHaveLength(QUESTION.length);
    expect(sand).toBe('Aaa aaaa aaa aaaa aaa aa aaaaaaa?');
  });
});

describe('follow-ups', () => {
  it('drops blank questions, caps the count at the bank, and is off with an empty bank', () => {
    expect(followUpsOf(voice({ follow_up: { enabled: true, questions: [' ', ''] } }))).toBeNull();
    expect(followUpsOf(voice({ follow_up: { enabled: false, questions: ['Why?'] } }))).toBeNull();
    expect(followUpsOf(voice({ follow_up: { enabled: true, questions: ['Why?', ' How? ', ''], count: 3 } }))).toEqual({ questions: ['Why?', 'How?'], count: 2, think_s: 10, answer_s: 30 });
  });
  it('draws different questions at random', () => {
    const bank = ['A', 'B', 'C', 'D'];
    const drawn = drawFollowUps(bank, 3);
    expect(new Set(drawn).size).toBe(3);
    drawn.forEach((q) => expect(bank).toContain(q));
    expect(drawFollowUps(bank, 2, () => 0)).toEqual(['B', 'C']);
  });
  it('marks a follow-up point by its label', () => {
    const point = followUpPoint('Why that line?', 61.2);
    expect(point).toEqual({ label: 'Follow-up: Why that line?', t: 61.2 });
    expect(isFollowUpPoint(point)).toBe(true);
    expect(isFollowUpPoint({ label: 'Concept' })).toBe(false);
  });
});

describe('a timed task on the lesson page', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    localStorage.clear();
  });

  it('keeps the question off the page for students until they start, and shows it to the teacher', async () => {
    vi.mocked(apiPost).mockResolvedValue({ submitted: false });
    const student = renderVoiceTask(timed(), 'student', { lessonId: 'lesson1' });
    document.body.append(student);
    expect(student.textContent).not.toContain('poem end in silence');
    expect(student.querySelector('.voice-sand')).not.toBeNull();
    await vi.waitFor(() => expect(student.textContent).toContain('Start prepping'));
    expect(student.textContent).toContain('The question appears when you press Start prepping');
    expect(student.textContent).not.toContain('poem end in silence');
    expect(student.textContent).toContain('45 s to prepare');
    student.remove();

    const teacher = renderVoiceTask(timed(), 'teacher', { lessonId: 'lesson1' });
    expect(teacher.textContent).toContain('poem end in silence');
    // The class screen shows the task only: still hidden.
    const display = renderVoiceTask(timed(), 'teacher', { lessonId: 'lesson1', display: true });
    expect(display.textContent).not.toContain('poem end in silence');
  });

  it('shows a run already had, with the question, instead of a fresh start', async () => {
    vi.mocked(apiPost).mockResolvedValue({ submitted: false, started: true, started_at: '2026-11-09T00:00:00Z', elapsed_s: 600, initials: 'JS' });
    const student = renderVoiceTask(timed(), 'student', { lessonId: 'lesson1' });
    document.body.append(student);
    await vi.waitFor(() => expect(student.textContent).toContain('You’ve had your go'));
    expect(student.textContent).toContain('poem end in silence');
    expect(student.textContent).not.toContain('Start prepping');
    student.remove();
  });

  it('offers to carry on when prep time is still running', async () => {
    vi.mocked(apiPost).mockResolvedValue({ submitted: false, started: true, started_at: '2026-11-09T00:00:00Z', elapsed_s: 5, initials: 'JS' });
    const student = renderVoiceTask(timed(), 'student', { lessonId: 'lesson1' });
    document.body.append(student);
    await vi.waitFor(() => expect(student.textContent).toContain('Your prep time is still running'));
    expect(student.textContent).toContain('Carry on');
    student.remove();
  });
});

describe('editor', () => {
  it('turns on time pressure with a fixed speaking time, and fills a follow-up bank', () => {
    vi.mocked(apiGet).mockResolvedValue({ continuum: { strands: [] } });
    let latest = voice({ student_chooses_time: true, time_limit_s: undefined });
    const editor = createBlockEditor(latest, (next) => (latest = next as VoiceBlock), () => latest);
    document.body.append(editor);
    const pill = (group: string, label: string) =>
      [...editor.querySelectorAll<HTMLElement>(`[aria-label="${group}"] button`)].find((b) => b.textContent === label)!;
    pill('Time pressure', 'On').click();
    expect(latest.content.pressure).toEqual({ enabled: true, prep_s: 60, countdown_s: 10, grace_s: 10 });
    expect(latest.content.student_chooses_time).toBeUndefined();
    expect(latest.content.time_limit_s).toBe(90);
    expect(pill('Speaking time', 'Students choose')).toBeUndefined();

    const prep = [...editor.querySelectorAll<HTMLLabelElement>('label')].find((l) => l.textContent === 'Prep time (s)')!;
    const prepBox = editor.querySelector<HTMLInputElement>(`#${prep.htmlFor}`)!;
    prepBox.value = '9999';
    prepBox.dispatchEvent(new Event('change'));
    expect(prepBox.value).toBe('600');
    expect(latest.content.pressure!.prep_s).toBe(600);

    pill('Follow-up questions', 'On').click();
    const bank = editor.querySelector<HTMLTextAreaElement>('.voice-editor__bank')!;
    bank.value = 'Which line proves it?\nWhat would a critic say?';
    bank.dispatchEvent(new Event('input'));
    expect(latest.content.follow_up!.questions).toEqual(['Which line proves it?', 'What would a critic say?']);
    pill('Questions per take', '2').click();
    expect(latest.content.follow_up!.count).toBe(2);
    expect(latest.content.follow_up!.enabled).toBe(true);
    editor.remove();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() };
});

import { apiGet, apiPut } from '@/api/client';
import { clock, livePoint, paceSlots, pointProgress, slotAt } from '@/blocks/voice-pacing';
import { buildPaper, commonestFiller, fillerSuggestions, pointIndexAt, tapTarget, wordAt } from '@/blocks/voice-marking';
import { keepTake, memoryTakes, MAX_TAKES } from '@/blocks/voice-takes';
import { renderVoiceFeedback } from '@/blocks/voice-feedback-view';
import { mountVoiceTeacher } from '@/blocks/voice-teacher';
import { primeFeedbackCodes, type FeedbackCode } from '@/blocks/feedback-codes';
import { speakingSeconds } from '@/blocks/voice-student';
import { BlockSchema, type Block } from '@/schemas/block';
import { publishBlockIssues } from '@/schemas/publish-block-issues';
import type { VoiceWord } from '@/blocks/voice-transcript';

const word = (w: string, start: number, end = start + 0.3): VoiceWord => ({ w, start, end });

describe('pacing', () => {
  it('splits the time by weight and ends exactly on the limit', () => {
    const slots = paceSlots([1, 2, 1], 80);
    expect(slots.map((s) => [s.start, s.end])).toEqual([[0, 20], [20, 60], [60, 80]]);
    expect(slotAt(slots, 25)).toBe(1);
    expect(slotAt(slots, 95)).toBe(2);
  });
  it('lets Next move ahead early but never back', () => {
    const slots = paceSlots([1, 1, 1], 90);
    expect(livePoint(slots, 5, 1)).toBe(1);
    expect(livePoint(slots, 65, 1)).toBe(2);
    expect(livePoint(slots, 5, 9)).toBe(2);
    expect(clock(84.6)).toBe('1:24');
  });
  it('fills a point’s bar from when it began, even after an early Next', () => {
    const slots = paceSlots([1, 1, 1], 90);
    expect(pointProgress(slots[0]!, 0, 15)).toBeCloseTo(0.5);
    // Next pressed at 10 s: point 2 is scheduled 30–60, so it runs 10 → 60.
    expect(pointProgress(slots[1]!, 10, 10)).toBe(0);
    expect(pointProgress(slots[1]!, 10, 35)).toBeCloseTo(0.5);
    expect(pointProgress(slots[1]!, 10, 70)).toBe(1);
  });
});

describe('marking helpers', () => {
  const words = [word('So,', 0), word('um,', 0.5), word('like,', 1), word('the', 1.6), word('poem', 2), word('looks', 2.5), word('like', 2.9), word('a', 3.2), word('storm.', 3.4), word('You', 4), word('know', 4.3), word('basically', 5)];
  it('lands a tap a second early on the word being spoken', () => {
    expect(tapTarget(words, 3.0, 1)).toEqual({ t: 2, word: 4 });
    expect(tapTarget(words, 0.4, 1)).toEqual({ t: 0, word: 0 });
    expect(wordAt(words, 1.45)).toBe(2);
    expect(wordAt([], 2)).toBe(-1);
  });
  it('suggests fillers but leaves “looks like a storm” alone', () => {
    const found = fillerSuggestions(words).map((f) => f.word);
    expect(found).toEqual(['um', 'like', 'you know']);
    expect(commonestFiller(words, [[1, 1], [2, 2], [2, 2]])).toBe('like');
  });
  it('starts a paragraph at each dot point and maps words to characters', () => {
    const sheet = buildPaper(words.slice(0, 5), [{ t: 0 }, { t: 1.5 }]);
    expect(sheet.text).toBe('So, um, like,\nthe poem');
    expect(sheet.ranges[3]).toEqual({ start: 14, end: 17 });
    expect(sheet.pointStarts).toEqual([0, 3]);
    expect(pointIndexAt([{ t: 0 }, { t: 1.5 }], 2)).toBe(1);
    expect(pointIndexAt([], 2)).toBe(-1);
  });
});

describe('takes on the device', () => {
  it('keeps only the newest five per block', async () => {
    const store = memoryTakes();
    for (let i = 0; i < 7; i++) {
      await keepTake(store, { id: `t${i}`, scope: 'l:b', recorded_at: `2026-10-21T00:00:0${i}Z`, duration_s: 10, mime: 'audio/webm', points: [], reached: 0 }, new ArrayBuffer(4));
    }
    await keepTake(store, { id: 'other', scope: 'l:c', recorded_at: '2026-10-21T00:00:00Z', duration_s: 5, mime: 'audio/webm', points: [], reached: 0 }, new ArrayBuffer(4));
    const kept = await store.list('l:b');
    expect(kept).toHaveLength(MAX_TAKES);
    expect(kept[0]!.id).toBe('t6');
    expect(await store.audio('t0')).toBeNull();
  });
});

const codes: FeedbackCode[] = [
  { id: 'speak_fw', code: 'FW', label: 'Filler word', group: 'speaking', criterion: null, colour: 'peach', descriptor: 'Filler word.', key: '1' },
  { id: 'comp_t', code: 'T', label: 'Techniques', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Name the technique.' },
  { id: 'comp_ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with a concept.', strength_descriptor: 'Great opening concept.' }
];

const vivaBlock = (content: Record<string, unknown> = {}) =>
  BlockSchema.parse({
    id: 'viva1',
    type: 'block',
    block_type: 'audio',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { url: '', mode: 'viva', prompt: 'How is isolation shown?', time_limit_s: 90, ...content },
    created_at: '2026-10-16T00:00:00.000Z',
    updated_at: '2026-10-16T00:00:00.000Z',
    schema_version: 1
  }) as Extract<Block, { block_type: 'audio' }>;

describe('block settings', () => {
  it('needs a question to publish in respond or viva mode, a URL only in listen', () => {
    expect(publishBlockIssues([vivaBlock({ prompt: '' })])).toMatch(/question/);
    expect(publishBlockIssues([vivaBlock()])).toBeNull();
  });
  it('works out speaking time from the block or the student’s choice', () => {
    expect(speakingSeconds(vivaBlock(), { points: [] })).toBe(90);
    expect(speakingSeconds(vivaBlock({ time_limit_s: undefined }), { points: [] })).toBe(90);
    expect(speakingSeconds(vivaBlock({ student_chooses_time: true }), { points: [], seconds: 60 })).toBe(60);
    expect(speakingSeconds(vivaBlock({ mode: 'respond', time_limit_s: undefined }), { points: [] })).toBeNull();
  });
});

describe('student feedback view', () => {
  it('shows the summary, marks on the transcript, and a card per mark', () => {
    const view = renderVoiceFeedback({
      submitted: true,
      initials: 'JS',
      submitted_at: '2026-10-21T00:00:00Z',
      duration_s: 5,
      status: 'returned',
      audio_url: null,
      audio_deleted: true,
      audio_delete_after: '2026-11-18T00:00:00Z',
      points: [{ label: 'Concept', t: 0 }],
      transcript: { segments: [{ text: 'Um the poem uses metaphor', start: 0, end: 5, words: [{ word: 'Um', start: 0, end: 0.4 }, { word: 'the', start: 0.5, end: 0.7 }, { word: 'poem', start: 0.8, end: 1.2 }, { word: 'uses', start: 1.3, end: 1.6 }, { word: 'metaphor', start: 1.7, end: 2.4 }] }] },
      tags: [
        { id: 'a', code_id: 'speak_fw', code: 'FW', label: 'Filler word', positive: false, t: 0.1, w: [0, 0] },
        { id: 'b', code_id: 'comp_ts', code: 'TS', label: 'Topic sentence', positive: true, t: 0.6, w: [1, 4], note: 'Clear concept' }
      ],
      comment: 'Good pace overall.',
      codes
    });
    document.body.append(view);
    const key = view.querySelector('.voice-summary')?.textContent ?? '';
    expect(key).toContain('TS+');
    expect(key).toContain('Topic sentence (strength)');
    expect(key).toContain('Filler word');
    const meanings = [...view.querySelectorAll('.voice-summary__meaning')].map((m) => m.textContent);
    expect(meanings).toEqual(expect.arrayContaining(['Great opening concept.', 'Filler word.']));
    expect(key).toContain('A + after a code marks a strength.');
    expect(view.textContent).toContain('Audio removed after 4 weeks');
    const marks = view.querySelectorAll<HTMLElement>('.pa-run--mark');
    expect(marks.length).toBeGreaterThan(0);
    marks[marks.length - 1]!.click();
    expect(view.querySelector('.pa-cards')?.textContent).toContain('Great opening concept.');
    expect(view.querySelector('.pa-cards')?.textContent).toContain('Clear concept');
    view.remove();
  });
});

describe('teacher marking', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPut).mockReset();
    primeFeedbackCodes(codes);
  });

  it('lists submissions, opens one, pre-marks fillers, and tags with keys', async () => {
    const record = {
      id: 'vs_1',
      initials: 'JS',
      device_hash: 'abc123',
      submitted_at: '2026-10-21T00:00:00Z',
      duration_s: 5,
      status: 'new',
      transcript_status: 'done',
      audio_deleted: false,
      audio_delete_after: '2026-11-18T00:00:00Z',
      prompt: 'Q',
      points: [],
      transcript: { segments: [{ text: 'um the poem', start: 0, end: 2, words: [{ word: 'um,', start: 0, end: 0.4 }, { word: 'the', start: 0.5, end: 0.8 }, { word: 'poem', start: 0.9, end: 1.4 }] }] },
      tags: [],
      comment: '',
      audio_url: '/api/published/voice-audio/x'
    };
    vi.mocked(apiGet).mockImplementation(async (path: string) =>
      path.endsWith('/vs_1') ? record : { submissions: [{ ...record, tag_count: 0 }] }
    );
    vi.mocked(apiPut).mockImplementation(async (_path: string, body: unknown) => ({ ...record, ...(body as object), status: 'marked' }));
    const root = mountVoiceTeacher(vivaBlock(), 'lesson1');
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('.voice-inbox__open')).not.toBeNull());
    root.querySelector<HTMLButtonElement>('.voice-inbox__open')!.click();
    await vi.waitFor(() => expect(root.querySelector('.voice-mark')).not.toBeNull());

    expect(root.querySelector('.voice-review')?.textContent).toContain('1 suggested filler');
    const firstPut = vi.mocked(apiPut).mock.calls[0]!;
    expect((firstPut[1] as { fillers_suggested: boolean }).fillers_suggested).toBe(true);

    const audio = root.querySelector('audio')!;
    Object.defineProperty(audio, 'currentTime', { value: 2, writable: true });
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't' }));
    expect(root.querySelector('.voice-strip__typing')?.textContent).toContain('T / TS');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 'S', shiftKey: true }));
    const chips = [...root.querySelectorAll('.voice-note .fc-chip')].map((c) => c.textContent);
    expect(chips).toEqual(expect.arrayContaining(['FW', 'TS+']));
    // Backspace undoes the last tap.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect([...root.querySelectorAll('.voice-note .fc-chip')].map((c) => c.textContent)).not.toContain('TS+');
    root.remove();
  });
});

import { codeRef, mountAnnotationCodeField, renderAnnotationCode } from '@/blocks/annotation-code-field';
import { AnnotationCodeRefSchema } from '@/schemas/block';

describe('feedback codes on annotation notes', () => {
  beforeEach(() => primeFeedbackCodes(codes));

  it('copies the code’s words onto the note so students can read them', () => {
    const ref = codeRef(codes[2]!, true);
    expect(ref).toMatchObject({ code: 'TS', positive: true, descriptor: 'Great opening concept.' });
    const note = { code: AnnotationCodeRefSchema.parse(ref) };
    expect(note.code?.code).toBe('TS');
    expect(renderAnnotationCode(ref).textContent).toContain('TS+');
  });

  it('types a code like a margin note; Enter settles a prefix', async () => {
    const onChange = vi.fn();
    const field = mountAnnotationCodeField(undefined, onChange);
    document.body.append(field);
    await Promise.resolve();
    await Promise.resolve();
    const input = field.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = 't';
    input.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'T', positive: false }));
    field.remove();
  });
});

import { createBlockEditor } from '@/blocks/editors';

describe('Voice block editor', () => {
  it('switches between listen, respond and viva and keeps the content', () => {
    let latest = vivaBlock({ mode: 'listen', prompt: undefined, time_limit_s: undefined });
    const editor = createBlockEditor(
      latest,
      (next) => {
        latest = next as typeof latest;
      },
      () => latest
    );
    document.body.append(editor);
    const pill = (label: string) => [...editor.querySelectorAll<HTMLButtonElement>('.voice-editor__modes button')].find((b) => b.textContent === label)!;
    expect(editor.querySelector<HTMLElement>('.voice-editor__listen')!.hidden).toBe(false);
    pill('Viva').click();
    expect(latest.content.mode).toBe('viva');
    expect(editor.querySelector<HTMLElement>('.voice-editor__listen')!.hidden).toBe(true);
    const question = editor.querySelector<HTMLTextAreaElement>('.voice-editor__question')!;
    question.value = 'Why does the poem end in silence?';
    question.dispatchEvent(new Event('input'));
    expect(latest.content.prompt).toBe('Why does the poem end in silence?');
    [...editor.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add a point')!.click();
    expect(latest.content.scaffold).toHaveLength(1);
    [...editor.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Students choose')!.click();
    expect(latest.content.student_chooses_time).toBe(true);
    editor.remove();
  });
});

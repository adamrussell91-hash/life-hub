import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingRecording, MeetingTranscript, MeetingWriteup, RecordingBundle } from '@/api/meeting-recordings';

vi.mock('@/api/meeting-recordings', () => ({
  getRecordingBundle: vi.fn(),
  patchReview: vi.fn(async (body: { built?: Record<string, string>; picks?: Record<string, unknown> }) => ({
    writeup: { ...writeup, review: { built: { ...(body.built ?? {}) }, picks: { ...(body.picks ?? {}) } } }
  })),
  patchSpeakers: vi.fn(async () => ({ transcript, writeup })),
  rerunWriteup: vi.fn(),
  retryRecording: vi.fn(),
  saveRecordingNotes: vi.fn(),
  stopRecording: vi.fn(),
  deleteRecording: vi.fn(),
  fetchRecordingPart: vi.fn(),
  uploadRecordingPart: vi.fn(),
  startRecording: vi.fn()
}));

import { cardState, groupBuilt, mountRecordingCard, NO_LOCAL, overviewHtml, plainText } from '@/views/meeting-recording-card';
import { createRecordingModel } from '@/views/meeting-recording-strip';
import { findLines, groupLines } from '@/views/meeting-transcript-drawer';
import { patchReview } from '@/api/meeting-recordings';
import { __resetRecorderRegistry } from '@/lib/meeting-recorder';

const MEETING = 'meeting_00000000-0000-4000-8000-0000000000bb';
const IRIS = 'shared:person:iris-calloway';
const THEO = 'shared:person:theo-marsh';

const recording: MeetingRecording = {
  id: 'rec_card', meeting_id: MEETING, kind: 'meeting', status: 'done', private: false, consent_confirmed_at: '2026-11-19T04:30:00.000Z',
  started_at: '2026-11-19T04:30:00.000Z', stopped_at: '2026-11-19T05:28:00.000Z', duration_ms: 58 * 60_000, parts_expected: 58,
  parts_received: Array.from({ length: 58 }, (_, i) => i), taps: [], flags: [], notes: ['Essay first or viva first?', 'Who writes the marking guide'],
  attendees: [{ who: IRIS, name: 'Iris Calloway', role: 'chair' }, { who: THEO, name: 'Theo Marsh', role: null }], room: false, attempts: 0,
  error: null, claimed_until: null, transcript_key: 'k', audio_deleted_at: '2026-11-19T06:02:00.000Z', writeup_status: 'done'
};

const transcript: MeetingTranscript = {
  recording_id: 'rec_card', duration_ms: 58 * 60_000, engine: { words: 'w', speakers: 's' },
  voices: [
    { key: 'S1', who: 'me', source: 'taps', talk_ms: 600_000 },
    { key: 'S2', who: IRIS, source: 'taps', talk_ms: 500_000 },
    { key: 'S3', who: null, source: null, talk_ms: 20_000 }
  ],
  lines: [
    { start_ms: 12_000, end_ms: 18_000, speaker: 'S2', text: 'Let’s settle the Term 1 order.', who_override: null, moved: false, unsure: false },
    { start_ms: 19_000, end_ms: 22_000, speaker: 'S2', text: 'Viva or essay first?', who_override: null, moved: false, unsure: false },
    { start_ms: 29_000, end_ms: 35_000, speaker: 'S1', text: 'Viva first works for marking.', who_override: null, moved: true, unsure: false },
    { start_ms: 50_000, end_ms: 51_000, speaker: 'S3', text: 'Yeah.', who_override: null, moved: false, unsure: false }
  ],
  speakers_checked: true
};

const writeup: MeetingWriteup = {
  status: 'done', speakers_checked: true,
  overview: 'The team agreed <b>viva first</b> &amp; the essay in Week 8.',
  flow: [
    { start_ms: 0, mins: 3, title: 'Purpose', text: 'Iris sets the one decision.', who: [IRIS], line: 0 },
    { start_ms: null, mins: 10, title: 'Order', text: 'Viva first agreed.', who: [IRIS, 'me'], line: null }
  ],
  built: [
    { note_index: 0, text: 'Decided: viva first', who: IRIS, start_ms: 19_000, line: 1 },
    { note_index: null, text: 'Theo books the seminar room', who: THEO, start_ms: null, line: null },
    { note_index: 9, text: 'Out of range note index', who: 'me', start_ms: 29_000, line: 2 }
  ],
  picks: {
    mine: [{ text: 'Draft the essay guide', due: '2026-11-27', due_label: 'End of Week 2', quote: 'I’ll take the essay guide.', start_ms: 29_000, line: 2 }],
    others: [{ who: THEO, text: 'Book the seminar room', due: null, quote: 'I’ll book it.', start_ms: null, line: null }],
    poi: [{ who: IRIS, text: 'Reading panel wants teachers', quote: '', start_ms: 12_000, line: 0 }]
  },
  persons: [
    { who: IRIS, points: [{ text: 'Kept to one decision', star: true }], quote: 'Let’s settle it.', line: 0 },
    { who: 'me', points: [{ text: 'Raised marking load', star: false }] }
  ],
  review: { built: {}, picks: {} },
  error: null,
  created_at: '2026-11-19T06:00:00.000Z'
};

const bundle = (): RecordingBundle => ({ recording, transcript, writeup: { ...writeup, review: { built: {}, picks: {} } }, mac: { last_seen_at: null, version: null } });

function mount(deps: Partial<Parameters<typeof mountRecordingCard>[0]['deps']> = {}) {
  const model = createRecordingModel(MEETING, async () => bundle());
  model.set(bundle());
  const appendToNotes = vi.fn();
  const createTask = vi.fn(async () => undefined);
  const trackIt = vi.fn(async () => undefined);
  const card = mountRecordingCard({
    meetingId: MEETING,
    kind: 'meeting',
    people: () => [{ ref: IRIS, name: 'Iris Calloway', role: 'chair' }, { ref: THEO, name: 'Theo Marsh', role: null }],
    room: false,
    model,
    deps: { appendToNotes, createTask, trackIt, ...deps }
  });
  document.body.append(card.el);
  return { card, model, appendToNotes, createTask, trackIt };
}

beforeEach(() => {
  __resetRecorderRegistry();
  document.body.replaceChildren();
});
afterEach(() => vi.clearAllMocks());

describe('card state', () => {
  it('follows Life Hub and this device', () => {
    expect(cardState(null, NO_LOCAL)).toBe('none');
    expect(cardState(bundle(), { ...NO_LOCAL, active: true })).toBe('recording');
    expect(cardState({ ...bundle(), recording: { ...recording, status: 'uploaded' } }, { ...NO_LOCAL, hasLocal: true, pending: 2, adopted: true })).toBe('uploading');
    expect(cardState({ ...bundle(), recording: { ...recording, status: 'recording' } }, { ...NO_LOCAL, hasLocal: true, pending: 2, stalled: true })).toBe('device');
    expect(cardState({ ...bundle(), recording: { ...recording, status: 'uploaded' } }, NO_LOCAL)).toBe('waiting');
    expect(cardState({ ...bundle(), recording: { ...recording, status: 'failed' } }, NO_LOCAL)).toBe('failed');
    expect(cardState(bundle(), NO_LOCAL)).toBe('done');
    // A failed redo keeps the earlier write-up on show.
    expect(cardState({ ...bundle(), recording: { ...recording, writeup_status: 'failed' } }, NO_LOCAL)).toBe('done');
    expect(cardState({ ...bundle(), writeup: null, recording: { ...recording, writeup_status: 'failed' } }, NO_LOCAL)).toBe('writeup_failed');
    expect(cardState({ ...bundle(), writeup: null, recording: { ...recording, writeup_status: 'private_none' } }, NO_LOCAL)).toBe('no_writeup');
  });

  it('groups built lines under their note; bad indices go to Not in your notes', () => {
    const grouped = groupBuilt(recording.notes, writeup.built);
    expect(grouped.byNote[0]!.map((x) => x.index)).toEqual([0]);
    expect(grouped.extra.map((x) => x.index)).toEqual([1, 2]);
  });

  it('keeps <b> in the overview and drops any other tag', () => {
    expect(overviewHtml('<b>yes</b> <script>x</script><i>no</i>')).toBe('<b>yes</b> xno');
    expect(plainText('A &amp; <b>B</b>')).toBe('A & B');
  });
});

describe('done card', () => {
  it('renders the synthetic write-up in the mockup’s order', () => {
    const { card } = mount();
    const text = card.el.textContent ?? '';
    expect(card.el.hidden).toBe(false);
    expect(card.el.dataset.state).toBe('done');
    const order = ['Overview', 'How it went', 'Your notes, built out', 'Picked up', 'Who said what'].map((h) => text.indexOf(h));
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
    expect(card.el.querySelector('.rec-overview b')?.textContent).toBe('viva first');
    expect(card.el.querySelector('.rec-overview')?.textContent).toContain('& the essay');
    expect(text).toContain('58 min · written up by Claude');
    // Times show only where the write-up placed the point.
    expect(card.el.querySelectorAll('.rec-seg-words, [data-part="rec-seg-words"]').length).toBe(1);
    expect(card.el.querySelector('[data-built="1"] .rec-ts')).toBeNull();
    expect(card.el.querySelector('[data-built="0"] .rec-ts')?.textContent).toBe('0:19');
    // Not in your notes holds the unplaced and out-of-range lines.
    expect(text).toContain('Not in your notes');
    expect(card.el.querySelectorAll('.rec-add')).toHaveLength(3);
    // Picks: Track it only for a person; due label shown.
    expect(card.el.querySelector('[data-pick="mine:0"]')?.textContent).toContain('End of Week 2');
    expect(card.el.querySelector('[data-pick="others:0"] [data-part="rec-pick-track"]')).not.toBeNull();
    // Who said what: profile link for a person, never for you.
    const profile = card.el.querySelector<HTMLAnchorElement>('[data-part="rec-open-profile"]');
    expect(profile?.getAttribute('href')).toBe('#/people/iris-calloway');
    expect(text).toContain('Not saved anywhere else');
    expect(text).toContain('1 voice not named');
    // No raw refs in visible text (D12).
    expect(text).not.toContain('shared:person');
  });

  it('✓ adds the line to the notes and saves the review; Keep all does the rest', async () => {
    const { card, appendToNotes } = mount();
    card.el.querySelector<HTMLButtonElement>('[data-built="0"] [data-part="rec-built-keep"]')!.click();
    expect(appendToNotes).toHaveBeenCalledWith(['Essay first or viva first?: Decided: viva first (Iris, 0:19)']);
    await vi.waitFor(() => expect(patchReview).toHaveBeenCalledWith({ meeting_id: MEETING, built: { 0: 'kept' } }));
    expect(card.el.querySelector('[data-built="0"]')?.classList.contains('is-kept')).toBe(true);
    card.el.querySelector<HTMLButtonElement>('[data-part="rec-keep-all"]')!.click();
    await vi.waitFor(() => expect(patchReview).toHaveBeenCalledWith({ meeting_id: MEETING, built: { 1: 'kept', 2: 'kept' } }));
    expect(appendToNotes).toHaveBeenLastCalledWith(['Theo books the seminar room (Theo)', 'Out of range note index (you, 0:29)']);
  });

  it('✕ drops a line without touching the notes', async () => {
    const { card, appendToNotes } = mount();
    card.el.querySelector<HTMLButtonElement>('[data-built="1"] [data-part="rec-built-drop"]')!.click();
    expect(appendToNotes).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(card.el.querySelector<HTMLElement>('[data-built="1"]')!.hidden).toBe(true));
  });

  it('+ Task makes a task with the due date heard; Track it files a they-owe promise', async () => {
    const { card, createTask, trackIt } = mount();
    card.el.querySelector<HTMLButtonElement>('[data-pick="mine:0"] [data-part="rec-pick-task"]')!.click();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledWith({ title: 'Draft the essay guide', due_date: '2026-11-27' }));
    await vi.waitFor(() => expect(card.el.querySelector('[data-pick="mine:0"]')?.textContent).toContain('Task added · due End of Week 2'));
    card.el.querySelector<HTMLButtonElement>('[data-pick="others:0"] [data-part="rec-pick-track"]')!.click();
    await vi.waitFor(() => expect(trackIt).toHaveBeenCalledWith({ person_ref: THEO, text: 'Book the seminar room', due: null }));
    expect(patchReview).toHaveBeenCalledWith({ meeting_id: MEETING, picks: { 'others:0': { state: 'done', note: '✓ Waiting on Theo · on their profile' } } });
  });

  it('a time opens the transcript drawer at that line, with same-person lines joined', async () => {
    const { card } = mount();
    card.el.querySelector<HTMLButtonElement>('[data-built="0"] .rec-ts')!.click();
    const drawer = document.querySelector('[data-part="transcript-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer!.querySelector('#rec-line-1')?.classList.contains('is-hit')).toBe(true);
    // Lines 0 and 1 are both Iris: one paragraph.
    expect(drawer!.querySelectorAll('.rec-line')).toHaveLength(3);
    expect(drawer!.textContent).toContain('Unnamed voice 3');
    drawer!.querySelector<HTMLButtonElement>('[data-part="drawer-close"]')!.click();
    expect(document.querySelector('[data-part="transcript-drawer"]')).toBeNull();
  });
});

describe('transcript helpers', () => {
  it('finds lines with every word and groups runs by person', () => {
    expect(findLines(transcript, 'viva first')).toEqual([1, 2]);
    expect(findLines(transcript, 'marking viva')).toEqual([2]);
    expect(groupLines(transcript, null).map((g) => g.lines)).toEqual([[0, 1], [2], [3]]);
    expect(groupLines({ ...transcript, lines: transcript.lines.map((l, i) => (i === 1 ? { ...l, who_override: 'me' } : l)) }, null).map((g) => g.lines)).toEqual([[0], [1, 2], [3]]);
  });
});

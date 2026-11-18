/**
 * Dev-only: runs the real meeting-recording and people-said handlers against an
 * in-memory store, seeded with one finished recording so the Done card can be
 * walked. Invented people and words only.
 */
import { handleBrowser } from '../../../netlify/functions/meeting-recordings.mjs';
import { handlePeopleSaid } from '../../../netlify/functions/people-said.mjs';
import {
  peopleSaidKey,
  recordingKey,
  transcriptKey,
  writeupKey
} from '../../../netlify/functions/_shared/meeting-recordings-store.mjs';

type Store = {
  get(key: string, opts?: { type?: string }): Promise<unknown>;
  getWithMetadata(key: string, opts?: { type?: string }): Promise<{ data: unknown; metadata: Record<string, unknown> } | null>;
  set(key: string, value: unknown): Promise<void>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: Array<{ key: string }> }>;
};

function memoryStore(): Store {
  const map = new Map<string, unknown>();
  return {
    async get(key, opts = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return opts.type === 'json' && typeof value === 'string' ? JSON.parse(value) : value;
    },
    async getWithMetadata(key, opts = {}) {
      const data = await this.get(key, opts);
      return data == null ? null : { data, metadata: {} };
    },
    async set(key, value) { map.set(key, value); },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

// The seeded mentoring meeting "Priya: standard 3 planning" and its attendee.
const MEETING = 'meeting_00000000-0000-4000-8000-000000000112';
const MENTEE = 'shared:person:person_00000000-0000-4000-8000-0000000000f1';
const REC = 'rec_00000000-0000-4000-8000-00000000c0de';

function seed(store: Store): void {
  const at = new Date(Date.now() - 9 * 86_400_000).toISOString();
  void store.setJSON(recordingKey(MEETING), {
    id: REC, meeting_id: MEETING, kind: 'meeting', status: 'done', private: false,
    consent_confirmed_at: at, started_at: at, stopped_at: at, duration_ms: 41 * 60_000,
    parts_expected: 41, parts_received: [], segment_starts: [0],
    taps: [{ who: 'me', at_ms: 4000 }, { who: MENTEE, at_ms: 12000 }], flags: [{ kind: 'poi', at_ms: 1_980_000 }],
    notes: ['Standard 3 evidence so far', 'Lesson plan for the observation', 'Next steps'],
    attendees: [{ who: MENTEE, name: 'Priya Nandakumar', role: null }], room: false,
    attempts: 0, error: null, claimed_until: null, transcript_key: transcriptKey(MEETING, REC),
    audio_deleted_at: at, writeup_status: 'done'
  });
  const lines: Array<[number, string, string, boolean?]> = [
    [5, 'S1', 'Thanks for coming in. I want to land the plan for the Standard 3 observation today.'],
    [14, 'S2', 'I have two lessons that could work. The persuasive writing one has the clearest learning intentions.'],
    [31, 'S1', 'Then let’s use that one. What evidence do you already have for 3.2?'],
    [40, 'S2', 'My unit outline and the annotated plans from Term 3. I can add the student work samples.', true],
    [62, 'S1', 'Good. I’ll send you the observation template by Friday.'],
    [75, 'S2', 'I’ll draft the lesson plan and share it before our next check-in.'],
    [1980, 'S2', 'The regional network is asking early-career teachers to present at its March conference. I might put something in.'],
    [1995, 'S3', 'Sorry to interrupt, is room 14 free after this?'],
    [2001, 'S1', 'Yes, we’re nearly done. Priya, you should apply for that conference slot.']
  ];
  void store.setJSON(transcriptKey(MEETING, REC), {
    recording_id: REC, duration_ms: 41 * 60_000,
    engine: { words: 'whisper.cpp large-v3-turbo-q5_0', speakers: 'sherpa-onnx titanet_small' },
    voices: [
      { key: 'S1', who: 'me', source: 'taps', talk_ms: 1_120_000 },
      { key: 'S2', who: MENTEE, source: 'taps', talk_ms: 1_330_000 },
      { key: 'S3', who: null, source: null, talk_ms: 6000 }
    ],
    lines: lines.map(([s, speaker, text, moved]) => ({
      start_ms: s * 1000, end_ms: s * 1000 + 6000, speaker, text, who_override: null, moved: Boolean(moved), unsure: false
    })),
    speakers_checked: true
  });
  void store.setJSON(writeupKey(MEETING), {
    status: 'done', speakers_checked: true,
    overview: 'We settled on the <b>persuasive writing lesson</b> for the Standard 3 observation. Priya already has her unit outline and annotated plans for 3.2 and will add student work samples. You send the observation template by Friday; she drafts the lesson plan before the next check-in. Near the end she mentioned the regional network’s March conference.',
    flow: [
      { start_ms: 0, mins: 4, title: 'Purpose', text: 'You set the one decision: which lesson to observe.', who: ['me'], line: 0 },
      { start_ms: 240_000, mins: 15, title: 'Choosing the lesson', text: 'Priya weighs two lessons; persuasive writing wins.', who: [MENTEE, 'me'], line: 1 },
      { start_ms: 1_140_000, mins: 13, title: 'Evidence for 3.2', text: 'Unit outline and annotated plans; work samples to add.', who: [MENTEE], line: 3 },
      { start_ms: 1_920_000, mins: 6, title: 'Conference', text: 'Priya raises the March conference call for presenters.', who: [MENTEE, 'me'], line: 6 },
      { start_ms: 2_280_000, mins: 3, title: 'Wrap-up', text: 'Who does what before the next check-in.', who: ['me'], line: 8 }
    ],
    built: [
      { note_index: 0, text: 'Has the unit outline and Term 3 annotated plans; will add student work samples', who: MENTEE, start_ms: 40_000, line: 3 },
      { note_index: 1, text: 'Decided: the persuasive writing lesson, for its clear learning intentions', who: MENTEE, start_ms: 14_000, line: 1 },
      { note_index: 2, text: 'You send the observation template by Friday', who: 'me', start_ms: 62_000, line: 4 },
      { note_index: 2, text: 'Priya drafts the lesson plan before the next check-in', who: MENTEE, start_ms: 75_000, line: 5 },
      { note_index: null, text: 'Regional network wants early-career presenters for its March conference', who: MENTEE, start_ms: 1_980_000, line: 6 }
    ],
    picks: {
      mine: [{ text: 'Send Priya the observation template', due: null, due_label: 'Friday', quote: 'I’ll send you the observation template by Friday.', start_ms: 62_000, line: 4 }],
      others: [{ who: MENTEE, text: 'Draft the lesson plan and share it', due: null, quote: 'I’ll draft the lesson plan and share it before our next check-in.', start_ms: 75_000, line: 5 }],
      poi: [{ who: MENTEE, text: 'Regional network’s March conference wants early-career presenters.', quote: 'The regional network is asking early-career teachers to present…', start_ms: 1_980_000, line: 6 }]
    },
    persons: [
      { who: MENTEE, points: [{ text: 'Chose the persuasive writing lesson for its clear learning intentions', star: false }, { text: 'Already has strong 3.2 evidence from Term 3', star: false }, { text: 'Spotted the March conference call for presenters', star: true }], quote: 'The regional network is asking early-career teachers to present at its March conference.', line: 6 },
      { who: 'me', points: [{ text: 'Set the decision for the meeting', star: false }, { text: 'Encouraged Priya to apply for the conference', star: false }] }
    ],
    review: { built: {}, picks: {} }, error: null, created_at: at
  });
  void store.setJSON(peopleSaidKey(MENTEE, MEETING), {
    person_ref: MENTEE, meeting_id: MEETING, meeting_title: 'Priya: standard 3 planning', date: at.slice(0, 10), kind: 'meeting',
    points: [{ text: 'Spotted the March conference call for presenters', star: true }, { text: 'Already has strong 3.2 evidence from Term 3', star: false }],
    quote: 'The regional network is asking early-career teachers to present at its March conference.', line: 6
  });
}

export function createMockMeetingRecordings() {
  const store = memoryStore();
  seed(store);
  return {
    matches(url: string): boolean {
      return url.startsWith('/api/meeting-recordings') || url.startsWith('/api/people-said');
    },
    async handle(method: string, url: string, headers: Record<string, string>, raw: Buffer): Promise<Response> {
      const request = new Request(`http://localhost${url}`, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' || !raw.length ? undefined : new Uint8Array(raw)
      });
      if (url.startsWith('/api/people-said')) return handlePeopleSaid(request, { store }) as Promise<Response>;
      return handleBrowser(request, { store, invokeWriteup: async () => true }) as Promise<Response>;
    }
  };
}

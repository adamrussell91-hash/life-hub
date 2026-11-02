import { renderBlock } from '@/blocks/render';
import { BlockSchema, type Block } from '@/schemas/block';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import '../styles/app.css';

/**
 * Voice block preview with an in-page fake server and a fake microphone (a
 * quiet tone), so the whole loop runs without Netlify: record, send, mark,
 * return, read. ?view=student (default) or ?view=teacher. Invented data only.
 */

const codes: FeedbackCode[] = [
  { id: 'comp_ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with a clear concept that answers the question.' },
  { id: 'comp_ar', code: 'AR', label: 'Analysis – relevance', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Answer this question directly.' },
  { id: 'comp_e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Use relevant, accurate evidence.' },
  { id: 'comp_t', code: 'T', label: 'Techniques', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Name a technique and explain its effect.' },
  { id: 'comp_ex', code: 'EX', label: 'Expression', group: 'composition', criterion: 3, colour: 'gold', descriptor: 'Choose precise language.' },
  { id: 'viva_pp', code: 'PP', label: 'Pre-prepared', group: 'viva', criterion: 1, colour: 'lilac', descriptor: 'Respond to the question asked.' },
  { id: 'speak_fw', code: 'FW', label: 'Filler word', group: 'speaking', criterion: null, colour: 'peach', descriptor: 'Filler word. Try a short silent pause instead.', key: '1' },
  { id: 'speak_pf', code: 'PF', label: 'Pace – too fast', group: 'speaking', criterion: null, colour: 'peach', descriptor: 'Slow down so the idea lands.', key: '2' },
  { id: 'speak_pa', code: 'PA', label: 'Pause', group: 'speaking', criterion: null, colour: 'peach', descriptor: 'Use a deliberate pause.', key: '4', strength_descriptor: 'Well-placed pause.' }
];

const SAMPLE = 'So, um, the composer represents isolation as, like, a kind of silence that grows. In the second stanza the enjambment, you know, pulls us forward, which shows how the speaker can’t stop thinking. Basically the final image of the empty harbour links back to the question.';

function sampleWhisper(duration: number) {
  const words = SAMPLE.split(' ');
  const step = duration / words.length;
  return { text: SAMPLE, segments: [{ text: SAMPLE, start: 0, end: duration, words: words.map((word, i) => ({ word, start: i * step, end: i * step + step * 0.8 })) }] };
}

type Sub = Record<string, unknown> & { id: string; status: string; tags: unknown[]; comment: string; duration_s: number; audio_url: string };
let submission: Sub | null = null;

const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });

function mine() {
  if (!submission) return { submitted: false };
  const base = { submitted: true, initials: submission.initials, submitted_at: submission.submitted_at, duration_s: submission.duration_s, status: submission.status === 'returned' ? 'returned' : 'waiting', audio_url: submission.audio_url, audio_deleted: false, audio_delete_after: submission.audio_delete_after };
  if (submission.status !== 'returned') return base;
  return { ...base, points: submission.points, transcript: submission.transcript, tags: (submission.tags as Array<{ confirmed?: boolean }>).filter((t) => t.confirmed !== false), comment: submission.comment, codes };
}

// ?seed=1 starts with a long marked-length take, so the teacher view can be scrolled without recording first.
if (new URLSearchParams(location.search).has('seed')) {
  const now = new Date();
  const long = Array(8).fill(SAMPLE).join(' ');
  const words = long.split(' ');
  submission = {
    id: 'vs_demo', initials: 'JS', device_hash: 'a1b2c3', submitted_at: now.toISOString(),
    audio_delete_after: new Date(now.getTime() + 28 * 86400_000).toISOString(), duration_s: 120, status: 'new',
    transcript_status: 'done', points: [], prompt: 'How does the composer represent isolation?', tags: [], comment: '', audio_url: '', audio_deleted: false,
    transcript: { text: long, segments: [{ text: long, start: 0, end: 120, words: words.map((word, i) => ({ word, start: (i * 120) / words.length, end: ((i + 0.8) * 120) / words.length })) }] }
  };
}

let lastBlob: Blob | null = null;
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const path = url.pathname;
  const method = (init?.method ?? 'GET').toUpperCase();
  if (path === '/api/feedback-codes') return ok({ codes });
  if (path.endsWith('/part')) {
    lastBlob = (init?.body as FormData).get('file') as Blob;
    return ok({ index: 0 });
  }
  if (path.startsWith('/api/published/voice/')) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.action === 'submit') {
      const now = new Date();
      submission = {
        id: 'vs_demo',
        initials: body.initials,
        device_hash: 'a1b2c3',
        submitted_at: now.toISOString(),
        audio_delete_after: new Date(now.getTime() + 28 * 86400_000).toISOString(),
        duration_s: body.duration_s,
        status: 'new',
        transcript_status: 'done',
        transcript: sampleWhisper(body.duration_s),
        points: body.points,
        prompt: 'How does the composer represent isolation?',
        tags: [],
        comment: '',
        audio_url: lastBlob ? URL.createObjectURL(lastBlob) : '',
        audio_deleted: false
      };
    }
    return ok(mine());
  }
  if (path.startsWith('/api/voice/')) {
    const parts = path.split('/').slice(3);
    if (parts.length === 2) return ok({ submissions: submission ? [{ ...submission, tag_count: submission.tags.length }] : [], transcribing: false });
    if (parts[3] === 'return') {
      submission!.status = 'returned';
      return ok(submission);
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      submission = { ...submission!, ...body, status: submission!.status === 'new' ? 'marked' : submission!.status };
      return ok(submission);
    }
    if (method === 'DELETE') {
      submission = null;
      return ok({});
    }
    return ok(submission);
  }
  return realFetch(input, init);
};

// A fake microphone: a quiet tone, so MediaRecorder has something to record.
if (navigator.mediaDevices) {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    return dest.stream;
  };
}

const block = BlockSchema.parse({
  id: 'viva1',
  type: 'block',
  block_type: 'audio',
  variant: 'medium',
  visibility: 'student_teacher',
  content: {
    url: '',
    mode: 'viva',
    prompt: 'Explain how the composer represents the human experience of isolation.',
    time_limit_s: 30,
    scaffold: [{ label: 'Concept', weight: 1 }, { label: 'Evidence and technique', weight: 2 }, { label: 'Link back', weight: 1 }]
  },
  settings: {
    deep_step: { du: 'du_demo01', step: '3' },
    deep_checks: ['Names two texts by title', 'Names the move both texts make', 'Says what each text does differently with it']
  },
  created_at: '2026-10-21T00:00:00.000Z',
  updated_at: '2026-10-21T00:00:00.000Z',
  schema_version: 1
}) as Block;

const mount = document.getElementById('mount')!;
const nav = document.createElement('p');
nav.innerHTML = '<a href="?view=student">Student</a> · <a href="?view=teacher">Teacher</a>';
const view = new URLSearchParams(location.search).get('view') === 'teacher' ? 'teacher' : 'student';
(window as unknown as { voiceRerender: (v: 'student' | 'teacher') => void }).voiceRerender = (v) => {
  mount.replaceChildren(nav, renderBlock(block, v, { lessonId: 'lesson_demo' }));
};
mount.replaceChildren(nav, renderBlock(block, view, { lessonId: 'lesson_demo' }));

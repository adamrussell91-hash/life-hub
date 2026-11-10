import { renderBlock } from '@/blocks/render';
import { createExplainerEditor } from '@/blocks/explainer';
import { filterBlocksForStudent } from '@/blocks/visibility';
import type { Block, ExplainerBlock } from '@/schemas/block';
import { sampleExplainer } from './explainer-sample';
import '../styles/app.css';

/**
 * Explainer preview with an in-page fake server and a fake microphone (a
 * quiet tone), so record → upload → captions → timeline → play runs without
 * Netlify. ?view=editor (default), ?view=teacher or ?view=student. Invented text only.
 */

/** A short quiet tone as a WAV, so the sample clips have real audio to play. */
function toneUrl(seconds: number, hz: number): string {
  const rate = 8000;
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * hz * i) / rate) * 900, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const SPOKEN = 'Here I keep the idea that proves my point and cross out the rest of my notes.';
let lastBlob: Blob | null = null;
const jobs = new Map<string, number>();
let jobSeq = 0;

const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const path = url.pathname;
  if (path === '/api/annotation/voice/part') {
    lastBlob = (init?.body as FormData).get('file') as Blob;
    return ok({ index: 0 });
  }
  if (path === '/api/annotation/voice/transcribe') {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const id = `job_${++jobSeq}`;
    jobs.set(id, Number(body.duration_s) || 5);
    const media = { id: `media_${jobSeq}`, preview_url: lastBlob ? URL.createObjectURL(lastBlob) : '', mime_type: body.mime };
    return ok({ id, media });
  }
  if (path.startsWith('/api/ai/jobs/')) {
    const id = path.split('/').pop()!;
    const duration = jobs.get(id) ?? 5;
    const words = SPOKEN.split(' ');
    const step = duration / words.length;
    return ok({ id, status: 'done', result: { whisper: { text: SPOKEN, segments: [{ text: SPOKEN, start: 0, end: duration, words: words.map((word, i) => ({ word, start: i * step, end: i * step + step * 0.8 })) }] } } });
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

const params = new URLSearchParams(location.search);
const view = params.get('view') === 'student' ? 'student' : params.get('view') === 'teacher' ? 'teacher' : 'editor';
let block: ExplainerBlock = sampleExplainer({ status: params.has('draft') ? 'draft' : 'published', urls: [toneUrl(22, 220), toneUrl(18, 330)] });

const mount = document.getElementById('mount')!;
const nav = document.createElement('p');
const link = (v: string) => {
  const q = new URLSearchParams(location.search);
  q.set('view', v);
  return `?${q}`;
};
nav.innerHTML = `<a href="${link('editor')}">Editor</a> · <a href="${link('teacher')}">Teacher</a> · <a href="${link('student')}">Student</a> · <a href="?view=editor&amp;blank=1">Blank editor</a>`;

if (params.has('blank')) {
  block = { ...block, content: { layout: 'text', tray: block.content.tray, text: block.content.text, title: 'A new explainer' } };
}

if (view === 'editor') {
  const panel = document.createElement('pre');
  panel.style.cssText = 'font-size:11px;max-height:12rem;overflow:auto;background:#f4f4f4;padding:8px';
  const editor = createExplainerEditor(block, (next) => {
    block = next;
    panel.textContent = JSON.stringify(next.content.recording?.events.map((e) => [e.t, e.kind, e.id]) ?? [], null, 0);
  }, { lessonId: 'lesson_demo', countdownMs: 400, transcribeWaitMs: 3000 });
  mount.replaceChildren(nav, editor, panel);
} else {
  const shown = view === 'student' ? (filterBlocksForStudent([block as Block])[0] as Block) : (block as Block);
  mount.replaceChildren(nav, renderBlock(shown, view, { lessonId: 'lesson_demo' }));
}

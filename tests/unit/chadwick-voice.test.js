import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildChadwickCuePlaylist,
  createChadwickVoiceController
} from '../../apps/life/js/app/chadwick-voice.js';

const session = () => ({
  date: '2026-09-06',
  path: 'data/fitness/2026/09/chest.md',
  title: 'Chest and arms',
  status: 'planned',
  exercises: [
    {
      name: 'Bench press',
      sets: [{}, {}, {}],
      coach_cues: {
        start: 'Bro, chest up and own it.',
        rest: 'Breathe, big guy.',
        final_set: 'Last set. Make it magnificent.'
      }
    },
    {
      name: 'Cable curl',
      sets: [{}],
      coach_cues: { start: 'Time to inflate those sleeves, legend.' }
    }
  ]
});

class FakeAudio {
  constructor() {
    this.src = '';
    this.muted = false;
    this.paused = true;
    this.listeners = new Map();
    this.playCalls = 0;
    this.pauseCalls = 0;
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  async play() { this.paused = false; this.playCalls += 1; }
  pause() { this.paused = true; this.pauseCalls += 1; }
  emit(type) { this.listeners.get(type)?.(); }
}

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return value; } };
}

function readyState(cues) {
  return {
    job: { status: 'completed', message: 'Chadwick is ready.', completed: cues.length, total: cues.length },
    profile: { candidate_number: 6 },
    clips: cues.map((cue, index) => ({
      cue_id: cue.id,
      text: cue.text,
      wav_url: `/life-hub/audio/${String(index + 1).padStart(32, '0')}.wav`
    }))
  };
}

test('buildChadwickCuePlaylist keeps workout order and repeats rest cues where they occur', () => {
  const cues = buildChadwickCuePlaylist(session());
  assert.deepEqual(cues.map(cue => cue.kind), ['start', 'rest', 'rest', 'final_set', 'start']);
  assert.deepEqual(cues.map(cue => cue.exercise), ['Bench press', 'Bench press', 'Bench press', 'Bench press', 'Cable curl']);
  assert.equal(cues[1].text, 'Breathe, big guy.');
  assert.equal(cues[2].text, 'Breathe, big guy.');
  assert.notEqual(cues[1].id, cues[2].id);
});

test('controller prepares the full playlist and plays, skips, and advances clips', async () => {
  const calls = [];
  let audio;
  const cues = buildChadwickCuePlaylist(session());
  const controller = createChadwickVoiceController({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(readyState(cues), 202);
    },
    AudioCtor: class extends FakeAudio { constructor() { super(); audio = this; } },
    storage: { getItem: () => null, setItem() {} },
    baseUrl: 'http://127.0.0.1:8765'
  });

  await controller.prepare(session());
  assert.equal(controller.getState().status, 'ready');
  assert.equal(controller.getState().clips.length, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/api/life-hub/prepare');
  assert.equal(JSON.parse(calls[0].options.body).session_id, session().path);

  await controller.play();
  assert.equal(controller.getState().status, 'playing');
  assert.match(audio.src, /\/life-hub\/audio\/0{31}1\.wav$/);
  controller.skip();
  assert.equal(controller.getState().index, 1);
  assert.match(audio.src, /0{31}2\.wav$/);
  audio.emit('ended');
  assert.equal(controller.getState().index, 2);
  assert.match(audio.src, /0{31}3\.wav$/);
});

test('controller polls preparation, remembers mute, and avoids duplicate session jobs', async () => {
  const stored = new Map();
  let requests = 0;
  const cues = buildChadwickCuePlaylist(session());
  const controller = createChadwickVoiceController({
    fetchImpl: async (url) => {
      requests += 1;
      if (url.endsWith('/prepare')) {
        return response({ job: { status: 'loading', message: 'Loading', completed: 0, total: cues.length }, clips: [] }, 202);
      }
      return response(readyState(cues));
    },
    AudioCtor: FakeAudio,
    storage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value)
    },
    delay: async () => {},
    baseUrl: 'http://127.0.0.1:8765'
  });

  await controller.prepare(session());
  assert.equal(requests, 2);
  await controller.prepare(session());
  assert.equal(requests, 2, 'the same ready workout is not submitted again');
  controller.toggleMute();
  assert.equal(controller.getState().muted, true);
  assert.equal(stored.get('life-hub:chadwick-voice-muted'), '1');
});

test('controller reports a missing local companion without breaking the workout', async () => {
  const controller = createChadwickVoiceController({
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
    AudioCtor: FakeAudio,
    storage: { getItem: () => null, setItem() {} }
  });
  await controller.prepare(session());
  assert.equal(controller.getState().status, 'unavailable');
  assert.match(controller.getState().message, /local voice companion/i);
});

test('the Life Hub shell publishes the voice player and caches its module', async () => {
  const [html, worker] = await Promise.all([
    readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="chadwick-voice"/);
  assert.match(worker, /js\/app\/chadwick-voice\.js/);
});

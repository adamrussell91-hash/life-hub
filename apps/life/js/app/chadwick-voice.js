const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
const MUTED_KEY = 'life-hub:chadwick-voice-muted';
const ACTIVE = new Set(['loading', 'generating']);

const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function buildChadwickCuePlaylist(session) {
  const cues = [];
  for (const [exerciseIndex, exercise] of (session?.exercises ?? []).entries()) {
    const name = compact(exercise?.name) || `Exercise ${exerciseIndex + 1}`;
    const coach = exercise?.coach_cues ?? {};
    const start = compact(coach.start);
    if (start) {
      cues.push({ id: `exercise-${exerciseIndex + 1}:start`, text: start, kind: 'start', exercise: name });
    }

    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const final = setIndex === sets.length - 1;
      const text = compact(final ? coach.final_set : coach.rest);
      if (!text) continue;
      cues.push({
        id: `exercise-${exerciseIndex + 1}:${final ? 'final-set' : `rest-${setIndex + 1}`}`,
        text,
        kind: final ? 'final_set' : 'rest',
        exercise: name
      });
    }
  }
  return cues;
}

function renderControls(root, state, actions) {
  const host = root?.querySelector?.('#chadwick-voice');
  if (!host) return;
  host.replaceChildren();
  if (!state.visible || state.status === 'empty') {
    host.setAttribute?.('hidden', '');
    return;
  }
  host.removeAttribute?.('hidden');

  const head = root.createElement('div');
  head.className = 'chadwick-voice__head';
  const identity = root.createElement('div');
  const eyebrow = root.createElement('span');
  eyebrow.className = 'chadwick-voice__eyebrow';
  eyebrow.textContent = 'CHADWICK VOICE';
  const title = root.createElement('strong');
  title.textContent = 'Candidate 6';
  identity.append(eyebrow, title);
  const signal = root.createElement('span');
  signal.className = 'chadwick-voice__signal';
  signal.dataset.state = state.status;
  signal.setAttribute?.('aria-hidden', 'true');
  head.append(identity, signal);

  const status = root.createElement('p');
  status.className = 'chadwick-voice__status';
  status.dataset.chadwickVoice = 'status';
  status.setAttribute?.('aria-live', 'polite');
  status.textContent = state.message;

  const controls = root.createElement('div');
  controls.className = 'chadwick-voice__controls';
  const play = root.createElement('button');
  play.type = 'button';
  play.className = 'chadwick-voice__primary';
  play.dataset.chadwickVoice = state.status === 'playing' ? 'pause' : 'play';
  play.textContent = state.status === 'playing' ? 'Pause voice' : 'Play voice';
  play.disabled = !['ready', 'paused', 'playing'].includes(state.status) || state.muted;
  play.addEventListener('click', () => state.status === 'playing' ? actions.pause() : void actions.play());

  const skip = root.createElement('button');
  skip.type = 'button';
  skip.className = 'chadwick-voice__button';
  skip.dataset.chadwickVoice = 'skip';
  skip.textContent = 'Skip';
  skip.disabled = !['ready', 'paused', 'playing'].includes(state.status) || state.clips.length < 2;
  skip.addEventListener('click', actions.skip);

  const mute = root.createElement('button');
  mute.type = 'button';
  mute.className = 'chadwick-voice__button';
  mute.dataset.chadwickVoice = 'mute';
  mute.textContent = state.muted ? 'Unmute' : 'Mute';
  mute.setAttribute?.('aria-pressed', String(state.muted));
  mute.addEventListener('click', actions.toggleMute);
  controls.append(play, skip, mute);

  if (['unavailable', 'error', 'cancelled'].includes(state.status)) {
    const retry = root.createElement('button');
    retry.type = 'button';
    retry.className = 'chadwick-voice__button';
    retry.dataset.chadwickVoice = 'retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => void actions.retry());
    controls.append(retry);
  }
  host.append(head, status, controls);
}

export function createChadwickVoiceController({
  root,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  AudioCtor = globalThis.Audio,
  storage = globalThis.localStorage,
  baseUrl = DEFAULT_BASE_URL,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof AudioCtor !== 'function') {
    throw new TypeError('Chadwick voice playback is unavailable');
  }
  const audio = new AudioCtor();
  let lastSession = null;
  let prepareRun = 0;
  let state = {
    visible: false,
    status: 'idle',
    message: 'Checking the local voice companion…',
    sessionId: null,
    cues: [],
    clips: [],
    index: 0,
    muted: storage?.getItem?.(MUTED_KEY) === '1'
  };
  audio.muted = state.muted;

  const actions = {
    play,
    pause,
    skip,
    toggleMute,
    retry: () => lastSession ? prepare(lastSession, { force: true }) : Promise.resolve()
  };

  function publish(patch = {}) {
    state = { ...state, ...patch };
    renderControls(root, state, actions);
  }

  function getState() {
    return { ...state, cues: [...state.cues], clips: [...state.clips] };
  }

  async function fetchJson(path, options) {
    const response = await fetchImpl(`${baseUrl}${path}`, options);
    let value = null;
    try { value = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
      throw new Error(value?.error || `Local voice request failed (${response.status}).`);
    }
    return value;
  }

  function applyReady(value, cues) {
    const byId = new Map((value?.clips ?? []).map(clip => [clip.cue_id, clip]));
    const clips = cues.map(cue => {
      const clip = byId.get(cue.id);
      return clip && { ...cue, ...clip, url: new URL(clip.wav_url, baseUrl).href };
    }).filter(Boolean);
    if (clips.length !== cues.length) throw new Error('The local voice playlist is incomplete. Try again.');
    publish({
      status: 'ready',
      message: `${clips.length} Chadwick cues ready · Candidate 6`,
      clips,
      index: 0
    });
  }

  async function prepare(session, { force = false } = {}) {
    const cues = buildChadwickCuePlaylist(session);
    const sessionId = compact(session?.path) || `${compact(session?.date)}:${compact(session?.title)}`;
    lastSession = session;
    publish({ visible: true });
    if (!cues.length || !sessionId) {
      publish({ status: 'empty', message: 'No spoken Chadwick cues in this workout.', cues: [], clips: [] });
      return;
    }
    if (!force && state.sessionId === sessionId && ['preparing', 'ready', 'playing', 'paused'].includes(state.status)) {
      return;
    }
    const run = ++prepareRun;
    audio.pause();
    publish({
      status: 'preparing',
      message: 'Preparing Chadwick’s workout cues…',
      sessionId,
      cues,
      clips: [],
      index: 0
    });
    try {
      let value = await fetchJson('/api/life-hub/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chadwick-Voice': '1' },
        body: JSON.stringify({
          session_id: sessionId,
          cues: cues.map(({ id, text }) => ({ id, text }))
        })
      });
      for (let poll = 0; ACTIVE.has(value?.job?.status) && poll < 480; poll += 1) {
        if (run !== prepareRun) return;
        publish({
          status: 'preparing',
          message: value.job.message || `Preparing ${value.job.completed ?? 0} of ${value.job.total ?? cues.length} cues…`
        });
        await delay(750);
        value = await fetchJson('/api/life-hub/state');
      }
      if (run !== prepareRun) return;
      if (value?.job?.session_id && value.job.session_id !== sessionId) {
        throw new Error('The local companion prepared a different workout. Try again.');
      }
      if (value?.job?.status !== 'completed') {
        throw new Error(value?.job?.error || value?.job?.message || 'Chadwick voice preparation stopped.');
      }
      applyReady(value, cues);
    } catch (error) {
      if (run !== prepareRun) return;
      const unavailable = error instanceof TypeError || /failed to fetch|networkerror/i.test(String(error?.message));
      publish({
        status: unavailable ? 'unavailable' : 'error',
        message: unavailable
          ? 'Start the local voice companion to hear Candidate 6.'
          : (error?.message || 'Chadwick voice preparation failed.'),
        clips: []
      });
    }
  }

  function loadCurrent({ autoplay = false } = {}) {
    const clip = state.clips[state.index];
    if (!clip) return;
    audio.src = clip.url;
    if (autoplay && !state.muted) {
      publish({ status: 'playing', message: `${clip.exercise} · ${state.index + 1} of ${state.clips.length}` });
      const started = audio.play();
      started?.catch?.(() => publish({ status: 'paused', message: 'Press play to continue Chadwick.' }));
    } else {
      publish({ status: 'ready', message: `${clip.exercise} · ${state.index + 1} of ${state.clips.length}` });
    }
  }

  async function play() {
    if (!state.clips.length || state.muted) return;
    const clip = state.clips[state.index] ?? state.clips[0];
    if (audio.src !== clip.url) audio.src = clip.url;
    publish({ status: 'playing', message: `${clip.exercise} · ${state.index + 1} of ${state.clips.length}` });
    try {
      await audio.play();
    } catch {
      publish({ status: 'paused', message: 'Press play to continue Chadwick.' });
    }
  }

  function pause() {
    audio.pause();
    if (state.clips.length) publish({ status: 'paused', message: 'Chadwick paused.' });
  }

  function skip() {
    if (!state.clips.length) return;
    const wasPlaying = state.status === 'playing';
    audio.pause();
    publish({ index: (state.index + 1) % state.clips.length });
    loadCurrent({ autoplay: wasPlaying });
  }

  function toggleMute() {
    const muted = !state.muted;
    audio.muted = muted;
    storage?.setItem?.(MUTED_KEY, muted ? '1' : '0');
    if (muted && state.status === 'playing') audio.pause();
    publish({
      muted,
      status: muted && state.status === 'playing' ? 'paused' : state.status,
      message: muted ? 'Chadwick muted.' : (state.clips.length ? 'Chadwick ready.' : state.message)
    });
  }

  function hide() {
    prepareRun += 1;
    audio.pause();
    publish({ visible: false, status: 'idle', sessionId: null, cues: [], clips: [], index: 0 });
  }

  audio.addEventListener('ended', () => {
    if (state.status !== 'playing' || !state.clips.length) return;
    if (state.index >= state.clips.length - 1) {
      audio.pause();
      publish({ status: 'ready', index: 0, message: 'Workout voice complete · ready to replay' });
      return;
    }
    publish({ index: state.index + 1 });
    loadCurrent({ autoplay: true });
  });
  audio.addEventListener('error', () => {
    publish({ status: 'error', message: 'That Chadwick cue could not play. Try again.' });
  });

  return { prepare, play, pause, skip, toggleMute, hide, getState };
}

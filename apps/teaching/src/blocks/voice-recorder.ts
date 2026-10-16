/**
 * Annotation voice recorder (4b). DOM + MediaRecorder; no network helpers beyond upload.
 */
import { askConfirmCard, askTextCard } from '@/teacher/confirm-dialog';
import { getApiBaseUrl } from '@/api/config';
import { pollAiJob } from '@/ai/jobs-client';
import { createLiveCaptions } from '@/blocks/voice-live-captions';
import {
  audioExtension,
  createDraftWriter,
  downloadBlob,
  listVoiceDrafts,
  voiceDraftAudio,
  voiceDraftBackend,
  type VoiceDraftMeta
} from '@/blocks/voice-draft-store';
import type { VoiceWord } from '@/blocks/voice-transcript';
import { parseWhisperTimings } from '@/blocks/voice-transcript';
import type { AnnotationAnchor, AnnotationVoiceTrack } from '@/schemas/block';
import type { VoiceTap } from '@/blocks/voice-match';

export type VoiceRecorderKind = 'reading' | 'think_aloud';

export type VoiceRecorderHandle = {
  el: HTMLElement;
  /** Push a tap at the current elapsed media time (while recording or paused). */
  pushTap: (anchor: AnnotationAnchor) => void;
  isCapturing: () => boolean;
  dispose: () => void;
};

export type MountVoiceRecorderOptions = {
  layerId: string;
  lessonId?: string;
  /** How long to wait for the Whisper job before using live captions (ms). */
  transcribeWaitMs?: number;
  /** Prefill kind; title is asked before first Record. */
  defaultKind?: VoiceRecorderKind;
  onTrackReady: (track: AnnotationVoiceTrack) => void;
  onCancel: () => void;
};

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/** Netlify drops bodies over 6 MB before the function runs; stay well under. */
export const VOICE_PART_BYTES = 4 * 1024 * 1024;

type StartedJob = {
  jobId: string;
  media: { id: string; preview_url?: string; download_url?: string; mime_type?: string };
};

async function postJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...init,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) }
  });
  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: T; error?: { message?: string } }
    | null;
  if (!response.ok || !body?.ok || !body.data) {
    throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  }
  return body.data;
}

async function withRetry<T>(job: () => Promise<T>, tries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      return await job();
    } catch (error) {
      lastError = error;
      if (attempt < tries - 1) await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed');
}

/**
 * Upload in ≤4 MB parts, then ask the server to join them and queue
 * transcription. Any length works; each part retries on its own.
 */
export async function uploadVoiceRecording(input: {
  blob: Blob;
  mime: string;
  title: string;
  trackId: string;
  lessonId?: string;
  duration_s: number;
  onProgress?: (sent: number, total: number) => void;
}): Promise<StartedJob> {
  const uploadId = `${input.trackId}_${Math.random().toString(36).slice(2, 8)}`;
  const total = Math.max(1, Math.ceil(input.blob.size / VOICE_PART_BYTES));
  for (let index = 0; index < total; index += 1) {
    const part = input.blob.slice(index * VOICE_PART_BYTES, (index + 1) * VOICE_PART_BYTES);
    await withRetry(() => {
      const form = new FormData();
      form.append('upload_id', uploadId);
      form.append('index', String(index));
      form.append('file', part, `part-${index}`);
      return postJson('/api/annotation/voice/part', { method: 'POST', body: form });
    });
    input.onProgress?.(index + 1, total);
  }
  const data = await withRetry(() =>
    postJson<{ id: string; media: StartedJob['media'] }>('/api/annotation/voice/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        upload_id: uploadId,
        parts: total,
        mime: input.mime,
        title: input.title,
        track_id: input.trackId,
        duration_s: input.duration_s,
        ...(input.lessonId ? { lesson_id: input.lessonId } : {})
      })
    })
  );
  return { jobId: data.id, media: data.media };
}

function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const finish = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => finish(audio.duration), { once: true });
    audio.addEventListener('error', () => finish(0), { once: true });
    window.setTimeout(() => finish(0), 8000);
    audio.src = url;
  });
}

/**
 * Mount Record / Pause / Stop UI with level meter, kind pills, and tap capture.
 * Calls onTrackReady with a draft track once transcription finishes (or with empty words on failure after upload).
 */
export function mountVoiceRecorder(options: MountVoiceRecorderOptions): VoiceRecorderHandle {
  const el = document.createElement('aside');
  el.className = 'block-editor__annotation-voice-recorder';
  el.setAttribute('aria-label', 'Voice recorder');

  const header = document.createElement('div');
  header.className = 'block-editor__annotation-voice-header';
  const heading = document.createElement('h3');
  heading.className = 'block-editor__annotation-note-title';
  heading.textContent = 'Record';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost block-editor__annotation-voice-close';
  closeBtn.textContent = 'Close';
  header.append(heading, closeBtn);

  const status = document.createElement('p');
  status.className = 'block-editor__hint block-editor__annotation-voice-status';
  status.setAttribute('aria-live', 'polite');
  const kindHint = (value: VoiceRecorderKind) =>
    value === 'think_aloud'
      ? 'Think aloud: talk about the poem, and tap a line each time you move on to it. Each tap starts a clip pinned to that line.'
      : 'Reading: read the poem aloud. Lines are matched to your voice; tap a line to pin it exactly.';
  status.textContent = `Pick a kind, then Record. ${kindHint(options.defaultKind ?? 'reading')}`;

  const kindRow = document.createElement('div');
  kindRow.className = 'block-editor__annotation-voice-kinds';
  kindRow.setAttribute('role', 'group');
  kindRow.setAttribute('aria-label', 'Recording kind');

  let kind: VoiceRecorderKind = options.defaultKind ?? 'reading';
  const kindDefs: Array<{ value: VoiceRecorderKind; label: string }> = [
    { value: 'reading', label: 'Reading' },
    { value: 'think_aloud', label: 'Think aloud' }
  ];
  const kindButtons = new Map<VoiceRecorderKind, HTMLButtonElement>();
  for (const def of kindDefs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary block-editor__annotation-voice-kind';
    btn.textContent = def.label;
    btn.setAttribute('aria-pressed', def.value === kind ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (recording || paused) return;
      kind = def.value;
      for (const [value, other] of kindButtons) {
        other.setAttribute('aria-pressed', value === kind ? 'true' : 'false');
      }
      status.textContent = kindHint(kind);
    });
    kindButtons.set(def.value, btn);
    kindRow.append(btn);
  }

  const meter = document.createElement('div');
  meter.className = 'block-editor__annotation-voice-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Input level');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  const meterFill = document.createElement('span');
  meterFill.className = 'block-editor__annotation-voice-meter-fill';
  meter.append(meterFill);

  const elapsedEl = document.createElement('p');
  elapsedEl.className = 'block-editor__annotation-voice-elapsed';
  elapsedEl.textContent = '0:00';

  const actions = document.createElement('div');
  actions.className = 'block-editor__annotation-voice-actions';

  const recordBtn = document.createElement('button');
  recordBtn.type = 'button';
  recordBtn.className = 'btn btn--primary';
  recordBtn.textContent = 'Record';

  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'btn btn--secondary';
  pauseBtn.textContent = 'Pause';
  pauseBtn.disabled = true;

  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'btn btn--secondary';
  stopBtn.textContent = 'Stop';
  stopBtn.disabled = true;

  actions.append(recordBtn, pauseBtn, stopBtn);

  const live = document.createElement('div');
  live.className = 'block-editor__annotation-voice-live';
  live.hidden = true;
  const liveLabel = document.createElement('p');
  liveLabel.className = 'block-editor__annotation-voice-live-label';
  liveLabel.textContent = 'Live captions';
  const liveText = document.createElement('p');
  liveText.className = 'block-editor__annotation-voice-live-text';
  liveText.setAttribute('aria-live', 'off');
  const liveFinal = document.createElement('span');
  const liveInterim = document.createElement('span');
  liveInterim.className = 'block-editor__annotation-voice-live-interim';
  liveText.append(liveFinal, liveInterim);
  live.append(liveLabel, liveText);

  const pinsWrap = document.createElement('div');
  pinsWrap.className = 'block-editor__annotation-voice-pins';
  pinsWrap.hidden = true;
  const pinsLabel = document.createElement('p');
  pinsLabel.className = 'block-editor__annotation-voice-live-label';
  const pinsList = document.createElement('ol');
  pinsList.className = 'block-editor__annotation-voice-pin-list';
  pinsWrap.append(pinsLabel, pinsList);

  const useLiveBtn = document.createElement('button');
  useLiveBtn.type = 'button';
  useLiveBtn.className = 'btn btn--secondary block-editor__annotation-voice-use-live';
  useLiveBtn.textContent = 'Use live captions now';
  useLiveBtn.hidden = true;

  // When an upload fails the audio stays on this device; these get it out.
  const rescue = document.createElement('div');
  rescue.className = 'block-editor__annotation-voice-actions block-editor__annotation-voice-rescue';
  rescue.hidden = true;
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn btn--primary';
  retryBtn.textContent = 'Try upload again';
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'btn btn--secondary';
  downloadBtn.textContent = 'Download audio';
  rescue.append(retryBtn, downloadBtn);

  // Recordings that never made it into the block (failed upload, refresh, crash).
  const recovered = document.createElement('div');
  recovered.className = 'block-editor__annotation-voice-recovered';
  recovered.hidden = true;

  const importWrap = document.createElement('label');
  importWrap.className = 'block-editor__annotation-voice-import';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'audio/*';
  importInput.className = 'block-editor__annotation-voice-import-input';
  importWrap.append(document.createTextNode('Or add an audio file: '), importInput);

  el.append(header, recovered, status, kindRow, meter, elapsedEl, actions, rescue, live, pinsWrap, useLiveBtn, importWrap);

  let disposed = false;
  let title = '';
  let recording = false;
  let paused = false;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let rafId = 0;
  let chunks: BlobPart[] = [];
  let taps: VoiceTap[] = [];
  let startedAt = 0;
  let accumulatedMs = 0;
  let pauseStartedAt = 0;
  let elapsedTimer = 0;
  let skipWait = false;
  let busyUploading = false;
  let draft: ReturnType<typeof createDraftWriter> | null = null;
  let draftFlushTimer = 0;
  let currentTrackId = '';
  let currentMime = '';
  let lastFailed: { blob: Blob; meta: VoiceDraftMeta } | null = null;

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!recording && !paused && !busyUploading) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  const captions = createLiveCaptions({
    elapsedS: () => elapsedMs() / 1000,
    onText: (finalText, interim) => {
      live.hidden = false;
      // Keep the tail in view: the last ~400 characters.
      const tail = finalText.length > 400 ? `…${finalText.slice(-400)}` : finalText;
      liveFinal.textContent = tail ? `${tail} ` : '';
      liveInterim.textContent = interim;
    },
    onUnavailable: (reason) => {
      live.hidden = false;
      liveFinal.textContent = '';
      liveInterim.textContent = reason;
    }
  });

  function paintPins(): void {
    pinsList.replaceChildren();
    pinsWrap.hidden = taps.length === 0;
    pinsLabel.textContent = `Pins (${taps.length})`;
    taps.forEach((tap, index) => {
      const li = document.createElement('li');
      li.className = 'block-editor__annotation-voice-pin';
      const time = document.createElement('span');
      time.className = 'block-editor__annotation-voice-pin-time';
      time.textContent = formatElapsed(tap.t * 1000);
      const quote = document.createElement('span');
      quote.className = 'block-editor__annotation-voice-pin-quote';
      const exact = tap.anchor.quote?.exact?.trim() ?? '';
      quote.textContent = exact.length > 60 ? `${exact.slice(0, 57)}…` : exact || `Line ${tap.anchor.line ?? ''}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__annotation-voice-pin-remove';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove pin at ${time.textContent}`);
      remove.addEventListener('click', () => {
        taps.splice(index, 1);
        paintPins();
        draft?.update({ taps: taps.map((row) => ({ ...row })) });
      });
      li.append(time, quote, remove);
      pinsList.append(li);
    });
  }

  function elapsedMs(): number {
    if (!recording && !paused) return accumulatedMs;
    if (paused) return accumulatedMs;
    return accumulatedMs + (Date.now() - startedAt);
  }

  function paintElapsed(): void {
    elapsedEl.textContent = formatElapsed(elapsedMs());
  }

  function setBusy(busy: boolean): void {
    recordBtn.disabled = busy || recording || paused;
    pauseBtn.disabled = busy || (!recording && !paused);
    stopBtn.disabled = busy || (!recording && !paused);
    for (const btn of kindButtons.values()) btn.disabled = busy || recording || paused;
  }

  function stopMeter(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    meterFill.style.width = '0%';
    meter.setAttribute('aria-valuenow', '0');
  }

  function tickMeter(): void {
    if (!analyser || disposed) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const sample of data) {
      peak = Math.max(peak, Math.abs(sample - 128));
    }
    const level = Math.min(100, Math.round((peak / 128) * 100));
    meterFill.style.width = `${level}%`;
    meter.setAttribute('aria-valuenow', String(level));
    rafId = requestAnimationFrame(tickMeter);
  }

  function cleanupStream(): void {
    stopMeter();
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = 0;
    }
    mediaRecorder = null;
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) track.stop();
      mediaStream = null;
    }
    if (audioContext) {
      void audioContext.close().catch(() => undefined);
      audioContext = null;
    }
    analyser = null;
    recording = false;
    paused = false;
  }

  function pushTap(anchor: AnnotationAnchor): void {
    if (!recording && !paused) return;
    const t = elapsedMs() / 1000;
    taps.push({ t, anchor: { ...anchor, quote: { ...anchor.quote } } });
    status.textContent = `Pinned at ${formatElapsed(elapsedMs())}.`;
    paintPins();
    draft?.update({ taps: taps.map((tap) => ({ ...tap })) });
  }

  async function ensureTitle(): Promise<string | null> {
    if (title.trim()) return title.trim();
    const asked = await askTextCard({
      title: 'Recording title',
      placeholder: kind === 'think_aloud' ? 'Think aloud' : 'Reading',
      value: kind === 'think_aloud' ? 'Think aloud' : 'Reading'
    });
    if (!asked) return null;
    title = asked.trim();
    return title;
  }

  async function beginRecord(): Promise<void> {
    if (disposed || recording || paused) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Recording is not supported in this browser.';
      return;
    }
    const mime = pickMime();
    if (!mime) {
      status.textContent = 'Recording is not supported in this browser.';
      return;
    }
    const chosenTitle = await ensureTitle();
    if (!chosenTitle) return;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        status.textContent = 'Microphone permission was denied.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        status.textContent = 'No microphone was found.';
      } else {
        status.textContent = 'Could not open the microphone.';
      }
      return;
    }

    chunks = [];
    taps = [];
    paintPins();
    accumulatedMs = 0;
    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      tickMeter();
    } catch {
      // Level meter is optional.
    }

    // 64 kbps is plenty for a voice and keeps a 30-minute take near 15 MB.
    try {
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime, audioBitsPerSecond: 64_000 });
    } catch {
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
    }
    currentTrackId = nextId('voice');
    currentMime = mediaRecorder.mimeType || mime;
    const stamp = new Date().toISOString();
    draft = createDraftWriter({
      id: currentTrackId,
      title: title || 'Voice recording',
      kind,
      layer_id: options.layerId,
      ...(options.lessonId ? { lesson_id: options.lessonId } : {}),
      mime: currentMime,
      started_at: stamp,
      updated_at: stamp,
      duration_s: 0,
      taps: [],
      live_words: []
    });
    draftFlushTimer = window.setInterval(() => {
      draft?.update({ duration_s: elapsedMs() / 1000, live_words: captions.words() });
      void draft?.flush();
    }, 4000);
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        draft?.push(event.data);
      }
    });
    mediaRecorder.addEventListener('stop', () => {
      void finishRecording(currentMime || mime);
    });

    mediaRecorder.start(250);
    recording = true;
    paused = false;
    startedAt = Date.now();
    elapsedTimer = window.setInterval(paintElapsed, 250);
    paintElapsed();
    recordBtn.textContent = 'Recording…';
    setBusy(false);
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    recordBtn.disabled = true;
    captions.start();
    status.textContent =
      kind === 'think_aloud'
        ? 'Recording. Tap a line each time you start talking about it.'
        : 'Recording. Read aloud; tap a line to pin it.';
    if (!captions.supported) {
      live.hidden = false;
      liveInterim.textContent = 'Live captions are not available in this browser. The transcript arrives after you stop.';
    }
  }

  function togglePause(): void {
    if (!mediaRecorder) return;
    if (recording && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      accumulatedMs += Date.now() - startedAt;
      pauseStartedAt = Date.now();
      recording = false;
      paused = true;
      captions.stop();
      stopMeter();
      pauseBtn.textContent = 'Resume';
      status.textContent = 'Paused. Resume or Stop.';
      paintElapsed();
      return;
    }
    if (paused && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      startedAt = Date.now();
      recording = true;
      paused = false;
      captions.start();
      if (analyser) tickMeter();
      pauseBtn.textContent = 'Pause';
      status.textContent = 'Recording. Tap a line to pin it.';
    }
  }

  function requestStop(): void {
    if (!mediaRecorder) return;
    if (recording) {
      accumulatedMs += Date.now() - startedAt;
      recording = false;
    }
    paused = false;
    captions.stop();
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    setBusy(true);
    status.textContent = 'Finishing recording…';
  }

  async function finishRecording(mime: string): Promise<void> {
    const duration_s = Math.max(0.1, accumulatedMs / 1000);
    const blob = new Blob(chunks, { type: mime.split(';')[0] || 'audio/webm' });
    if (draftFlushTimer) {
      window.clearInterval(draftFlushTimer);
      draftFlushTimer = 0;
    }
    const writer = draft;
    draft = null;
    writer?.update({ duration_s, live_words: captions.words(), taps: taps.map((t) => ({ ...t })), finished: true });
    await writer?.flush();
    cleanupStream();
    recordBtn.textContent = 'Record';
    pauseBtn.textContent = 'Pause';
    paintElapsed();

    if (blob.size === 0) {
      status.textContent = 'Nothing was recorded.';
      await voiceDraftBackend().remove(currentTrackId).catch(() => undefined);
      setBusy(false);
      return;
    }
    if (writer?.failed) {
      status.textContent = 'Could not keep a copy on this device, so download the audio if the upload fails.';
    }
    await processRecording({
      blob,
      meta: {
        id: currentTrackId,
        title: title || 'Voice recording',
        kind,
        layer_id: options.layerId,
        ...(options.lessonId ? { lesson_id: options.lessonId } : {}),
        mime,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        duration_s,
        taps: taps.map((t) => ({ ...t })),
        live_words: captions.words(),
        finished: true
      }
    });
  }

  /** Upload, transcribe, hand the track to the block, then drop the device copy. */
  async function processRecording(input: { blob: Blob; meta: VoiceDraftMeta }): Promise<void> {
    const { blob, meta } = input;
    const duration_s = Math.max(0.1, meta.duration_s);
    rescue.hidden = true;
    lastFailed = null;
    busyUploading = true;
    setBusy(true);
    status.textContent = 'Uploading…';

    let started: Awaited<ReturnType<typeof uploadVoiceRecording>>;
    try {
      started = await uploadVoiceRecording({
        blob,
        mime: meta.mime,
        title: meta.title,
        trackId: meta.id,
        lessonId: meta.lesson_id,
        duration_s,
        onProgress: (sent, total) => {
          status.textContent = total > 1 ? `Uploading ${sent} of ${total}…` : 'Uploading…';
        }
      });
    } catch (error) {
      busyUploading = false;
      lastFailed = { blob, meta };
      const reason = error instanceof Error && error.message ? error.message : 'Upload failed.';
      status.textContent = `Upload failed (${reason}). Your recording is kept on this device: try again, or download it.`;
      void voiceDraftBackend()
        .putMeta({ ...meta, last_error: reason, updated_at: new Date().toISOString() })
        .catch(() => undefined);
      rescue.hidden = false;
      setBusy(false);
      return;
    }

    const { jobId, media } = started;
    const url = media.preview_url || media.download_url || `/api/media/${media.id}/file`;
    let words: AnnotationVoiceTrack['transcript']['words'] = [];
    let timing: AnnotationVoiceTrack['transcript']['timing'] = 'estimated';
    const liveWords: VoiceWord[] = meta.live_words ?? [];
    if (liveWords.length > 0) {
      useLiveBtn.hidden = false;
      useLiveBtn.disabled = false;
    }
    skipWait = false;
    const waitStarted = Date.now();
    const deadline = waitStarted + (options.transcribeWaitMs ?? 180_000);
    let note = '';
    while (Date.now() < deadline && !disposed && !skipWait) {
      status.textContent = `Audio saved. Transcribing with Whisper… ${formatElapsed(Date.now() - waitStarted)}`;
      let job: { status: string; result?: { whisper?: unknown }; error?: string };
      try {
        job = (await pollAiJob(jobId)) as typeof job;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      if (job.status === 'done') {
        const parsed = parseWhisperTimings(job.result?.whisper, { duration_s });
        words = parsed.words;
        timing = parsed.timing;
        break;
      }
      if (job.status === 'error') {
        note = job.error?.trim() || 'Whisper could not transcribe this recording.';
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    useLiveBtn.hidden = true;

    if (words.length === 0 && liveWords.length > 0) {
      words = liveWords;
      timing = 'estimated';
      note = note ? `${note} Using the live captions instead.` : 'Using the live captions.';
    } else if (words.length === 0 && !note) {
      note = 'Whisper is still working on this one.';
    }

    const track: AnnotationVoiceTrack = {
      id: meta.id,
      layer_id: options.layerId,
      kind: meta.kind,
      title: meta.title,
      audio: {
        media_id: media.id,
        url,
        duration_s,
        mime: media.mime_type || blob.type || 'audio/webm'
      },
      transcript: { words, timing },
      taps: meta.taps.length > 0 ? meta.taps : undefined,
      clips: [],
      status: 'draft'
    };
    busyUploading = false;
    // The audio is on the server now; the device copy can go once the block has it.
    options.onTrackReady(track);
    await voiceDraftBackend().remove(meta.id).catch(() => undefined);
    if (!disposed) {
      status.textContent =
        words.length > 0
          ? `${note ? `${note} ` : ''}Opening review…`
          : `${note ? `${note} ` : ''}Audio saved; your pins become the clips. Opening review…`;
    }
  }

  function draftLabel(meta: VoiceDraftMeta): string {
    const when = new Date(meta.started_at);
    const day = Number.isNaN(when.getTime())
      ? ''
      : when.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const pins = meta.taps.length ? ` · ${meta.taps.length} pin${meta.taps.length === 1 ? '' : 's'}` : '';
    return `${meta.title} · ${formatElapsed(meta.duration_s * 1000)}${pins}${day ? ` · ${day}` : ''}`;
  }

  async function paintRecovered(): Promise<void> {
    const drafts = await listVoiceDrafts();
    if (disposed) return;
    recovered.replaceChildren();
    const rows = drafts.filter((meta) => meta.id !== currentTrackId || (!recording && !paused && !busyUploading));
    recovered.hidden = rows.length === 0;
    if (rows.length === 0) return;
    const head = document.createElement('p');
    head.className = 'block-editor__annotation-voice-live-label';
    head.textContent = rows.length === 1 ? 'Unsaved recording on this device' : 'Unsaved recordings on this device';
    recovered.append(head);
    for (const meta of rows) {
      const row = document.createElement('div');
      row.className = 'block-editor__annotation-voice-recovered-row';
      row.dataset.draftId = meta.id;
      const label = document.createElement('span');
      label.className = 'block-editor__annotation-voice-recovered-label';
      label.textContent = draftLabel(meta);
      const upload = document.createElement('button');
      upload.type = 'button';
      upload.className = 'btn btn--primary';
      upload.textContent = 'Upload';
      upload.addEventListener('click', async () => {
        const blob = await voiceDraftAudio(meta.id, meta.mime);
        if (blob.size === 0) {
          status.textContent = 'That recording has no audio on this device.';
          return;
        }
        recovered.hidden = true;
        const duration = meta.duration_s > 0 ? meta.duration_s : await audioDuration(blob);
        await processRecording({ blob, meta: { ...meta, duration_s: duration } });
        void paintRecovered();
      });
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'btn btn--secondary';
      download.textContent = 'Download';
      download.addEventListener('click', async () => {
        const blob = await voiceDraftAudio(meta.id, meta.mime);
        downloadBlob(blob, `${meta.title || 'recording'}.${audioExtension(meta.mime)}`);
      });
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.className = 'btn btn--ghost block-editor__annotation-voice-delete';
      discard.textContent = 'Discard';
      discard.addEventListener('click', async () => {
        const ok = await askConfirmCard({
          title: 'Discard this recording?',
          supporting: 'It was never uploaded, so this deletes the only copy.',
          confirmLabel: 'Discard',
          discardLabel: 'Keep it'
        });
        if (!ok) return;
        await voiceDraftBackend().remove(meta.id).catch(() => undefined);
        void paintRecovered();
      });
      row.append(label, upload, download, discard);
      recovered.append(row);
    }
  }

  recordBtn.addEventListener('click', () => {
    void beginRecord();
  });
  pauseBtn.addEventListener('click', () => togglePause());
  retryBtn.addEventListener('click', () => {
    if (lastFailed) void processRecording(lastFailed);
  });
  downloadBtn.addEventListener('click', () => {
    const blob = lastFailed?.blob ?? (chunks.length ? new Blob(chunks, { type: currentMime.split(';')[0] }) : null);
    if (blob) downloadBlob(blob, `${title || 'recording'}.${audioExtension(currentMime || blob.type)}`);
  });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file || recording || paused || busyUploading) return;
    const duration = await audioDuration(file);
    const stamp = new Date().toISOString();
    currentTrackId = nextId('voice');
    await processRecording({
      blob: file,
      meta: {
        id: currentTrackId,
        title: file.name.replace(/\.[^.]+$/, '') || 'Voice recording',
        kind,
        layer_id: options.layerId,
        ...(options.lessonId ? { lesson_id: options.lessonId } : {}),
        mime: file.type || 'audio/mp4',
        started_at: stamp,
        updated_at: stamp,
        duration_s: duration,
        taps: [],
        live_words: [],
        finished: true
      }
    });
  });
  useLiveBtn.addEventListener('click', () => {
    skipWait = true;
    useLiveBtn.disabled = true;
  });
  stopBtn.addEventListener('click', () => requestStop());
  closeBtn.addEventListener('click', () => {
    if (recording || paused) {
      status.textContent = 'Stop the recording before closing.';
      return;
    }
    if (busyUploading) {
      status.textContent = 'Still uploading. Your recording is kept on this device if you close.';
    }
    options.onCancel();
  });

  void paintRecovered();

  return {
    el,
    pushTap,
    isCapturing: () => recording || paused,
    dispose: () => {
      disposed = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (draftFlushTimer) window.clearInterval(draftFlushTimer);
      void draft?.flush();
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {
          // ignore
        }
      }
      captions.dispose();
      cleanupStream();
      el.remove();
    }
  };
}

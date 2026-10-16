/**
 * Annotation voice recorder (4b). DOM + MediaRecorder; no network helpers beyond upload.
 */
import { askTextCard } from '@/teacher/confirm-dialog';
import { getApiBaseUrl } from '@/api/config';
import { pollAiJob } from '@/ai/jobs-client';
import { createLiveCaptions } from '@/blocks/voice-live-captions';
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

async function startTranscriptionJob(input: {
  file: File;
  title: string;
  trackId: string;
  lessonId?: string;
  duration_s: number;
}): Promise<{ jobId: string; media: { id: string; preview_url?: string; download_url?: string; mime_type?: string } }> {
  const form = new FormData();
  form.append('file', input.file, input.file.name);
  form.append('title', input.title);
  form.append('track_id', input.trackId);
  form.append('duration_s', String(input.duration_s));
  if (input.lessonId) form.append('lesson_id', input.lessonId);

  const response = await fetch(`${getApiBaseUrl()}/api/annotation/voice/transcribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: form
  });
  const body = (await response.json()) as {
    ok?: boolean;
    data?: {
      id: string;
      media: { id: string; preview_url?: string; download_url?: string; mime_type?: string };
    };
    error?: { message?: string };
  };
  if (!body.ok || !body.data) {
    throw new Error(body.error?.message ?? `Transcription start failed (${response.status})`);
  }
  return { jobId: body.data.id, media: body.data.media };
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

  el.append(header, status, kindRow, meter, elapsedEl, actions, live, pinsWrap, useLiveBtn);

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

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    mediaRecorder.addEventListener('stop', () => {
      void finishRecording(mime);
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
    cleanupStream();
    recordBtn.textContent = 'Record';
    pauseBtn.textContent = 'Pause';
    paintElapsed();

    if (blob.size === 0) {
      status.textContent = 'Nothing was recorded.';
      setBusy(false);
      return;
    }

    const trackId = nextId('voice');
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `${trackId}.${ext}`, { type: blob.type });

    status.textContent = 'Uploading…';
    setBusy(true);

    try {
      const { jobId, media } = await startTranscriptionJob({
        file,
        title: title || 'Voice recording',
        trackId,
        lessonId: options.lessonId,
        duration_s
      });

      const url = media.preview_url || media.download_url || `/api/media/${media.id}/file`;
      let words: AnnotationVoiceTrack['transcript']['words'] = [];
      let timing: AnnotationVoiceTrack['transcript']['timing'] = 'estimated';

      const liveWords = captions.words();
      if (liveWords.length > 0) {
        useLiveBtn.hidden = false;
        useLiveBtn.disabled = false;
      }
      const waitStarted = Date.now();
      const deadline = waitStarted + (options.transcribeWaitMs ?? 180_000);
      let note = '';
      while (Date.now() < deadline && !disposed && !skipWait) {
        status.textContent = `Transcribing with Whisper… ${formatElapsed(Date.now() - waitStarted)}`;
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

      if (disposed) return;
      if (words.length === 0 && liveWords.length > 0) {
        words = liveWords;
        timing = 'estimated';
        note = note ? `${note} Using the live captions instead.` : 'Using the live captions.';
      } else if (words.length === 0 && !note) {
        note = 'Whisper is still working on this one.';
      }

      const track: AnnotationVoiceTrack = {
        id: trackId,
        layer_id: options.layerId,
        kind,
        title: title || 'Voice recording',
        audio: {
          media_id: media.id,
          url,
          duration_s,
          mime: media.mime_type || blob.type || 'audio/webm'
        },
        transcript: { words, timing },
        taps: taps.length > 0 ? taps : undefined,
        clips: [],
        status: 'draft'
      };
      status.textContent =
        words.length > 0
          ? `${note ? `${note} ` : ''}Opening review…`
          : `${note ? `${note} ` : ''}Audio saved; your pins become the clips. Opening review…`;
      options.onTrackReady(track);
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Upload or transcription failed.';
      setBusy(false);
    }
  }

  recordBtn.addEventListener('click', () => {
    void beginRecord();
  });
  pauseBtn.addEventListener('click', () => togglePause());
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
    options.onCancel();
  });

  return {
    el,
    pushTap,
    isCapturing: () => recording || paused,
    dispose: () => {
      disposed = true;
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

/**
 * Record straight into a block from the microphone. The take goes up through
 * the block's own upload button, so it gets the same checks and the same link
 * as a file picked from the computer.
 */
import { MAX_MEDIA_BYTES } from '@/media/upload-rules';

/** Ten minutes. Some browsers ignore the 64 kbps ask, so the take also stops by size. */
export const MAX_RECORDING_MS = 10 * 60 * 1000;
/** Just under the 10 MB upload limit, leaving room for the last second of audio. */
export const MAX_RECORDING_BYTES = MAX_MEDIA_BYTES - 512 * 1024;

export type AudioRecordButtonOptions = {
  /** Hand the finished take to the upload; resolves once it has finished. */
  upload: (file: File) => Promise<void>;
  /** True once the upload has put the take into the block. */
  uploaded: () => boolean;
  fileTitle?: () => string;
};

export type AudioRecordButtonHandle = {
  el: HTMLElement;
  dispose: () => void;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((mime) =>
    MediaRecorder.isTypeSupported(mime)
  );
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function createAudioRecordButton(options: AudioRecordButtonOptions): AudioRecordButtonHandle {
  const el = document.createElement('div');
  el.className = 'block-editor__record';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary block-editor__record-btn';
  const dot = document.createElement('span');
  dot.className = 'block-editor__record-dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = 'Record';
  button.append(dot, label);

  const status = document.createElement('p');
  status.className = 'block-editor__upload-status';
  status.setAttribute('role', 'status');
  status.hidden = true;

  const rescue = document.createElement('a');
  rescue.className = 'btn btn--ghost block-editor__record-rescue';
  rescue.textContent = 'Download the recording';
  rescue.hidden = true;

  el.append(button, status, rescue);

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let recordedBytes = 0;
  let startedAt = 0;
  let timer = 0;
  let disposed = false;

  const say = (message: string | null) => {
    status.hidden = !message;
    status.textContent = message ?? '';
  };

  function release(): void {
    window.clearInterval(timer);
    timer = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    el.classList.remove('is-recording');
    label.textContent = 'Record';
    button.setAttribute('aria-pressed', 'false');
  }

  async function start(): Promise<void> {
    const mime = pickMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      say('Recording works in Chrome or Safari, or you can upload a file.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      say('Allow the microphone for this site, then press Record again.');
      return;
    }
    if (disposed) {
      release();
      return;
    }
    rescue.hidden = true;
    chunks = [];
    recordedBytes = 0;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
    } catch {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    }
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        recordedBytes += event.data.size;
      }
    });
    recorder.addEventListener('stop', () => void finish(recorder?.mimeType || mime), { once: true });
    recorder.start(1000);
    startedAt = Date.now();
    el.classList.add('is-recording');
    button.setAttribute('aria-pressed', 'true');
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      label.textContent = `Stop · ${clock(elapsed)}`;
      // Stop at the cap, or when the editor closes mid-take (the take still uploads).
      if (
        elapsed >= MAX_RECORDING_MS ||
        recordedBytes >= MAX_RECORDING_BYTES ||
        (elapsed > 1000 && !el.isConnected)
      ) {
        stop();
      }
    };
    tick();
    timer = window.setInterval(tick, 250);
    say('Recording… press Stop when you are done.');
  }

  function stop(): void {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    release();
  }

  async function finish(mime: string): Promise<void> {
    recorder = null;
    const type = mime.split(';')[0] || 'audio/webm';
    const blob = new Blob(chunks, { type });
    chunks = [];
    if (blob.size === 0) {
      say('Nothing was recorded. Check the microphone and try again.');
      return;
    }
    const stamp = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
    const title = options.fileTitle?.().trim() || `Recording ${stamp}`;
    const file = new File([blob], `${title}.${extensionFor(type)}`, { type });
    say(null);
    button.disabled = true;
    try {
      await options.upload(file);
    } finally {
      button.disabled = false;
    }
    if (!options.uploaded()) {
      // The upload button shows why; keep the take so it is never lost.
      rescue.href = URL.createObjectURL(blob);
      rescue.download = file.name;
      rescue.hidden = false;
    }
  }

  button.addEventListener('click', () => {
    if (recorder && recorder.state !== 'inactive') stop();
    else void start();
  });

  return {
    el,
    dispose() {
      disposed = true;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      release();
    }
  };
}

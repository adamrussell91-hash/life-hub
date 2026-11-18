/**
 * A postcard's voice clip: up to 30 seconds of the owner talking, recorded with the
 * phone's normal voice processing. It ends when Stop is pressed or the time is up.
 */
import { POSTCARD_MAX_AUDIO_S } from '@/postcard/model';

/** audio/mp4 plays on every phone; the rest are what a browser offers when it cannot make one. */
const MIME_ORDER = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

export function pickClipMime(
  isSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)
): string | undefined {
  return MIME_ORDER.find((mime) => {
    try {
      return isSupported(mime);
    } catch {
      return false;
    }
  });
}

export interface VoiceClip {
  blob: Blob;
  seconds: number;
}

export interface VoiceClipRecording {
  /** Ends the clip. `onEnd` gets it. Safe to call twice. */
  stop(): void;
}

/** Its message is the sentence to show the owner. */
export class VoiceClipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceClipError';
  }
}

export interface StartVoiceClipOptions {
  maxSeconds?: number;
  /** About four times a second while recording. */
  onTick?: (elapsedSeconds: number) => void;
  /** Once, however the recording ended. Null when nothing was captured. */
  onEnd: (clip: VoiceClip | null) => void;
  now?: () => number;
}

export async function startVoiceClip(options: StartVoiceClipOptions): Promise<VoiceClipRecording> {
  const now = options.now ?? Date.now;
  const maxSeconds = options.maxSeconds ?? POSTCARD_MAX_AUDIO_S;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new VoiceClipError('Recording is not available in this browser. You can still post the photo and type the words.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new VoiceClipError('Microphone access was not allowed. You can still post the photo and type the words.');
  }

  const mime = pickClipMime();
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const startedAt = now();
  const elapsed = (): number => Math.max(0, (now() - startedAt) / 1000);

  const ticker = setInterval(() => {
    const seconds = elapsed();
    options.onTick?.(Math.min(maxSeconds, seconds));
    if (seconds >= maxSeconds) stop();
  }, 250);

  function stop(): void {
    clearInterval(ticker);
    if (recorder.state !== 'inactive') recorder.stop();
  }

  recorder.addEventListener('dataavailable', (event) => {
    const data = (event as BlobEvent).data;
    if (data?.size) chunks.push(data);
  });
  recorder.addEventListener('stop', () => {
    clearInterval(ticker);
    stream.getTracks().forEach((track) => track.stop());
    const seconds = Math.min(maxSeconds, elapsed());
    options.onEnd(
      chunks.length ? { blob: new Blob(chunks, { type: recorder.mimeType || mime || 'audio/mp4' }), seconds } : null
    );
  });
  // Small slices, so a tab that is killed still leaves most of the clip.
  recorder.start(1000);

  return { stop };
}

/**
 * Ambient sound for the journal: the room as it is. Shared by New moment and
 * Edit moment so both record, fall back and fail the same way.
 */

/** Ambient means the room as it is: no echo cancelling, noise gating or levelling. */
export const AMBIENT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export interface AmbientClip {
  blob: Blob;
  seconds: number;
}

export interface AmbientRecording {
  readonly startedAt: number;
  /** Ends the clip. Safe to call twice; the second call returns the same clip. */
  stop(): Promise<AmbientClip | null>;
}

/** Its message is the sentence to show the person. */
export class AmbientRecorderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbientRecorderError';
  }
}

export async function startAmbientRecording(
  deps: { now?: () => number } = {},
): Promise<AmbientRecording> {
  const now = deps.now ?? Date.now;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new AmbientRecorderError('Sound recording is not available in this browser.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: AMBIENT_AUDIO_CONSTRAINTS });
  } catch {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new AmbientRecorderError('Microphone access was not allowed.');
    }
  }

  const chunks: BlobPart[] = [];
  const rec = new MediaRecorder(stream);
  const startedAt = now();
  const done = new Promise<AmbientClip | null>((resolve) => {
    rec.addEventListener('dataavailable', (ev) => {
      const data = (ev as BlobEvent).data;
      if (data?.size) chunks.push(data);
    });
    rec.addEventListener('stop', () => {
      stream.getTracks().forEach((t) => t.stop());
      const seconds = (now() - startedAt) / 1000;
      resolve(chunks.length ? { blob: new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }), seconds } : null);
    });
  });
  // Small timeslices so a killed tab still leaves most of the clip.
  rec.start(1000);

  return {
    startedAt,
    stop() {
      if (rec.state !== 'inactive') rec.stop();
      return done;
    },
  };
}

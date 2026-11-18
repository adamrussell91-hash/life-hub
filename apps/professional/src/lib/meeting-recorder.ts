/**
 * Meeting recorder: MediaRecorder in 60 s slices, every slice written to this
 * device (IndexedDB `life-hub-recordings`) before it is uploaded, an upload queue
 * that never drops a part, a live level meter with a silent-mic alarm, mic picker,
 * wake lock, leave-page guard, pause/resume, the 3 hour limit, crash recovery and
 * "save a copy". Device copies are cleared only once Life Hub reports
 * `audio_deleted_at` (W8 in docs/CURSOR-UI-FAILURES.md).
 *
 * The pure bits at the top (silence detector, part bookkeeping, recovery listing,
 * clocks) are unit tested in tests/unit/meeting-recorder.test.ts.
 */
import {
  stopRecording,
  uploadRecordingPart,
  type MeetingRecording,
  type RecordingFlag,
  type RecordingKind,
  type RecordingTap
} from '@/api/meeting-recordings';

// ───────────────────────────── Constants ─────────────────────────────

export const SLICE_MS = 60_000;
export const LIMIT_MS = 3 * 60 * 60_000;
export const WARN_MS = LIMIT_MS - 10 * 60_000;
export const SILENCE_MS = 15_000;
/** RMS of a 0..1 waveform. A dead or muted mic sits near 0; a quiet room is about 0.003–0.01. */
export const SILENCE_RMS = 0.006;
export const TAP_CAP = 500;
export const FLAG_CAP = 200;
export const UNDO_MS = 10_000;
export const NOTES_MAX_LINES = 80;
export const NOTES_MAX_CHARS = 300;
export const AUDIO_BITS = 32_000;

// ───────────────────────────── Pure helpers ─────────────────────────────

/** `4:05`, or `1:02:05` past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Root mean square of a byte waveform (128 = silence), as 0..1. */
export function rmsOfBytes(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = ((samples[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** Bar height in px (2..18) for a level, on a square-root scale so speech moves the bars. */
export function meterHeight(rms: number): number {
  return Math.round(2 + Math.min(16, Math.sqrt(Math.max(0, rms)) * 48));
}

export type SilenceReading = { silentMs: number; alarm: boolean };

/**
 * Silence detector: the alarm goes up after `holdMs` of RMS under `threshold`,
 * and down as soon as sound comes back. `acknowledge()` ("It's just quiet")
 * hides the alarm until the next stretch of silence after some sound.
 */
export function createSilenceDetector(options: { threshold?: number; holdMs?: number } = {}) {
  const threshold = options.threshold ?? SILENCE_RMS;
  const holdMs = options.holdMs ?? SILENCE_MS;
  let silentSince: number | null = null;
  let acknowledged = false;
  return {
    feed(rms: number, nowMs: number): SilenceReading {
      if (rms >= threshold) {
        silentSince = null;
        acknowledged = false;
        return { silentMs: 0, alarm: false };
      }
      if (silentSince === null) silentSince = nowMs;
      const silentMs = nowMs - silentSince;
      return { silentMs, alarm: silentMs >= holdMs && !acknowledged };
    },
    acknowledge(): void {
      acknowledged = true;
    },
    reset(): void {
      silentSince = null;
      acknowledged = false;
    }
  };
}

export type LimitState = 'ok' | 'warn' | 'stop';
export function limitState(elapsedMs: number): LimitState {
  if (elapsedMs >= LIMIT_MS) return 'stop';
  if (elapsedMs >= WARN_MS) return 'warn';
  return 'ok';
}

export function tapCounts(taps: RecordingTap[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tap of taps) counts[tap.who] = (counts[tap.who] ?? 0) + 1;
  return counts;
}

/** The last tap can be undone for 10 seconds. */
export function canUndoTap(taps: RecordingTap[], elapsedMs: number): boolean {
  const last = taps[taps.length - 1];
  return Boolean(last) && elapsedMs - last!.at_ms <= UNDO_MS && elapsedMs >= last!.at_ms;
}

/** Note lines as the server takes them: trimmed, non-empty, at most 80 lines of 300 chars. */
export function capNotes(lines: string[]): string[] {
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, NOTES_MAX_LINES)
    .map((line) => (line.length > NOTES_MAX_CHARS ? `${line.slice(0, NOTES_MAX_CHARS - 1)}…` : line));
}

/** A part as this device keeps it (the blob is stored beside it). */
export interface LocalPart {
  meeting_id: string;
  recording_id: string;
  index: number;
  bytes: number;
  /** Recording time (paused time excluded) at the end of this slice. */
  end_ms: number;
  saved_at: string;
  uploaded: boolean;
  mime: string;
}

/** What this device knows about a recording it made, kept beside the parts. */
export interface LocalSession {
  meeting_id: string;
  recording_id: string;
  kind: RecordingKind;
  started_at: string;
  mime: string;
  elapsed_ms: number;
  taps: RecordingTap[];
  flags: RecordingFlag[];
  notes: string[];
  private: boolean;
  next_index: number;
  segment_starts: number[];
  /** The recorder was stopped on purpose (not a closed tab). */
  stopped: boolean;
  /** Life Hub accepted the stop with nothing missing. */
  finalized: boolean;
  updated_at: string;
}

export type PartProgress = {
  saved: number;
  uploaded: number;
  pending: number[];
  savedMs: number;
  uploadedMs: number;
};

/** Saved on this device vs in Life Hub. A part counts as uploaded if either side says so. */
export function partProgress(parts: LocalPart[], serverReceived: number[] = []): PartProgress {
  const received = new Set(serverReceived);
  const sorted = [...parts].sort((a, b) => a.index - b.index);
  const pending: number[] = [];
  let savedMs = 0;
  let uploadedMs = 0;
  let uploaded = 0;
  for (const part of sorted) {
    savedMs = Math.max(savedMs, part.end_ms);
    if (part.uploaded || received.has(part.index)) {
      uploaded += 1;
      uploadedMs = Math.max(uploadedMs, part.end_ms);
    } else {
      pending.push(part.index);
    }
  }
  return { saved: sorted.length, uploaded, pending, savedMs, uploadedMs };
}

export type Recovery = {
  meetingId: string;
  recordingId: string;
  startedAt: string;
  /** The page closed while recording, rather than Stop being pressed. */
  interrupted: boolean;
  savedMs: number;
  uploadedMs: number;
  notUploaded: number[];
  /** Life Hub still has the recording open for this id, so recording can carry on into it. */
  canContinue: boolean;
};

/**
 * On load: what this device holds for the meeting that Life Hub hasn't got or hasn't
 * been told about. Null when there is nothing to offer (or the device copy can go).
 */
export function recoveryFor(
  meetingId: string,
  session: LocalSession | null,
  parts: LocalPart[],
  recording: MeetingRecording | null
): Recovery | null {
  if (!session || session.meeting_id !== meetingId) return null;
  if (recording && recording.id !== session.recording_id) return null;
  if (recording?.audio_deleted_at) return null;
  const mine = parts.filter((part) => part.recording_id === session.recording_id);
  const progress = partProgress(mine, recording?.parts_received ?? []);
  const told = session.finalized || (recording !== null && recording.status !== 'recording');
  if (told && !progress.pending.length) return null;
  if (!mine.length && !session.taps.length) return null;
  return {
    meetingId,
    recordingId: session.recording_id,
    startedAt: session.started_at,
    interrupted: !session.stopped,
    savedMs: progress.savedMs,
    uploadedMs: progress.uploadedMs,
    notUploaded: progress.pending,
    canContinue: !session.stopped && (recording === null || recording.status === 'recording')
  };
}

/** Device copies go only once Life Hub has the transcript and has deleted its own audio. */
export function shouldClearDevice(recording: MeetingRecording | null | undefined): boolean {
  return Boolean(recording?.audio_deleted_at);
}

export function pickRecorderMime(isTypeSupported: ((mime: string) => boolean) | null): string | undefined {
  if (!isTypeSupported) return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((mime) => {
    try {
      return isTypeSupported(mime);
    } catch {
      return false;
    }
  });
}

export function fileExtension(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Retry wait after `failures` failed tries: 2 s, 4 s, 8 s … capped at a minute. */
export function retryDelayMs(failures: number): number {
  return Math.min(60_000, 2000 * 2 ** Math.max(0, failures - 1));
}

// ───────────────────────────── Device storage ─────────────────────────────

export interface PartStore {
  readonly kind: 'device' | 'memory';
  putPart(part: LocalPart, blob: Blob): Promise<void>;
  getBlob(recordingId: string, index: number): Promise<Blob | null>;
  listParts(meetingId: string): Promise<LocalPart[]>;
  markUploaded(recordingId: string, index: number): Promise<void>;
  putSession(session: LocalSession): Promise<void>;
  getSession(meetingId: string): Promise<LocalSession | null>;
  /** Deletes the parts and the session. */
  clear(meetingId: string, recordingId: string): Promise<void>;
}

/** Kept in memory only: used where IndexedDB is missing (and in tests). */
export function createMemoryStore(): PartStore {
  const parts = new Map<string, { part: LocalPart; blob: Blob }>();
  const sessions = new Map<string, LocalSession>();
  const key = (recordingId: string, index: number) => `${recordingId}#${index}`;
  return {
    kind: 'memory',
    async putPart(part, blob) {
      parts.set(key(part.recording_id, part.index), { part: { ...part }, blob });
    },
    async getBlob(recordingId, index) {
      return parts.get(key(recordingId, index))?.blob ?? null;
    },
    async listParts(meetingId) {
      return [...parts.values()].filter((entry) => entry.part.meeting_id === meetingId).map((entry) => ({ ...entry.part }));
    },
    async markUploaded(recordingId, index) {
      const entry = parts.get(key(recordingId, index));
      if (entry) entry.part.uploaded = true;
    },
    async putSession(session) {
      sessions.set(session.meeting_id, structuredCloneSafe(session));
    },
    async getSession(meetingId) {
      const found = sessions.get(meetingId);
      return found ? structuredCloneSafe(found) : null;
    },
    async clear(meetingId, recordingId) {
      for (const [k, entry] of parts) if (entry.part.recording_id === recordingId) parts.delete(k);
      if (sessions.get(meetingId)?.recording_id === recordingId) sessions.delete(meetingId);
    }
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const DB_NAME = 'life-hub-recordings';
const DB_VERSION = 1;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Device storage failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Device storage failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Device storage stopped'));
  });
}

/** IndexedDB store: `parts` keyed [recording_id, index] (+ blob), `sessions` keyed meeting_id. */
export function createIdbStore(factory: IDBFactory): PartStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const handle = open.result;
      if (!handle.objectStoreNames.contains('parts')) {
        const parts = handle.createObjectStore('parts', { keyPath: ['recording_id', 'index'] });
        parts.createIndex('by_meeting', 'meeting_id');
      }
      if (!handle.objectStoreNames.contains('sessions')) handle.createObjectStore('sessions', { keyPath: 'meeting_id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => {
      dbPromise = null;
      reject(open.error ?? new Error('Device storage is not available'));
    };
  }));
  return {
    kind: 'device',
    async putPart(part, blob) {
      const tx = (await db()).transaction('parts', 'readwrite');
      tx.objectStore('parts').put({ ...part, blob });
      await txDone(tx);
    },
    async getBlob(recordingId, index) {
      const tx = (await db()).transaction('parts', 'readonly');
      const row = (await promisify(tx.objectStore('parts').get([recordingId, index]))) as (LocalPart & { blob: Blob }) | undefined;
      return row?.blob ?? null;
    },
    async listParts(meetingId) {
      const tx = (await db()).transaction('parts', 'readonly');
      const rows = (await promisify(tx.objectStore('parts').index('by_meeting').getAll(meetingId))) as Array<LocalPart & { blob?: Blob }>;
      return rows.map(({ blob: _blob, ...part }) => part);
    },
    async markUploaded(recordingId, index) {
      const tx = (await db()).transaction('parts', 'readwrite');
      const store = tx.objectStore('parts');
      const row = (await promisify(store.get([recordingId, index]))) as (LocalPart & { blob: Blob }) | undefined;
      if (row && !row.uploaded) store.put({ ...row, uploaded: true });
      await txDone(tx);
    },
    async putSession(session) {
      const tx = (await db()).transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      await txDone(tx);
    },
    async getSession(meetingId) {
      const tx = (await db()).transaction('sessions', 'readonly');
      return ((await promisify(tx.objectStore('sessions').get(meetingId))) as LocalSession | undefined) ?? null;
    },
    async clear(meetingId, recordingId) {
      const tx = (await db()).transaction(['parts', 'sessions'], 'readwrite');
      const parts = tx.objectStore('parts');
      const keys = (await promisify(parts.index('by_meeting').getAllKeys(meetingId))) as IDBValidKey[];
      for (const key of keys) {
        if (Array.isArray(key) && key[0] === recordingId) parts.delete(key);
      }
      const sessions = tx.objectStore('sessions');
      const session = (await promisify(sessions.get(meetingId))) as LocalSession | undefined;
      if (session?.recording_id === recordingId) sessions.delete(meetingId);
      await txDone(tx);
    }
  };
}

let defaultStore: PartStore | null = null;
/** IndexedDB where the browser has it, else memory (the strip then says so). */
export function deviceStore(): PartStore {
  if (defaultStore) return defaultStore;
  defaultStore = typeof indexedDB !== 'undefined' && indexedDB ? createIdbStore(indexedDB) : createMemoryStore();
  return defaultStore;
}

/** Every part this device holds for a recording, joined into one file and handed to the browser to save. */
export async function joinLocalParts(store: PartStore, meetingId: string, recordingId: string): Promise<{ blob: Blob; mime: string; missing: number[] } | null> {
  const parts = (await store.listParts(meetingId)).filter((part) => part.recording_id === recordingId).sort((a, b) => a.index - b.index);
  if (!parts.length) return null;
  const blobs: Blob[] = [];
  const missing: number[] = [];
  const last = parts[parts.length - 1]!.index;
  for (let index = 0; index <= last; index += 1) {
    const blob = await store.getBlob(recordingId, index);
    if (blob) blobs.push(blob);
    else missing.push(index);
  }
  const mime = parts[0]!.mime || 'audio/webm';
  return { blob: new Blob(blobs, { type: mime.split(';')[0] }), mime, missing };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function recordingFileName(startedAt: string, mime: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(startedAt)?.[0] ?? 'recording';
  return `meeting-recording-${day}.${fileExtension(mime)}`;
}

// ───────────────────────────── The live recorder ─────────────────────────────

export type RecorderPhase = 'idle' | 'checking' | 'recording' | 'paused' | 'stopping' | 'stopped';

export type MicOption = { id: string; label: string };

export type RecorderSnapshot = {
  phase: RecorderPhase;
  supported: boolean;
  error: string | null;
  recordingId: string | null;
  isPrivate: boolean;
  elapsedMs: number;
  levels: number[];
  hearing: boolean;
  silentMs: number;
  silentAlarm: boolean;
  limit: LimitState;
  stoppedByLimit: boolean;
  savedParts: number;
  uploadedParts: number;
  savedMs: number;
  uploadedMs: number;
  pendingUploads: number;
  uploadStalled: boolean;
  lastUploadError: string | null;
  lastTriedAt: number | null;
  /** Life Hub has been told the recording stopped, with nothing missing. */
  finalized: boolean;
  storage: 'device' | 'memory';
  wakeLock: 'held' | 'unavailable' | 'off';
  mics: MicOption[];
  micId: string | null;
  canSwitchMicWhileRecording: boolean;
  taps: RecordingTap[];
  flags: RecordingFlag[];
};

export type RecorderApi = {
  uploadPart: typeof uploadRecordingPart;
  stop: typeof stopRecording;
};

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener?: (type: 'release', fn: () => void) => void };

export class RecorderSession {
  readonly meetingId: string;
  private readonly api: RecorderApi;
  private readonly store: PartStore;
  private readonly now: () => number;
  private listeners = new Set<(snap: RecorderSnapshot) => void>();

  private phase: RecorderPhase = 'idle';
  private error: string | null = null;
  private session: LocalSession | null = null;
  private serverReceived: number[] = [];
  private parts = new Map<number, LocalPart>();
  private memoryBlobs = new Map<number, Blob>();
  private storageKind: 'device' | 'memory';

  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private mime = '';
  private micId: string | null = null;
  private mics: MicOption[] = [];

  private activeSince: number | null = null;
  private accumulatedMs = 0;
  private levels: number[] = [2, 2, 2, 2, 2, 2];
  private heardAt = 0;
  private silence = createSilenceDetector();
  private silent: SilenceReading = { silentMs: 0, alarm: false };
  private lastBuzz = 0;
  private stoppedByLimit = false;
  private ticker: ReturnType<typeof setInterval> | null = null;

  private saveChain: Promise<void> = Promise.resolve();
  private uploading = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stalled = false;
  private lastUploadError: string | null = null;
  private lastTriedAt: number | null = null;
  private awaitingFinalize = false;
  private finalizing: Promise<void> | null = null;
  private drainWaiters: Array<() => void> = [];

  private wakeLock: WakeLockSentinelLike | null = null;
  private wakeState: 'held' | 'unavailable' | 'off' = 'off';

  constructor(meetingId: string, deps: { api?: RecorderApi; store?: PartStore; now?: () => number } = {}) {
    this.meetingId = meetingId;
    this.api = deps.api ?? { uploadPart: uploadRecordingPart, stop: stopRecording };
    this.store = deps.store ?? deviceStore();
    this.storageKind = this.store.kind;
    this.now = deps.now ?? (() => Date.now());
  }

  // ── Read-out ──

  subscribe(fn: (snap: RecorderSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  elapsedMs(): number {
    return this.accumulatedMs + (this.activeSince === null ? 0 : this.now() - this.activeSince);
  }

  isActive(): boolean {
    return this.phase === 'recording' || this.phase === 'paused' || this.phase === 'stopping';
  }

  snapshot(): RecorderSnapshot {
    const progress = partProgress([...this.parts.values()], this.serverReceived);
    const elapsed = this.elapsedMs();
    return {
      phase: this.phase,
      supported: recorderSupported(),
      error: this.error,
      recordingId: this.session?.recording_id ?? null,
      isPrivate: this.session?.private ?? false,
      elapsedMs: elapsed,
      levels: [...this.levels],
      hearing: this.now() - this.heardAt < 2500,
      silentMs: this.phase === 'recording' ? this.silent.silentMs : 0,
      silentAlarm: this.phase === 'recording' && this.silent.alarm,
      limit: limitState(elapsed),
      stoppedByLimit: this.stoppedByLimit,
      savedParts: progress.saved,
      uploadedParts: progress.uploaded,
      savedMs: progress.savedMs,
      uploadedMs: progress.uploadedMs,
      pendingUploads: progress.pending.length,
      uploadStalled: this.stalled && progress.pending.length > 0,
      lastUploadError: this.lastUploadError,
      lastTriedAt: this.lastTriedAt,
      finalized: this.session?.finalized ?? false,
      storage: this.storageKind,
      wakeLock: this.wakeState,
      mics: [...this.mics],
      micId: this.micId,
      canSwitchMicWhileRecording: true,
      taps: [...(this.session?.taps ?? [])],
      flags: [...(this.session?.flags ?? [])]
    };
  }

  // ── Mic ──

  async listMics(): Promise<MicOption[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      let n = 0;
      this.mics = devices
        .filter((device) => device.kind === 'audioinput' && device.deviceId !== 'communications')
        .map((device) => ({ id: device.deviceId, label: device.label || `Microphone ${++n}` }));
    } catch {
      this.mics = [];
    }
    this.emit();
    return this.mics;
  }

  /** Opens the mic for the check (or switches it). The level meter runs from here. */
  async openMic(deviceId?: string | null): Promise<void> {
    this.error = null;
    if (!recorderSupported()) {
      this.error = 'This browser can’t record audio. Try Chrome or Safari.';
      this.emit();
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
    } catch (err) {
      this.error = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'The browser blocked the microphone. Allow it in the address bar, then try again.'
        : 'No microphone found.';
      this.emit();
      return;
    }
    const oldStream = this.stream;
    const oldSource = this.source;
    this.stream = stream;
    this.micId = stream.getAudioTracks()[0]?.getSettings?.().deviceId ?? deviceId ?? null;
    const Ctx = audioContextClass();
    if (Ctx) {
      if (!this.audioCtx) {
        this.audioCtx = new Ctx();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 1024;
        if (typeof this.audioCtx.createMediaStreamDestination === 'function') this.dest = this.audioCtx.createMediaStreamDestination();
      }
      void this.audioCtx.resume?.().catch(() => undefined);
      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.source.connect(this.analyser!);
      if (this.dest) this.source.connect(this.dest);
      oldSource?.disconnect();
    }
    oldStream?.getTracks().forEach((track) => track.stop());
    if (this.phase === 'idle' || this.phase === 'stopped') this.phase = 'checking';
    // Without a destination node the recorder is tied to the old stream: start a new segment on the new one.
    if (oldStream && !this.dest && this.recorder && (this.phase === 'recording' || this.phase === 'paused')) await this.restartRecorder();
    this.startTicker();
    await this.listMics();
  }

  /** Cancel from the consent panel: stop the mic without recording. */
  closeMic(): void {
    if (this.isActive()) return;
    this.releaseMic();
    this.phase = this.session && !this.session.finalized && this.parts.size ? 'stopped' : 'idle';
    this.emit();
  }

  private releaseMic(): void {
    this.stopTicker();
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioCtx?.close?.().catch(() => undefined);
    this.audioCtx = null;
    this.analyser = null;
    this.dest = null;
    this.levels = [2, 2, 2, 2, 2, 2];
  }

  // ── Recording ──

  /**
   * Starts recording into a recording Life Hub has just opened. `resume` carries on a
   * recording this device started before the page closed.
   */
  async begin(recording: MeetingRecording, options: { notes?: string[]; resume?: LocalSession | null } = {}): Promise<void> {
    if (this.isActive()) return;
    if (!this.stream) await this.openMic(this.micId);
    if (!this.stream) return;
    const resume = options.resume && options.resume.recording_id === recording.id ? options.resume : null;
    this.mime = resume?.mime || pickRecorderMime(typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported ? (m) => MediaRecorder.isTypeSupported(m) : null) || '';
    if (resume) {
      const local = await this.store.listParts(this.meetingId).catch(() => [] as LocalPart[]);
      this.parts = new Map(local.filter((part) => part.recording_id === recording.id).map((part) => [part.index, part]));
    } else {
      this.parts = new Map();
      this.memoryBlobs = new Map();
    }
    const nextIndex = resume ? Math.max(resume.next_index, ...[...this.parts.keys()].map((index) => index + 1)) : 0;
    this.session = {
      meeting_id: this.meetingId,
      recording_id: recording.id,
      kind: recording.kind,
      started_at: resume?.started_at ?? recording.started_at,
      mime: this.mime,
      elapsed_ms: resume?.elapsed_ms ?? 0,
      taps: resume?.taps ?? [],
      flags: resume?.flags ?? [],
      notes: options.notes ?? resume?.notes ?? [],
      private: recording.private,
      next_index: nextIndex,
      segment_starts: resume ? [...resume.segment_starts, nextIndex] : [0],
      stopped: false,
      finalized: false,
      updated_at: new Date(this.now()).toISOString()
    };
    this.serverReceived = recording.parts_received ?? [];
    this.accumulatedMs = this.session.elapsed_ms;
    this.stoppedByLimit = false;
    this.silence.reset();
    this.silent = { silentMs: 0, alarm: false };
    await this.persistSession();
    this.startRecorder();
    this.activeSince = this.now();
    this.phase = 'recording';
    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibility);
    await this.holdWakeLock();
    this.startTicker();
    this.emit();
    if (resume) void this.pump();
  }

  private startRecorder(): void {
    const stream = this.dest?.stream ?? this.stream!;
    const options: MediaRecorderOptions = { audioBitsPerSecond: AUDIO_BITS };
    if (this.mime) options.mimeType = this.mime;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    this.mime = recorder.mimeType || this.mime || 'audio/webm';
    if (this.session) this.session.mime = this.mime;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      const index = this.session!.next_index;
      this.session!.next_index += 1;
      const end = this.elapsedMs();
      this.saveChain = this.saveChain.then(() => this.savePart(index, event.data, end));
    };
    recorder.start(SLICE_MS);
    this.recorder = recorder;
  }

  private async restartRecorder(): Promise<void> {
    const old = this.recorder;
    if (old && old.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        old.addEventListener('stop', () => resolve(), { once: true });
        old.stop();
      });
    }
    this.session!.segment_starts.push(this.session!.next_index);
    this.startRecorder();
    if (this.phase === 'paused') this.recorder?.pause();
  }

  private async savePart(index: number, blob: Blob, endMs: number): Promise<void> {
    const session = this.session!;
    const part: LocalPart = {
      meeting_id: this.meetingId,
      recording_id: session.recording_id,
      index,
      bytes: blob.size,
      end_ms: endMs,
      saved_at: new Date(this.now()).toISOString(),
      uploaded: false,
      mime: this.mime
    };
    try {
      await this.store.putPart(part, blob);
    } catch {
      // Device storage refused (full or private mode): keep it in memory and say so.
      this.storageKind = 'memory';
      this.memoryBlobs.set(index, blob);
    }
    this.parts.set(index, part);
    session.elapsed_ms = endMs;
    await this.persistSession();
    this.emit();
    void this.pump();
  }

  private async persistSession(): Promise<void> {
    if (!this.session) return;
    this.session.updated_at = new Date(this.now()).toISOString();
    if (this.activeSince !== null) this.session.elapsed_ms = this.elapsedMs();
    try {
      await this.store.putSession({ ...this.session, taps: [...this.session.taps], flags: [...this.session.flags] });
    } catch {
      this.storageKind = 'memory';
    }
  }

  pause(): void {
    if (this.phase !== 'recording' || !this.recorder) return;
    this.recorder.pause();
    this.accumulatedMs = this.elapsedMs();
    this.activeSince = null;
    this.phase = 'paused';
    this.silence.reset();
    this.silent = { silentMs: 0, alarm: false };
    void this.persistSession();
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'paused' || !this.recorder) return;
    this.recorder.resume();
    this.activeSince = this.now();
    this.phase = 'recording';
    void this.audioCtx?.resume?.().catch(() => undefined);
    this.emit();
  }

  tap(who: string): void {
    if (!this.session || !(this.phase === 'recording' || this.phase === 'paused')) return;
    if (this.session.taps.length >= TAP_CAP) return;
    this.session.taps.push({ who, at_ms: Math.round(this.elapsedMs()) });
    void this.persistSession();
    this.emit();
  }

  undoTap(): void {
    if (!this.session || !canUndoTap(this.session.taps, this.elapsedMs())) return;
    this.session.taps.pop();
    void this.persistSession();
    this.emit();
  }

  flag(kind: 'task' | 'poi'): void {
    if (!this.session || !(this.phase === 'recording' || this.phase === 'paused')) return;
    if (this.session.flags.length >= FLAG_CAP) return;
    this.session.flags.push({ kind, at_ms: Math.round(this.elapsedMs()) });
    void this.persistSession();
    this.emit();
  }

  /** "It's just quiet": the red alarm goes until the next silence after some sound. */
  acknowledgeSilence(): void {
    this.silence.acknowledge();
    this.silent = { ...this.silent, alarm: false };
    this.emit();
  }

  /**
   * Stops the recorder, waits for the last slice to be on the device, tries to upload
   * for a short while, then tells Life Hub. Anything not uploaded keeps retrying.
   */
  async stop(notes: string[] = []): Promise<{ missing: number[]; recording: MeetingRecording | null }> {
    if (!(this.phase === 'recording' || this.phase === 'paused') || !this.recorder || !this.session) {
      return { missing: [], recording: null };
    }
    this.phase = 'stopping';
    this.emit();
    const recorder = this.recorder;
    await new Promise<void>((resolve) => {
      if (recorder.state === 'inactive') return resolve();
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.stop();
    });
    this.recorder = null;
    this.accumulatedMs = this.elapsedMs();
    this.activeSince = null;
    await this.saveChain;
    this.session.stopped = true;
    this.session.notes = capNotes(notes);
    this.session.elapsed_ms = this.accumulatedMs;
    await this.persistSession();
    this.releaseMic();
    await this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.phase = 'stopped';
    this.emit();
    await Promise.race([this.drain(), new Promise((resolve) => setTimeout(resolve, 15_000))]);
    return this.finalize();
  }

  /** Life Hub has the recording open for this meeting but this device's recorder stopped (closed tab). */
  async adopt(session: LocalSession, recording: MeetingRecording | null): Promise<void> {
    if (this.isActive()) return;
    this.session = { ...session };
    this.mime = session.mime;
    this.serverReceived = recording?.parts_received ?? [];
    const local = await this.store.listParts(this.meetingId).catch(() => [] as LocalPart[]);
    this.parts = new Map(local.filter((part) => part.recording_id === session.recording_id).map((part) => [part.index, part]));
    this.accumulatedMs = session.elapsed_ms;
    this.phase = 'stopped';
    window.addEventListener('online', this.onOnline);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.emit();
  }

  /** Upload what this device still holds, then tell Life Hub it stopped. */
  async uploadRest(notes?: string[]): Promise<void> {
    if (!this.session) return;
    if (!this.session.stopped) {
      this.session.stopped = true;
      if (notes) this.session.notes = capNotes(notes);
      await this.persistSession();
    }
    this.failures = 0;
    await this.pump();
    await Promise.race([this.drain(), new Promise((resolve) => setTimeout(resolve, 15_000))]);
    await this.finalize();
  }

  private finalize(): Promise<{ missing: number[]; recording: MeetingRecording | null }> {
    const run = async (): Promise<{ missing: number[]; recording: MeetingRecording | null }> => {
      const session = this.session!;
      try {
        const out = await this.api.stop({
          meeting_id: this.meetingId,
          recording_id: session.recording_id,
          parts_expected: session.next_index,
          duration_ms: Math.round(session.elapsed_ms),
          taps: session.taps,
          flags: session.flags,
          notes: session.notes,
          ...(session.segment_starts.length > 1 ? { segment_starts: session.segment_starts } : {})
        });
        this.serverReceived = out.recording?.parts_received ?? this.serverReceived;
        this.awaitingFinalize = out.missing.length > 0;
        if (!this.awaitingFinalize) {
          session.finalized = true;
          await this.persistSession();
          this.maybeReleaseGuards();
        } else {
          // Life Hub is missing parts this device thinks it sent: send them again. Life Hub
          // flips to `uploaded` by itself once the set is complete.
          let requeued = 0;
          for (const index of out.missing) {
            const part = this.parts.get(index);
            if (part) {
              part.uploaded = false;
              requeued += 1;
            }
          }
          this.serverReceived = this.serverReceived.filter((index) => !out.missing.includes(index));
          // Nothing here to send: this device can't fill the gap, so stop asking.
          if (!requeued) this.awaitingFinalize = false;
          void this.pump();
        }
        this.emit();
        return { missing: out.missing, recording: out.recording };
      } catch (err) {
        this.awaitingFinalize = true;
        this.lastUploadError = err instanceof Error ? err.message : 'Could not reach Life Hub';
        this.stalled = true;
        this.scheduleRetry();
        this.emit();
        return { missing: [], recording: null };
      }
    };
    const job = (this.finalizing ?? Promise.resolve()).then(run);
    this.finalizing = job.then(() => undefined, () => undefined);
    return job;
  }

  // ── Uploads ──

  private pendingIndices(): number[] {
    return partProgress([...this.parts.values()], this.serverReceived).pending;
  }

  /** Waits until nothing is waiting to upload. */
  drain(): Promise<void> {
    if (!this.pendingIndices().length) return Promise.resolve();
    return new Promise((resolve) => this.drainWaiters.push(resolve));
  }

  private settleDrain(): void {
    if (this.pendingIndices().length) return;
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.failures += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.pump().then(() => {
        if (this.awaitingFinalize && !this.pendingIndices().length && this.session?.stopped) void this.finalize();
      });
    }, retryDelayMs(this.failures));
  }

  /** Try every waiting part now (the "Try now" / "Upload now" buttons). */
  async retryNow(): Promise<void> {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.failures = 0;
    await this.pump();
    if (this.awaitingFinalize && !this.pendingIndices().length && this.session?.stopped) await this.finalize();
  }

  private async pump(): Promise<void> {
    if (this.uploading || !this.session) return;
    this.uploading = true;
    try {
      for (;;) {
        const index = this.pendingIndices()[0];
        if (index === undefined) break;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          this.stalled = true;
          this.lastUploadError = 'No connection';
          this.emit();
          break;
        }
        const blob = this.memoryBlobs.get(index) ?? (await this.store.getBlob(this.session.recording_id, index).catch(() => null));
        if (!blob) {
          // Neither memory nor device has it any more: nothing to send.
          this.parts.delete(index);
          continue;
        }
        this.lastTriedAt = this.now();
        try {
          const out = await this.api.uploadPart({ meeting_id: this.meetingId, recording_id: this.session.recording_id, index, blob });
          this.serverReceived = out.parts_received ?? [...this.serverReceived, index];
          const part = this.parts.get(index);
          if (part) part.uploaded = true;
          await this.store.markUploaded(this.session.recording_id, index).catch(() => undefined);
          this.stalled = false;
          this.lastUploadError = null;
          this.failures = 0;
          this.emit();
        } catch (err) {
          this.stalled = true;
          this.lastUploadError = err instanceof Error ? err.message : 'Upload failed';
          this.emit();
          this.scheduleRetry();
          break;
        }
      }
    } finally {
      this.uploading = false;
    }
    this.settleDrain();
    if (this.awaitingFinalize && this.session?.stopped && !this.pendingIndices().length && !this.stalled) void this.finalize();
    this.maybeReleaseGuards();
  }

  // ── Ticker: meter, silence, limit ──

  private startTicker(): void {
    if (this.ticker !== null) return;
    const buffer = new Uint8Array(1024);
    this.ticker = setInterval(() => {
      if (this.analyser) {
        this.analyser.getByteTimeDomainData(buffer);
        const rms = rmsOfBytes(buffer);
        this.levels = [...this.levels.slice(1), meterHeight(rms)];
        const now = this.now();
        if (rms >= SILENCE_RMS) this.heardAt = now;
        if (this.phase === 'recording') {
          const before = this.silent.alarm;
          this.silent = this.silence.feed(rms, now);
          if (this.silent.alarm && (!before || now - this.lastBuzz > 15_000)) this.buzz(now);
        }
      }
      if (this.phase === 'recording' && limitState(this.elapsedMs()) === 'stop') {
        this.stoppedByLimit = true;
        void this.stop(this.session?.notes ?? []);
      }
      if (this.phase === 'recording' && this.audioCtx && this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => undefined);
      this.emit();
    }, 250);
  }

  private stopTicker(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
  }

  private buzz(now: number): void {
    this.lastBuzz = now;
    try {
      navigator.vibrate?.([300, 120, 300]);
    } catch {
      // Not every device can buzz.
    }
  }

  /** The notes to send with Stop when the page ends the recording (End ›, 3 h limit). */
  setNotes(lines: string[]): void {
    if (this.session) this.session.notes = capNotes(lines);
  }

  // ── Wake lock and leave guard ──

  private async holdWakeLock(): Promise<void> {
    const lockApi = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!lockApi) {
      this.wakeState = 'unavailable';
      return;
    }
    try {
      this.wakeLock = await lockApi.request('screen');
      this.wakeState = 'held';
      this.wakeLock.addEventListener?.('release', () => {
        this.wakeLock = null;
        if (this.isActive()) this.wakeState = 'unavailable';
        this.emit();
      });
    } catch {
      this.wakeState = 'unavailable';
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    this.wakeState = 'off';
    await lock?.release().catch(() => undefined);
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible' && this.isActive() && !this.wakeLock) void this.holdWakeLock().then(() => this.emit());
  };

  private onOnline = (): void => {
    void this.retryNow();
  };

  private onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.needsGuard()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  private needsGuard(): boolean {
    return this.isActive() || this.pendingIndices().length > 0 || this.awaitingFinalize;
  }

  private maybeReleaseGuards(): void {
    if (this.needsGuard()) return;
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('online', this.onOnline);
  }

  /** Forget this device's copy once Life Hub has deleted its audio. */
  async clearDevice(recordingId: string): Promise<void> {
    await this.store.clear(this.meetingId, recordingId).catch(() => undefined);
    if (this.session?.recording_id === recordingId && !this.isActive()) {
      this.session = null;
      this.parts = new Map();
      this.memoryBlobs = new Map();
      this.phase = 'idle';
      this.emit();
    }
  }

  /** Every slice this device holds, as one file. */
  async localCopy(): Promise<{ blob: Blob; mime: string; missing: number[]; startedAt: string } | null> {
    if (!this.session) return null;
    const session = this.session;
    if (this.memoryBlobs.size) {
      const indices = [...this.parts.keys()].sort((a, b) => a - b);
      const blobs: Blob[] = [];
      const missing: number[] = [];
      for (const index of indices) {
        const blob = this.memoryBlobs.get(index) ?? (await this.store.getBlob(session.recording_id, index).catch(() => null));
        if (blob) blobs.push(blob);
        else missing.push(index);
      }
      return { blob: new Blob(blobs, { type: this.mime.split(';')[0] }), mime: this.mime, missing, startedAt: session.started_at };
    }
    const joined = await joinLocalParts(this.store, this.meetingId, session.recording_id);
    return joined ? { ...joined, startedAt: session.started_at } : null;
  }

  localSession(): LocalSession | null {
    return this.session ? { ...this.session } : null;
  }

  storeHandle(): PartStore {
    return this.store;
  }
}

function recorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function audioContextClass(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null;
  return (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ?? null;
}

// ───────────────────────────── Registry ─────────────────────────────

const sessions = new Map<string, RecorderSession>();

/** One recorder per meeting, kept across page repaints and route changes inside the app. */
export function recorderFor(meetingId: string): RecorderSession {
  let session = sessions.get(meetingId);
  if (!session) {
    session = new RecorderSession(meetingId);
    sessions.set(meetingId, session);
  }
  return session;
}

/** The meeting whose recorder holds the mic, if any. */
export function activeRecordingMeeting(): string | null {
  for (const [meetingId, session] of sessions) if (session.isActive()) return meetingId;
  return null;
}

/** What this device holds for a meeting that Life Hub hasn't got (crash recovery). */
export async function listRecovery(meetingId: string, recording: MeetingRecording | null, store: PartStore = deviceStore()): Promise<{ recovery: Recovery | null; session: LocalSession | null }> {
  try {
    const [session, parts] = await Promise.all([store.getSession(meetingId), store.listParts(meetingId)]);
    return { recovery: recoveryFor(meetingId, session, parts, recording), session };
  } catch {
    return { recovery: null, session: null };
  }
}

/** Test seam. */
export function __resetRecorderRegistry(): void {
  sessions.clear();
  defaultStore = null;
}

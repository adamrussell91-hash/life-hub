/**
 * "Upload a recording": an audio file in place of a live recording. The file is cut
 * into byte ranges and sent as the same numbered parts a live recording sends, so the
 * server and the Mac worker treat it exactly like one. The worker joins the parts back
 * into the original file before ffmpeg converts it, so any format ffmpeg reads works.
 * There are no taps, so voices arrive unnamed and are named once on the Done card.
 */
import '../styles/meeting-recording.css';
import { ApiClientError } from '@/api/client';
import {
  startRecording,
  stopRecording,
  uploadRecordingPart,
  type MeetingRecording,
  type RecordingKind
} from '@/api/meeting-recordings';
import { activeRecordingMeeting, retryDelayMs } from '@/lib/meeting-recorder';
import { askConfirm, button, el, type RecordingAttendeeInput, type RecordingModel } from '@/views/meeting-recording-strip';

/** Under the server's 4.5 MB part limit, with room for the form fields. */
export const FILE_PART_BYTES = 4 * 1024 * 1024;
/** The server keeps at most 400 parts. */
export const FILE_MAX_PARTS = 400;
export const FILE_MAX_BYTES = FILE_PART_BYTES * FILE_MAX_PARTS;
const TRIES_PER_PART = 4;

const AUDIO_EXTENSIONS = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'oga', 'opus', 'webm', 'flac', 'caf', 'aiff', 'aif', 'mp4', 'mov', 'm4v', 'wma', 'amr', '3gp'];
export const FILE_ACCEPT = ['audio/*', 'video/mp4', 'video/quicktime', 'video/webm', ...AUDIO_EXTENSIONS.map((ext) => `.${ext}`)].join(',');

/** Byte ranges `[start, end)` for each part, in order. */
export function planFileParts(size: number, partBytes = FILE_PART_BYTES): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < size; start += partBytes) ranges.push([start, Math.min(size, start + partBytes)]);
  return ranges;
}

/** Plain-words reason the file can't be used, or null when it can. */
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const looksAudio = file.type.startsWith('audio/') || file.type.startsWith('video/') || AUDIO_EXTENSIONS.includes(ext);
  if (!looksAudio) return 'That doesn’t look like an audio file. Try an .m4a, .mp3 or .wav.';
  if (!file.size) return 'That file is empty.';
  if (file.size > FILE_MAX_BYTES) return `That file is over ${Math.round(FILE_MAX_BYTES / (1024 * 1024))} MB. Export it at a lower quality and try again.`;
  return null;
}

export function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export type UploadPartFn = (index: number, blob: Blob) => Promise<void>;

/**
 * Sends every part not yet in `received`, in order, retrying each a few times.
 * `received` is updated as parts land, so calling again after a failure carries on.
 */
export async function sendFileParts(input: {
  file: Blob;
  received: Set<number>;
  upload: UploadPartFn;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  wait?: (ms: number) => Promise<void>;
  partBytes?: number;
}): Promise<void> {
  const ranges = planFileParts(input.file.size, input.partBytes);
  const wait = input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const sent = () => ranges.reduce((sum, [start, end], index) => sum + (input.received.has(index) ? end - start : 0), 0);
  input.onProgress?.(sent(), input.file.size);
  for (const [index, [start, end]] of ranges.entries()) {
    if (input.received.has(index)) continue;
    let failures = 0;
    for (;;) {
      try {
        await input.upload(index, input.file.slice(start, end));
        input.received.add(index);
        break;
      } catch (err) {
        failures += 1;
        if (failures >= TRIES_PER_PART || (err instanceof ApiClientError && err.status && err.status >= 400 && err.status < 500)) throw err;
        await wait(retryDelayMs(failures));
      }
    }
    input.onProgress?.(sent(), input.file.size);
  }
}

/** The file's length from its metadata, or 0 if the browser can't tell within a few seconds. */
export function audioDurationMs(file: Blob, timeoutMs = 8000): Promise<number> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return Promise.resolve(0);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (ms: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0);
    };
    const timer = setTimeout(() => finish(0), timeoutMs);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      finish(audio.duration * 1000);
    });
    audio.addEventListener('error', () => {
      clearTimeout(timer);
      finish(0);
    });
    audio.src = url;
  });
}

type Phase = 'closed' | 'open' | 'uploading' | 'failed';

export type RecordingUploadHandle = { el: HTMLElement; destroy(): void };

export function mountRecordingUpload(options: {
  meetingId: string;
  kind: RecordingKind;
  people: () => RecordingAttendeeInput[];
  room: boolean;
  notes: () => string[];
  model: RecordingModel;
}): RecordingUploadHandle {
  const root = el('section', 'rec-upload');
  root.dataset.part = 'rec-upload';
  const ctx = options.kind === 'event' ? 'event' : 'meeting';

  let phase: Phase = 'closed';
  let file: File | null = null;
  let problem: string | null = null;
  let ticked = false;
  let isPrivate = false;
  let error: string | null = null;
  let sentBytes = 0;
  let recording: MeetingRecording | null = null;
  let received = new Set<number>();
  let durationMs = 0;

  const busy = () => phase === 'uploading';
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!busy()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);

  function visible(): boolean {
    if (phase === 'uploading' || phase === 'failed') return true;
    const active = activeRecordingMeeting();
    if (active === options.meetingId) return false;
    const existing = options.model.get()?.recording ?? null;
    return !existing;
  }

  function render(): void {
    root.hidden = !visible();
    root.replaceChildren();
    root.className = phase === 'closed' ? 'rec-upload' : 'rec-upload rec-consent';
    if (root.hidden) return;
    if (phase === 'closed') {
      const row = el('div', 'rec-upload__row');
      row.append(el('span', 'muted', `Recorded this ${ctx} on something else?`));
      const open = button('↑ Upload a recording', 'btn btn--secondary btn--sm', 'rec-upload-open');
      open.addEventListener('click', () => {
        phase = 'open';
        render();
      });
      row.append(open);
      root.append(row);
      return;
    }
    if (phase === 'open') root.append(...picker());
    else root.append(...progress());
  }

  function picker(): HTMLElement[] {
    const nodes: HTMLElement[] = [el('h3', 'rec-upload__title', 'Upload a recording')];
    const pick = el('label', 'rec-upload__pick');
    const input = el('input') as HTMLInputElement;
    input.type = 'file';
    input.accept = FILE_ACCEPT;
    input.dataset.part = 'rec-upload-file';
    input.addEventListener('change', () => {
      file = input.files?.[0] ?? null;
      problem = file ? fileProblem(file) : null;
      error = null;
      render();
    });
    pick.append(el('span', 'btn btn--secondary btn--sm', file ? 'Choose another file' : 'Choose an audio file'), input);
    const chosen = el('span', 'rec-upload__file', file ? `${file.name} · ${sizeLabel(file.size)}` : 'Voice Memos, Zoom, Teams or any .m4a, .mp3, .wav');
    const pickRow = el('div', 'rec-upload__row');
    pickRow.append(pick, chosen);
    nodes.push(pickRow);
    if (problem) nodes.push(el('p', 'rec-error', problem));

    const tick = el('label', 'rec-consent__tick');
    const box = el('input') as HTMLInputElement;
    box.type = 'checkbox';
    box.checked = ticked;
    box.dataset.part = 'rec-upload-tick';
    box.addEventListener('change', () => {
      ticked = box.checked;
      render();
      root.querySelector<HTMLInputElement>('[data-part="rec-upload-tick"]')?.focus();
    });
    tick.append(box, document.createTextNode(` Everyone in this recording agreed to it being recorded.`));
    nodes.push(tick);
    nodes.push(el('p', 'rec-consent__law', 'No one will be named until you match each voice to a person on the write-up.'));

    const row = el('div', 'rec-consent__row');
    const priv = el('label', 'rec-upload__private');
    const privBox = el('input') as HTMLInputElement;
    privBox.type = 'checkbox';
    privBox.checked = isPrivate;
    privBox.addEventListener('change', () => {
      isPrivate = privBox.checked;
    });
    priv.append(privBox, el('span', undefined, ' Private: the write-up runs on your Mac, not Claude'));
    const buttons = el('span', 'rec-consent__buttons');
    const cancel = button('Cancel', 'btn btn--ghost btn--sm', 'rec-upload-cancel');
    cancel.addEventListener('click', () => {
      phase = 'closed';
      file = null;
      problem = null;
      ticked = false;
      error = null;
      render();
    });
    const go = button('↑ Upload', 'btn btn--primary', 'rec-upload-go');
    go.disabled = !file || Boolean(problem) || !ticked;
    go.addEventListener('click', () => void begin());
    buttons.append(cancel, go);
    row.append(priv, buttons);
    nodes.push(row);
    if (error) nodes.push(el('p', 'rec-error', error));
    return nodes;
  }

  function progress(): HTMLElement[] {
    const total = file?.size ?? 0;
    const pct = total ? Math.floor((sentBytes / total) * 100) : 0;
    const title = el('h3', 'rec-upload__title', phase === 'failed' ? 'Upload stopped' : 'Uploading the recording');
    const bar = el('div', 'rec-upload__bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(pct));
    const fill = el('i');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    const line = el('p', 'muted', `${sizeLabel(sentBytes)} of ${sizeLabel(total)} · ${file?.name ?? ''}`);
    const nodes: HTMLElement[] = [title, bar, line];
    if (phase === 'uploading') {
      nodes.push(el('p', 'muted', 'Keep this tab open until it finishes. Your Mac transcribes it after.'));
    } else {
      nodes.push(el('p', 'rec-error', error ?? 'The upload stopped.'));
      const row = el('div', 'rec-actions');
      const again = button('Try again', 'btn btn--primary btn--sm', 'rec-upload-retry');
      again.addEventListener('click', () => void carryOn());
      row.append(again, el('span', 'muted', 'It carries on from where it stopped.'));
      nodes.push(row);
    }
    return nodes;
  }

  function onProgress(sent: number): void {
    sentBytes = sent;
    const fill = root.querySelector<HTMLElement>('.rec-upload__bar i');
    const bar = root.querySelector<HTMLElement>('.rec-upload__bar');
    const total = file?.size ?? 0;
    const pct = total ? Math.floor((sent / total) * 100) : 0;
    if (fill) fill.style.width = `${pct}%`;
    bar?.setAttribute('aria-valuenow', String(pct));
    const line = bar?.nextElementSibling;
    if (line) line.textContent = `${sizeLabel(sent)} of ${sizeLabel(total)} · ${file?.name ?? ''}`;
  }

  async function begin(): Promise<void> {
    if (!file || problem || !ticked || busy()) return;
    error = null;
    const body = {
      meeting_id: options.meetingId,
      consent_confirmed: true as const,
      private: isPrivate,
      kind: options.kind,
      attendees: options.people().map((person) => ({ who: person.ref, name: person.name, role: person.role })),
      room: options.room
    };
    try {
      let started: MeetingRecording;
      try {
        started = (await startRecording(body)).recording;
      } catch (err) {
        if (!(err instanceof ApiClientError && err.status === 409)) throw err;
        const replace = await askConfirm({
          title: `Replace this ${ctx}’s recording?`,
          body: 'This replaces the last recording, its transcript and its write-up. It can’t be undone.',
          confirm: 'Replace it'
        });
        if (!replace) return;
        started = (await startRecording({ ...body, replace: true })).recording;
      }
      recording = started;
      received = new Set<number>();
      sentBytes = 0;
      durationMs = await audioDurationMs(file);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Life Hub could not start the upload.';
      render();
      return;
    }
    await carryOn();
  }

  async function carryOn(): Promise<void> {
    if (!file || !recording) return;
    const rec = recording;
    const source = file;
    phase = 'uploading';
    error = null;
    render();
    try {
      await sendFileParts({
        file: source,
        received,
        onProgress,
        upload: async (index, blob) => {
          await uploadRecordingPart({ meeting_id: options.meetingId, recording_id: rec.id, index, blob });
        }
      });
      const parts = planFileParts(source.size).length;
      const stopped = await stopRecording({
        meeting_id: options.meetingId,
        recording_id: rec.id,
        parts_expected: parts,
        duration_ms: durationMs,
        taps: [],
        flags: [],
        notes: options.notes(),
        segment_starts: [0]
      });
      if (stopped.missing?.length) {
        for (const index of stopped.missing) received.delete(index);
        throw new Error(`${stopped.missing.length} part${stopped.missing.length === 1 ? '' : 's'} didn’t arrive.`);
      }
      phase = 'closed';
      file = null;
      ticked = false;
      recording = null;
      options.model.patch({ recording: stopped.recording, transcript: null, writeup: null });
      void options.model.refresh();
    } catch (err) {
      phase = 'failed';
      error = err instanceof Error ? `${err.message} Nothing is lost: the file is still on this device.` : 'The upload stopped.';
    }
    render();
  }

  const unsubscribe = options.model.subscribe(() => {
    if (!busy()) render();
  });
  render();

  return {
    el: root,
    destroy() {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
    }
  };
}

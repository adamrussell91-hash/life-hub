/**
 * Photos and sound on a saved moment: add, record, remove. Used by Edit moment.
 * Nothing is written until the sheet saves; new files then go through the
 * device outbox like New moment's do.
 */
import type { JournalDocument } from '@/api/journal';
import type { JournalMedia, JournalMoment } from '@/journal/types';
import {
  buildJournalMediaRow,
  isAudioContentType,
  makeMediaId,
  normalizeMediaContentType,
} from '@/journal/media-upload';
import {
  isFixtureMediaUrl,
  journalAudioSrc,
  journalMediaDerivativeUrl,
  localJournalMediaUrl,
} from '@/journal/media-loading';
import {
  AmbientRecorderError,
  startAmbientRecording,
  type AmbientRecording,
} from '@/journal/ambient-recorder';
import { formatClipLength } from '@/journal/capture-stamp';
import { I } from '@/lib/icons';

export interface NewAttachment {
  mediaId: string;
  row: JournalMedia;
  blob: Blob;
}

/**
 * Moves the moment's media to match the edit. A removed file is soft-deleted
 * only when no other live moment still shows it (merges can share media).
 */
export function applyAttachmentEdits(
  journal: JournalDocument,
  momentId: string,
  added: NewAttachment[],
  removedIds: string[],
): JournalDocument {
  const removed = new Set(removedIds);
  const moments = journal.moments.map((m) =>
    m.id === momentId
      ? { ...m, media_ids: [...m.media_ids.filter((id) => !removed.has(id)), ...added.map((a) => a.mediaId)] }
      : m,
  );
  const stillShown = new Set(moments.filter((m) => m.lifecycle === 'live').flatMap((m) => m.media_ids));
  const now = new Date().toISOString();
  const media = journal.media.map((row) =>
    removed.has(row.id) && !stillShown.has(row.id) && row.lifecycle !== 'deleted'
      ? { ...row, lifecycle: 'deleted' as const, deleted_at: now }
      : row,
  );
  return { ...journal, moments, media: [...media, ...added.map((a) => a.row)] };
}

export interface MomentAttachmentsHandle {
  changed(): boolean;
  added(): NewAttachment[];
  removed(): string[];
  /** Finishes a recording and any file still being read. Call before saving. */
  settle(): Promise<void>;
  destroy(): void;
}

interface Shown {
  id: string;
  audio: boolean;
  src: string;
  seconds?: number;
}

function photoSrc(tripId: string, media: JournalMedia): string {
  const local = localJournalMediaUrl(media.id);
  if (local) return local;
  if (isFixtureMediaUrl(media.url)) return media.url;
  return journalMediaDerivativeUrl(tripId, media.id, 320);
}

function isAudio(media: JournalMedia): boolean {
  return isAudioContentType(media.content_type ?? '');
}

export function mountMomentAttachments(
  host: HTMLElement,
  opts: { tripId: string; journal: JournalDocument; moment: JournalMoment; onChange: () => void },
): MomentAttachmentsHandle {
  const byId = new Map(opts.journal.media.map((m) => [m.id, m]));
  const existing = opts.moment.media_ids
    .map((id) => byId.get(id))
    .filter((m): m is JournalMedia => Boolean(m) && m!.lifecycle !== 'deleted');
  const removed = new Set<string>();
  const added: (NewAttachment & { url: string; seconds?: number })[] = [];
  const pending = new Set<Promise<void>>();
  let recording: AmbientRecording | null = null;
  let recordingDone: Promise<void> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let player: HTMLAudioElement | null = null;
  let playingId: string | null = null;

  const list = document.createElement('div');
  list.className = 'journal-capture__thumbs journal-attachments__list';
  const sounds = document.createElement('div');
  sounds.className = 'journal-attachments__sounds';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;

  const addPhoto = document.createElement('button');
  addPhoto.type = 'button';
  addPhoto.className = 'journal-attachments__add';
  addPhoto.innerHTML = `${I.camera}<span>Add photo</span>`;
  const record = document.createElement('button');
  record.type = 'button';
  record.className = 'journal-attachments__add';
  const recordIcon = document.createElement('span');
  recordIcon.className = 'journal-attachments__icon';
  recordIcon.innerHTML = I.mic;
  const recordDot = document.createElement('span');
  recordDot.className = 'journal-capture__recording-dot';
  recordDot.hidden = true;
  recordDot.setAttribute('aria-hidden', 'true');
  const recordLabel = document.createElement('span');
  recordLabel.textContent = 'Record';
  record.append(recordIcon, recordDot, recordLabel);

  const actions = document.createElement('div');
  actions.className = 'journal-attachments__actions';
  actions.append(addPhoto, record);

  const notice = document.createElement('p');
  notice.className = 'journal-edit-moment__section-hint';
  notice.hidden = true;
  notice.setAttribute('role', 'status');

  host.replaceChildren(list, sounds, actions, notice, input);

  function shown(): Shown[] {
    const out: Shown[] = [];
    for (const m of existing) {
      if (removed.has(m.id)) continue;
      out.push(
        isAudio(m)
          ? { id: m.id, audio: true, src: journalAudioSrc(opts.tripId, m), seconds: m.duration_s }
          : { id: m.id, audio: false, src: photoSrc(opts.tripId, m) },
      );
    }
    for (const a of added) {
      out.push({ id: a.mediaId, audio: isAudio(a.row), src: a.url, seconds: a.seconds });
    }
    return out;
  }

  function remove(id: string): void {
    const i = added.findIndex((a) => a.mediaId === id);
    if (i >= 0) {
      URL.revokeObjectURL(added[i]!.url);
      added.splice(i, 1);
    } else {
      removed.add(id);
    }
    if (playingId === id) stopPlaying();
    render();
    opts.onChange();
  }

  function stopPlaying(): void {
    player?.pause();
    playingId = null;
  }

  function togglePlay(item: Shown): void {
    if (playingId === item.id) {
      stopPlaying();
      render();
      return;
    }
    player?.pause();
    player = new Audio(item.src);
    playingId = item.id;
    player.addEventListener('ended', () => {
      playingId = null;
      render();
    });
    void player.play().catch(() => {
      playingId = null;
      render();
    });
    render();
  }

  function render(): void {
    const items = shown();
    const photos = items.filter((i) => !i.audio);
    const clips = items.filter((i) => i.audio);
    list.replaceChildren(
      ...photos.map((p, index) => {
        const cell = document.createElement('div');
        cell.className = 'journal-capture__thumb';
        const img = document.createElement('img');
        img.src = p.src;
        img.alt = `Photo ${index + 1}`;
        img.decoding = 'async';
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'journal-capture__thumb-remove';
        x.setAttribute('aria-label', `Remove photo ${index + 1}`);
        x.textContent = '×';
        x.addEventListener('click', () => remove(p.id));
        cell.append(img, x);
        return cell;
      }),
    );
    list.hidden = photos.length === 0;
    sounds.replaceChildren(
      ...clips.map((c, index) => {
        const chip = document.createElement('div');
        chip.className = 'journal-attachments__sound';
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'journal-attachments__play';
        const playing = playingId === c.id;
        play.setAttribute('aria-label', playing ? `Pause sound ${index + 1}` : `Play sound ${index + 1}`);
        play.textContent = `${playing ? '❚❚' : '▶'} Sound${c.seconds ? ` · ${formatClipLength(c.seconds)}` : ''}`;
        play.addEventListener('click', () => togglePlay(c));
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'journal-attachments__sound-remove';
        x.setAttribute('aria-label', `Remove sound ${index + 1}`);
        x.textContent = '×';
        x.addEventListener('click', () => remove(c.id));
        chip.append(play, x);
        return chip;
      }),
    );
    sounds.hidden = clips.length === 0;
  }

  function track(work: Promise<void>): void {
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }

  function addFile(blob: Blob, seconds?: number): Promise<void> {
    const mediaId = makeMediaId();
    const contentType = normalizeMediaContentType(blob, seconds !== undefined ? 'audio/mp4' : 'image/jpeg');
    const work = buildJournalMediaRow(mediaId, blob, contentType, { durationS: seconds }).then((row) => {
      added.push({ mediaId, row, blob, url: URL.createObjectURL(blob), seconds });
      render();
      opts.onChange();
    });
    track(work);
    return work;
  }

  function showNotice(text: string | null): void {
    notice.hidden = !text;
    notice.textContent = text ?? '';
  }

  function setRecordingUi(on: boolean, startedAt = 0): void {
    record.classList.toggle('is-recording', on);
    record.setAttribute('aria-pressed', on ? 'true' : 'false');
    recordDot.hidden = !on;
    recordIcon.hidden = on;
    if (ticker) clearInterval(ticker);
    ticker = null;
    if (!on) {
      recordLabel.textContent = 'Record';
      return;
    }
    const tick = () => {
      recordLabel.textContent = `Stop · ${formatClipLength((Date.now() - startedAt) / 1000)}`;
    };
    tick();
    ticker = setInterval(tick, 500);
  }

  async function stopRecording(): Promise<void> {
    const rec = recording;
    if (rec && !recordingDone) {
      recordingDone = rec.stop().then(async (clip) => {
        recording = null;
        setRecordingUi(false);
        if (clip) await addFile(clip.blob, clip.seconds);
      });
    }
    if (recordingDone) await recordingDone;
    recordingDone = null;
  }

  input.addEventListener('change', () => {
    const files = input.files ? [...input.files] : [];
    input.value = '';
    for (const f of files) void addFile(f);
  });
  addPhoto.addEventListener('click', () => {
    // The camera takes the phone over and cuts the microphone, so end the clip first.
    void stopRecording().then(() => input.click());
  });
  record.addEventListener('click', () => {
    if (recording) {
      void stopRecording();
      return;
    }
    showNotice(null);
    const start = startAmbientRecording().then(
      (rec) => {
        recording = rec;
        setRecordingUi(true, rec.startedAt);
        opts.onChange();
      },
      (err) => {
        showNotice(err instanceof AmbientRecorderError ? err.message : 'Microphone access was not allowed.');
      },
    );
    track(start);
  });

  render();

  return {
    changed: () => removed.size > 0 || added.length > 0 || recording !== null,
    added: () => added.map(({ mediaId, row, blob }) => ({ mediaId, row, blob })),
    removed: () => [...removed],
    async settle() {
      await Promise.all([...pending]);
      await stopRecording();
      await Promise.all([...pending]);
    },
    destroy() {
      stopPlaying();
      if (ticker) clearInterval(ticker);
      if (recording) void recording.stop();
      for (const a of added) URL.revokeObjectURL(a.url);
    },
  };
}

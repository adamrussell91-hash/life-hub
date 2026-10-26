import type { JournalDocument } from '@/api/journal';
import { persistJournalPatch, type PersistedJournal } from '@/journal/journal-sheet-save';
import type { JournalCoordinates, JournalMedia } from '@/journal/types';
import {
  buildJournalMediaRow,
  makeMediaId,
  normalizeMediaContentType,
} from '@/journal/media-upload';
import {
  dropQueuedJournalMedia,
  flushJournalOutbox,
  queueJournalMedia,
} from '@/journal/journal-outbox';
import { rememberLocalJournalMedia } from '@/journal/media-loading';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
import {
  type CaptureDraftMode,
  type JournalCaptureDraft,
  clearCaptureDraft,
  createDraftAutosave,
  loadCaptureDraft,
} from '@/journal/drafts';
import { bootstrapJournalForFirstMoment } from '@/journal/capture-context';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import {
  chronologicalDisplayOrder,
  formatClipLength,
  formatStampDate,
  formatStampTime,
  localPartsInZone,
  resolveCaptureStamp,
  type LibraryPhotoMeta,
} from '@/journal/capture-stamp';

export type CaptureMode = CaptureDraftMode;

export interface OpenCaptureSheetOptions {
  tripId: string;
  legId: string;
  localDate: string;
  journal: JournalDocument;
  version: string;
  tripTitle?: string;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
  /** Kept for callers; bulk import has its own toolbar entry. */
  onImportPhotos?: (files: File[]) => void;
}

export interface CaptureSaveInput {
  text: string;
  photoCount: number;
  hasVoiceAttachment: boolean;
}

/** Save is enabled when there is body text or at least one attachment. */
export function isCaptureSaveEnabled(input: CaptureSaveInput): boolean {
  if (input.text.trim().length > 0) return true;
  if (input.photoCount > 0) return true;
  if (input.hasVoiceAttachment) return true;
  return false;
}

/** Ambient means the room as it is: no echo cancelling, noise gating or levelling. */
export const AMBIENT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/** How long Save waits for a first location fix before saving without one. */
const LOCATION_WAIT_ON_SAVE_MS = 4000;

type PhotoSource = 'camera' | 'library';

interface CapturedPhoto {
  blob: Blob;
  name: string;
  source: PhotoSource;
  url: string;
  meta: Promise<LibraryPhotoMeta>;
}

type LocationState =
  | { kind: 'locating' }
  | { kind: 'ok'; coords: JournalCoordinates; accuracy?: number }
  | { kind: 'off'; reason: 'denied' | 'unavailable' };

function makeMomentId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'mom_';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function readLibraryMeta(blob: Blob): Promise<LibraryPhotoMeta> {
  try {
    const { inspectFile } = await import('@/journal/exif-worker');
    const inspected = await inspectFile(blob);
    return {
      instant: inspected.instant,
      wall: inspected.capture_wall_time,
      coordinates: inspected.coordinates,
    };
  } catch {
    return {};
  }
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('journal-capture__icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

const ICON_SOUND =
  'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3';
const ICON_CAMERA =
  'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const ICON_LIBRARY = 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01';

export function openCaptureSheet(options: OpenCaptureSheetOptions): { destroy(): void } {
  attachVisualViewportInset();

  const leg = options.journal.legs.find((l) => l.id === options.legId);
  const timeZone = leg?.timezone && leg.timezone !== 'UTC' ? leg.timezone : deviceTimeZone();

  let openedAt = new Date();
  let text = '';
  let photos: CapturedPhoto[] = [];
  let soundBlob: Blob | null = null;
  let soundUrl: string | null = null;
  let soundSeconds = 0;
  let recorder: MediaRecorder | null = null;
  let recordStartedAt = 0;
  let recordTicker: ReturnType<typeof setInterval> | null = null;
  let recordingDone: Promise<void> | null = null;
  let location: LocationState = { kind: 'locating' };
  /** A restored draft keeps the place it was captured, not where the phone is now. */
  let locationPinned = false;
  let locationWaiters: (() => void)[] = [];
  let dirty = false;
  let destroyed = false;
  let discardOpen = false;
  let saving = false;
  let overlay: JournalOverlayHandle | null = null;

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-capture-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'New moment');

  const title = document.createElement('h3');
  title.textContent = 'New moment';

  // The stamp line: where and when, filled in by the phone.
  const stamp = document.createElement('div');
  stamp.className = 'journal-capture__stamp';
  const stampPlace = document.createElement('span');
  stampPlace.className = 'journal-capture__stamp-place';
  const stampTime = document.createElement('span');
  stampTime.className = 'journal-capture__stamp-time num';
  const retryLocation = document.createElement('button');
  retryLocation.type = 'button';
  retryLocation.className = 'btn btn--ghost journal-capture__stamp-retry';
  retryLocation.textContent = 'Try again';
  retryLocation.hidden = true;
  stamp.append(stampPlace, stampTime, retryLocation);
  stamp.setAttribute('aria-live', 'polite');

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  // Three big capture buttons.
  const grid = document.createElement('div');
  grid.className = 'journal-capture__actions';

  function actionButton(label: string, path: string, kind: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `journal-capture__action journal-capture__action--${kind}`;
    const text = document.createElement('span');
    text.className = 'journal-capture__action-label';
    text.textContent = label;
    b.append(icon(path), text);
    return b;
  }

  const ambientBtn = actionButton('Ambient', ICON_SOUND, 'ambient');
  ambientBtn.setAttribute('aria-pressed', 'false');
  const cameraBtn = actionButton('Take photo', ICON_CAMERA, 'camera');
  const libraryBtn = actionButton('Add photo', ICON_LIBRARY, 'library');
  grid.append(ambientBtn, cameraBtn, libraryBtn);

  const cameraInput = document.createElement('input');
  cameraInput.type = 'file';
  cameraInput.accept = 'image/jpeg';
  cameraInput.setAttribute('capture', 'environment');
  cameraInput.hidden = true;

  const libraryInput = document.createElement('input');
  libraryInput.type = 'file';
  libraryInput.accept = 'image/jpeg,image/png';
  libraryInput.multiple = true;
  libraryInput.hidden = true;

  const recordingBar = document.createElement('div');
  recordingBar.className = 'journal-capture__recording';
  recordingBar.hidden = true;
  const recordingDot = document.createElement('span');
  recordingDot.className = 'journal-capture__recording-dot';
  recordingDot.setAttribute('aria-hidden', 'true');
  const recordingLabel = document.createElement('span');
  recordingLabel.className = 'num';
  recordingBar.append(recordingDot, recordingLabel);

  const notice = document.createElement('p');
  notice.className = 'journal-capture__notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;

  // What has been captured so far.
  const tray = document.createElement('div');
  tray.className = 'journal-capture__tray';
  tray.hidden = true;
  const thumbs = document.createElement('div');
  thumbs.className = 'journal-capture__thumbs';
  const soundRow = document.createElement('div');
  soundRow.className = 'journal-capture__sound';
  soundRow.hidden = true;
  const soundLabel = document.createElement('span');
  soundLabel.className = 'journal-capture__sound-label';
  const soundPlayer = document.createElement('audio');
  soundPlayer.controls = true;
  soundPlayer.className = 'journal-capture__sound-player';
  const soundRemove = document.createElement('button');
  soundRemove.type = 'button';
  soundRemove.className = 'btn btn--ghost journal-capture__remove';
  soundRemove.textContent = 'Remove';
  soundRow.append(soundLabel, soundPlayer, soundRemove);
  tray.append(thumbs, soundRow);

  const textArea = document.createElement('textarea');
  textArea.className = 'journal-capture__text';
  textArea.rows = 2;
  textArea.placeholder = 'Add a line (optional)';
  textArea.setAttribute('aria-label', 'A line about this moment');

  const draftStatus = document.createElement('p');
  draftStatus.className = 'journal-capture__draft-status';
  draftStatus.hidden = true;
  draftStatus.textContent = 'Draft kept on this phone';

  const discardBar = document.createElement('div');
  discardBar.className = 'journal-capture__discard confirm-card';
  discardBar.hidden = true;
  const discardText = document.createElement('p');
  discardText.textContent = 'Discard this moment?';
  const discardActions = document.createElement('div');
  discardActions.className = 'confirm-card__actions';
  const keepEditingBtn = document.createElement('button');
  keepEditingBtn.type = 'button';
  keepEditingBtn.className = 'btn btn--secondary';
  keepEditingBtn.textContent = 'Keep it';
  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'btn btn--ghost';
  discardBtn.textContent = 'Discard';
  discardActions.append(keepEditingBtn, discardBtn);
  discardBar.append(discardText, discardActions);

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const saveStatus = document.createElement('p');
  saveStatus.className = 'journal-sheet__status';
  saveStatus.setAttribute('role', 'alert');
  saveStatus.hidden = true;
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';

  // ---- Location -----------------------------------------------------------

  function settleLocation(next: LocationState): void {
    location = next;
    const waiters = locationWaiters;
    locationWaiters = [];
    waiters.forEach((w) => w());
    renderStamp();
    if (next.kind === 'ok') markDirty(false);
  }

  function requestLocation(): void {
    if (!navigator.geolocation?.getCurrentPosition) {
      settleLocation({ kind: 'off', reason: 'unavailable' });
      return;
    }
    location = { kind: 'locating' };
    renderStamp();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (destroyed || locationPinned) return;
        settleLocation({
          kind: 'ok',
          coords: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (destroyed || locationPinned) return;
        settleLocation({ kind: 'off', reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }

  function waitForLocation(ms: number): Promise<void> {
    if (location.kind !== 'locating') return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      locationWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  function hasLiveCapture(): boolean {
    return Boolean(soundBlob) || recorder !== null || photos.some((p) => p.source === 'camera');
  }

  function renderStamp(): void {
    const libraryOnly = !hasLiveCapture() && photos.length > 0;
    if (libraryOnly) {
      stampPlace.textContent = 'Time and place from the photo';
      retryLocation.hidden = true;
    } else if (location.kind === 'locating') {
      stampPlace.textContent = 'Finding your location…';
      retryLocation.hidden = true;
    } else if (location.kind === 'ok') {
      const acc = location.accuracy;
      stampPlace.textContent =
        acc && Number.isFinite(acc) ? `Location saved (within ${Math.round(acc)} m)` : 'Location saved';
      retryLocation.hidden = true;
    } else {
      stampPlace.textContent =
        location.reason === 'denied' ? 'Location is off for this site' : 'No location yet';
      retryLocation.hidden = location.reason === 'denied';
    }
    const now = localPartsInZone(openedAt, timeZone);
    stampTime.textContent = `${formatStampTime(now.local_time)}, ${formatStampDate(now.local_date)}`;
  }

  // ---- Drafts --------------------------------------------------------------

  function draftPayload(): JournalCaptureDraft {
    const parts = localPartsInZone(openedAt, timeZone);
    return {
      tripId: options.tripId,
      legId: options.legId,
      localDate: parts.local_date,
      mode: soundBlob ? 'voice' : photos.length ? 'photos' : 'text',
      text,
      localTime: parts.local_time,
      placeName: '',
      updatedAt: new Date().toISOString(),
      hasVoice: Boolean(soundBlob),
      photoNames: photos.map((p) => p.name),
      photoSources: photos.map((p) => p.source),
      draftKeyDate: options.localDate,
      openedAt: openedAt.toISOString(),
      deviceCoordinates: location.kind === 'ok' ? location.coords : undefined,
    };
  }

  const autosave = createDraftAutosave(
    () => ({ draft: draftPayload(), voice: soundBlob, photos: photos.map((p) => p.blob) }),
    () => {
      draftStatus.hidden = !hasContent();
    },
  );

  function hasContent(): boolean {
    return isCaptureSaveEnabled({
      text,
      photoCount: photos.length,
      hasVoiceAttachment: Boolean(soundBlob),
    });
  }

  function markDirty(userChange = true): void {
    if (userChange) dirty = true;
    if (dirty) autosave.schedule();
    refreshSave();
  }

  function refreshSave(): void {
    saveBtn.disabled = saving || (!hasContent() && recorder === null);
  }

  function showNotice(message: string | null): void {
    notice.hidden = !message;
    notice.textContent = message ?? '';
  }

  // ---- Tray ----------------------------------------------------------------

  function renderTray(): void {
    thumbs.replaceChildren();
    photos.forEach((photo, index) => {
      const cell = document.createElement('div');
      cell.className = 'journal-capture__thumb';
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = `Photo ${index + 1}`;
      img.decoding = 'async';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'journal-capture__thumb-remove';
      remove.setAttribute('aria-label', `Remove photo ${index + 1}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(photo.url);
        photos = photos.filter((p) => p !== photo);
        renderTray();
        renderStamp();
        markDirty();
      });
      cell.append(img, remove);
      thumbs.append(cell);
    });
    thumbs.hidden = photos.length === 0;

    if (soundBlob && soundUrl) {
      soundRow.hidden = false;
      soundLabel.textContent = `Sound · ${formatClipLength(soundSeconds)}`;
      if (soundPlayer.src !== soundUrl) soundPlayer.src = soundUrl;
    } else {
      soundRow.hidden = true;
      soundPlayer.removeAttribute('src');
    }
    tray.hidden = photos.length === 0 && !soundBlob;
    refreshSave();
  }

  function addPhotos(files: File[], source: PhotoSource): void {
    for (const file of files) {
      photos.push({
        blob: file,
        name: file.name,
        source,
        url: URL.createObjectURL(file),
        meta: source === 'library' ? readLibraryMeta(file) : Promise.resolve({}),
      });
    }
    renderTray();
    renderStamp();
    markDirty();
  }

  function clearSound(): void {
    if (soundUrl) URL.revokeObjectURL(soundUrl);
    soundUrl = null;
    soundBlob = null;
    soundSeconds = 0;
  }

  // ---- Ambient sound ---------------------------------------------------------

  function setRecordingUi(on: boolean): void {
    ambientBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    ambientBtn.classList.toggle('is-recording', on);
    const label = ambientBtn.querySelector('.journal-capture__action-label');
    if (label) label.textContent = on ? 'Stop' : soundBlob ? 'Record again' : 'Ambient';
    recordingBar.hidden = !on;
    if (recordTicker) clearInterval(recordTicker);
    recordTicker = null;
    if (on) {
      const tick = () => {
        recordingLabel.textContent = `Recording · ${formatClipLength((Date.now() - recordStartedAt) / 1000)}`;
      };
      tick();
      recordTicker = setInterval(tick, 500);
    }
  }

  async function startAmbient(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showNotice('Sound recording is not available in this browser.');
      return;
    }
    showNotice(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: AMBIENT_AUDIO_CONSTRAINTS });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        showNotice('Microphone access was not allowed.');
        return;
      }
    }
    if (destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const chunks: BlobPart[] = [];
    const rec = new MediaRecorder(stream);
    recorder = rec;
    recordStartedAt = Date.now();
    recordingDone = new Promise<void>((resolve) => {
      rec.addEventListener('dataavailable', (ev) => {
        if (ev.data.size) chunks.push(ev.data);
      });
      rec.addEventListener('stop', () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = (Date.now() - recordStartedAt) / 1000;
        recorder = null;
        if (chunks.length) {
          clearSound();
          soundBlob = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' });
          soundUrl = URL.createObjectURL(soundBlob);
          soundSeconds = seconds;
        }
        setRecordingUi(false);
        renderTray();
        renderStamp();
        markDirty();
        resolve();
      });
    });
    // Small timeslices so a killed tab still leaves most of the clip.
    rec.start(1000);
    setRecordingUi(true);
    renderStamp();
    refreshSave();
  }

  async function stopAmbient(): Promise<void> {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (recordingDone) await recordingDone;
    recordingDone = null;
  }

  ambientBtn.addEventListener('click', () => {
    if (recorder) void stopAmbient();
    else void startAmbient();
  });

  // The camera takes over the phone, which cuts the microphone, so finish the
  // clip cleanly first.
  cameraBtn.addEventListener('click', () => {
    void stopAmbient().then(() => cameraInput.click());
  });
  libraryBtn.addEventListener('click', () => libraryInput.click());

  cameraInput.addEventListener('change', () => {
    const list = cameraInput.files ? [...cameraInput.files] : [];
    cameraInput.value = '';
    if (list.length) addPhotos(list, 'camera');
  });
  libraryInput.addEventListener('change', () => {
    const list = libraryInput.files ? [...libraryInput.files] : [];
    libraryInput.value = '';
    if (list.length) addPhotos(list, 'library');
  });

  soundRemove.addEventListener('click', () => {
    clearSound();
    setRecordingUi(false);
    renderTray();
    renderStamp();
    markDirty();
  });

  retryLocation.addEventListener('click', () => requestLocation());

  textArea.addEventListener('input', () => {
    text = textArea.value;
    markDirty();
  });
  textArea.addEventListener('blur', () => void autosave.flush());

  // ---- Close -----------------------------------------------------------------

  function requestClose(after?: () => void): void {
    if (destroyed || discardOpen) return;
    if (dirty && (hasContent() || recorder)) {
      showDiscard(after);
      return;
    }
    finishClose(after);
  }

  function showDiscard(after?: () => void): void {
    discardOpen = true;
    discardBar.hidden = false;
    discardBar.scrollIntoView({ block: 'nearest' });
    keepEditingBtn.onclick = () => {
      discardOpen = false;
      discardBar.hidden = true;
    };
    discardBtn.onclick = () => {
      discardOpen = false;
      discardBar.hidden = true;
      void clearCaptureDraft(options.tripId, options.legId, options.localDate).then(() =>
        finishClose(after),
      );
    };
  }

  function finishClose(after?: () => void): void {
    if (destroyed) return;
    destroyed = true;
    autosave.destroy();
    if (recordTicker) clearInterval(recordTicker);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    for (const p of photos) URL.revokeObjectURL(p.url);
    if (soundUrl) URL.revokeObjectURL(soundUrl);
    overlay?.release();
    options.onClose?.();
    after?.();
  }

  cancelBtn.addEventListener('click', () => requestClose());

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (saveBtn.disabled) return;
    void submitMoment();
  });

  // ---- Save ------------------------------------------------------------------

  async function submitMoment(): Promise<void> {
    saving = true;
    refreshSave();
    saveStatus.hidden = true;
    const originalLabel = saveBtn.textContent;

    await stopAmbient();
    if (!hasContent()) {
      saving = false;
      refreshSave();
      return;
    }
    if (location.kind === 'locating' && hasLiveCapture()) {
      saveBtn.textContent = 'Adding location…';
      await waitForLocation(LOCATION_WAIT_ON_SAVE_MS);
    }
    saveBtn.textContent = originalLabel;

    const libraryMeta = await Promise.all(
      photos.filter((p) => p.source === 'library').map((p) => p.meta),
    );
    const when = resolveCaptureStamp({
      openedAt,
      timeZone,
      deviceCoordinates: location.kind === 'ok' ? location.coords : undefined,
      hasLiveCapture: hasLiveCapture(),
      libraryPhotos: libraryMeta,
    });

    const momentId = makeMomentId();
    const display_order = chronologicalDisplayOrder(
      options.journal.moments,
      options.legId,
      when.local_date,
      when.local_time,
    );

    // Photos and the sound clip become media rows. Their bytes go into the
    // device outbox first, so nothing is lost if the phone drops signal or
    // the tab is killed before the upload finishes.
    const attachments: { blob: Blob; contentType: string; durationS?: number }[] = photos.map((p) => ({
      blob: p.blob,
      contentType: normalizeMediaContentType(p.blob),
    }));
    if (soundBlob) {
      attachments.push({
        blob: soundBlob,
        contentType: normalizeMediaContentType(soundBlob, 'audio/mp4'),
        durationS: soundSeconds || undefined,
      });
    }

    const mediaRows: JournalMedia[] = [];
    try {
      for (const a of attachments) {
        const mediaId = makeMediaId();
        mediaRows.push(await buildJournalMediaRow(mediaId, a.blob, a.contentType, a));
        await queueJournalMedia(
          { tripId: options.tripId, mediaId, blob: a.blob, contentType: a.contentType },
          { flush: false },
        );
      }
    } catch {
      await dropQueuedJournalMedia(mediaRows.map((m) => m.id));
      saving = false;
      refreshSave();
      saveStatus.hidden = false;
      saveStatus.textContent = 'This phone is out of space for the photos. Your draft is still here.';
      return;
    }

    const baseJournal = bootstrapJournalForFirstMoment(
      options.journal,
      options.legId,
      when.local_date,
      options.tripTitle?.trim() || 'Trip',
    );
    const nextJournal: JournalDocument = {
      ...baseJournal,
      revision: baseJournal.revision + 1,
      media: [...baseJournal.media, ...mediaRows],
      moments: [
        ...baseJournal.moments,
        {
          id: momentId,
          leg_id: options.legId,
          local_date: when.local_date,
          local_time: when.local_time,
          coordinates: when.coordinates,
          location_source: when.location_source,
          text: text.trim() || undefined,
          media_ids: mediaRows.map((m) => m.id),
          display_order,
          lifecycle: 'live',
        },
      ],
    };
    let envelope: PersistedJournal;
    try {
      envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
    } catch {
      await dropQueuedJournalMedia(mediaRows.map((m) => m.id));
      saving = false;
      refreshSave();
      saveStatus.hidden = false;
      saveStatus.textContent = 'Could not save. Your draft is still here, so try again.';
      return;
    }
    attachments.forEach((a, i) => rememberLocalJournalMedia(mediaRows[i]!.id, a.blob));
    if (mediaRows.length) void flushJournalOutbox();
    await clearCaptureDraft(options.tripId, options.legId, options.localDate);
    options.onSaved?.(envelope);
    finishClose();
    if (envelope.queued) {
      showHubToast('Saved on this phone. It will upload when you are back online.');
    } else if (mediaRows.length) {
      showHubToast(
        mediaRows.length === 1 ? 'Saved. Uploading 1 file…' : `Saved. Uploading ${mediaRows.length} files…`,
      );
    }
  }

  // ---- Mount -----------------------------------------------------------------

  scroll.append(grid, recordingBar, notice, tray, textArea, draftStatus, cameraInput, libraryInput);
  form.append(scroll, saveStatus, discardBar, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(title, stamp, form);
  back.append(sheet);
  overlay = presentJournalOverlay(back, {
    anchor: options.anchor,
    dismiss: () => requestClose(),
  });

  void (async () => {
    const restored = await loadCaptureDraft(options.tripId, options.legId, options.localDate);
    // Never clobber anything captured while the draft was loading.
    if (!restored || destroyed || dirty) return;
    const d = restored.draft;
    if (d.openedAt) openedAt = new Date(d.openedAt);
    text = d.text;
    textArea.value = text;
    photos = restored.photoBlobs.map((blob, i) => {
      const source: PhotoSource = d.photoSources?.[i] ?? 'library';
      return {
        blob,
        name: d.photoNames[i] ?? `photo-${i + 1}.jpg`,
        source,
        url: URL.createObjectURL(blob),
        meta: source === 'library' ? readLibraryMeta(blob) : Promise.resolve({}),
      };
    });
    if (restored.voiceBlob && d.hasVoice) {
      soundBlob = restored.voiceBlob;
      soundUrl = URL.createObjectURL(soundBlob);
    }
    if (d.deviceCoordinates) {
      locationPinned = true;
      settleLocation({ kind: 'ok', coords: d.deviceCoordinates });
    }
    dirty = hasContent();
    draftStatus.hidden = !dirty;
    setRecordingUi(false);
    renderTray();
    renderStamp();
  })();

  renderTray();
  renderStamp();
  requestLocation();

  return {
    destroy() {
      finishClose();
    },
  };
}

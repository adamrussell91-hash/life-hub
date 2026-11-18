/**
 * The postcard sheet: a photo, up to 30 seconds of voice, the words and the address,
 * then Post. It opens from a stop that is already ticked safe, and the tick never waits
 * on anything here.
 *
 * What the sheet knows lives in composer-state.ts. This file draws it and runs the work:
 * reading the photo, recording, uploading, writing out the words, keeping the draft.
 */
import type { Item, Trip } from '@/types';
import { ApiClientError } from '@/api/client';
import {
  deleteTravelAudio,
  getTrip,
  setPostcard,
  transcribeTravelAudio,
  uploadTravelAudio,
  uploadTravelPhoto,
  type TripEnvelope
} from '@/api/travel';
import { presentJournalOverlay } from '@/journal/overlay-host';
import { I } from '@/lib/icons';
import { safeSaveErrorMessage } from '@/lib/safe-photo';
import { formatClipClock } from '@/postcard/card';
import {
  buildPostcard,
  composerReducer,
  hasContent,
  initialComposerState,
  postBlocker,
  type ComposerEvent,
  type ComposerState
} from '@/postcard/composer-state';
import { idbDraftStore, type DraftStore } from '@/postcard/draft';
import {
  POSTCARD_MAX_AUDIO_S,
  POSTCARD_MAX_LINE_CHARS,
  POSTCARD_MAX_TEXT_CHARS,
  fallbackAddress,
  type PostcardView
} from '@/postcard/model';
import { addressForPhoto, preparePostcardPhoto } from '@/postcard/photo-place';
import { openPostcardViewer } from '@/postcard/viewer';
import { VoiceClipError, startVoiceClip, type VoiceClipRecording } from '@/postcard/voice-clip';

export interface ComposerDeps {
  preparePhoto: typeof preparePostcardPhoto;
  addressForPhoto: typeof addressForPhoto;
  startVoiceClip: typeof startVoiceClip;
  uploadAudio: typeof uploadTravelAudio;
  deleteAudio: (audioId: string) => Promise<unknown>;
  transcribe: typeof transcribeTravelAudio;
  uploadPhoto: typeof uploadTravelPhoto;
  setPostcard: typeof setPostcard;
  getTrip: typeof getTrip;
  drafts: DraftStore;
}

export interface ComposerOptions {
  trip: Trip;
  version: string;
  /** The stop the postcard is from. It is already ticked safe. */
  item: Item;
  /** The postcard is saved: here is the trip as the server now has it. */
  onPosted: (saved: TripEnvelope) => void;
  onClose?: () => void;
  deps?: Partial<ComposerDeps>;
}

export interface ComposerHandle {
  close(): void;
  /** Settles once a draft kept on this phone has been put back. */
  ready: Promise<void>;
}

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const UNREADABLE = "That photo can't be read. Try a different one.";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, label: string, icon = ''): HTMLButtonElement {
  const node = el('button', className);
  node.type = 'button';
  if (icon) node.innerHTML = icon;
  node.append(label);
  return node;
}

const objectUrl = (blob: Blob): string => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '');
const dropUrl = (url: string | null): void => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

let nextFieldId = 1;

export function openPostcardComposer(options: ComposerOptions): ComposerHandle {
  const { trip, item } = options;
  const tripId = trip.id;
  const deps: ComposerDeps = {
    preparePhoto: preparePostcardPhoto,
    addressForPhoto,
    startVoiceClip,
    uploadAudio: uploadTravelAudio,
    deleteAudio: deleteTravelAudio,
    transcribe: transcribeTravelAudio,
    uploadPhoto: uploadTravelPhoto,
    setPostcard,
    getTrip,
    drafts: idbDraftStore(),
    ...options.deps
  };
  const fallback = fallbackAddress(trip, item);

  let state: ComposerState = initialComposerState(fallback);
  let version = options.version;
  /** The copy that is uploaded: a JPEG with no metadata. */
  let photo: Blob | null = null;
  let photoUrl: string | null = null;
  /** Set once the photo is uploaded, so a second try at posting does not send it again. */
  let photoId: string | null = null;
  let clip: Blob | null = null;
  let clipUrl: string | null = null;
  let recording: VoiceClipRecording | null = null;
  /** Bumped whenever the clip changes, so a slow upload or transcript for an old take is ignored. */
  let take = 0;
  let closed = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  // ----- the sheet -----
  const id = nextFieldId++;
  const back = el('div', 'sheet-back');
  const sheet = el('div', 'sheet addform postcard-composer');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const heading = el('h3', '', 'Postcard');
  heading.id = `postcard-composer-title-${id}`;
  sheet.setAttribute('aria-labelledby', heading.id);
  const blurb = el(
    'p',
    '',
    `A photo from ${item.title} for the people on your public link, with up to ${POSTCARD_MAX_AUDIO_S} seconds of your voice.`
  );
  sheet.append(heading, blurb);

  const form = el('form', 'addform__form');
  form.noValidate = true;
  const scroll = el('div', 'addform__scroll postcard-composer__parts');

  // Photo
  const photoPart = el('div', 'postcard-composer__part');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = PHOTO_TYPES;
  fileInput.hidden = true;
  // A real button, not the browser's bare "Choose File" box.
  const chooseBtn = button('btn ghost postcard-composer__choose', 'Choose photo', I.camera);
  const picked = el('div', 'postcard-composer__picked');
  const preview = el('img', 'postcard-composer__preview');
  preview.alt = '';
  const pickedName = el('span', 'postcard-composer__name');
  const removePhotoBtn = button('mini', 'Remove');
  picked.append(preview, pickedName, removePhotoBtn);
  const photoNote = el('p', 'hint postcard-composer__note');
  photoNote.setAttribute('role', 'alert');
  photoPart.append(el('span', 'flabel', 'Photo'), chooseBtn, fileInput, picked, photoNote);

  // Voice
  const voicePart = el('div', 'postcard-composer__part');
  const voiceRow = el('div', 'postcard-composer__voice');
  const recordBtn = button('btn ghost', 'Record', I.mic);
  const clock = el('span', 'postcard-composer__clock num');
  clock.setAttribute('aria-live', 'off');
  const stopBtn = button('btn', 'Stop');
  const player = el('audio', 'postcard-composer__player');
  player.controls = true;
  player.preload = 'metadata';
  const againBtn = button('mini', 'Record again');
  const removeClipBtn = button('mini', 'Remove');
  voiceRow.append(recordBtn, clock, stopBtn, player, againBtn, removeClipBtn);
  const voiceNote = el('p', 'hint postcard-composer__note');
  voiceNote.setAttribute('role', 'status');
  const voiceText = el('span');
  const resendBtn = button('mini', 'Try again');
  voiceNote.append(voiceText, resendBtn);
  voicePart.append(el('span', 'flabel', 'Voice, optional'), voiceRow, voiceNote);

  // Words
  const wordsPart = el('div', 'postcard-composer__part');
  const wordsLabel = el('label', 'flabel', 'Words');
  const textarea = el('textarea', 'postcard-composer__text');
  textarea.id = `postcard-composer-words-${id}`;
  wordsLabel.htmlFor = textarea.id;
  textarea.rows = 4;
  textarea.maxLength = POSTCARD_MAX_TEXT_CHARS;
  textarea.placeholder = 'What you say is written here. You can change it, or type your own.';
  const under = el('div', 'postcard-composer__under');
  const wordsNote = el('span', 'hint postcard-composer__note');
  wordsNote.setAttribute('role', 'status');
  const wordsText = el('span');
  const rewriteBtn = button('mini', 'Try again');
  wordsNote.append(wordsText, rewriteBtn);
  const count = el('span', 'postcard-composer__count num');
  under.append(wordsNote, count);
  wordsPart.append(wordsLabel, textarea, under);

  // Sent from
  const addressPart = el('div', 'postcard-composer__part');
  const addressInputs = [0, 1, 2, 3].map((index) => {
    const input = el('input', 'postcard-composer__line');
    input.type = 'text';
    input.maxLength = POSTCARD_MAX_LINE_CHARS;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Sent from, line ${index + 1}`);
    input.addEventListener('input', () => {
      dispatch({ type: 'address_edited', index, value: input.value });
      saveSoon();
    });
    return input;
  });
  addressPart.append(el('span', 'flabel', 'Sent from'), ...addressInputs);

  // Draft
  const draftRow = el('div', 'postcard-composer__draft');
  const draftNote = el('span', 'hint', 'Draft restored from this phone.');
  const discardBtn = button('mini', 'Discard draft');
  draftRow.append(draftNote, discardBtn);

  const errorNote = el('p', 'hint postcard-composer__error');
  errorNote.setAttribute('role', 'alert');
  const blockerNote = el('p', 'hint postcard-composer__blocker');

  scroll.append(photoPart, voicePart, wordsPart, addressPart, draftRow, errorNote, blockerNote);

  const actions = el('div', 'addform__actions');
  actions.setAttribute('data-part', 'form-actions');
  const postBtn = el('button', 'btn');
  postBtn.type = 'submit';
  const previewBtn = button('btn ghost', 'Preview');
  const cancelBtn = button('btn ghost', 'Cancel');
  actions.append(postBtn, previewBtn, cancelBtn);

  form.append(scroll, actions);
  sheet.append(form);
  back.append(sheet);

  // ----- drawing -----
  function paint(): void {
    const hasClip = state.clipSeconds !== null;

    chooseBtn.hidden = Boolean(state.photoName);
    chooseBtn.disabled = state.photoBusy;
    chooseBtn.innerHTML = state.photoBusy ? 'Reading the photo…' : `${I.camera}Choose photo`;
    picked.hidden = !state.photoName;
    pickedName.textContent = state.photoName ?? '';
    photoNote.hidden = !state.photoError;
    photoNote.textContent = state.photoError ?? '';

    recordBtn.hidden = state.recording || hasClip;
    clock.hidden = !state.recording;
    clock.textContent = `${formatClipClock(state.elapsedS)} / ${formatClipClock(POSTCARD_MAX_AUDIO_S)}`;
    stopBtn.hidden = !state.recording;
    player.hidden = !hasClip;
    againBtn.hidden = !hasClip;
    removeClipBtn.hidden = !hasClip;
    const voiceMessage = state.micError
      ? state.micError
      : state.audio === 'uploading'
        ? 'Sending the recording…'
        : state.audio === 'failed'
          ? "The recording didn't send."
          : '';
    voiceNote.hidden = !voiceMessage;
    voiceText.textContent = voiceMessage ? `${voiceMessage} ` : '';
    resendBtn.hidden = state.audio !== 'failed' || Boolean(state.micError);

    if (textarea.value !== state.text) textarea.value = state.text;
    count.textContent = `${Array.from(state.text).length} / ${POSTCARD_MAX_TEXT_CHARS}`;
    const wordsMessage =
      state.transcript === 'working'
        ? 'Writing out what you said…'
        : state.transcript === 'failed'
          ? "Couldn't write out the words."
          : '';
    wordsNote.hidden = !wordsMessage;
    wordsText.textContent = wordsMessage ? `${wordsMessage} ` : '';
    rewriteBtn.hidden = state.transcript !== 'failed';

    addressInputs.forEach((input, index) => {
      const line = state.address[index] ?? '';
      // Never rewrite the line being typed in.
      if (document.activeElement !== input && input.value !== line) input.value = line;
    });

    draftRow.hidden = !hasContent(state);
    draftNote.hidden = !state.restored;

    const blocker = postBlocker(state);
    postBtn.disabled = Boolean(blocker) || state.posting;
    postBtn.innerHTML = state.posting ? 'Posting…' : `${I.check}Post postcard`;
    if (state.posting) postBtn.setAttribute('aria-busy', 'true');
    else postBtn.removeAttribute('aria-busy');
    previewBtn.disabled = !state.photoName || state.photoBusy;
    blockerNote.hidden = !blocker;
    blockerNote.textContent = blocker ?? '';
    errorNote.hidden = !state.error;
    errorNote.textContent = state.error ?? '';
  }

  function dispatch(event: ComposerEvent): void {
    state = composerReducer(state, event);
    if (!closed) paint();
  }

  // ----- the draft on this phone -----
  function saveDraft(): Promise<unknown> {
    clearTimeout(saveTimer);
    if (!hasContent(state)) return deps.drafts.clear(tripId, item.id);
    return deps.drafts.save({
      tripId,
      itemId: item.id,
      photo,
      photoName: state.photoName ?? '',
      orientation: state.orientation,
      clip,
      clipSeconds: state.clipSeconds ?? 0,
      audioId: state.audioId,
      text: state.text,
      address: state.address,
      addressTouched: state.addressTouched,
      updatedAt: new Date().toISOString()
    });
  }
  function saveSoon(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveDraft(), 400);
  }

  function setPhoto(next: Blob | null): void {
    photo = next;
    photoId = null;
    dropUrl(photoUrl);
    photoUrl = next ? objectUrl(next) : null;
    if (photoUrl) preview.src = photoUrl;
    else preview.removeAttribute('src');
  }
  function setClip(next: Blob | null): void {
    clip = next;
    dropUrl(clipUrl);
    clipUrl = next ? objectUrl(next) : null;
    if (clipUrl) player.src = clipUrl;
    else player.removeAttribute('src');
  }

  // ----- photo -----
  async function choosePhoto(file: File): Promise<void> {
    dispatch({ type: 'photo_reading' });
    let prepared;
    try {
      prepared = await deps.preparePhoto(file);
    } catch (err) {
      dispatch({ type: 'photo_failed', message: err instanceof Error && err.message ? err.message : UNREADABLE });
      return;
    }
    if (closed) return;
    setPhoto(prepared.file);
    dispatch({ type: 'photo_ready', name: file.name || 'Photo', orientation: prepared.orientation });
    void saveDraft();
    const lines = await deps.addressForPhoto(prepared.coordinates, fallback);
    if (closed) return;
    dispatch({ type: 'address_resolved', lines });
    void saveDraft();
  }

  // ----- voice -----
  function dropClip(): void {
    take += 1;
    const uploaded = state.audioId;
    setClip(null);
    dispatch({ type: 'clip_removed' });
    // The clip is on no postcard yet; a failed delete only leaves an orphan.
    if (uploaded) void deps.deleteAudio(uploaded).catch(() => undefined);
  }

  async function writeOut(): Promise<void> {
    const audioId = state.audioId;
    if (!audioId) return;
    const mine = take;
    dispatch({ type: 'transcript_working' });
    try {
      const { text } = await deps.transcribe(tripId, audioId);
      if (mine !== take || closed) return;
      dispatch({ type: 'transcript_done', text });
      void saveDraft();
    } catch {
      if (mine === take && !closed) dispatch({ type: 'transcript_failed' });
    }
  }

  async function sendClip(): Promise<void> {
    if (!clip) return;
    const mine = (take += 1);
    dispatch({ type: 'audio_uploading' });
    let audioId: string;
    try {
      ({ audio_id: audioId } = await deps.uploadAudio(tripId, clip));
    } catch {
      if (mine === take && !closed) dispatch({ type: 'audio_failed' });
      return;
    }
    if (mine !== take) {
      // That take was replaced while it uploaded.
      void deps.deleteAudio(audioId).catch(() => undefined);
      return;
    }
    dispatch({ type: 'audio_uploaded', audioId });
    void saveDraft();
    if (!closed) await writeOut();
  }

  async function record(): Promise<void> {
    if (state.clipSeconds !== null) dropClip();
    dispatch({ type: 'record_started' });
    try {
      recording = await deps.startVoiceClip({
        onTick: (elapsedS) => dispatch({ type: 'record_tick', elapsedS }),
        onEnd: (taken) => {
          recording = null;
          if (taken) setClip(taken.blob);
          dispatch({ type: 'record_ended', seconds: taken ? taken.seconds : null });
          if (!taken) return;
          // Kept on the phone first; a sheet closed mid-take keeps what was said.
          void saveDraft();
          if (!closed) void sendClip();
        }
      });
    } catch (err) {
      dispatch({
        type: 'record_failed',
        message:
          err instanceof VoiceClipError
            ? err.message
            : 'Recording could not start. You can still post the photo and type the words.'
      });
    }
  }

  // ----- post -----
  async function post(): Promise<void> {
    if (state.posting || postBlocker(state) || !photo) return;
    dispatch({ type: 'post_started' });
    try {
      if (!photoId) {
        const file = photo instanceof File ? photo : new File([photo], 'postcard.jpg', { type: 'image/jpeg' });
        photoId = (await deps.uploadPhoto(tripId, file)).photo_id;
      }
      const postcard = buildPostcard(state, photoId, fallback);
      let saved: TripEnvelope;
      try {
        saved = await deps.setPostcard(tripId, item.id, version, postcard);
      } catch (err) {
        // Someone else changed the trip meanwhile: fetch it and try once more.
        if (!(err instanceof ApiClientError) || err.code !== 'conflict') throw err;
        version = (await deps.getTrip(tripId)).version;
        saved = await deps.setPostcard(tripId, item.id, version, postcard);
      }
      clearTimeout(saveTimer);
      await deps.drafts.clear(tripId, item.id);
      finish();
      options.onPosted(saved);
    } catch (err) {
      dispatch({ type: 'post_failed', message: safeSaveErrorMessage(err) });
    }
  }

  function openPreview(): void {
    if (!photoUrl || !state.orientation) return;
    const built = buildPostcard(state, 'tph_preview', fallback);
    const card: PostcardView = {
      id: 'preview',
      itemId: item.id,
      cityId: item.city_id,
      title: item.title,
      at: new Date().toISOString(),
      photoId: 'preview',
      orientation: built.orientation,
      address: built.address,
      ...(built.text ? { text: built.text } : {}),
      ...(clipUrl && state.clipSeconds !== null ? { audioId: 'preview', audioS: Math.round(state.clipSeconds) } : {})
    };
    const media = { photoUrl, audioUrl: clipUrl ?? undefined };
    openPostcardViewer({ trip, cards: [card], mediaFor: () => media, label: 'Postcard preview' });
  }

  // ----- leaving -----
  const warnOnLeave = (event: BeforeUnloadEvent): void => {
    if (state.recording || state.audio === 'uploading' || state.posting) event.preventDefault();
  };

  function finish(): void {
    if (closed) return;
    closed = true;
    recording?.stop();
    player.pause();
    dropUrl(photoUrl);
    dropUrl(clipUrl);
    window.removeEventListener('beforeunload', warnOnLeave);
    overlay.release();
    options.onClose?.();
  }

  /** Closing keeps the draft: opening Postcard on this stop again puts it back. */
  function close(): void {
    if (closed) return;
    if (saveTimer !== undefined || hasContent(state)) void saveDraft();
    finish();
  }

  // ----- wiring -----
  chooseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void choosePhoto(file);
  });
  removePhotoBtn.addEventListener('click', () => {
    setPhoto(null);
    dispatch({ type: 'photo_removed' });
    void saveDraft();
    chooseBtn.focus({ preventScroll: true });
  });
  recordBtn.addEventListener('click', () => void record());
  againBtn.addEventListener('click', () => void record());
  stopBtn.addEventListener('click', () => recording?.stop());
  removeClipBtn.addEventListener('click', () => {
    dropClip();
    void saveDraft();
    recordBtn.focus({ preventScroll: true });
  });
  resendBtn.addEventListener('click', () => void sendClip());
  rewriteBtn.addEventListener('click', () => void writeOut());
  textarea.addEventListener('input', () => {
    dispatch({ type: 'text_edited', value: textarea.value });
    saveSoon();
  });
  discardBtn.addEventListener('click', () => {
    clearTimeout(saveTimer);
    if (state.clipSeconds !== null) dropClip();
    setPhoto(null);
    dispatch({ type: 'reset', address: fallback });
    addressInputs.forEach((input, index) => {
      input.value = state.address[index] ?? '';
    });
    void deps.drafts.clear(tripId, item.id);
  });
  previewBtn.addEventListener('click', openPreview);
  cancelBtn.addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void post();
  });
  window.addEventListener('beforeunload', warnOnLeave);

  const overlay = presentJournalOverlay(back, { anchor: document.body, dismiss: close, initialFocus: chooseBtn });
  paint();

  const ready = (async (): Promise<void> => {
    const draft = await deps.drafts.load(tripId, item.id);
    if (!draft || closed) return;
    if (draft.photo) setPhoto(draft.photo);
    if (draft.clip) setClip(draft.clip);
    state = initialComposerState(draft.address.some((line) => line.trim()) ? draft.address : fallback, {
      photoName: draft.photo ? draft.photoName || 'Photo' : null,
      orientation: draft.photo ? draft.orientation : null,
      clipSeconds: draft.clip ? draft.clipSeconds : null,
      audioId: draft.clip ? draft.audioId : null,
      text: draft.text,
      addressTouched: draft.addressTouched,
      restored: true
    });
    paint();
    // A clip that was recorded but never reached the server goes up now.
    if (clip && !state.audioId) void sendClip();
  })();

  return { close, ready };
}

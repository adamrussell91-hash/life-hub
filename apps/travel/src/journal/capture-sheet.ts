import type { JournalDocument } from '@/api/journal';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import {
  type CaptureDraftMode,
  type JournalCaptureDraft,
  clearCaptureDraft,
  createDraftAutosave,
  loadCaptureDraft,
} from '@/journal/drafts';
import { bootstrapJournalForFirstMoment } from '@/journal/capture-context';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

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
  /** When the user picks multiple photos, hand off to import review instead. */
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

function makeMomentId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'mom_';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function openCaptureSheet(options: OpenCaptureSheetOptions): { destroy(): void } {
  attachVisualViewportInset();

  let mode: CaptureMode = 'text';
  let text = '';
  let localDate = options.localDate;
  let localTime = '';
  let placeName = '';
  let photoBlobs: Blob[] = [];
  let photoNames: string[] = [];
  let voiceBlob: Blob | null = null;
  let voiceAttached = false;
  let voiceRecording: MediaRecorder | null = null;
  let voiceChunks: BlobPart[] = [];
  let voicePlaybackUrl: string | null = null;
  let dirty = false;
  let destroyed = false;
  let discardOpen = false;

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-capture-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add moment');

  const title = document.createElement('h3');
  title.textContent = 'Add moment';

  const context = document.createElement('p');
  context.className = 'journal-capture__context';

  const modes = document.createElement('div');
  modes.className = 'journal-capture__modes';
  modes.setAttribute('role', 'tablist');
  modes.setAttribute('aria-label', 'Capture type');

  const modePanels: Record<CaptureMode, HTMLElement> = {
    photos: document.createElement('div'),
    voice: document.createElement('div'),
    text: document.createElement('div'),
  };
  for (const panel of Object.values(modePanels)) {
    panel.className = 'journal-capture__panel';
    panel.hidden = true;
  }

  const draftStatus = document.createElement('p');
  draftStatus.className = 'journal-capture__draft-status';
  draftStatus.hidden = true;
  draftStatus.textContent = 'Draft saved on this device';

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/jpeg,image/png';
  photoInput.multiple = true;
  photoInput.hidden = true;

  const photoPick = document.createElement('button');
  photoPick.type = 'button';
  photoPick.className = 'btn btn--secondary journal-capture__mode-action';
  photoPick.textContent = 'Choose photos';

  const photoSummary = document.createElement('p');
  photoSummary.className = 'journal-capture__photo-summary';
  photoSummary.hidden = true;

  modePanels.photos.append(photoPick, photoSummary, photoInput);

  const voiceWaveHost = document.createElement('div');
  voiceWaveHost.className = 'journal-capture__voice-host';
  const voiceStatus = document.createElement('p');
  voiceStatus.className = 'journal-capture__voice-status';
  voiceStatus.textContent = 'Record a voice note for this moment.';
  const recordBtn = document.createElement('button');
  recordBtn.type = 'button';
  recordBtn.className = 'btn btn--primary journal-capture__mode-action';
  recordBtn.textContent = 'Record';
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'btn btn--secondary journal-capture__mode-action';
  stopBtn.textContent = 'Stop';
  stopBtn.hidden = true;
  const playback = document.createElement('audio');
  playback.controls = true;
  playback.className = 'journal-capture__voice-playback';
  playback.hidden = true;
  const retakeBtn = document.createElement('button');
  retakeBtn.type = 'button';
  retakeBtn.className = 'btn btn--ghost journal-capture__mode-action';
  retakeBtn.textContent = 'Retake';
  retakeBtn.hidden = true;
  const attachVoiceBtn = document.createElement('button');
  attachVoiceBtn.type = 'button';
  attachVoiceBtn.className = 'btn btn--secondary journal-capture__mode-action';
  attachVoiceBtn.textContent = 'Attach';
  attachVoiceBtn.hidden = true;
  const voiceActions = document.createElement('div');
  voiceActions.className = 'journal-capture__voice-actions';
  voiceActions.append(stopBtn, retakeBtn, attachVoiceBtn);
  modePanels.voice.append(voiceStatus, voiceWaveHost, recordBtn, playback, voiceActions);

  const textArea = document.createElement('textarea');
  textArea.className = 'journal-capture__text';
  textArea.rows = 5;
  textArea.placeholder = 'What happened?';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = localDate;
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  const placeInput = document.createElement('input');
  placeInput.type = 'text';
  placeInput.placeholder = 'Place (optional)';
  modePanels.text.append(
    textArea,
    field('Date', dateInput),
    field('Time (optional)', timeInput),
    field('Place (optional)', placeInput)
  );

  const discardBar = document.createElement('div');
  discardBar.className = 'journal-capture__discard confirm-card';
  discardBar.hidden = true;
  const discardText = document.createElement('p');
  discardText.textContent = 'Discard unsaved changes?';
  const discardActions = document.createElement('div');
  discardActions.className = 'confirm-card__actions';
  const keepEditingBtn = document.createElement('button');
  keepEditingBtn.type = 'button';
  keepEditingBtn.className = 'btn btn--secondary';
  keepEditingBtn.textContent = 'Keep editing';
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
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';

  function field(labelText: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'journal-capture__field';
    const label = document.createElement('span');
    label.textContent = labelText;
    wrap.append(label, control);
    return wrap;
  }

  function draftPayload(): JournalCaptureDraft {
    return {
      tripId: options.tripId,
      legId: options.legId,
      localDate,
      mode,
      text,
      localTime,
      placeName,
      updatedAt: new Date().toISOString(),
      hasVoice: voiceAttached,
      photoNames,
    };
  }

  const autosave = createDraftAutosave(
    () => ({
      draft: draftPayload(),
      voice: voiceAttached ? voiceBlob : null,
      photos: photoBlobs,
    }),
    () => {
      draftStatus.hidden = false;
    }
  );

  function markDirty(): void {
    dirty = true;
    autosave.schedule();
    refreshSave();
  }

  function refreshContext(): void {
    const leg = options.journal.legs.find((l) => l.id === options.legId);
    context.textContent = `${leg?.destination ?? 'Trip'} · ${localDate}`;
  }

  function setMode(next: CaptureMode, userChange = false): void {
    mode = next;
    for (const [key, panel] of Object.entries(modePanels)) {
      panel.hidden = key !== next;
    }
    for (const btn of modes.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      const selected = btn.dataset.mode === next;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      btn.classList.toggle('is-active', selected);
    }
    if (userChange) markDirty();
  }

  function refreshSave(): void {
    saveBtn.disabled = !isCaptureSaveEnabled({
      text,
      photoCount: photoBlobs.length,
      hasVoiceAttachment: voiceAttached,
    });
  }

  function refreshPhotos(): void {
    if (!photoBlobs.length) {
      photoSummary.hidden = true;
    } else {
      photoSummary.hidden = false;
      photoSummary.textContent = `${photoBlobs.length} photo${photoBlobs.length === 1 ? '' : 's'} selected`;
    }
    refreshSave();
  }

  function clearVoicePlayback(): void {
    if (voicePlaybackUrl) {
      URL.revokeObjectURL(voicePlaybackUrl);
      voicePlaybackUrl = null;
    }
    playback.removeAttribute('src');
    playback.hidden = true;
  }

  function resetVoiceUi(): void {
    voiceBlob = null;
    voiceAttached = false;
    voiceChunks = [];
    recordBtn.hidden = false;
    stopBtn.hidden = true;
    retakeBtn.hidden = true;
    attachVoiceBtn.hidden = true;
    clearVoicePlayback();
    voiceStatus.textContent = 'Record a voice note for this moment.';
    refreshSave();
  }

  async function startRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      voiceStatus.textContent = 'Recording is not available in this browser.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunks = [];
      voiceRecording = new MediaRecorder(stream);
      voiceRecording.addEventListener('dataavailable', (ev) => {
        if (ev.data.size) voiceChunks.push(ev.data);
      });
      voiceRecording.addEventListener('stop', () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(voiceChunks, { type: voiceRecording?.mimeType || 'audio/webm' });
        voiceBlob = blob;
        clearVoicePlayback();
        voicePlaybackUrl = URL.createObjectURL(blob);
        playback.src = voicePlaybackUrl;
        playback.hidden = false;
        retakeBtn.hidden = false;
        attachVoiceBtn.hidden = false;
        recordBtn.hidden = true;
        stopBtn.hidden = true;
        voiceStatus.textContent = 'Review your recording, then attach it to this moment.';
      });
      voiceRecording.start();
      recordBtn.hidden = true;
      stopBtn.hidden = false;
      voiceStatus.textContent = 'Recording…';
    } catch {
      voiceStatus.textContent = 'Microphone permission was denied.';
    }
  }

  (['photos', 'voice', 'text'] as CaptureMode[]).forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary journal-capture__mode';
    btn.setAttribute('role', 'tab');
    btn.dataset.mode = m;
    btn.textContent = m === 'photos' ? 'Photos' : m === 'voice' ? 'Voice' : 'Text';
    btn.addEventListener('click', () => setMode(m, true));
    modes.append(btn);
  });

  photoPick.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    const list = photoInput.files ? [...photoInput.files] : [];
    photoInput.value = '';
    if (!list.length) return;
    if (list.length > 1 && options.onImportPhotos) {
      requestClose(() => options.onImportPhotos?.(list));
      return;
    }
    photoBlobs = [...list];
    photoNames = list.map((f) => f.name);
    setMode('photos');
    refreshPhotos();
    markDirty();
  });

  recordBtn.addEventListener('click', () => void startRecording());
  stopBtn.addEventListener('click', () => {
    if (voiceRecording?.state === 'recording') voiceRecording.stop();
  });
  retakeBtn.addEventListener('click', () => {
    resetVoiceUi();
    markDirty();
  });
  attachVoiceBtn.addEventListener('click', () => {
    voiceAttached = true;
    voiceStatus.textContent = 'Voice note attached to this moment.';
    attachVoiceBtn.hidden = true;
    retakeBtn.hidden = true;
    markDirty();
  });

  for (const el of [textArea, dateInput, timeInput, placeInput]) {
    el.addEventListener('input', () => {
      text = textArea.value;
      localDate = dateInput.value || options.localDate;
      localTime = timeInput.value;
      placeName = placeInput.value;
      refreshContext();
      markDirty();
    });
    el.addEventListener('blur', () => void autosave.flush());
  }

  function requestClose(after?: () => void): void {
    if (destroyed) return;
    if (
      dirty &&
      isCaptureSaveEnabled({
        text,
        photoCount: photoBlobs.length,
        hasVoiceAttachment: voiceAttached,
      })
    ) {
      showDiscard(after);
      return;
    }
    finishClose(after);
  }

  function showDiscard(after?: () => void): void {
    discardOpen = true;
    discardBar.hidden = false;
    const onKeep = () => {
      discardOpen = false;
      discardBar.hidden = true;
    };
    const onDiscard = () => {
      discardOpen = false;
      discardBar.hidden = true;
      void clearCaptureDraft(options.tripId, options.legId, localDate).then(() =>
        finishClose(after)
      );
    };
    keepEditingBtn.onclick = onKeep;
    discardBtn.onclick = onDiscard;
  }

  function finishClose(after?: () => void): void {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    autosave.destroy();
    clearVoicePlayback();
    if (voiceRecording?.state === 'recording') voiceRecording.stop();
    back.remove();
    options.onClose?.();
    after?.();
  }

  cancelBtn.addEventListener('click', () => requestClose());
  back.addEventListener('click', (ev) => {
    if (ev.target === back && !discardOpen) requestClose();
  });

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || discardOpen) return;
    ev.preventDefault();
    requestClose();
  };
  document.addEventListener('keydown', onKey);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (saveBtn.disabled) return;
    void submitMoment();
  });

  async function submitMoment(): Promise<void> {
    saveBtn.disabled = true;
    const momentId = makeMomentId();
    const legMoments = options.journal.moments.filter((m) => m.leg_id === options.legId);
    const display_order =
      legMoments.reduce((max, m) => Math.max(max, m.display_order), 0) + 1;
    const baseJournal = bootstrapJournalForFirstMoment(
      options.journal,
      options.legId,
      localDate,
      options.tripTitle?.trim() || 'Trip',
    );
    const nextJournal: JournalDocument = {
      ...baseJournal,
      revision: baseJournal.revision + 1,
      moments: [
        ...baseJournal.moments,
        {
          id: momentId,
          leg_id: options.legId,
          local_date: localDate,
          local_time: localTime || undefined,
          place: placeName.trim() ? { name: placeName.trim() } : undefined,
          text: text.trim() || undefined,
          media_ids: [],
          display_order,
          lifecycle: 'live',
        },
      ],
    };
    try {
      const envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
      await clearCaptureDraft(options.tripId, options.legId, options.localDate);
      options.onSaved?.(envelope);
      finishClose();
    } catch {
      saveBtn.disabled = false;
      voiceStatus.textContent = 'Could not save. Try again.';
    }
  }

  scroll.append(modes, ...Object.values(modePanels), draftStatus);
  form.append(scroll, discardBar, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(title, context, form);
  back.append(sheet);
  options.anchor.append(back);

  void (async () => {
    const restored = await loadCaptureDraft(options.tripId, options.legId, options.localDate);
    if (!restored || destroyed) return;
    mode = restored.draft.mode;
    text = restored.draft.text;
    localTime = restored.draft.localTime;
    placeName = restored.draft.placeName;
    localDate = restored.draft.localDate;
    voiceAttached = restored.draft.hasVoice;
    photoNames = restored.draft.photoNames;
    photoBlobs = restored.photoBlobs;
    voiceBlob = restored.voiceBlob;
    textArea.value = text;
    dateInput.value = localDate;
    timeInput.value = localTime;
    placeInput.value = placeName;
    if (voiceBlob && voiceAttached) {
      voicePlaybackUrl = URL.createObjectURL(voiceBlob);
      playback.src = voicePlaybackUrl;
      playback.hidden = false;
      recordBtn.hidden = true;
      voiceStatus.textContent = 'Voice note attached to this moment.';
    } else if (voiceBlob) {
      voicePlaybackUrl = URL.createObjectURL(voiceBlob);
      playback.src = voicePlaybackUrl;
      playback.hidden = false;
      retakeBtn.hidden = false;
      attachVoiceBtn.hidden = false;
      recordBtn.hidden = true;
      voiceStatus.textContent = 'Review your recording, then attach it to this moment.';
    }
    setMode(mode);
    refreshPhotos();
    refreshContext();
    refreshSave();
  })();

  setMode('text');
  refreshContext();
  refreshSave();
  textArea.focus();

  return {
    destroy() {
      finishClose();
    },
  };
}

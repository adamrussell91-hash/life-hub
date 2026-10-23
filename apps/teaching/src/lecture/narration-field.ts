// apps/teaching/src/lecture/narration-field.ts
import type { Narration } from '@/schemas/block';
import { AUDIO_ACCEPT, createUploadButton } from '@/blocks/upload-button';
import { createAudioRecordButton } from '@/blocks/audio-record-button';

/** The schema's ceiling for one narration clip, in seconds. */
const MAX_DURATION_S = 900;

/**
 * Recordings from MediaRecorder often report an Infinity duration until the
 * browser has scanned the whole file. Seeking far past the end makes it work
 * the real length out. Resolves 0 when the length can't be found in time.
 */
export function measureDuration(url: string, timeoutMs = 4000): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.removeAttribute('src');
      const seconds = Number.isFinite(value) ? Math.round(value) : 0;
      resolve(Math.min(MAX_DURATION_S, Math.max(0, seconds)));
    };
    const timer = window.setTimeout(() => done(0), timeoutMs);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) return done(audio.duration);
      audio.currentTime = 1e7;
    });
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) done(audio.duration);
    });
    audio.addEventListener('error', () => done(0));
    audio.src = url;
  });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

function ghostButton(text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

export function createNarrationField(options: {
  label: string;
  value: Narration | undefined;
  onChange: (next: Narration | undefined) => void;
}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'narration-field';
  let value = options.value;
  let disposeRecorder: (() => void) | null = null;

  const paint = () => {
    disposeRecorder?.();
    disposeRecorder = null;
    root.replaceChildren();
    const label = document.createElement('span');
    label.className = 'narration-field__label';
    label.textContent = options.label;
    root.append(label);

    if (value) {
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = value.url;
      player.className = 'narration-field__audio';
      const length = document.createElement('span');
      length.className = 'narration-field__length';
      length.textContent = value.duration_s ? clock(value.duration_s) : '';
      // Re-record keeps the saved clip until a new one lands.
      const redo = ghostButton('Re-record', () => {
        value = undefined;
        paint();
      });
      const remove = ghostButton('Remove', () => {
        value = undefined;
        options.onChange(undefined);
        paint();
      });
      const words = document.createElement('details');
      words.className = 'narration-field__transcript';
      const summary = document.createElement('summary');
      summary.textContent = value.transcript ? 'Transcript' : 'Add transcript (for captions)';
      const area = document.createElement('textarea');
      area.rows = 3;
      area.maxLength = 8000;
      area.value = value.transcript ?? '';
      area.setAttribute('aria-label', `${options.label} transcript`);
      area.addEventListener('change', () => {
        if (!value) return;
        const transcript = area.value.trim();
        const { transcript: _old, ...rest } = value;
        value = transcript ? { ...rest, transcript } : rest;
        options.onChange(value);
      });
      words.append(summary, area);
      root.append(player, length, redo, remove, words);
      return;
    }

    let uploaded = '';
    const upload = createUploadButton({
      accept: AUDIO_ACCEPT,
      noun: 'a recording',
      label: 'Upload',
      compact: true,
      onUploaded: (url) => {
        uploaded = url;
        void measureDuration(url).then((duration_s) => {
          const transcript = options.value?.transcript;
          value = { url, duration_s, ...(transcript ? { transcript } : {}) };
          options.onChange(value);
          paint();
        });
      }
    });
    const record = createAudioRecordButton({
      upload: (file) => {
        uploaded = '';
        return upload.uploadFiles([file]);
      },
      uploaded: () => Boolean(uploaded),
      fileTitle: () => options.label.replace(/^\W+/u, '')
    });
    disposeRecorder = record.dispose;
    root.append(record.el, upload.el);
  };
  paint();
  return root;
}

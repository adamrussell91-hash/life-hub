// apps/teaching/src/lecture/narration-field.ts
import type { Narration, NarrationPart } from '@/schemas/block';
import { AUDIO_ACCEPT, createUploadButton } from '@/blocks/upload-button';
import { createAudioRecordButton } from '@/blocks/audio-record-button';
import { fromParts, narrationParts, partLength } from './narration-parts';

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

/** What the field is recording into: the whole narration, one more take, or a new go at one take. */
type Target = { kind: 'all' } | { kind: 'add' } | { kind: 'replace'; index: number };

export function createNarrationField(options: {
  label: string;
  value: Narration | undefined;
  onChange: (next: Narration | undefined) => void;
  /** Scene headings only: what to say, shown while recording and copied into a new take's transcript. */
  script?: { value: string; onChange: (next: string) => void };
}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'narration-field';
  let value = options.value;
  /** Null while showing the saved takes; otherwise where the next recording goes. */
  let target: Target | null = value ? null : { kind: 'all' };
  const save = (next: Narration | undefined) => {
    value = next;
    options.onChange(next);
  };
  const saveParts = (parts: NarrationPart[]) => save(fromParts(parts, value?.transcript));
  let disposeRecorder: (() => void) | null = null;
  let script = options.script?.value.trim() ?? '';

  const show = (next: Target | null) => {
    target = next;
    paint();
  };

  function paintTakes(current: Narration): void {
    const parts = narrationParts(current);
    const several = parts.length > 1;
    const note = document.createElement('span');
    note.className = 'narration-field__status';
    note.setAttribute('role', 'status');

    const list = document.createElement('ol');
    list.className = 'narration-field__parts';
    parts.forEach((part, index) => {
      const row = document.createElement('li');
      row.className = 'narration-field__part';
      if (several) {
        const name = document.createElement('span');
        name.className = 'narration-field__part-name';
        name.textContent = `Part ${index + 1}`;
        row.append(name);
      }
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = part.url;
      player.className = 'narration-field__audio';
      player.setAttribute('aria-label', several ? `${options.label} part ${index + 1}` : options.label);
      // Playback here stops at the cut, as it will for students.
      player.addEventListener('timeupdate', () => {
        if (part.end_s !== undefined && player.currentTime >= part.end_s) player.pause();
      });
      const length = document.createElement('span');
      length.className = 'narration-field__length';
      const kept = partLength(part);
      length.textContent =
        part.end_s !== undefined && part.duration_s > kept
          ? `${clock(kept)} of ${clock(part.duration_s)}`
          : kept ? clock(kept) : '';
      row.append(player, length);

      if (part.end_s === undefined) {
        row.append(
          ghostButton('Cut here', () => {
            const at = Math.round(player.currentTime * 10) / 10;
            const known = part.duration_s > 0 ? part.duration_s : Number.isFinite(player.duration) ? player.duration : 0;
            if (!(at >= 1) || (known > 0 && at >= known - 0.5)) {
              note.textContent = 'Play the take, pause where it should end, then press Cut here.';
              return;
            }
            saveParts(parts.map((p, i) => (i === index ? { ...p, end_s: at } : p)));
            show(null);
          })
        );
      } else {
        row.append(
          ghostButton('Undo cut', () => {
            saveParts(parts.map((p, i) => (i === index ? { url: p.url, duration_s: p.duration_s } : p)));
            show(null);
          })
        );
      }
      if (several) {
        row.append(
          ghostButton('Re-record', () => show({ kind: 'replace', index })),
          ghostButton('Remove', () => {
            saveParts(parts.filter((_, i) => i !== index));
            show(null);
          })
        );
      }
      list.append(row);
    });

    const actions = document.createElement('div');
    actions.className = 'narration-field__actions';
    actions.append(
      ghostButton('Record more', () => show({ kind: 'add' })),
      // Re-record keeps the saved takes until a new one lands.
      ghostButton(several ? 'Re-record all' : 'Re-record', () => show({ kind: 'all' })),
      ghostButton(several ? 'Remove all' : 'Remove', () => {
        save(undefined);
        show({ kind: 'all' });
      })
    );

    const words = document.createElement('details');
    words.className = 'narration-field__transcript';
    const summary = document.createElement('summary');
    summary.textContent = current.transcript ? 'Transcript' : 'Add transcript (for captions)';
    const area = document.createElement('textarea');
    area.rows = 3;
    area.maxLength = 8000;
    area.value = current.transcript ?? '';
    area.setAttribute('aria-label', `${options.label} transcript`);
    area.addEventListener('change', () => {
      if (!value) return;
      const transcript = area.value.trim();
      const { transcript: _old, ...rest } = value;
      save(transcript ? { ...rest, transcript } : rest);
    });
    words.append(summary, area);
    root.append(list, actions, note, words);
  }

  function paintRecorder(into: Target): void {
    const parts = narrationParts(value);
    let uploaded = '';
    // Record and Upload sit in one fieldset so both lock while a new clip is measured.
    const controls = document.createElement('fieldset');
    controls.className = 'narration-field__controls';
    const status = document.createElement('span');
    status.className = 'narration-field__status';
    status.setAttribute('role', 'status');
    const land = (take: NarrationPart) => {
      if (into.kind === 'add') saveParts([...parts, take]);
      else if (into.kind === 'replace') saveParts(parts.map((p, i) => (i === into.index ? take : p)));
      // A new whole narration starts from the script, or with no transcript: the old words were for the old take.
      else save(script ? { ...take, transcript: script } : take);
      show(null);
    };
    const upload = createUploadButton({
      accept: AUDIO_ACCEPT,
      noun: 'a recording',
      label: 'Upload',
      compact: true,
      onUploaded: (url) => {
        uploaded = url;
        controls.disabled = true;
        status.textContent = 'Saving…';
        void measureDuration(url).then((duration_s) => land({ url, duration_s }));
      }
    });
    const record = createAudioRecordButton({
      upload: (file) => {
        uploaded = '';
        return upload.uploadFiles([file]);
      },
      uploaded: () => Boolean(uploaded),
      fileTitle: () => options.label.replace(/^\W+/u, ''),
      pausable: true
    });
    disposeRecorder = record.dispose;
    controls.append(record.el, upload.el);
    if (into.kind !== 'all') {
      const where = document.createElement('p');
      where.className = 'narration-field__where';
      where.textContent =
        into.kind === 'add'
          ? `Part ${parts.length + 1}: plays straight after part ${parts.length}.`
          : `New take for part ${into.index + 1}. The old one stays until this one saves.`;
      root.append(where);
    }
    root.append(controls, status);
    if (options.script && into.kind === 'all') {
      const onScript = options.script.onChange;
      const area = document.createElement('textarea');
      area.className = 'narration-field__script';
      area.rows = Math.min(8, Math.max(3, script.split('\n').length + 1));
      area.maxLength = 8000;
      area.value = script;
      area.placeholder = 'Script: what you plan to say. It becomes the captions when you record.';
      area.setAttribute('aria-label', `${options.label} script`);
      area.addEventListener('change', () => {
        script = area.value.trim();
        onScript(script);
      });
      root.append(area);
    }
    if (value) controls.append(ghostButton('Cancel', () => show(null)));
  }

  function paint(): void {
    disposeRecorder?.();
    disposeRecorder = null;
    root.replaceChildren();
    const label = document.createElement('span');
    label.className = 'narration-field__label';
    label.textContent = options.label;
    root.append(label);
    if (target || !value) paintRecorder(target ?? { kind: 'all' });
    else paintTakes(value);
  }
  paint();
  return root;
}

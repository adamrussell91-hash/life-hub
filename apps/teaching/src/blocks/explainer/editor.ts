/**
 * Explainer editor: set up the text and notes tray, record, then tidy the
 * timeline. The recording starts as a draft; students see it once published.
 */
import { parseAnnotationSource, serializeAnnotationSource } from '@/blocks/annotation-text';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import type { ExplainerBlock, ExplainerRecording } from '@/schemas/block';
import { spliceRecording, type ExplainerTake } from './clips';
import { mountExplainerPlayer, type ExplainerPlayer } from './player';
import { mountExplainerRecorder, type ExplainerRecorderHandle } from './recorder';
import { createTimeline } from './timeline';
import './explainer.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
let seq = 0;
const fieldId = (p: string) => `explainer-${p}-${++seq}`;
const htmlText = (html: string) => (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim();
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A finished take becomes the recording, or is spliced in from its start point. */
export function applyTake(current: ExplainerRecording | undefined, take: ExplainerTake, startAt: number): ExplainerRecording {
  if (current && startAt > 0) return spliceRecording(current, startAt, take);
  return { status: 'draft', clips: take.clips, duration_s: take.duration_s, events: take.events, ...(take.transcript ? { transcript: take.transcript } : {}) };
}

export function createExplainerEditor(
  block: ExplainerBlock,
  onChange: (block: ExplainerBlock) => void,
  context: { lessonId?: string; countdownMs?: number; transcribeWaitMs?: number } = {}
): HTMLElement {
  let current = block;
  const commit = (content: Partial<ExplainerBlock['content']>) => {
    current = { ...current, content: { ...current.content, ...content } };
    onChange(current);
  };

  const root = el('div', 'block-explainer-editor');

  // Set up.
  const setup = el('div', 'block-explainer-editor__setup');
  const titleId = fieldId('title');
  const titleLab = el('label', 'pf-field__label', 'Title');
  titleLab.htmlFor = titleId;
  const title = el('input', 'block-explainer-editor__title');
  title.id = titleId;
  title.type = 'text';
  title.value = current.content.title ?? '';
  title.placeholder = 'e.g. From notes to a one-minute answer';
  title.addEventListener('input', () => commit({ title: title.value }));

  const layoutId = fieldId('layout');
  const layoutLab = el('label', 'pf-field__label', 'Layout');
  layoutLab.htmlFor = layoutId;
  const layout = el('select', 'block-explainer-editor__layout');
  layout.id = layoutId;
  for (const [value, label, ready] of [
    ['text', 'Text only', true],
    ['board', 'Board only (coming soon)', false],
    ['both', 'Text and board (coming soon)', false]
  ] as const) {
    const o = el('option', '', label);
    o.value = value;
    o.disabled = !ready;
    layout.append(o);
  }
  layout.value = current.content.layout ?? 'text';
  layout.addEventListener('change', () => commit({ layout: layout.value as ExplainerBlock['content']['layout'] }));

  const kindRow = el('div', 'block-explainer-editor__kind');
  kindRow.setAttribute('role', 'group');
  kindRow.setAttribute('aria-label', 'Text kind');
  let kind: 'prose' | 'verse' = current.content.text?.kind ?? 'prose';
  const kindBtns = (['prose', 'verse'] as const).map((k) => {
    const b = btn(k === 'prose' ? 'Prose' : 'Verse', 'btn--ghost', () => {
      kind = k;
      for (const x of kindBtns) x.setAttribute('aria-pressed', String(x === b));
      commit({ text: parseAnnotationSource(source.value, kind) });
    });
    b.setAttribute('aria-pressed', String(k === kind));
    kindRow.append(b);
    return b;
  });
  const sourceId = fieldId('text');
  const sourceLab = el('label', 'pf-field__label', 'Text to work on');
  sourceLab.htmlFor = sourceId;
  const source = el('textarea', 'block-explainer-editor__source');
  source.id = sourceId;
  source.rows = 8;
  source.value = current.content.text ? serializeAnnotationSource(current.content.text) : '';
  source.placeholder = 'Paste the answer, poem or notes you will talk through. Leave a blank line between paragraphs or stanzas.';
  source.addEventListener('change', () => {
    commit({ text: parseAnnotationSource(source.value, kind) });
    if (!current.content.recording && !recorder) paintRecording();
  });
  const textHint = el('p', 'block-explainer__hint', 'Marks stay on their words when you fix a typo after recording.');

  // Notes tray.
  const tray = el('div', 'block-explainer-editor__tray');
  const trayHead = el('p', 'pf-field__label', 'Notes tray');
  const trayHint = el('p', 'block-explainer__hint', 'Write notes now and drop them on words while you talk.');
  const trayList = el('ul', 'block-explainer-editor__tray-list');
  const paintTray = () => {
    trayList.replaceChildren();
    for (const note of current.content.tray ?? []) {
      const li = el('li', 'block-explainer-editor__tray-row');
      const input = el('input', 'block-explainer-editor__tray-input');
      input.type = 'text';
      input.value = htmlText(note.html);
      input.setAttribute('aria-label', 'Tray note');
      input.addEventListener('change', () =>
        commit({ tray: (current.content.tray ?? []).map((n) => (n.id === note.id ? { ...n, html: `<p>${escapeHtml(input.value.trim())}</p>` } : n)) })
      );
      const del = btn('Delete', 'btn--ghost', () => {
        commit({ tray: (current.content.tray ?? []).filter((n) => n.id !== note.id) });
        paintTray();
      });
      li.append(input, del);
      trayList.append(li);
    }
  };
  const addNote = btn('Add a note', 'btn--secondary block-explainer-editor__add-note', () => {
    const id = `tray_${Date.now().toString(36)}${(++seq).toString(36)}`;
    commit({ tray: [...(current.content.tray ?? []), { id, html: '' }] });
    paintTray();
    trayList.querySelector<HTMLInputElement>('li:last-child input')?.focus();
  });
  paintTray();
  tray.append(trayHead, trayHint, trayList, addNote);

  setup.append(titleLab, title, layoutLab, layout, sourceLab, kindRow, source, textHint, tray);

  // Recording.
  const recArea = el('div', 'block-explainer-editor__recording');
  let player: ExplainerPlayer | null = null;
  let recorder: ExplainerRecorderHandle | null = null;

  const openRecorder = (startAt: number) => {
    player?.dispose();
    player = null;
    recorder = mountExplainerRecorder(current, {
      blockId: current.id,
      lessonId: context.lessonId,
      startAt,
      countdownMs: context.countdownMs,
      transcribeWaitMs: context.transcribeWaitMs,
      onDone: (take) => {
        recorder?.dispose();
        recorder = null;
        commit({ recording: applyTake(current.content.recording, take, startAt) });
        paintRecording();
      },
      onCancel: () => {
        recorder = null;
        paintRecording();
      }
    });
    recArea.replaceChildren(recorder.el);
    setup.hidden = true;
  };

  const askRecord = async (startAt: number) => {
    if (current.content.recording && startAt === 0) {
      const ok = await askConfirmCard({
        title: 'Record a new explainer?',
        supporting: 'The new recording replaces this one and its timeline.',
        confirmLabel: 'Record again',
        discardLabel: 'Keep this one'
      });
      if (!ok) return;
    }
    openRecorder(startAt);
  };

  function paintRecording(): void {
    setup.hidden = false;
    player?.dispose();
    player = null;
    const rec = current.content.recording;
    recArea.replaceChildren();
    if (!rec) {
      const hasText = (current.content.text?.stanzas ?? []).some((s) => s.lines.some((l) => l.text.trim()));
      const record = btn('Record', 'btn--primary block-explainer-editor__record', () => void askRecord(0));
      record.disabled = !hasText;
      recArea.append(el('p', 'block-explainer__hint', hasText ? 'Record your voice while you mark the text. Up to 10 minutes.' : 'Paste the text first, then record.'), record);
      return;
    }
    const statusRow = el('div', 'block-explainer-editor__status');
    statusRow.setAttribute('role', 'group');
    statusRow.setAttribute('aria-label', 'Who sees the recording');
    const statusBtns = (['draft', 'published'] as const).map((s) => {
      const b = btn(s === 'draft' ? 'Draft: only you' : 'Published: students see it', 'btn--ghost block-explainer-editor__status-btn', () => {
        commit({ recording: { ...current.content.recording!, status: s } });
        for (const x of statusBtns) x.setAttribute('aria-pressed', String(x === b));
      });
      b.dataset.status = s;
      b.setAttribute('aria-pressed', String(rec.status === s));
      statusRow.append(b);
      return b;
    });
    const again = btn('Record again', 'btn--ghost block-explainer-editor__record-again', () => void askRecord(0));
    statusRow.append(again);
    player = mountExplainerPlayer(current);
    const timeline = createTimeline(rec, {
      onChange: (next) => {
        const t = player?.time() ?? 0;
        commit({ recording: next });
        paintRecording();
        player?.seek(t);
      },
      onSeek: (t) => {
        player?.seek(t);
        player?.play();
      },
      onRerecord: (t) => openRecorder(t)
    });
    recArea.append(statusRow, player.el, timeline);
  }
  paintRecording();

  root.append(setup, recArea);
  return root;
}

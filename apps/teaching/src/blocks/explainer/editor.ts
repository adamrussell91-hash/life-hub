/**
 * Explainer editor: set up the text and notes tray, record, then tidy the
 * timeline. The recording starts as a draft; students see it once published.
 */
import { parseAnnotationSource, serializeAnnotationSource } from '@/blocks/annotation-text';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import type { ExplainerBlock, ExplainerBoardElement, ExplainerRecording } from '@/schemas/block';
import { mountBoard, type BoardHandle } from './board-runtime';
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

/**
 * Takes in progress, by block id. The lesson page can rebuild a block's editor
 * mid-take (a click elsewhere, Done, a late fetch). The take carries on, and
 * the newest editor for the block adopts it and saves it when it finishes.
 */
type LiveTake = { recorder: ExplainerRecorderHandle; startAt: number; owner: { done: (take: ExplainerTake) => void; cancel: () => void } };
const liveTakes = new Map<string, LiveTake>();

export function createExplainerEditor(
  block: ExplainerBlock,
  onChange: (block: ExplainerBlock) => void,
  context: { lessonId?: string; countdownMs?: number; transcribeWaitMs?: number; getLatest?: () => unknown } = {}
): HTMLElement {
  let current = block;
  /** The lesson's own copy of this block, newer than ours if the page changed it. */
  const latest = (): ExplainerBlock => {
    const b = context.getLatest?.() as ExplainerBlock | undefined;
    return b && b.block_type === 'explainer' && b.id === block.id ? b : current;
  };
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
    ['board', 'Board only', true],
    ['both', 'Text and board side by side', true]
  ] as const) {
    const o = el('option', '', label);
    o.value = value;
    o.disabled = !ready;
    layout.append(o);
  }
  layout.value = current.content.layout ?? 'text';
  layout.addEventListener('change', () => {
    commit({ layout: layout.value as ExplainerBlock['content']['layout'] });
    paintStartBoard();
    if (!recorder) paintRecording();
  });

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

  // The board's starting picture, drawn before recording (e.g. empty boxes to fill).
  const startArea = el('div', 'block-explainer-editor__start');
  let startBoard: BoardHandle | null = null;
  function paintStartBoard(): void {
    startBoard?.dispose();
    startBoard = null;
    startArea.replaceChildren();
    if ((current.content.layout ?? 'text') === 'text') return;
    const locked = Boolean(current.content.recording);
    startArea.append(
      el('p', 'pf-field__label', 'Starting picture'),
      el(
        'p',
        'block-explainer__hint',
        locked ? 'Delete the recording, or record again, to change the starting picture: the recording draws on top of it.' : 'Draw what the board shows before you start talking.'
      )
    );
    const scene = current.content.board_start;
    startBoard = mountBoard({
      elements: (scene?.elements ?? []).filter((e) => !e.isDeleted),
      files: scene?.files,
      background: scene?.appState?.viewBackgroundColor,
      editable: !locked,
      onChange: locked
        ? undefined
        : ({ elements, appState }) => {
            if (appState.newElement) return;
            const live = elements.filter((e) => !e.isDeleted).map((e) => JSON.parse(JSON.stringify(e)) as ExplainerBoardElement);
            const before = JSON.stringify(current.content.board_start?.elements ?? []);
            if (JSON.stringify(live) === before) return;
            commit({ board_start: { format: 'excalidraw', version: 1, elements: live, appState: {}, files: startBoard?.getFiles() ?? {} } });
          }
    });
    startArea.append(startBoard.el);
  }
  paintStartBoard();

  setup.append(titleLab, title, layoutLab, layout, sourceLab, kindRow, source, textHint, tray, startArea);

  // Recording.
  const recArea = el('div', 'block-explainer-editor__recording');
  let player: ExplainerPlayer | null = null;
  let recorder: ExplainerRecorderHandle | null = null;

  const owner = (startAt: number): LiveTake['owner'] => ({
    done: (take) => {
      liveTakes.get(current.id)?.recorder.dispose();
      liveTakes.delete(current.id);
      recorder = null;
      // Save onto the lesson's latest copy of the block, never an older one.
      current = latest();
      // Images pasted during the take play back from the starting picture's
      // file store (files only: the starting picture's shapes stay as they were).
      const start = current.content.board_start;
      const extra = take.files
        ? { board_start: start ? { ...start, files: { ...take.files, ...(start.files ?? {}) } } : { format: 'excalidraw' as const, version: 1 as const, elements: [], appState: {}, files: take.files } }
        : {};
      commit({ recording: applyTake(current.content.recording, take, startAt), ...extra });
      paintStartBoard();
      paintRecording();
    },
    cancel: () => {
      liveTakes.delete(current.id);
      recorder = null;
      paintRecording();
    }
  });

  const openRecorder = (startAt: number) => {
    player?.dispose();
    player = null;
    current = latest();
    const live: LiveTake = { recorder: null as unknown as ExplainerRecorderHandle, startAt, owner: owner(startAt) };
    recorder = mountExplainerRecorder(current, {
      blockId: current.id,
      lessonId: context.lessonId,
      startAt,
      countdownMs: context.countdownMs,
      transcribeWaitMs: context.transcribeWaitMs,
      onDone: (take) => live.owner.done(take),
      onCancel: () => live.owner.cancel()
    });
    live.recorder = recorder;
    liveTakes.set(current.id, live);
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

  // A test take can go: the text, tray and starting picture stay, and the board can be drawn on again.
  const askDelete = async () => {
    const ok = await askConfirmCard({
      title: 'Delete this recording?',
      supporting: 'Your voice, marks and board drawing go. The text, notes tray and starting picture stay.',
      confirmLabel: 'Delete recording',
      discardLabel: 'Keep it'
    });
    if (!ok) return;
    const { recording: _gone, ...rest } = current.content;
    current = { ...current, content: rest };
    onChange(current);
    paintStartBoard();
    paintRecording();
  };

  function paintRecording(): void {
    setup.hidden = false;
    player?.dispose();
    player = null;
    const rec = current.content.recording;
    recArea.replaceChildren();
    if (!rec) {
      const hasText =
        current.content.layout === 'board' || (current.content.text?.stanzas ?? []).some((s) => s.lines.some((l) => l.text.trim()));
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
    const remove = btn('Delete recording', 'btn--ghost block-explainer-editor__delete-recording', () => void askDelete());
    statusRow.append(again, remove);
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
  // A take already running for this block (the page rebuilt the editor): adopt it.
  const running = liveTakes.get(block.id);
  if (running) {
    running.owner = owner(running.startAt);
    recorder = running.recorder;
    recorder.adopt(recArea);
    setup.hidden = true;
  } else paintRecording();

  root.append(setup, recArea);
  return root;
}

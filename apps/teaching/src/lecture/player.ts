// apps/teaching/src/lecture/player.ts
import type { Block } from '@/schemas/block';
import { renderBlock, type RenderContext } from '@/blocks/render';
import { el, readJSON, writeJSON } from '@/quiz/dom';
import { lectureScenes, noteCues, type LectureScene } from './scenes';
import { act, answer, goTo, mainAction, restoreState, startState, type LectureState } from './state';
import { LECTURE_ANSWERED, type AnsweredDetail } from './answered';
import { createNarration } from './narration';
import type { LectureClient, LectureStatus, MyHandup } from './api';
import './lecture.css';

export type LecturePlayerOptions = {
  lessonId: string;
  title: string;
  blocks: Block[];
  /** Null in preview and when opened without a class: nothing is sent. */
  client: LectureClient | null;
  /** Draws the lesson's cover and title onto the title card. */
  renderHero: (host: HTMLElement) => void;
  /** Teacher preview: hinge answers check locally and the strip jumps to any scene. */
  preview?: boolean;
};

export type LecturePlayerHandle = { dispose(): void };

const NOTE_LOCK_MS = 3000;
const HINT_MS = 4000;
const SEND_EVERY = 3;

/**
 * The lecture player: a title card, then one scene at a time with its
 * narration, tap to reveal, gates and note cues, and a recap at the end.
 * The rules live in state.ts; this file only draws them.
 */
export function mountLecturePlayer(host: HTMLElement, options: LecturePlayerOptions): LecturePlayerHandle {
  const { lessonId, blocks, client, preview = false } = options;
  const scenes = lectureScenes(blocks);
  const saveKey = `lecture:${lessonId}:state`;
  let state: LectureState = restoreState(preview ? null : readJSON(saveKey), scenes);
  let status: LectureStatus | null = null;
  const localHandups: MyHandup[] = [];
  let hinted = false;
  let hintTimer = 0;
  let lockTimer = 0;
  let unsent = 0;
  let disposed = false;
  const noteReady = new Map<string, number>();
  const narration = createNarration();
  const canRaise = !!client && !preview;

  const root = el('div', 'lecture');
  root.classList.toggle('lecture--no-hand', !canRaise);
  host.replaceChildren(root);

  const save = () => { if (!preview) writeJSON(saveKey, state); };
  const progressBody = () => ({
    reached: state.reached, replays: state.replays, last_scene: scenes[state.scene]?.id ?? '',
    missed: state.missed, ticked: state.ticked.length, finished: state.finished
  });
  const send = (leaving = false) => {
    if (!client || preview || status?.identity.need) return;
    unsent = 0;
    client.progress(progressBody(), leaving);
  };
  const onLeave = () => { if (document.visibilityState === 'hidden') send(true); };
  document.addEventListener('visibilitychange', onLeave);

  // ---------- title card ----------
  function titleCard(): void {
    narration.pause();
    const card = el('section', 'lecture-title');
    options.renderHero(card);
    const total = scenes.reduce((sum, s) => sum + (s.narration?.duration_s ?? 0), 0);
    if (total > 0) card.append(el('p', 'lecture-title__time', `About ${Math.max(1, Math.round(total / 60))} min`));
    card.append(el('p', 'lecture-title__book', 'You’ll need your book and a pen.'));
    const who = el('div', 'lecture-title__who');
    const start = el('button', 'btn btn--primary lecture-title__start');
    start.type = 'button';
    const resumeAt = state.scene > 0 && !state.finished ? scenes[state.scene] : undefined;
    start.textContent = resumeAt ? `Pick up at ${resumeAt.label}` : 'Start';
    start.addEventListener('click', () => play());
    card.append(who, start);
    if (resumeAt) {
      const again = el('button', 'btn btn--ghost lecture-title__again', 'Start again');
      again.type = 'button';
      again.addEventListener('click', () => { state = startState(scenes); save(); play(); });
      card.append(again);
    }
    root.replaceChildren(card);
    paintWho(who, start);
  }

  function paintWho(who: HTMLElement, start: HTMLButtonElement): void {
    const need = !!client && status?.identity.need === 'initials';
    start.disabled = need;
    who.replaceChildren();
    if (!need) {
      if (status?.identity.initials) who.append(el('p', 'lecture-title__as', `Watching as ${status.identity.initials}`));
      return;
    }
    const input = el('input', 'qz-input lecture-title__initials');
    input.autocomplete = 'off';
    input.maxLength = 5;
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--secondary', 'That’s me');
    go.type = 'button';
    const err = el('p', 'lecture-title__err');
    err.hidden = true;
    go.addEventListener('click', async () => {
      try {
        status = await client!.claim(input.value);
        paintWho(who, start);
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t work. Try again.';
        err.hidden = false;
      }
    });
    who.append(el('p', 'lecture-title__ask', 'Type your initials so your teacher can see your hand-ups.'), input, go, err);
  }

  // ---------- playing ----------
  const strip = el('header', 'lecture-strip');
  const chapterName = el('p', 'lecture-strip__chapter');
  const dots = el('ol', 'lecture-strip__dots');
  const hand = el('button', 'lecture-strip__hand', '✋ Lost me');
  hand.type = 'button';
  strip.append(chapterName, dots, hand);

  const stage = el('main', 'lecture-stage');
  const captions = el('p', 'lecture-captions');
  captions.hidden = true;
  captions.setAttribute('aria-live', 'polite');
  const hint = el('p', 'lecture-hint', 'Tap Reveal for the next part');
  hint.hidden = true;

  const bar = el('footer', 'lecture-bar');
  const back = el('button', 'lecture-bar__back', '◀ Back');
  back.type = 'button';
  const cc = el('button', 'lecture-bar__cc', 'CC');
  cc.type = 'button';
  cc.setAttribute('aria-pressed', 'false');
  cc.setAttribute('aria-label', 'Captions');
  const main = el('button', 'btn btn--primary lecture-bar__main');
  main.type = 'button';
  bar.append(back, narration.el, cc, main);

  back.addEventListener('click', () => {
    if (state.detour) state = act(state, scenes, { kind: 'return', label: '' });
    else state = goTo(state, scenes, state.scene - 1);
    save();
    paintScene();
  });
  cc.addEventListener('click', () => {
    const on = cc.getAttribute('aria-pressed') !== 'true';
    cc.setAttribute('aria-pressed', String(on));
    paintCaptions();
  });
  main.addEventListener('click', () => {
    const action = mainAction(state, scenes);
    const before = state.scene;
    state = act(state, scenes, action);
    save();
    if (action.kind === 'finish') { send(); return recap(); }
    if (action.kind === 'detour' || action.kind === 'return' || state.scene !== before) {
      if (state.scene !== before && ++unsent >= SEND_EVERY) send();
      return paintScene();
    }
    revealUpTo();
    paintBar();
  });
  hand.addEventListener('click', () => openHandup());
  stage.addEventListener(LECTURE_ANSWERED, (e) => {
    const { blockId, result } = (e as CustomEvent<AnsweredDetail>).detail;
    state = answer(state, blockId, result);
    save();
    paintBar();
  });
  // A video or clip inside the scene pauses the narration.
  stage.addEventListener('play', () => narration.pause(), true);
  // Narration never holds the main button; idle only drives the one-time hint.
  narration.onIdle((idle) => {
    window.clearTimeout(hintTimer);
    if (!idle || hinted) return;
    hintTimer = window.setTimeout(() => {
      const kind = mainAction(state, scenes).kind;
      if (kind !== 'reveal' && kind !== 'next') return;
      hinted = true;
      hint.hidden = false;
    }, HINT_MS);
  });

  const onKey = (e: KeyboardEvent) => {
    if (!root.contains(stage)) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
    if (e.key === ' ') { e.preventDefault(); narration.toggle(); }
    if (e.key === 'ArrowRight' && !main.disabled) { e.preventDefault(); main.click(); }
  };
  document.addEventListener('keydown', onKey);

  function play(): void {
    root.replaceChildren(strip, stage, captions, hint, bar);
    hand.hidden = !canRaise;
    paintScene();
  }

  function paintScene(): void {
    window.clearTimeout(hintTimer);
    hint.hidden = true;
    const scene = scenes[state.scene];
    if (!scene) return recap();
    const detourGate = state.detour ? scene.beats.find((b) => b.block.id === state.detour) : null;
    chapterName.textContent = scene.chapter?.label ?? options.title;
    paintDots();
    stage.replaceChildren();
    stage.classList.toggle('lecture-stage--detour', !!detourGate?.sidePath);
    const ctx: RenderContext = { lessonId, pageBlocks: blocks, lecture: preview ? 'preview' : 'live' };
    if (detourGate?.sidePath) {
      const side = detourGate.sidePath;
      stage.classList.remove('lecture-stage--single-image');
      stage.append(el('p', 'lecture-stage__detour', 'A second look'));
      stage.append(el('h2', 'lecture-stage__title', side.content.title || 'Let’s look again'));
      for (const child of side.content.blocks as Block[]) stage.append(beatEl(renderBlock(child, 'student', ctx), -1));
      narration.load(side.content.narration ?? null);
    } else {
      if (scene.heading) stage.append(renderBlock(scene.heading, 'student', ctx));
      else stage.append(el('h2', 'lecture-stage__title', scene.label));
      stage.classList.toggle('lecture-stage--single-image', scene.beats.length === 1 && scene.beats[0]!.block.block_type === 'image');
      scene.beats.forEach((beat, i) => stage.append(beatEl(renderBlock(beat.block, 'student', ctx), i)));
      narration.load(scene.narration);
      revealUpTo();
    }
    paintCaptions();
    paintBar();
    stage.scrollTo?.({ top: 0 });
  }

  function beatEl(content: HTMLElement, beat: number): HTMLElement {
    const wrap = el('div', 'lecture-beat');
    wrap.dataset.beat = String(beat);
    wrap.append(content);
    return wrap;
  }

  function revealUpTo(): void {
    const beats = stage.querySelectorAll<HTMLElement & { inert: boolean }>('.lecture-beat[data-beat]');
    let marked = false;
    for (const beat of beats) {
      const i = Number(beat.dataset.beat);
      if (i < 0) continue;
      const hidden = i >= state.shown;
      if (!hidden && beat.classList.contains('lecture-beat--hidden')) beat.classList.add('lecture-beat--in');
      beat.classList.toggle('lecture-beat--hidden', hidden);
      beat.classList.toggle('lecture-beat--next', hidden && !marked);
      if (hidden) marked = true;
      beat.inert = hidden;
      beat.setAttribute('aria-hidden', String(hidden));
    }
    hint.hidden = true;
  }

  function paintDots(): void {
    dots.replaceChildren();
    scenes.forEach((scene, i) => {
      const dot = el('li', 'lecture-strip__dot');
      if (scene.chapter && scene.chapter.id === scene.id) dot.classList.add('lecture-strip__dot--chapter');
      if (scene.beats.some((b) => b.gate)) dot.classList.add('lecture-strip__dot--gate');
      if (scene.beats.some((b) => b.block.block_type === 'note_cue')) dot.classList.add('lecture-strip__dot--note');
      if (state.reached.includes(scene.id)) dot.classList.add('lecture-strip__dot--seen');
      if (i === state.scene) {
        dot.classList.add('lecture-strip__dot--here');
        dot.setAttribute('aria-current', 'step');
        if (state.detour) dot.classList.add('lecture-strip__dot--detour');
      }
      dot.title = scene.label;
      if (preview) {
        dot.tabIndex = 0;
        dot.addEventListener('click', () => { state = goTo(state, scenes, i); paintScene(); });
      }
      dots.append(dot);
    });
    dots.setAttribute('aria-label', `Scene ${state.scene + 1} of ${scenes.length}`);
  }

  function paintCaptions(): void {
    const scene = scenes[state.scene];
    const gate = state.detour ? scene?.beats.find((b) => b.block.id === state.detour) : null;
    const clip = gate?.sidePath ? gate.sidePath.content.narration : scene?.narration;
    const text = clip?.transcript ?? '';
    captions.textContent = text;
    captions.hidden = cc.getAttribute('aria-pressed') !== 'true' || !text;
    cc.hidden = !text;
  }

  function paintBar(): void {
    if (disposed) return;
    window.clearTimeout(lockTimer);
    const action = mainAction(state, scenes);
    main.textContent = action.label;
    main.disabled = action.kind === 'wait';
    back.disabled = state.scene === 0 && !state.detour;
    if (action.kind === 'tick') {
      // A note cue holds the button a moment, so "Done" means they wrote something.
      const ready = noteReady.get(action.noteId) ?? Date.now() + NOTE_LOCK_MS;
      noteReady.set(action.noteId, ready);
      const left = ready - Date.now();
      if (left > 0) {
        main.disabled = true;
        lockTimer = window.setTimeout(paintBar, left);
      }
    }
  }

  // ---------- hand-up ----------
  function openHandup(prefill = ''): void {
    if (!client || !canRaise) return;
    const scene = scenes[state.scene];
    if (!scene) return;
    const sheet = el('dialog', 'lecture-sheet');
    const form = el('form', 'lecture-sheet__form');
    form.method = 'dialog';
    form.append(el('p', 'lecture-sheet__title', `✋ ${scene.label}`));
    const box = el('textarea', 'lecture-sheet__text');
    box.maxLength = 500;
    box.rows = 3;
    box.placeholder = 'What lost you? (optional)';
    box.value = prefill;
    box.setAttribute('aria-label', 'What lost you?');
    const sendBtn = el('button', 'btn btn--primary', 'Send to my teacher');
    sendBtn.type = 'button';
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    const note = el('p', 'lecture-sheet__note');
    note.setAttribute('role', 'status');
    const close = () => (sheet.open ? sheet.close() : sheet.remove());
    cancel.addEventListener('click', close);
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      try {
        status = await client.handup({ scene_id: scene.id, scene_label: scene.label, clip_s: narration.time(), text: box.value.trim() });
        localHandups.length = 0;
        note.textContent = 'Sent. Your teacher will see it.';
        window.setTimeout(close, 1200);
      } catch (e) {
        note.textContent = e instanceof Error ? e.message : 'That didn’t send. Try again.';
        sendBtn.disabled = false;
      }
    });
    form.append(box, note, sendBtn, cancel);
    sheet.append(form);
    sheet.addEventListener('close', () => sheet.remove());
    root.append(sheet);
    if (typeof sheet.showModal === 'function') sheet.showModal();
    else sheet.setAttribute('open', '');
  }
  // A Question note cue offers the hand-up straight from its card.
  stage.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest?.('.lecture-raise');
    if (link) openHandup((link as HTMLElement).dataset.prompt ?? '');
  });

  // ---------- recap ----------
  function recap(): void {
    narration.pause();
    window.clearTimeout(hintTimer);
    const page = el('section', 'lecture-recap');
    page.append(el('h2', 'lecture-recap__title', 'Recap'));
    const notes = el('ul', 'lecture-recap__list');
    for (const { block } of noteCues(scenes)) {
      const done = state.ticked.includes(block.id);
      const item = el('li', `lecture-recap__note${done ? ' lecture-recap__note--done' : ''}`);
      item.append(el('span', 'lecture-recap__mark', done ? '✓' : '○'), el('span', '', (block.content as { prompt: string }).prompt));
      notes.append(item);
    }
    if (notes.childElementCount) page.append(el('h3', 'lecture-recap__head', 'In your book'), notes);
    const missed = scenes.flatMap((scene, i) => scene.beats.filter((b) => state.missed.includes(b.block.id)).map(() => ({ scene, i })));
    if (missed.length) {
      const list = el('ul', 'lecture-recap__list');
      for (const { scene, i } of missed) {
        const item = el('li');
        const go = el('button', 'btn btn--ghost', `Look again: ${scene.label}`);
        go.type = 'button';
        go.addEventListener('click', () => { state = goTo({ ...state, finished: false }, scenes, i); save(); play(); });
        item.append(go);
        list.append(item);
      }
      page.append(el('h3', 'lecture-recap__head', 'Look again'), list);
    }
    const mine = [...(status?.handups ?? []), ...localHandups];
    if (mine.length) {
      const list = el('ul', 'lecture-recap__list');
      for (const h of mine) {
        const item = el('li', 'lecture-recap__handup');
        item.append(el('p', '', `✋ ${h.scene_label}${h.text ? `: ${h.text}` : ''}`));
        item.append(el('p', 'lecture-recap__reply', h.status === 'answered' ? `Your teacher: ${h.reply || 'Answered.'}` : 'Waiting for your teacher.'));
        list.append(item);
      }
      page.append(el('h3', 'lecture-recap__head', 'Your hand-ups'), list);
    }
    const finish = el('button', 'btn btn--primary lecture-recap__finish', state.finished ? 'Finished ✓' : 'Finish');
    finish.type = 'button';
    finish.addEventListener('click', () => {
      state = { ...state, finished: true };
      save();
      send();
      finish.textContent = 'Finished ✓';
    });
    page.append(finish);
    root.replaceChildren(page);
  }

  titleCard();
  if (client && !preview) {
    // The server may be missing or down; the lecture still plays, it just sends nothing.
    void Promise.resolve()
      .then(() => client.status())
      .then((next) => {
        if (disposed) return;
        status = next;
        if (root.querySelector('.lecture-title')) titleCard();
      })
      .catch(() => {});
  }

  return {
    dispose() {
      send(true);
      disposed = true;
      narration.dispose();
      window.clearTimeout(hintTimer);
      window.clearTimeout(lockTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onLeave);
    }
  };
}

import { button, el } from '@/blocks/peer-feedback-ui';
import { loadActivityState, saveActivityState, storageKey } from '@/blocks/learning-activity';
import { keepInitials, savedInitials, sendThinking } from '@/blocks/thinking-client';
import { cleanInitials } from '@/blocks/voice-client';
import { LECTURE_ANSWERED } from '@/lecture/answered';
import {
  RATING_NAMES, canAdd, cleanChoiceData, pickProblem, ratingName, ruleApplies, ruleStatus,
  type ChoiceData, type ChoicePickRecord
} from './model';
import {
  boardSettings, buildTileBody, tileGrid, tileLabel, tileMeta, tileTier,
  type ChoiceBoardBlock, type DeckMode, type RenderChild
} from './shared';

/** How long after the last change the picks go to the teacher. */
export const SEND_DELAY_MS = 1500;
const REASON_MAX = 140;
const LEARNED_MAX = 200;

type StudentPick = Omit<ChoicePickRecord, 'index' | 'tier'>;

/**
 * Student side: pick tiles with a reason, work inside them, swap until work
 * starts, then rate each finished task and note one thing learned.
 */
export function mountStudent(
  block: ChoiceBoardBlock,
  opts: { lessonId?: string; saveScope?: string; renderChild: RenderChild; decks: DeckMode }
): HTMLElement {
  const tiles = block.content.tabs;
  const tabIds = tiles.map((t) => t.id);
  const settings = boardSettings(block);
  const showColumn = settings.rule === 'each_column' && ruleApplies(settings, tiles.length);
  const scope = opts.lessonId ?? opts.saveScope;
  const stateKey = scope ? `${storageKey(scope, block.id)}.choice` : '';

  const loaded = stateKey ? cleanChoiceData(loadActivityState<ChoiceData>(stateKey)) : { picks: [] };
  let picks: StudentPick[] = loaded.picks
    .filter((p) => tabIds.includes(p.tab))
    .slice(0, settings.pick)
    .map(({ index: _i, tier: _t, ...rest }) => rest);
  let choosing = -1;
  let finishing = '';
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  let sentOnce = picks.length > 0;

  const root = el('div', 'cb-student');
  const status = el('p', 'cb-status block-secondary');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const note = el('p', 'cb-note block-secondary');
  note.hidden = true;

  let initialsInput: HTMLInputElement | null = null;
  if (opts.lessonId) {
    const wrap = el('div', 'pf-field cb-initials');
    const label = el('label', 'pf-field__label', 'Your initials');
    label.htmlFor = `cb-initials-${block.id}`;
    const input = el('input', 'pa-input cb-initials__input');
    input.id = label.htmlFor;
    input.maxLength = 4;
    input.autocomplete = 'off';
    input.placeholder = 'e.g. JS';
    input.value = savedInitials();
    input.addEventListener('input', () => {
      input.value = cleanInitials(input.value);
      if (input.value.length >= 2) {
        keepInitials(input.value);
        if (picks.length) scheduleSend();
      }
    });
    wrap.append(label, input, el('p', 'pf-field__hint block-secondary', 'Your teacher sees your initials next to your picks.'));
    initialsInput = input;
    root.append(wrap);
  }

  const grid = tileGrid(settings, 'Tasks to pick from');
  const work = el('div', 'cb-work');
  root.append(status, grid, work, note);

  const faces: HTMLButtonElement[] = [];
  const stateTags: HTMLElement[] = [];
  const reasonBoxes: HTMLElement[] = [];
  const sections = new Map<string, HTMLElement>();

  const pickOf = (tab: string): StudentPick | undefined => picks.find((p) => p.tab === tab);
  const pickedIndexes = (): number[] => picks.map((p) => tabIds.indexOf(p.tab)).filter((i) => i >= 0);

  function persist(): void {
    if (stateKey) saveActivityState(stateKey, record());
    scheduleSend();
  }

  function record(): ChoiceData {
    return {
      picks: picks.map((p) => {
        const index = tabIds.indexOf(p.tab);
        return { ...p, index, tier: tileTier(tiles[index]!) };
      })
    };
  }

  function scheduleSend(): void {
    if (!opts.lessonId) return;
    if (!picks.length && !sentOnce) return;
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      sendTimer = undefined;
      const initials = initialsInput ? cleanInitials(initialsInput.value) : '';
      sendThinking(opts.lessonId!, block.id, initials, record())
        .then(() => {
          sentOnce = true;
          note.hidden = true;
        })
        .catch(() => {
          note.hidden = false;
          note.textContent = 'Your picks are kept on this device. They reach your teacher once the connection is back.';
        });
    }, SEND_DELAY_MS);
  }

  function setStatus(text?: string): void {
    if (text) {
      status.textContent = text;
      return;
    }
    const rule = ruleStatus(pickedIndexes(), tiles.length, settings);
    if (!rule.met) {
      status.textContent = rule.need;
      return;
    }
    const done = picks.filter((p) => p.finished).length;
    status.textContent = done === picks.length ? 'Your picks are set and every task is finished.' : 'Your picks are set.';
  }

  function stateText(pick: StudentPick | undefined): string {
    if (!pick) return '';
    if (pick.finished) return 'Finished';
    if (pick.started) return 'In progress';
    return 'Picked';
  }

  /* ── Grid ─────────────────────────────────────────────────────────── */

  tiles.forEach((tile, index) => {
    const item = el('li', 'cb-tile');
    item.dataset.tier = String(tileTier(tile));
    item.dataset.tab = tile.id;
    const face = el('button', 'cb-tile__face');
    face.type = 'button';
    const tag = el('span', 'cb-state');
    face.append(el('span', 'cb-tile__label', tileLabel(tile, index)), tileMeta(tile, index, settings, showColumn), tag);
    face.addEventListener('click', () => onTile(index));
    faces.push(face);
    stateTags.push(tag);

    const reason = el('div', 'cb-reason');
    reason.id = `cb-reason-${block.id}-${index}`;
    reason.hidden = true;
    face.setAttribute('aria-controls', reason.id);
    reasonBoxes.push(reason);
    item.append(face, reason);
    grid.append(item);
  });

  function onTile(index: number): void {
    const tile = tiles[index]!;
    if (pickOf(tile.id)) {
      const section = sections.get(tile.id);
      section?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      section?.querySelector<HTMLElement>('.cb-task__title')?.focus();
      return;
    }
    if (choosing === index) {
      choosing = -1;
      draw();
      return;
    }
    if (!canAdd(pickedIndexes(), settings)) {
      setStatus(`You have picked ${settings.pick}. Swap a pick to choose this task.`);
      return;
    }
    const problem = pickProblem(pickedIndexes(), index, tiles.length, settings);
    if (problem) {
      setStatus(problem);
      return;
    }
    choosing = index;
    draw();
    reasonBoxes[index]!.querySelector<HTMLInputElement>('input')?.focus();
  }

  function fillReason(index: number): void {
    const box = reasonBoxes[index]!;
    if (box.childElementCount) return;
    const id = `cb-why-${block.id}-${index}`;
    const label = el('label', 'pf-field__label', 'Why this one?');
    label.htmlFor = id;
    const input = el('input', 'pa-input cb-reason__input');
    input.id = id;
    input.maxLength = REASON_MAX;
    input.autocomplete = 'off';
    input.placeholder = 'One line is enough';
    const error = el('p', 'cb-error');
    error.hidden = true;
    const open = button('Open this task', 'primary', () => {
      const text = input.value.trim();
      if (!text) {
        error.hidden = false;
        error.textContent = 'Write a short reason, then open the task.';
        input.focus();
        return;
      }
      const tile = tiles[index]!;
      picks = [...picks, { tab: tile.id, reason: text, started: false, finished: false }];
      choosing = -1;
      input.value = '';
      error.hidden = true;
      persist();
      draw();
      sections.get(tile.id)?.querySelector<HTMLElement>('.cb-task__title')?.focus();
    });
    open.classList.add('cb-reason__open');
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        open.click();
      }
    });
    const back = button('Back', 'ghost', () => {
      choosing = -1;
      draw();
      faces[index]!.focus();
    });
    const actions = el('div', 'pf-actions');
    actions.append(open, back);
    box.append(label, input, error, actions);
  }

  /* ── Work area: one section per pick, built once and kept ─────────── */

  function sectionFor(pick: StudentPick): HTMLElement {
    const existing = sections.get(pick.tab);
    if (existing) return existing;
    const index = tabIds.indexOf(pick.tab);
    const tile = tiles[index]!;
    const section = el('section', 'cb-task');
    section.dataset.tab = tile.id;
    section.dataset.tier = String(tileTier(tile));
    const head = el('header', 'cb-task__head');
    const title = el('h4', 'cb-task__title block-subtitle', tileLabel(tile, index));
    title.tabIndex = -1;
    const tag = el('span', 'cb-state');
    head.append(title, tileMeta(tile, index, settings, showColumn), tag);
    const why = el('p', 'cb-task__why block-secondary');
    const body = el('div', 'cb-task__body');
    buildTileBody(body, tile, opts.renderChild, opts.decks);
    const markStarted = (): void => {
      const current = pickOf(tile.id);
      if (!current || current.started) return;
      current.started = true;
      persist();
      draw();
    };
    body.addEventListener('input', markStarted);
    body.addEventListener('change', markStarted);
    body.addEventListener(LECTURE_ANSWERED, markStarted);
    const actions = el('div', 'pf-actions cb-task__actions');
    const finish = el('div', 'cb-finish');
    const done = el('div', 'cb-done');
    section.append(head, why, body, actions, finish, done);
    sections.set(tile.id, section);
    return section;
  }

  function drawSection(pick: StudentPick): void {
    const section = sectionFor(pick);
    const tile = tiles[tabIds.indexOf(pick.tab)]!;
    section.dataset.state = pick.finished ? 'finished' : pick.started ? 'started' : 'picked';
    section.querySelector('.cb-state')!.textContent = stateText(pick);
    section.querySelector('.cb-task__why')!.textContent = `Why I picked it: ${pick.reason}`;
    const actions = section.querySelector<HTMLElement>('.cb-task__actions')!;
    const finish = section.querySelector<HTMLElement>('.cb-finish')!;
    const done = section.querySelector<HTMLElement>('.cb-done')!;
    actions.replaceChildren();
    done.replaceChildren();
    // Keep an open finish form as it is, so a redraw never wipes what is typed in it.
    const keepFinish = finishing === pick.tab && finish.dataset.open === '1';
    if (!keepFinish) {
      finish.replaceChildren();
      delete finish.dataset.open;
    }
    finish.hidden = finishing !== pick.tab;
    done.hidden = !pick.finished || finishing === pick.tab;

    if (!pick.started && !pick.finished) {
      actions.append(button('Swap this pick', 'ghost', () => swap(tile.id)));
    } else if (!pick.finished) {
      actions.append(el('span', 'cb-lock block-secondary', 'Work started, so this pick stays.'));
    }
    if (!pick.finished && finishing !== pick.tab) {
      actions.append(button('I’ve finished this task', 'secondary', () => {
        finishing = pick.tab;
        draw();
        finish.querySelector<HTMLButtonElement>('.cb-rate button')?.focus();
      }));
    }
    if (finishing === pick.tab && !keepFinish) {
      finish.dataset.open = '1';
      fillFinish(pick, finish);
    }
    if (pick.finished && finishing !== pick.tab) {
      done.append(
        el('p', 'cb-done__rating', `How hard: ${ratingName(pick.rating)}`),
        el('p', 'cb-done__learned', `One thing I learned: ${pick.learned ?? ''}`)
      );
      const edit = button('Change my note', 'ghost', () => {
        finishing = pick.tab;
        draw();
      });
      done.append(edit);
    }
  }

  function fillFinish(pick: StudentPick, host: HTMLElement): void {
    let rating = pick.rating ?? 0;
    const group = el('div', 'cb-rate');
    group.setAttribute('role', 'group');
    const legendId = `cb-rate-${block.id}-${pick.tab}`;
    const legend = el('p', 'pf-field__label', 'How hard was it?');
    legend.id = legendId;
    group.setAttribute('aria-labelledby', legendId);
    const choices: HTMLButtonElement[] = [];
    RATING_NAMES.forEach((name, i) => {
      const b = el('button', 'cb-rate__btn', name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(rating === i + 1));
      b.addEventListener('click', () => {
        rating = i + 1;
        choices.forEach((c, j) => c.setAttribute('aria-pressed', String(j === i)));
      });
      choices.push(b);
      group.append(b);
    });
    const id = `cb-learned-${block.id}-${pick.tab}`;
    const label = el('label', 'pf-field__label', 'One thing I learned');
    label.htmlFor = id;
    const input = el('input', 'pa-input cb-finish__input');
    input.id = id;
    input.maxLength = LEARNED_MAX;
    input.autocomplete = 'off';
    input.value = pick.learned ?? '';
    const error = el('p', 'cb-error');
    error.hidden = true;
    const save = button('Save', 'primary', () => {
      const learned = input.value.trim();
      if (!rating) {
        error.hidden = false;
        error.textContent = 'Choose how hard it was.';
        choices[0]!.focus();
        return;
      }
      if (!learned) {
        error.hidden = false;
        error.textContent = 'Write one thing you learned.';
        input.focus();
        return;
      }
      const current = pickOf(pick.tab);
      if (!current) return;
      Object.assign(current, { finished: true, started: true, rating, learned });
      finishing = '';
      persist();
      draw();
    });
    save.classList.add('cb-finish__save');
    const back = button('Back', 'ghost', () => {
      finishing = '';
      draw();
    });
    const actions = el('div', 'pf-actions');
    actions.append(save, back);
    host.append(legend, group, label, input, error, actions);
  }

  function swap(tab: string): void {
    const pick = pickOf(tab);
    if (!pick || pick.started || pick.finished) return;
    picks = picks.filter((p) => p.tab !== tab);
    sections.get(tab)?.remove();
    sections.delete(tab);
    persist();
    draw();
    faces[tabIds.indexOf(tab)]?.focus();
  }

  function draw(): void {
    const full = !canAdd(pickedIndexes(), settings);
    tiles.forEach((tile, index) => {
      const pick = pickOf(tile.id);
      const face = faces[index]!;
      const item = face.parentElement!;
      face.setAttribute('aria-pressed', String(Boolean(pick)));
      face.setAttribute('aria-expanded', String(choosing === index));
      item.dataset.state = pick ? (pick.finished ? 'finished' : pick.started ? 'started' : 'picked') : full ? 'closed' : 'open';
      stateTags[index]!.textContent = pick ? (pick.started && !pick.finished ? 'In progress · Locked choice' : stateText(pick)) : '';
      stateTags[index]!.hidden = !pick;
      const box = reasonBoxes[index]!;
      if (choosing === index) fillReason(index);
      box.hidden = choosing !== index;
    });
    // Picks only join at the end or leave, so move nothing that is already in place (focus stays put).
    const order = picks.map((p) => sectionFor(p));
    for (const child of [...work.children]) if (!order.includes(child as HTMLElement)) child.remove();
    for (const section of order) if (section.parentElement !== work) work.append(section);
    work.hidden = !order.length;
    picks.forEach(drawSection);
    setStatus();
  }

  draw();
  return root;
}

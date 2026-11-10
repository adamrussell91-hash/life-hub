import { button, el, errorText } from '@/blocks/peer-feedback-ui';
import { loadActivityState, saveActivityState, storageKey } from '@/blocks/learning-activity';
import type { RenderContext } from '@/blocks/render';
import { keepInitials, savedInitials, sendThinking } from '@/blocks/thinking-client';
import {
  WILD_ID, cleanSlots, consensus, consensusSlots, contested, endCards, movement, needsWhy, placeCard,
  roundGaps, rowName, slotRow, type Slots
} from './model';
import {
  cardFace, cardText, diamondGrid, dotStrip, endLabels, letterMap, moveBadge, readOnlyDiamond, readyCards,
  rowsPhrase, cardChip, type DiamondCard, type DiamondNineBlock
} from './shared';

type RoundName = 'first' | 'rerank' | 'second';
type Round = { slots: Slots; reasons: Record<string, string>; why?: Record<string, string> };
type Wildcard = { replaces: string; text: string };
/** What this device keeps for one Diamond 9. */
export type DiamondState = {
  initials: string;
  wildcard: Wildcard | null;
  first: Round;
  rerank: Round | null;
  second: Round | null;
  sent: RoundName[];
  active: RoundName | null;
  frame: boolean;
  layouts: string[][] | null;
};

const MAX_REASON = 600;
const MAX_WILD = 300;

const frameText = (end: 'top' | 'bottom') => `This is at the ${end} because …, but …, so ….`;

function cleanRound(value: unknown, valid: Set<string>): Round | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Round>;
  const slots = cleanSlots(v.slots).map((id) => (id && valid.has(id) ? id : null));
  const text = (o: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (o && typeof o === 'object') for (const [k, s] of Object.entries(o)) if (typeof s === 'string') out[k] = s.slice(0, MAX_REASON);
    return out;
  };
  return { slots, reasons: text(v.reasons), why: text(v.why) };
}

/** Builds a state from whatever was saved, dropping anything that no longer fits the block. */
export function loadState(saved: Partial<DiamondState> | null, cards: readonly DiamondCard[], wildcardOn: boolean): DiamondState {
  const ids = new Set(cards.map((c) => c.id));
  const w = saved?.wildcard;
  const wildcard = wildcardOn && w && typeof w.text === 'string' && ids.has(w.replaces) && w.text.trim()
    ? { replaces: w.replaces, text: w.text.slice(0, MAX_WILD) }
    : null;
  const valid = new Set(ids);
  if (wildcard) {
    valid.delete(wildcard.replaces);
    valid.add(WILD_ID);
  }
  const rounds: RoundName[] = ['first', 'rerank', 'second'];
  const sent = Array.isArray(saved?.sent) ? rounds.filter((r) => saved!.sent!.includes(r)) : [];
  const active = rounds.includes(saved?.active as RoundName) ? (saved!.active as RoundName) : null;
  return {
    initials: typeof saved?.initials === 'string' ? saved.initials : savedInitials(),
    wildcard,
    first: cleanRound(saved?.first, valid) ?? { slots: cleanSlots(null), reasons: {} },
    rerank: cleanRound(saved?.rerank, valid),
    second: cleanRound(saved?.second, valid),
    sent,
    active: active && !sent.includes(active) ? active : null,
    frame: saved?.frame === true,
    layouts: Array.isArray(saved?.layouts) ? saved!.layouts!.filter((l) => Array.isArray(l)) : null
  };
}

/** Reasons that still read as the untouched frame count as unwritten. */
function writtenReasons(reasons: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(reasons)) {
    if (text.trim() && text.trim() !== frameText('top') && text.trim() !== frameText('bottom')) out[id] = text.trim();
  }
  return out;
}

/** What is sent for one round: the slots, the two end reasons and any "what changed your mind". */
function roundData(round: Round, withWhy: boolean): Record<string, unknown> {
  const reasons = writtenReasons(round.reasons);
  const { top, bottom } = endCards(round.slots);
  const ends: Record<string, string> = {};
  for (const id of [top, bottom]) if (id && reasons[id]) ends[id] = reasons[id]!;
  const data: Record<string, unknown> = { slots: round.slots.map((s) => s ?? ''), reasons: ends };
  if (withWhy) {
    const why: Record<string, string> = {};
    for (const [id, text] of Object.entries(round.why ?? {})) if (text.trim()) why[id] = text.trim();
    data.why = why;
  }
  return data;
}

export function mountStudent(block: DiamondNineBlock, ctx: RenderContext): HTMLElement {
  const lessonId = ctx.lessonId;
  const scope = ctx.lessonId ?? ctx.saveScope;
  const key = scope ? `${storageKey(scope, block.id)}.diamond` : null;
  const base = readyCards(block);
  const root = el('div', 'd9-student');
  if (base.length < 9) {
    root.append(el('p', 'pf-note block-secondary', 'This Diamond 9 opens once your teacher has added nine cards.'));
    return root;
  }
  const letters = letterMap(base);
  const labels = endLabels(block.content.criterion);
  const second = block.content.second_criterion.trim();
  const state = loadState(key ? loadActivityState<Partial<DiamondState>>(key) : null, base, block.content.wildcard);

  const body = el('div', 'd9-student__body');
  const status = el('p', 'd9-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(body, status, alert);

  let selected: string | null = null;
  let busy = false;
  let focusAfter: string | null = null;
  let refreshGaps: () => void = () => undefined;

  const save = () => {
    if (key) saveActivityState(key, state);
  };
  const say = (text: string) => {
    status.textContent = text;
  };
  const cards = (): DiamondCard[] => base.map((c) =>
    state.wildcard && c.id === state.wildcard.replaces ? { id: WILD_ID, kind: 'text' as const, text: state.wildcard.text } : c);
  const cardMap = (): Map<string, DiamondCard> => new Map(cards().map((c) => [c.id, c]));
  /** Every card, including the one a wildcard replaced, so earlier rounds and the class view can draw it. */
  const allCards = (): Map<string, DiamondCard> => {
    const map = new Map(base.map((c) => [c.id, c]));
    if (state.wildcard) map.set(WILD_ID, { id: WILD_ID, kind: 'text', text: state.wildcard.text });
    return map;
  };
  const letterOf = (id: string) => letters.get(id) ?? '?';
  const editing = (): { name: RoundName; round: Round } | null => {
    if (!state.sent.includes('first')) return { name: 'first', round: state.first };
    if (state.active === 'rerank' && state.rerank) return { name: 'rerank', round: state.rerank };
    if (state.active === 'second' && state.second) return { name: 'second', round: state.second };
    return null;
  };

  const gapsFor = (name: RoundName, round: Round): string[] => {
    const gaps: string[] = [];
    if (lessonId && !state.initials) gaps.push('Type your initials');
    const why = name === 'rerank' ? { moved: movement(state.first.slots, round.slots), why: round.why ?? {} } : undefined;
    return [...gaps, ...roundGaps(round.slots, writtenReasons(round.reasons), why)];
  };

  function payload(): Record<string, unknown> {
    const rounds: Record<string, unknown> = {};
    if (state.sent.includes('first')) rounds.first = roundData(state.first, false);
    if (state.sent.includes('rerank') && state.rerank) rounds.rerank = roundData(state.rerank, true);
    if (state.sent.includes('second') && state.second) rounds.second = roundData(state.second, false);
    const data: Record<string, unknown> = { rounds };
    if (state.wildcard) data.wildcard = { ...state.wildcard };
    return data;
  }

  async function send(name: RoundName, pressed: HTMLButtonElement): Promise<void> {
    if (busy) return;
    const was = [...state.sent];
    if (!state.sent.includes(name)) state.sent.push(name);
    if (!lessonId) {
      state.active = null;
      selected = null;
      save();
      paint();
      say('Saved on this device.');
      return;
    }
    busy = true;
    const label = pressed.textContent;
    pressed.disabled = true;
    pressed.textContent = 'Sending…';
    try {
      const reply = await sendThinking(lessonId, block.id, state.initials, payload());
      if (reply.class?.layouts) state.layouts = reply.class.layouts;
      state.active = null;
      selected = null;
      alert.hidden = true;
      save();
      busy = false;
      paint();
      say(name === 'first' ? 'Sent. The class diamond is open below.' : 'Sent.');
    } catch (error) {
      state.sent = was;
      busy = false;
      alert.textContent = errorText(error);
      alert.hidden = false;
      if (pressed.isConnected) {
        pressed.disabled = false;
        pressed.textContent = label ?? '';
      }
    }
  }

  async function refreshClass(pressed: HTMLButtonElement): Promise<void> {
    if (!lessonId || busy) return;
    busy = true;
    pressed.disabled = true;
    try {
      const reply = await sendThinking(lessonId, block.id, state.initials, payload());
      if (reply.class?.layouts) state.layouts = reply.class.layouts;
      save();
      busy = false;
      paint();
      say('Class diamond updated.');
    } catch (error) {
      busy = false;
      pressed.disabled = false;
      alert.textContent = errorText(error);
      alert.hidden = false;
    }
  }

  /* ── Placing ─────────────────────────────────────────────────────── */

  function place(round: Round, id: string, slot: number): void {
    round.slots = placeCard(round.slots, id, slot);
    selected = null;
    save();
    focusAfter = `slot-${slot}`;
    paint();
    say(`${letterOf(id)} placed in ${rowName(slotRow(slot)).toLowerCase()}.`);
  }

  function toTray(round: Round, id: string): void {
    const at = round.slots.indexOf(id);
    if (at >= 0) round.slots = round.slots.map((s) => (s === id ? null : s));
    selected = null;
    save();
    focusAfter = `card-${id}`;
    paint();
    say(`${letterOf(id)} is back in the tray.`);
  }

  function select(id: string): void {
    selected = selected === id ? null : id;
    focusAfter = `card-${id}`;
    paint();
    say(selected ? `${letterOf(id)} picked. Tap a place in the diamond.` : `${letterOf(id)} put down.`);
  }

  /* ── Dragging: mouse, pen and touch ─────────────────────────────── */

  let drag: { id: string; x: number; y: number; pointer: number; source: HTMLElement; ghost: HTMLElement | null } | null = null;
  let over: Element | null = null;

  const targetAt = (x: number, y: number): HTMLElement | null => {
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
    const target = hit?.closest<HTMLElement>('[data-slot], [data-tray]') ?? null;
    return target && root.contains(target) ? target : null;
  };
  const endDrag = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    drag?.ghost?.remove();
    drag?.source.classList.remove('d9-card--lifted');
    over?.classList.remove('d9-over');
    over = null;
  };
  function onMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const ghost = drag.source.cloneNode(true) as HTMLElement;
      ghost.classList.add('d9-ghost');
      ghost.removeAttribute('id');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${drag.source.getBoundingClientRect().width || 120}px`;
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.source.classList.add('d9-card--lifted');
    }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const target = targetAt(e.clientX, e.clientY);
    if (target !== over) {
      over?.classList.remove('d9-over');
      target?.classList.add('d9-over');
      over = target;
    }
  }
  function onUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointer) return;
    const moved = !!drag.ghost;
    const id = drag.id;
    endDrag();
    drag = null;
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    const now = editing();
    const target = targetAt(e.clientX, e.clientY);
    if (!now || !target) return;
    if (target.dataset.slot !== undefined) place(now.round, id, Number(target.dataset.slot));
    else if (target.dataset.tray !== undefined && now.round.slots.includes(id)) toTray(now.round, id);
  }
  function onCancel(): void {
    endDrag();
    drag = null;
  }
  let suppressClick = false;

  function cardButton(card: DiamondCard, round: Round, slot: number | null): HTMLButtonElement {
    const b = el('button', 'd9-card');
    b.type = 'button';
    b.dataset.card = card.id;
    b.dataset.focus = `card-${card.id}`;
    b.setAttribute('aria-pressed', String(selected === card.id));
    const where = slot === null ? 'in the tray' : `in ${rowName(slotRow(slot)).toLowerCase()}`;
    b.setAttribute('aria-label', `Card ${letterOf(card.id)}, ${where}: ${cardText(card)}`);
    b.append(cardFace(card, letterOf(card.id)));
    b.addEventListener('click', () => {
      if (suppressClick) return;
      if (slot !== null && selected && selected !== card.id) place(round, selected, slot);
      else select(card.id);
    });
    b.addEventListener('pointerdown', (e) => {
      // Touch uses tap-to-place, so the page still scrolls under a finger.
      if (busy || (e.pointerType !== 'mouse' && e.pointerType !== 'pen') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: card.id, x: e.clientX, y: e.clientY, pointer: e.pointerId, source: b, ghost: null };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
    });
    return b;
  }

  /* ── Views ───────────────────────────────────────────────────────── */

  function initialsField(): HTMLElement {
    const wrap = el('div', 'pf-field d9-initials');
    const id = `d9-initials-${block.id}`;
    const lab = el('label', 'pf-field__label', 'Your initials');
    lab.htmlFor = id;
    const box = el('input', 'pf-field__input');
    box.id = id;
    box.maxLength = 4;
    box.autocomplete = 'off';
    box.value = state.initials;
    box.placeholder = 'JT';
    box.addEventListener('input', () => {
      state.initials = keepInitials(box.value);
      save();
      refreshGaps();
    });
    wrap.append(lab, box, el('p', 'pf-field__hint block-secondary', 'Your teacher sees these. The class screen shows no initials.'));
    return wrap;
  }

  function wildcardPanel(): HTMLElement {
    const box = el('div', 'd9-wild');
    if (state.wildcard) {
      const w = state.wildcard;
      box.append(
        el('p', 'block-secondary', `Your own card (${'★'}) is in place of card ${letterOf(w.replaces)}. Rank it like any other.`),
        button('Take my card out', 'ghost', () => {
          const swap = (r: Round | null) => {
            if (r) r.slots = r.slots.map((s) => (s === WILD_ID ? w.replaces : s));
          };
          swap(state.first);
          state.wildcard = null;
          selected = null;
          save();
          paint();
          say(`Card ${letterOf(w.replaces)} is back.`);
        })
      );
      return box;
    }
    const details = el('details', 'd9-wild__fold');
    details.append(el('summary', 'd9-wild__summary', 'Swap in your own card'));
    const form = el('div', 'd9-wild__form');
    const pickId = `d9-wild-pick-${block.id}`;
    const textId = `d9-wild-text-${block.id}`;
    const pickLab = el('label', 'pf-field__label', 'Card to swap out');
    pickLab.htmlFor = pickId;
    const pick = el('select', 'pf-field__input');
    pick.id = pickId;
    for (const c of base) {
      const o = el('option', '', `${letterOf(c.id)}: ${cardText(c).slice(0, 60)}`);
      o.value = c.id;
      pick.append(o);
    }
    const textLab = el('label', 'pf-field__label', 'Your card');
    textLab.htmlFor = textId;
    const text = el('textarea', 'pf-field__input');
    text.id = textId;
    text.rows = 2;
    text.maxLength = MAX_WILD;
    text.placeholder = 'Something you think belongs in the diamond';
    const go = button('Swap it in', 'secondary', () => {
      const words = text.value.trim();
      if (!words) {
        say('Write your card first, then swap it in.');
        text.focus();
        return;
      }
      state.wildcard = { replaces: pick.value, text: words };
      state.first.slots = state.first.slots.map((s) => (s === pick.value ? WILD_ID : s));
      selected = null;
      save();
      paint();
      say(`Your card is in place of card ${letterOf(pick.value)}.`);
    });
    form.append(
      el('p', 'block-secondary', 'Write a card of your own and choose one to take out. Your card goes in its place.'),
      pickLab, pick, textLab, text, go
    );
    details.append(form);
    box.append(details);
    return box;
  }

  function reasonBox(round: Round, id: string, end: 'top' | 'bottom'): HTMLElement {
    const wrap = el('div', 'pf-field d9-reason');
    const fieldId = `d9-reason-${block.id}-${end}`;
    const lab = el('label', 'pf-field__label', `Why is ${letterOf(id)} at the ${end}?`);
    lab.htmlFor = fieldId;
    const box = el('textarea', 'pf-field__input');
    box.id = fieldId;
    box.rows = 3;
    box.maxLength = MAX_REASON;
    box.value = round.reasons[id] ?? '';
    box.dataset.focus = `reason-${end}`;
    box.addEventListener('input', () => {
      round.reasons[id] = box.value;
      save();
      refreshGaps();
    });
    const card = cardMap().get(id);
    wrap.append(lab);
    if (card) wrap.append(cardChip(card, letterOf(id)));
    wrap.append(box);
    return wrap;
  }

  function whyBox(round: Round, id: string, d: number): HTMLElement {
    const wrap = el('div', 'pf-field d9-reason d9-reason--why');
    const fieldId = `d9-why-${block.id}-${id}`;
    const lab = el('label', 'pf-field__label', `What changed your mind about ${letterOf(id)}? It moved ${rowsPhrase(d)}.`);
    lab.htmlFor = fieldId;
    const box = el('textarea', 'pf-field__input');
    box.id = fieldId;
    box.rows = 2;
    box.maxLength = MAX_REASON;
    round.why ??= {};
    box.value = round.why[id] ?? '';
    box.addEventListener('input', () => {
      round.why![id] = box.value;
      save();
      refreshGaps();
    });
    wrap.append(lab, box);
    return wrap;
  }

  function editor(name: RoundName, round: Round): HTMLElement {
    const sec = el('section', `d9-round d9-round--${name}`);
    if (name === 'rerank') {
      sec.append(
        el('h4', 'd9-round__title block-subtitle', 'Rank again after the discussion'),
        el('p', 'block-secondary', 'Move any card. Each card shows how far it has moved since your first diamond.')
      );
    } else if (name === 'second') {
      const title = el('h4', 'd9-round__title block-subtitle', 'Rank by: ');
      title.append(el('strong', '', second));
      sec.append(title, el('p', 'block-secondary', 'Your first diamond is here to start from. Move the cards to fit this criterion.'));
    }
    if (lessonId) sec.append(initialsField());
    if (name === 'first' && block.content.wildcard) sec.append(wildcardPanel());

    const all = cards();
    const moved = name === 'rerank' ? movement(state.first.slots, round.slots) : name === 'second' ? movement(state.first.slots, round.slots) : {};

    // Tray
    const tray = el('div', 'd9-tray');
    tray.dataset.tray = '';
    tray.setAttribute('role', 'group');
    tray.setAttribute('aria-label', 'Cards to place');
    const waiting = all.filter((c) => !round.slots.includes(c.id));
    for (const c of waiting) tray.append(cardButton(c, round, null));
    if (!waiting.length) tray.append(el('p', 'd9-tray__done block-secondary', 'Every card is on the diamond. Tap two cards to swap them.'));
    const trayHead = el('div', 'd9-tray__head');
    trayHead.append(el('p', 'pf-field__label', `Cards (${waiting.length} to place)`));
    if (selected && round.slots.includes(selected)) {
      const pickedId = selected;
      const back = button('Back to the tray', 'ghost', () => toTray(round, pickedId));
      back.dataset.focus = 'back';
      trayHead.append(back);
    }
    sec.append(trayHead, tray);

    // Diamond
    const byId = cardMap();
    const diamond = diamondGrid(labels, (slot, row) => {
      const box = el('div', 'd9-slot');
      box.dataset.slot = String(slot);
      const id = round.slots[slot] ?? null;
      const card = id ? byId.get(id) : undefined;
      if (id && card) {
        const b = cardButton(card, round, slot);
        b.dataset.focus = `slot-${slot}`;
        const badge = name !== 'first' ? moveBadge(moved[id]) : null;
        if (badge) {
          const tag = el('span', `d9-move d9-move--${badge.kind}`, badge.text);
          tag.setAttribute('aria-hidden', 'true');
          b.append(tag);
          b.setAttribute('aria-label', `${b.getAttribute('aria-label')}, ${badge.label}`);
        }
        box.append(b);
      } else {
        box.classList.add('d9-slot--empty');
        const empty = el('button', 'd9-slot__empty');
        empty.type = 'button';
        empty.dataset.focus = `slot-${slot}`;
        empty.setAttribute('aria-label', `${rowName(row)}, empty${selected ? `: place ${letterOf(selected)} here` : ''}`);
        empty.append(el('span', 'd9-slot__hint', selected ? 'Place here' : ''));
        empty.addEventListener('click', () => {
          if (suppressClick) return;
          if (selected) place(round, selected, slot);
          else say('Pick a card first, then tap a place in the diamond.');
        });
        box.append(empty);
      }
      return box;
    }, name === 'second' ? `Diamond ranked by ${second}` : 'Your diamond');
    sec.append(diamond);

    // Reasons for the two ends
    const { top, bottom } = endCards(round.slots);
    if (top || bottom) {
      const reasons = el('div', 'd9-reasons');
      if (block.content.frame) {
        const sw = el('label', 'pf-switch');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = state.frame;
        box.addEventListener('change', () => {
          state.frame = box.checked;
          for (const [id, end] of [[top, 'top'], [bottom, 'bottom']] as const) {
            if (!id) continue;
            const now = round.reasons[id] ?? '';
            if (state.frame && !now.trim()) round.reasons[id] = frameText(end);
            if (!state.frame && now.trim() === frameText(end)) round.reasons[id] = '';
          }
          save();
          focusAfter = 'frame';
          paint();
        });
        box.dataset.focus = 'frame';
        sw.append(box, el('span', '', 'Use Because, but, so'));
        reasons.append(sw);
      }
      if (top) reasons.append(reasonBox(round, top, 'top'));
      if (bottom) reasons.append(reasonBox(round, bottom, 'bottom'));
      sec.append(reasons);
    }

    // What changed your mind
    if (name === 'rerank') {
      const big = needsWhy(moved);
      if (big.length) {
        const whys = el('div', 'd9-reasons');
        for (const id of big) whys.append(whyBox(round, id, moved[id]!));
        sec.append(whys);
      }
    }

    // Checklist and send
    const foot = el('div', 'd9-send');
    const list = el('ul', 'd9-checklist');
    list.setAttribute('aria-label', 'Still to do');
    const ready = el('p', 'd9-ready block-secondary', 'Ready to send.');
    const sendLabel = !lessonId ? 'Finish my diamond' : name === 'first' ? 'Send my diamond' : name === 'rerank' ? 'Send my new diamond' : 'Send this diamond';
    const go = button(sendLabel, 'primary', function () {
      if (gapsFor(name, round).length) return;
      void send(name, this);
    });
    go.classList.add('d9-send__button');
    refreshGaps = () => {
      const gaps = gapsFor(name, round);
      list.replaceChildren(...gaps.map((g) => el('li', '', g)));
      list.hidden = !gaps.length;
      ready.hidden = !!gaps.length;
      go.disabled = !!gaps.length || busy;
    };
    refreshGaps();
    const actions = el('div', 'pf-actions');
    actions.append(go);
    if (name !== 'first') {
      actions.append(button('Not now', 'ghost', () => {
        state.active = null;
        selected = null;
        save();
        paint();
      }));
    }
    foot.append(list, ready, actions);
    sec.append(foot);
    return sec;
  }

  function lockedRound(name: RoundName, round: Round): HTMLElement {
    const sec = el('section', `d9-round d9-round--locked d9-round--${name}`);
    const title = name === 'first' ? 'Your diamond' : name === 'rerank' ? 'After the discussion' : `Rank by: ${second}`;
    sec.append(el('h4', 'd9-round__title block-subtitle', title));
    const moved = name === 'first' ? {} : movement(state.first.slots, round.slots);
    sec.append(readOnlyDiamond(round.slots, allCards(), letters, labels, {
      name: title,
      badge: name === 'first' ? undefined : (id) => moveBadge(moved[id])
    }));
    const reasons = writtenReasons(round.reasons);
    const { top, bottom } = endCards(round.slots);
    const list = el('dl', 'd9-said');
    for (const [id, end] of [[top, 'Top'], [bottom, 'Bottom']] as const) {
      if (!id || !reasons[id]) continue;
      list.append(el('dt', '', `${end}: ${letterOf(id)}`), el('dd', '', reasons[id]!));
    }
    if (list.childElementCount) sec.append(list);
    if (name === 'rerank') sec.append(movementSummary(moved, round.why ?? {}));
    if (name === 'second') sec.append(comparisonNote(moved));
    return sec;
  }

  function movementSummary(moved: Record<string, number>, why: Record<string, string>): HTMLElement {
    const box = el('div', 'd9-summary');
    box.append(el('p', 'pf-field__label', 'Your movement'));
    const changes = Object.entries(moved).filter(([, d]) => d !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!changes.length) {
      box.append(el('p', 'block-secondary', 'Your diamond stayed the same. The discussion confirmed your ranking.'));
      return box;
    }
    const list = el('ul', 'd9-summary__list');
    for (const [id, d] of changes) {
      const item = el('li', '', `${letterOf(id)} moved ${rowsPhrase(d)}`);
      if (why[id]?.trim()) item.append(el('span', 'block-secondary', `: ${why[id]!.trim()}`));
      list.append(item);
    }
    box.append(list);
    return box;
  }

  function comparisonNote(moved: Record<string, number>): HTMLElement {
    const changes = Object.entries(moved).filter(([, d]) => d !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const text = changes.length
      ? `Your ranking changed when the criterion changed: ${changes.map(([id, d]) => `${letterOf(id)} ${rowsPhrase(d)}`).join(', ')}.`
      : 'Your ranking stayed the same under both criteria. Which card would you argue about first?';
    return el('p', 'd9-summary d9-compare', text);
  }

  function classView(): HTMLElement {
    const sec = el('section', 'd9-class');
    const layouts = state.layouts ?? [];
    const head = el('div', 'd9-class__head');
    head.append(el('h4', 'd9-round__title block-subtitle', 'Class diamond'));
    const refresh = button('See the latest', 'ghost', function () {
      void refreshClass(this);
    });
    head.append(refresh);
    sec.append(head, el('p', 'block-secondary', `${layouts.length} diamond${layouts.length === 1 ? '' : 's'} in, yours included. Each card sits at the class's average row.`));
    const ids = base.map((c) => c.id);
    const stats = consensus(layouts, ids);
    sec.append(readOnlyDiamond(consensusSlots(stats), allCards(), letters, labels, { name: 'Class diamond' }));
    sec.append(el('h4', 'd9-round__title block-subtitle', 'Where the class disagrees most'));
    const hot = contested(stats);
    if (!hot.length) {
      sec.append(el('p', 'block-secondary', 'This fills in once three or more diamonds place a card in different rows.'));
      return sec;
    }
    const list = el('ul', 'd9-contested');
    const map = allCards();
    for (const s of hot) {
      const card = map.get(s.id);
      if (!card) continue;
      const item = el('li', 'd9-contested__item');
      item.append(cardChip(card, letterOf(s.id)), dotStrip(s.rows));
      list.append(item);
    }
    sec.append(list);
    return sec;
  }

  function startRound(name: 'rerank' | 'second'): void {
    if (name === 'rerank') {
      state.rerank ??= { slots: [...state.first.slots], reasons: { ...state.first.reasons }, why: {} };
    } else {
      state.second ??= { slots: [...state.first.slots], reasons: {} };
    }
    state.active = name;
    selected = null;
    save();
    focusAfter = `round-${name}`;
    paint();
    say(name === 'rerank' ? 'Your first diamond is ready to change.' : `Rank by: ${second}.`);
  }

  function paint(): void {
    const keep = focusAfter ?? (document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement.dataset.focus ?? null : null);
    focusAfter = null;
    refreshGaps = () => undefined;
    body.replaceChildren();
    const now = editing();
    if (!state.sent.includes('first')) {
      if (now) body.append(editor(now.name, now.round));
      if (lessonId) body.append(el('p', 'd9-wait pf-panel pf-panel--quiet block-secondary', 'The class diamond opens here once you send yours.'));
    } else {
      body.append(lockedRound('first', state.first));
      body.append(lessonId ? classView() : el('p', 'block-secondary', 'Saved on this device.'));
      if (state.sent.includes('rerank') && state.rerank) body.append(lockedRound('rerank', state.rerank));
      if (state.sent.includes('second') && state.second) body.append(lockedRound('second', state.second));
      if (now) {
        const sec = editor(now.name, now.round);
        sec.dataset.focus = `round-${now.name}`;
        sec.tabIndex = -1;
        body.append(sec);
      } else {
        const next = el('div', 'd9-next pf-actions');
        const rerankOpen = block.content.rerank && !state.sent.includes('rerank');
        if (rerankOpen) next.append(button('Rank again after the discussion', 'secondary', () => startRound('rerank')));
        if (second && !state.sent.includes('second')) next.append(button(`Rank by: ${second}`, rerankOpen ? 'ghost' : 'secondary', () => startRound('second')));
        if (next.childElementCount) body.append(next);
      }
    }

    if (keep) [...body.querySelectorAll<HTMLElement>('[data-focus]')].find((n) => n.dataset.focus === keep)?.focus();
  }

  paint();
  return root;
}

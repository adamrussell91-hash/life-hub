import { apiPost } from '@/api/client';
import type { DiscernQualifier } from '@/schemas/discern';
import { pulseDeviceId } from '@/student/block-pulse';
import {
  DISCERN_INITIAL_MAX, DISCERN_LABEL_MAX, DISCERN_STEP_NAMES, characterMoments, discernOptions, discernStateKey,
  discernSteps, emptyDiscernState, loadDiscernState, saveDiscernState, stepsComplete, type DiscernState
} from './discern';
import { renderTailGraph } from './discern-graph';
import { mountDiscernSpread } from './discern-spread';

type ViewOptions = { mode: 'student' | 'teacher' | 'print'; blockId: string; lessonId?: string };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Wavy line: the Discern mark on chips and the Confirm badge. */
export function discernSymbol(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('discern-symbol');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 18c3 0 3-9 6-9s3 6 6 6 3-9 6-9');
  svg.append(path);
  return svg;
}

/** Five tap targets from uneasy to settled. */
export function settledScale(legend: string, value: number, onPick: (n: number) => void): HTMLFieldSetElement {
  const set = el('fieldset', 'discern-scale');
  set.append(el('legend', undefined, legend));
  const row = el('div', 'discern-scale__row');
  const dots = el('div', 'discern-scale__dots');
  for (let n = 1; n <= 5; n++) {
    const dot = button('', 'discern-scale__dot', () => {
      dots.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === dot)));
      onPick(n);
    });
    dot.setAttribute('aria-label', `${n} of 5${n === 1 ? ', uneasy' : n === 5 ? ', settled' : ''}`);
    dot.setAttribute('aria-pressed', String(value === n));
    dots.append(dot);
  }
  row.append(el('span', 'discern-scale__end', 'uneasy'), dots, el('span', 'discern-scale__end', 'settled'));
  set.append(row);
  return set;
}

/** Short note that becomes a dot's label. */
export function jotField(label: string, value: string, onInput: (v: string) => void): HTMLLabelElement {
  const field = el('label', 'discern-field');
  field.append(document.createTextNode(label), el('small', undefined, 'This becomes the label on your dot.'));
  const input = el('input');
  input.type = 'text';
  input.maxLength = DISCERN_LABEL_MAX;
  input.placeholder = 'In a few words';
  input.value = value;
  const count = el('span', 'discern-count', `${value.length}/${DISCERN_LABEL_MAX}`);
  input.addEventListener('input', () => { count.textContent = `${input.value.length}/${DISCERN_LABEL_MAX}`; onInput(input.value); });
  field.append(input, count);
  return field;
}

export function sendDiscernTail(lessonId: string, blockId: string, q: DiscernQualifier, state: DiscernState): void {
  const moments = characterMoments(q);
  void apiPost(`/api/published/discern/${encodeURIComponent(lessonId)}`, {
    block_id: blockId,
    device_id: pulseDeviceId(),
    initial: state.position.trim(),
    dots: state.dots,
    labels: state.notes.map((n) => n.trim()),
    ...(moments.length && state.character.drawn
      ? { character: { dots: state.character.dots.slice(0, moments.length), labels: state.character.notes.slice(0, moments.length).map((n) => n.trim()) } }
      : {})
  }).catch(() => { /* the graph in their book is the record; the spread is a bonus */ });
}

export function renderDiscern(q: DiscernQualifier, options: ViewOptions): HTMLElement {
  const root = el('div', 'discern');
  const steps = discernSteps(q);

  if (options.mode === 'print') {
    root.classList.add('discern--print');
    const title = el('h3', 'discern__title');
    title.append(discernSymbol(), document.createTextNode('Discern'));
    const list = el('ol');
    steps.slice(0, 4).forEach((step) => {
      const li = el('li');
      li.append(el('strong', undefined, `${step.title}. `), document.createTextNode(step.prompt));
      list.append(li);
    });
    root.append(title, list);
    return root;
  }

  const strip = el('div', 'discern__strip');
  const workspace = el('section', 'discern__workspace');
  workspace.hidden = true;
  const spread = el('section', 'discern__spread');
  spread.hidden = true;
  const live = options.mode === 'student' && !!options.lessonId;
  const key = live ? discernStateKey(options.lessonId!, options.blockId) : undefined;
  let state = key ? loadDiscernState(key) : emptyDiscernState();
  const persist = () => saveDiscernState(key, state);
  const send = () => { if (live) sendDiscernTail(options.lessonId!, options.blockId, q, state); };

  const chip = (text: string, panel: HTMLElement, onOpen: () => void): HTMLButtonElement => {
    const b = button(text, 'discern-chip', () => {
      const open = panel.hidden;
      for (const p of [workspace, spread]) p.hidden = true;
      strip.querySelectorAll('button').forEach((c) => c.setAttribute('aria-expanded', 'false'));
      panel.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      if (open) onOpen();
    });
    b.prepend(discernSymbol());
    b.setAttribute('aria-expanded', 'false');
    return b;
  };
  strip.append(chip(options.mode === 'teacher' ? 'Discern · preview' : 'Discern · 4 steps', workspace, () => draw()));
  if (options.mode === 'teacher' && options.lessonId) {
    strip.append(chip('Class spread', spread, () => mountDiscernSpread(spread, { lessonId: options.lessonId!, blockId: options.blockId, discern: q })));
  }

  function draw(focus = false): void {
    workspace.replaceChildren();
    const title = el('p', 'discern__title', q.mode === 'own'
      ? 'Discern: test your initial answer before you write it'
      : `Discern: test ${q.who.trim() ? `${q.who.trim()}’s` : 'their'} choice before you judge it`);
    workspace.append(title);
    if (options.mode === 'teacher') workspace.append(el('p', 'discern-caption', 'Student preview · nothing is saved or sent.'));
    if (state.drawn) drawTail();
    else drawStep(focus);
  }

  function drawStep(focus: boolean): void {
    const i = state.step;
    const step = steps[i]!;
    const nav = el('nav', 'discern-progress');
    nav.setAttribute('aria-label', 'Discern steps');
    steps.slice(0, 4).forEach((s, n) => {
      const tab = button(`${n + 1}. ${s.name}`, 'discern-progress__step', () => { state.step = n; persist(); draw(true); });
      if (n === i) tab.setAttribute('aria-current', 'step');
      if (state.dots[n] && state.notes[n]?.trim()) tab.classList.add('is-done');
      nav.append(tab);
    });
    const heading = el('h4', 'discern-step__title', step.title);
    heading.tabIndex = -1;
    workspace.append(nav, heading, el('p', 'discern-step__prompt', step.prompt));

    const next = button(i < 3 ? 'Next' : 'Draw my tail', 'btn btn--secondary', () => {
      if (i < 3) { state.step++; persist(); draw(true); return; }
      state.drawn = true;
      persist();
      send();
      draw();
    });
    const ready = () => { next.disabled = !(state.dots[i] && state.notes[i]!.trim() && (i > 0 || state.position.trim())); };

    if (i === 0) {
      const options = discernOptions(q);
      if (options.length) {
        const group = el('div', 'discern-positions');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', q.mode === 'own' ? 'Your initial answer' : 'Your initial verdict');
        for (const option of options) {
          const pick = button(option, 'discern-position', () => {
            state.position = option;
            group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === pick)));
            persist(); ready();
          });
          pick.setAttribute('aria-pressed', String(state.position === option));
          group.append(pick);
        }
        workspace.append(group);
      } else {
        const field = el('label', 'discern-field', q.mode === 'own' ? 'Your initial answer' : 'Your initial verdict');
        const input = el('input');
        input.type = 'text';
        input.maxLength = DISCERN_INITIAL_MAX;
        input.placeholder = 'In a few words';
        input.value = state.position;
        input.addEventListener('input', () => { state.position = input.value; persist(); ready(); });
        field.append(input);
        workspace.append(field);
      }
    }
    if (i === 3) {
      const pair = el('div', 'discern-pair');
      for (const [name, note] of [['Against', state.notes[1]], ['For', state.notes[2]]] as const) {
        const card = el('div', 'discern-pair__card');
        card.append(el('span', undefined, name), document.createTextNode(`“${note ?? ''}”`));
        pair.append(card);
      }
      workspace.append(pair);
    }
    workspace.append(
      jotField(step.jot, state.notes[i]!, (v) => { state.notes[i] = v; persist(); ready(); }),
      settledScale(`How settled are you in your ${q.mode === 'own' ? 'answer' : 'verdict'} right now?`, state.dots[i]!, (n) => { state.dots[i] = n; persist(); ready(); })
    );
    const actions = el('div', 'discern-actions');
    if (i > 0) actions.append(button('Back', 'btn btn--ghost', () => { state.step--; persist(); draw(true); }));
    actions.append(next);
    workspace.append(actions);
    ready();
    if (focus) heading.focus();
  }

  function drawTail(): void {
    const head = el('div', 'discern-tail-head');
    head.append(el('h4', undefined, 'Your tail so far'), el('span', 'discern-book', 'Copy this into your book'));
    workspace.append(head, renderTailGraph({
      columns: DISCERN_STEP_NAMES, values: state.dots.slice(0, 4).concat(state.dots[4] ? [state.dots[4]] : []),
      labels: state.notes, ghostLast: state.dots[4] ? undefined : 'at the end of the lesson'
    }));
    workspace.append(el('p', 'discern-caption', state.dots[4]
      ? 'Your tail is finished. The Confirm card shows how to read it.'
      : 'Now write your answer. The last dot comes from the Confirm card later in the lesson.'));
    const actions = el('div', 'discern-actions');
    actions.append(button('Change a step', 'btn btn--ghost', () => { state.drawn = false; state.step = 0; persist(); draw(true); }));
    workspace.append(actions);
    const moments = characterMoments(q);
    if (moments.length) workspace.append(characterSection(moments));
  }

  function characterSection(moments: string[]): HTMLElement {
    const who = q.who.trim() || 'they';
    const section = el('section', 'discern-character');
    section.append(el('h4', undefined, `${who}’s own tail`));
    const c = state.character;
    while (c.notes.length < moments.length) c.notes.push('');
    while (c.dots.length < moments.length) c.dots.push(0);
    if (c.drawn) {
      const head = el('div', 'discern-tail-head');
      head.append(el('span', 'discern-caption', `How settled ${who} is at each moment`), el('span', 'discern-book', 'Copy this into your book'));
      section.append(head, renderTailGraph({ columns: moments, values: c.dots.slice(0, moments.length), labels: c.notes }));
      section.append(button('Change these dots', 'btn btn--ghost', () => { c.drawn = false; persist(); draw(); }));
      return section;
    }
    section.append(el('p', 'discern-step__prompt', `At each moment, how settled is ${who} in their choice? Add a few words of evidence for each dot.`));
    const done = button(`Draw ${who}’s tail`, 'btn btn--secondary', () => { c.drawn = true; persist(); send(); draw(); });
    const ready = () => { done.disabled = !moments.every((_, m) => c.dots[m] && c.notes[m]!.trim()); };
    moments.forEach((moment, m) => {
      const box = el('div', 'discern-moment');
      box.append(el('p', 'discern-moment__name', moment));
      box.append(
        jotField('Evidence', c.notes[m]!, (v) => { c.notes[m] = v; persist(); ready(); }),
        settledScale(`How settled is ${who} here?`, c.dots[m]!, (n) => { c.dots[m] = n; persist(); ready(); })
      );
      section.append(box);
    });
    section.append(done);
    ready();
    return section;
  }

  // Keep the host in step when the Confirm card finishes the tail.
  if (key) {
    document.addEventListener('discern-state', function sync(event) {
      if (!root.isConnected && root.dataset.mounted) { document.removeEventListener('discern-state', sync); return; }
      if ((event as CustomEvent<{ key: string }>).detail.key !== key) return;
      const fresh = loadDiscernState(key);
      if (fresh.dots[4] === state.dots[4]) return;
      state = fresh;
      if (!workspace.hidden) draw();
    });
  }

  root.append(strip, workspace, spread);
  queueMicrotask(() => { if (root.isConnected) root.dataset.mounted = 'true'; });
  // Qualifier interactions must not select or rebuild a canvas row underneath it.
  root.addEventListener('click', (event) => event.stopPropagation());
  return root;
}

export function discernStepsComplete(state: DiscernState): boolean {
  return state.drawn && stepsComplete(state, 4);
}

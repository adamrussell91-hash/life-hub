import { button, el } from '@/quiz/dom';
import { understandProblems } from './checks';
import { briefText } from './model';
import { coach, draftOf, frameField, submitBar, type FormContext, type PhaseForm } from './form-kit';
import { LIMIT_CELLS, UNDERSTAND_GUIDE } from './guidance';
import { LIMIT_BOXES, UNDERSTAND_ALONE, defaultUnderstand, type LimitBox, type PhasePayload, type UnderstandStep } from './schema';
import type { SprintStatus, UnderstandGroup } from './api';

const STEP_TITLES: Record<UnderstandStep, string> = {
  spot: 'Spot: what stands out in the brief?',
  audience: 'Audience: who is this for?',
  dig: 'Dig: what is the real problem?',
  say: 'Say it: the problem in your own words',
  limits: 'Limits: what can you control, and what do you know?',
  vote: 'Vote: which problem should your group take on?',
  merge: 'Together: one audience',
  grid: 'Together: our limits',
  ask: 'Ask: what does the expert need to answer?',
  expert: 'Expert: what we found out'
};
const MAX_DIG = 6;
const MAX_CARDS = 8;
const cleanWord = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * Understand: each student works out the problem alone (Spot, Audience, Dig,
 * Say it, Limits), then the group brings it together in its shared space
 * (Vote, one audience, our limits, questions for the expert, the answers).
 * The Kit picks the steps and whether they show as slides or down the page.
 */
export function mountUnderstand(ctx: FormContext): PhaseForm {
  const settings = ctx.sprint.understand ?? defaultUnderstand();
  const steps = settings.steps;
  const order = (Object.keys(STEP_TITLES) as UnderstandStep[]).filter((k) => steps[k]);
  const alone = (k: UnderstandStep) => (UNDERSTAND_ALONE as readonly string[]).includes(k);
  const mine = draftOf(ctx, 'understand');
  const state: PhasePayload['understand'] = {
    notes: [...(mine?.notes ?? [])],
    star: mine?.star ?? '',
    stretch: mine?.stretch ?? '',
    spot: [...(mine?.spot ?? [])],
    audience: { who: mine?.audience?.who ?? '', why: mine?.audience?.why ?? '' },
    dig: [...(mine?.dig ?? [])],
    say: mine?.say ?? '',
    limits: Object.fromEntries(LIMIT_BOXES.map((b) => [b, [...(mine?.limits?.[b] ?? [])]])) as PhasePayload['understand']['limits']
  };
  while (state.dig.length < 2) state.dig.push('');
  let status = ctx.status;
  const off = !ctx.editable;

  const root = el('div', 'sprint-understand');
  root.append(el('h2', '', 'Understand the problem'));
  if (ctx.sprint.phases[0]!.instruction) root.append(el('p', '', ctx.sprint.phases[0]!.instruction));
  const bar = submitBar(ctx, 'understand', () => state, () => understandProblems(state, steps, (status.notes ?? []).length));
  const changed = () => { bar.changed(); if (slides) paintRail(); };
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  /** A shared-space write: shows the new state, or says why it didn't work. */
  const write = (p: Promise<SprintStatus>) => p.then((next) => { err.textContent = ''; status = next; paintShared(); }).catch((e: unknown) => { err.textContent = e instanceof Error ? e.message : 'That didn’t work. Try again.'; });

  const section = (k: UnderstandStep, n: number) => {
    const box = el('section', `su-step su-step--${alone(k) ? 'alone' : 'group'}`);
    box.dataset.step = k;
    const head = el('div', 'su-step__head');
    head.append(el('span', 'su-step__num', String(n)), el('h3', '', STEP_TITLES[k]), el('span', 'su-step__icon', UNDERSTAND_GUIDE[k].icon));
    head.lastElementChild!.setAttribute('aria-hidden', 'true');
    box.append(head, coach(UNDERSTAND_GUIDE[k]));
    return box;
  };

  // ---------------------------------------------------------------- alone

  function spot(box: HTMLElement): void {
    const text = briefText(ctx.blocks);
    if (!text) { box.append(el('p', 'sprint-note', 'Your teacher hasn’t written the brief yet.')); return; }
    box.append(el('p', 'sprint-note', 'Tap a word to mark it. Tap again to undo.'));
    const words = el('div', 'su-words');
    const picked = el('p', 'sprint-note');
    const paintPicked = () => { picked.textContent = state.spot.length ? `You picked: ${state.spot.join(', ')}` : 'No words picked yet.'; };
    for (const raw of text.split(' ')) {
      const word = cleanWord(raw);
      if (!word) { words.append(document.createTextNode(`${raw} `)); continue; }
      const b = el('button', 'su-word', raw);
      b.type = 'button';
      b.disabled = off;
      b.setAttribute('aria-pressed', String(state.spot.includes(word)));
      b.addEventListener('click', () => {
        const on = state.spot.includes(word);
        if (!on && state.spot.length >= 30) return;
        state.spot = on ? state.spot.filter((w) => w !== word) : [...state.spot, word];
        words.querySelectorAll<HTMLButtonElement>('.su-word').forEach((x) => { if (cleanWord(x.textContent ?? '') === word) x.setAttribute('aria-pressed', String(!on)); });
        paintPicked();
        changed();
      });
      words.append(b, document.createTextNode(' '));
    }
    paintPicked();
    box.append(words, picked);
  }

  function audience(box: HTMLElement): void {
    const who = el('input', 'qz-input');
    who.maxLength = 200;
    who.value = state.audience.who;
    who.disabled = off;
    who.id = 'su-who';
    who.addEventListener('input', () => { state.audience.who = who.value; changed(); });
    const whoLabel = el('label', 'sprint-field__label', 'Who is it for?');
    whoLabel.htmlFor = who.id;
    box.append(whoLabel, who, frameField({ label: 'Why does it matter to them?', value: state.audience.why, max: 300, rows: 2, support: ctx.support, disabled: off, onInput: (v) => { state.audience.why = v; changed(); } }));
  }

  function dig(box: HTMLElement): void {
        const list = el('div', 'su-dig');
    const paint = () => {
      list.replaceChildren();
      state.dig.forEach((v, i) => {
        list.append(frameField({ label: i === 0 ? 'What is the problem on the surface?' : `Why ${i}: why is that a problem?`, value: v, max: 300, rows: 2, support: ctx.support, disabled: off, onInput: (x) => { state.dig[i] = x; changed(); } }));
      });
      if (!off && state.dig.length < MAX_DIG) list.append(button('Ask why again', 'secondary', () => { state.dig.push(''); paint(); changed(); }));
    };
    paint();
    box.append(list);
  }

  function say(box: HTMLElement): void {
    box.append(frameField({ label: 'The problem, in 1–2 sentences', value: state.say, max: 400, starter: '[Who] needs ___ because ___.', support: ctx.support, disabled: off, onInput: (v) => { state.say = v; changed(); } }));
    if (steps.vote) box.append(el('p', 'sprint-note', 'It goes up to your group’s space without your name.'));
  }

  /** The 2 × 2 sorter: columns say whether we can control it, rows whether we know it. */
  function matrix(fill: (b: LimitBox, cell: HTMLElement) => void): HTMLElement {
    const wrap = el('div', 'su-matrix');
    wrap.append(
      el('span', 'su-axis su-axis--corner', ''),
      el('span', 'su-axis su-axis--col', '✅ We can control it'),
      el('span', 'su-axis su-axis--col', '🚫 We can’t control it')
    );
    const rows: ReadonlyArray<readonly [LimitBox, LimitBox]> = [['can_known', 'cant_known'], ['can_unknown', 'cant_unknown']];
    rows.forEach((pair, r) => {
      wrap.append(el('span', 'su-axis su-axis--row', r === 0 ? '📘 We know it' : '❔ We don’t know yet'));
      for (const b of pair) {
        const meta = LIMIT_CELLS[b];
        const cell = el('div', `su-box su-box--${b}${b.endsWith('unknown') ? ' su-box--unknown' : ''}`);
        const head = el('div', 'su-box__head');
        head.append(el('span', 'su-box__icon', meta.icon), el('h4', '', meta.title));
        head.firstElementChild!.setAttribute('aria-hidden', 'true');
        cell.append(head, el('p', 'su-box__ask', meta.ask));
        fill(b, cell);
        wrap.append(cell);
      }
    });
    return wrap;
  }

  function limits(box: HTMLElement): void {
    if (steps.ask) box.append(el('p', 'sprint-note', 'The unknowns become questions for the expert.'));
    box.append(matrix((b, cell) => {
      const cards = el('ul', 'su-cards');
      const paint = () => {
        const items = state.limits[b].map((t, i) => {
          const li = el('li', 'su-card');
          li.append(el('span', '', t));
          if (!off) {
            const x = button('✕', 'ghost', () => { state.limits[b].splice(i, 1); paint(); changed(); });
            x.setAttribute('aria-label', `Remove "${t}"`);
            x.classList.add('su-card__x');
            li.append(x);
          }
          return li;
        });
        if (!items.length) items.push(el('li', 'su-card su-card--ghost', LIMIT_CELLS[b].example));
        cards.replaceChildren(...items);
      };
      paint();
      cell.append(cards);
      if (!off) {
        const add = el('form', 'su-add');
        const input = el('input', 'qz-input');
        input.maxLength = 120;
        input.placeholder = 'Type a card, press Enter';
        input.setAttribute('aria-label', `Add a card: ${LIMIT_CELLS[b].title}`);
        const go = el('button', 'btn btn--secondary', 'Add');
        go.type = 'submit';
        add.addEventListener('submit', (e) => {
          e.preventDefault();
          const t = input.value.trim();
          if (!t || state.limits[b].length >= MAX_CARDS) return;
          state.limits[b].push(t);
          input.value = '';
          paint();
          changed();
        });
        add.append(input, go);
        cell.append(add);
      }
    }));
  }

  // ---------------------------------------------------------------- the group's shared space

  const shared: Partial<Record<UnderstandStep, HTMLElement>> = {};
  // The agreed audience being edited: polling never overwrites it mid-edit.
  let mergeDraft: { who: string; why: string } | null = null;
  let questionDraft = '';
  const group = (): UnderstandGroup => status.understand_group ?? { who: [], why: [], audience: null, limits: { can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] }, questions: [], sent: [] };
  const counted = (t: string, n: number) => (n > 1 ? `${t} ×${n}` : t);

  function vote(box: HTMLElement): void {
    const notes = status.notes ?? [];
    box.append(el('p', 'sprint-note', 'Everyone’s statements, without names.'));
    if (!notes.length) { box.append(el('p', 'sprint-note', 'Statements show here as your group writes them.')); return; }
    if (state.star && !notes.some((n) => n.id === state.star)) state.star = '';
    for (const n of notes) {
      const b = el('button', 'sprint-chip sprint-star su-statement', `${state.star === n.id ? '★' : '☆'} ${n.text}${n.mine ? ' (yours)' : ''}`);
      b.type = 'button';
      b.disabled = off;
      b.setAttribute('aria-pressed', String(state.star === n.id));
      b.addEventListener('click', () => { state.star = n.id; paintShared(); changed(); });
      box.append(b);
    }
  }

  function merge(box: HTMLElement): void {
    const g = group();
    box.append(el('p', 'sprint-note', 'Repeats are stacked, like “×3”.'));
    const field = (label: string, key: 'who' | 'why', options: UnderstandGroup['who']) => {
      const chips = el('div', 'su-chips');
      const input = el('input', 'qz-input');
      input.maxLength = key === 'who' ? 200 : 300;
      input.disabled = off;
      input.value = mergeDraft?.[key] ?? g.audience?.[key] ?? '';
      input.setAttribute('aria-label', label);
      input.addEventListener('input', () => { mergeDraft = { who: mergeDraft?.who ?? g.audience?.who ?? '', why: mergeDraft?.why ?? g.audience?.why ?? '', [key]: input.value }; });
      for (const o of options) {
        const c = button(counted(o.text, o.count), 'ghost', () => { input.value = o.text; input.dispatchEvent(new Event('input')); });
        c.className = 'sprint-chip';
        c.disabled = off;
        chips.append(c);
      }
      box.append(el('span', 'sprint-field__label', label), chips, input);
    };
    field('Our audience', 'who', g.who);
    field('Why it matters to them', 'why', g.why);
    const save = button(g.audience ? 'Update' : 'Save for the group', 'primary', () => {
      const d = mergeDraft ?? { who: g.audience?.who ?? '', why: g.audience?.why ?? '' };
      void write(ctx.client.audience(d.who, d.why)).then(() => { mergeDraft = null; paintShared(); });
    });
    save.disabled = off;
    box.append(save, el('p', 'sprint-note', g.audience ? `Saved for the group: ${g.audience.who}` : 'Anyone in the group can save it. The last saved version goes to Sketch.'));
  }

  function gridShared(box: HTMLElement): void {
    const g = group();
    box.append(matrix((b, cell) => {
      const ul = el('ul', 'su-cards');
      for (const c of g.limits[b]) ul.append(el('li', 'su-card', counted(c.text, c.count)));
      if (!g.limits[b].length) ul.append(el('li', 'su-card su-card--ghost', 'Nothing here yet'));
      cell.append(ul);
    }));
  }

  function ask(box: HTMLElement): void {
    const g = group();
    const picked = g.questions.filter((q) => q.picked).length;
    box.append(el('p', 'sprint-note', `${picked} of 3 starred. Made from your group’s unknowns.`));
    for (const q of g.questions) {
      const b = el('button', 'sprint-chip sprint-star', `${q.picked ? '★' : '☆'} ${counted(q.text, q.count)}${q.sent ? ' · sent' : ''}`);
      b.type = 'button';
      b.disabled = off || (!q.picked && picked >= 3);
      b.setAttribute('aria-pressed', String(q.picked));
      b.addEventListener('click', () => void write(ctx.client.askPick(q.id)));
      box.append(b);
    }
    if (!g.questions.length) box.append(el('p', 'sprint-note', 'Questions show here once your group adds unknowns to Limits.'));
    if (!off) {
      const add = el('form', 'su-add');
      const input = el('input', 'qz-input');
      input.maxLength = 200;
      input.value = questionDraft;
      input.placeholder = 'Add or reword a question';
      input.setAttribute('aria-label', 'Add a question');
      input.addEventListener('input', () => { questionDraft = input.value; });
      const go = el('button', 'btn btn--secondary', 'Add');
      go.type = 'submit';
      add.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) void write(ctx.client.askAdd(t)).then(() => { questionDraft = ''; paintShared(); }); });
      add.append(input, go);
      box.append(add);
      const send = button('Send to teacher', 'primary', () => void write(ctx.client.askSend()));
      send.disabled = !picked;
      box.append(send);
    }
  }

  function expert(box: HTMLElement): void {
    const g = group();
    if (!g.sent.length) { box.append(el('p', 'sprint-note', steps.ask ? 'Send questions in the Ask step. Your teacher’s answers arrive here.' : 'Your teacher’s answers arrive here.')); return; }
    for (const q of g.sent) {
      const row = el('div', 'su-answer');
      row.append(el('strong', '', q.text), el('p', q.answer ? '' : 'sprint-note', q.answer ?? 'Waiting for your teacher…'));
      box.append(row);
    }
  }

  const BUILD: Record<UnderstandStep, (box: HTMLElement) => void> = { spot, audience, dig, say, limits, vote, merge, grid: gridShared, ask, expert };

  // ---------------------------------------------------------------- layout

  const boxes = new Map<UnderstandStep, HTMLElement>();
  order.forEach((k, i) => {
    const box = section(k, i + 1);
    const inner = el('div', 'su-step__body');
    box.append(inner);
    if (alone(k)) BUILD[k](inner);
    else shared[k] = inner;
    boxes.set(k, box);
  });

  function paintShared(): void {
    for (const [k, inner] of Object.entries(shared) as Array<[UnderstandStep, HTMLElement]>) {
      // Don't repaint a box the student is typing in.
      if (inner.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) continue;
      inner.replaceChildren();
      BUILD[k](inner);
    }
  }
  paintShared();

  const flow = el('div', 'su-flow');
  const slides = settings.layout === 'slides' && order.length > 1;
  let at = 0;
  const nav = el('div', 'su-nav');
  const where = el('span', 'su-nav__where');
  const rail = el('ol', 'su-rail');
  rail.setAttribute('aria-label', 'Steps');
  const back = button('Back', 'secondary', () => { at = Math.max(0, at - 1); show(); });
  const next = button('Next', 'primary', () => { at = Math.min(order.length - 1, at + 1); show(); });
  function show(): void {
    order.forEach((k, i) => { boxes.get(k)!.hidden = slides && i !== at; });
    back.disabled = at === 0;
    next.disabled = at === order.length - 1;
    const k = order[at];
    where.textContent = k ? `Step ${at + 1} of ${order.length} · ${alone(k) ? 'On your own' : 'Your group’s space'}` : '';
    paintRail();
  }
  /** Has this step got something in it? Alone steps read the draft, shared ones the group's space. */
  function stepDone(k: UnderstandStep): boolean {
    const g = group();
    switch (k) {
      case 'spot': return state.spot.length > 0;
      case 'audience': return !!state.audience.who.trim() && !!state.audience.why.trim();
      case 'dig': return state.dig.filter((d) => d.trim()).length >= 2;
      case 'say': return !!state.say.trim();
      case 'limits': return LIMIT_BOXES.every((b) => state.limits[b].length > 0);
      case 'vote': return !!state.star;
      case 'merge': return !!g.audience;
      case 'grid': return false;
      case 'ask': return g.questions.some((q) => q.picked);
      case 'expert': return g.sent.some((q) => q.answer);
    }
  }
  function paintRail(): void {
    rail.replaceChildren(...order.map((k, i) => {
      const li = el('li', '');
      const done = stepDone(k);
      const b = el('button', `su-rail__dot${i === at ? ' is-now' : ''}${done ? ' is-done' : ''}${alone(k) ? '' : ' is-group'}`, done && i !== at ? '✓' : String(i + 1));
      b.type = 'button';
      b.title = STEP_TITLES[k];
      b.setAttribute('aria-label', `Step ${i + 1}: ${STEP_TITLES[k]}${done ? ' (has something in it)' : ''}`);
      if (i === at) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => { at = i; show(); });
      li.append(b);
      return li;
    }));
  }
  let lastAlone = true;
  for (const k of order) {
    if (!slides && lastAlone && !alone(k)) flow.append(el('h3', 'su-divider', 'Your group’s space'));
    lastAlone = alone(k);
    flow.append(boxes.get(k)!);
  }
  if (!order.length) flow.append(el('p', 'sprint-note', 'Your teacher hasn’t set the steps for this phase yet.'));
  if (slides) root.append(rail);
  root.append(flow);
  if (slides) root.append(nav);
  if (slides) nav.append(back, where, next);
  show();
  root.append(err, bar.el);
  return {
    el: root,
    update(next: SprintStatus) { status = next; paintShared(); if (slides) paintRail(); },
    dispose: bar.dispose
  };
}

/** Rebuild only when the phase's own state changes; the group's space updates in place. */
export const understandSignature = (s: SprintStatus) => (s.phases ?? []).find((p) => p.key === 'understand')?.frozen ? 'frozen' : '';

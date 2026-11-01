import { button, el } from '@/quiz/dom';
import { sketchProblems } from './checks';
import { SKETCH_STARTERS } from './defaults';
import { SKETCH_GUIDE } from './guidance';
import { SKETCH_CHECKS } from './guidance';
import { coach, slidify, draftOf, frameField, stepHead, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import type { PhasePayload, SketchCard } from './schema';
import type { SprintStatus } from './api';

const blank = (id: string, seed: string): SketchCard => ({ id, seed, title: seed.slice(0, 80), idea: '', answers: '', evidence: '', criteria: {}, requirements: {}, value_answer: '' });
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/**
 * Sketch, alone: the group brief, inspiration to borrow from, rapid ideas
 * against a timer, a star on the best few, then each starred idea developed
 * into a card someone else could follow. The cards go to the group.
 */
export function mountSketch(ctx: FormContext): PhaseForm {
  const ideas = ctx.sprint.phases[1]!.ideas ?? 2;
  const minutes = ctx.sprint.sketch_timer ?? 8;
  const mine = draftOf(ctx, 'sketch');
  const state: PhasePayload['sketch'] = {
    inspiration: (mine?.inspiration ?? []).map((i) => ({ ...i })),
    rapid: [...(mine?.rapid ?? [])],
    rapid_started_at: mine?.rapid_started_at ?? '',
    cards: [...(mine?.cards ?? [])],
    strongest: mine?.strongest ?? '',
    strongest_why: mine?.strongest_why ?? ''
  };
  if (!state.inspiration.length) state.inspiration.push({ from: '', borrow: '' });
  const off = !ctx.editable;
  const reqs = ctx.sprint.requirements.filter((r) => r.phases.includes('sketch'));
  const root = el('div', 'sprint-sketch');
  root.append(el('h2', '', 'Sketch your ideas'));
  if (ctx.sprint.phases[1]!.instruction) root.append(el('p', '', ctx.sprint.phases[1]!.instruction));
  const bar = submitBar(ctx, 'sketch', () => state, () => sketchProblems(state, { ideas, requirements: ctx.sprint.requirements, valueCheck: !!ctx.valueCheck }).map((text) => {
    // Inspiration, Rapid ideas and Pick name their step; everything else is about developing the ideas.
    const key = text.startsWith('Inspiration:') ? 'inspiration' : text.startsWith('Rapid ideas:') ? 'rapid' : text.startsWith('Pick:') ? 'pick' : 'develop';
    return { text, at: `[data-step="${key}"] .su-step__where` };
  }));
  const change = () => bar.changed();
  const step = (n: number, key: keyof typeof SKETCH_GUIDE, title: string, note: string) => {
    const box = el('section', 'su-step su-step--alone');
    box.dataset.step = key;
    box.append(...stepHead(`Sketch · Step ${n} of 4`, title), coach(SKETCH_GUIDE[key]));
    if (note) box.append(el('p', 'sprint-note', note));
    root.append(box);
    return box;
  };

  // 1. Inspiration
  const insp = step(1, 'inspiration', 'Inspiration: what could you borrow from?', '');
  const inspList = el('div', 'sk-insp');
  const paintInsp = () => {
    inspList.replaceChildren();
    state.inspiration.forEach((row, i) => {
      const r = el('div', 'sk-insp__row');
      const from = el('input', 'qz-input');
      from.maxLength = 120;
      from.value = row.from;
      from.disabled = off;
      from.placeholder = 'The example';
      from.setAttribute('aria-label', `Inspiration ${i + 1}: the example`);
      from.addEventListener('input', () => { row.from = from.value; change(); });
      const borrow = el('input', 'qz-input');
      borrow.maxLength = 200;
      borrow.value = row.borrow;
      borrow.disabled = off;
      borrow.placeholder = 'What I’d borrow from it';
      borrow.setAttribute('aria-label', `Inspiration ${i + 1}: what you’d borrow`);
      borrow.addEventListener('input', () => { row.borrow = borrow.value; change(); });
      r.append(from, borrow);
      inspList.append(r);
    });
    if (!off && state.inspiration.length < 3) inspList.append(button('Add another', 'secondary', () => { state.inspiration.push({ from: '', borrow: '' }); paintInsp(); }));
  };
  paintInsp();
  insp.append(inspList);

  // 2. Rapid ideas against the timer
  const rapid = step(2, 'rapid', 'Rapid ideas: as many as you can', minutes ? `You have ${minutes} minutes once you start. One line per idea, press Enter, no judging yet.` : 'One line per idea, press Enter, no judging yet.');
  const timer = el('div', 'sk-timer');
  const add = el('form', 'su-add');
  const input = el('input', 'qz-input');
  input.maxLength = 120;
  input.placeholder = 'An idea, in a line';
  input.setAttribute('aria-label', 'A rapid idea');
  const go = el('button', 'btn btn--secondary', 'Add');
  go.type = 'submit';
  add.append(input, go);
  const list = el('ol', 'sk-rapid');
  const left = () => (minutes && state.rapid_started_at ? Date.parse(state.rapid_started_at) + minutes * 60000 - Date.now() : 0);
  const running = () => !minutes || (!!state.rapid_started_at && left() > 0);
  let tick = 0;
  const paintTimer = () => {
    const n = state.rapid.length;
    const count = `${n} ${n === 1 ? 'idea' : 'ideas'}`;
    timer.replaceChildren();
    if (minutes && !state.rapid_started_at) {
      const start = button(`Start the ${minutes}-minute timer`, 'primary', () => {
        state.rapid_started_at = new Date().toISOString();
        change();
        paintTimer();
        startTick();
        input.focus();
      });
      start.disabled = off;
      timer.append(start, el('span', 'sprint-note', 'The box opens when you start.'));
    } else if (minutes && left() > 0) timer.append(el('strong', 'sk-timer__clock', clock(left())), el('span', 'sk-timer__count', count));
    else timer.append(el('strong', '', minutes ? `Time’s up. ${count}.` : count));
    const open = !off && running();
    input.disabled = !open;
    go.disabled = !open;
    if (minutes && state.rapid_started_at && left() <= 0) window.clearInterval(tick);
  };
  add.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t || !running() || state.rapid.length >= 40) return;
    if (!state.rapid.some((r) => same(r, t))) state.rapid.push(t);
    input.value = '';
    change();
    paintRapid();
    paintPick();
    paintTimer();
  });
  const paintRapid = () => {
    list.replaceChildren(...state.rapid.map((t, i) => {
      const li = el('li', '', t);
      const picked = state.cards.some((c) => c.seed && same(c.seed, t));
      if (!off && !picked) {
        const x = button('Remove', 'ghost', () => { state.rapid.splice(i, 1); change(); paintRapid(); paintPick(); paintTimer(); });
        x.setAttribute('aria-label', `Remove "${t}"`);
        li.append(' ', x);
      }
      return li;
    }));
  };
  rapid.append(timer, add, list);
  paintRapid();
  paintTimer();
  function startTick(): void { window.clearInterval(tick); tick = window.setInterval(paintTimer, 1000); }
  if (minutes && state.rapid_started_at && left() > 0) startTick();

  // 3. Pick the best
  const pickBox = step(3, 'pick', `Pick: star your best ${ideas}`, `These are the ${ideas === 1 ? 'idea' : 'ideas'} you put forward to your group, without your name.`);
  const pickList = el('div', 'sk-pick');
  pickBox.append(pickList);
  const nextId = () => { let n = 1; while (state.cards.some((c) => c.id === `k${n}`)) n += 1; return `k${n}`; };
  const paintPick = () => {
    pickList.replaceChildren();
    const count = state.cards.length;
    if (!state.rapid.length) pickList.append(el('p', 'sprint-note', 'Your rapid ideas show here to star.'));
    for (const t of state.rapid) {
      const on = state.cards.some((c) => c.seed && same(c.seed, t));
      const b = el('button', 'sprint-chip sprint-star', `${t}${on ? ' · starred' : ''}`);
      b.type = 'button';
      b.disabled = off || (!on && count >= ideas);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => {
        if (on) state.cards = state.cards.filter((c) => !(c.seed && same(c.seed, t)));
        else state.cards.push(blank(nextId(), t));
        if (!state.cards.some((c) => c.id === state.strongest)) state.strongest = '';
        at = Math.max(0, Math.min(at, state.cards.length - 1));
        change();
        paintPick();
        paintRapid();
        paintTabs();
        paintCard();
        paintStrongCheck();
        strongest.hidden = state.cards.length < 2;
      });
      pickList.append(b);
    }
  };

  // 4. Develop and justify each starred idea
  const dev = step(4, 'develop', 'Develop and justify', '');
  const tabs = el('div', 'sprint-tabs');
  tabs.setAttribute('role', 'tablist');
  const pane = el('div', 'sprint-card-pane');
  dev.append(tabs, pane);
  let at = 0;

  const paintCard = () => {
    pane.replaceChildren();
    const c = state.cards[at];
    if (!c) { pane.append(el('p', 'sprint-note', 'Star an idea above to develop it here.')); return; }
    const title = el('input', 'qz-input');
    title.maxLength = 80;
    title.value = c.title;
    title.disabled = !ctx.editable;
    title.setAttribute('aria-label', 'Title');
    title.addEventListener('input', () => { c.title = title.value; change(); });
    pane.append(el('label', 'sprint-field__label', 'Title'), title);
    pane.append(
      frameField({ label: SKETCH_STARTERS.idea, value: c.idea, max: 600, frames: ctx.frames.slice(0, 1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.idea = v; change(); } }),
      frameField({ label: SKETCH_STARTERS.answers, value: c.answers, max: 600, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.answers = v; change(); } }),
      frameField({ label: SKETCH_STARTERS.evidence, value: c.evidence, max: 600, frames: ctx.frames.slice(1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.evidence = v; change(); } })
    );
    const upload = el('input');
    upload.type = 'file';
    upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
    upload.disabled = !ctx.editable;
    upload.setAttribute('aria-label', 'Add a picture or PDF');
    upload.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      try {
        c.file = (await ctx.client.upload('sketch', file)).id;
        change();
      } catch (e) {
        pane.append(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'That didn’t upload.'));
      }
    });
    pane.append(el('label', 'sprint-field__label', c.file ? 'Picture or PDF added' : 'Add a picture or PDF (optional)'), upload);
  };

  /** Criteria and requirements are checked for the one idea chosen as strongest, so the other ideas stay quick. */
  const strongCheck = el('div', 'sprint-card-check sk-strong-check');
  const paintStrongCheck = () => {
    strongCheck.replaceChildren();
    const c = state.cards.length === 1 ? state.cards[0] : state.cards.find((x) => x.id === state.strongest);
    if (!c) {
      if (state.cards.length > 1) strongCheck.append(el('p', 'sprint-note', 'Pick your strongest idea above. You check that one against the criteria and requirements. The others don’t need it.'));
      return;
    }
    const check = strongCheck;
    check.append(el('h3', '', `Check your strongest idea${c.title ? `: ${c.title}` : ''}`), el('p', 'sprint-note', SKETCH_CHECKS.intro));
    const section = (kind: 'criteria' | 'requirements', title: string, items: ReadonlyArray<{ id: string; text: string }>, into: Record<string, string>, placeholder: string) => {
      const box = el('section', `sk-check sk-check--${kind}`);
      const tally = el('span', 'sk-check__tally');
      const count = () => { tally.textContent = kind === 'criteria' ? `${items.filter((x) => into[x.id]).length} ticked` : `${items.filter((x) => into[x.id]?.trim()).length} of ${items.length} done`; };
      const head = el('div', 'sk-check__head');
      head.append(el('h4', '', title), el('span', 'sk-check__tag', SKETCH_CHECKS[kind].tag), tally);
      const more = el('details', 'sk-check__more');
      more.append(el('summary', '', 'What does this mean?'));
      more.append(el('p', '', SKETCH_CHECKS[kind].what), el('p', '', SKETCH_CHECKS[kind].how), el('p', 'sprint-note', SKETCH_CHECKS[kind].example));
      box.append(head, el('p', 'sk-check__do', SKETCH_CHECKS[kind].doThis), more);
      // Criteria are optional ticks. Requirements are all needed, so each is just a "where is it?" box.
      for (const x of items) box.append(kind === 'criteria' ? tickRow(x.text, into, x.id, placeholder, ctx.editable, () => { count(); change(); }) : whereRow(x.text, into, x.id, placeholder, ctx.editable, () => { count(); change(); }));
      count();
      check.append(box);
    };
    if (ctx.sprint.criteria.length) section('criteria', 'Criteria: how well does it work?', ctx.sprint.criteria, c.criteria, 'Copy the words from your idea that show it');
    if (reqs.length) section('requirements', 'Requirements: does it have what it must?', reqs, c.requirements, 'Where in your idea is it?');
    const value = valueCheckField(ctx, c.value_answer, (v) => { c.value_answer = v; change(); });
    if (value) check.append(value);
  };

  const paintTabs = () => {
    tabs.replaceChildren(...state.cards.map((c, i) => {
      const t = el('button', 'btn btn--secondary sprint-tab', `Idea ${i + 1}${c.title ? `: ${c.title}` : ''}`);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(i === at));
      t.addEventListener('click', () => { at = i; paintTabs(); paintCard(); });
      return t;
    }));
  };

  const strongest = el('div', 'sprint-strongest');
  strongest.hidden = state.cards.length < 2;
  const pick = el('select', 'qz-input');
  pick.disabled = !ctx.editable;
  pick.setAttribute('aria-label', 'Your strongest idea');
  const refreshPick = () => {
    pick.replaceChildren(el('option', '', 'Pick your strongest idea'), ...state.cards.map((c, i) => {
      const o = el('option', '', `Idea ${i + 1}${c.title ? `: ${c.title}` : ''}`);
      o.value = c.id;
      o.selected = state.strongest === c.id;
      return o;
    }));
    (pick.firstChild as HTMLOptionElement).value = '';
  };
  refreshPick();
  pick.addEventListener('focus', refreshPick);
  pick.addEventListener('change', () => { state.strongest = pick.value; paintStrongCheck(); bar.changed(); });
  strongest.append(el('h3', '', 'Your strongest idea'), pick, frameField({ label: 'Why is it the strongest?', value: state.strongest_why, max: 300, rows: 2, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.strongest_why = v; bar.changed(); } }));

  paintPick();
  paintTabs();
  paintCard();
  paintStrongCheck();
  dev.append(strongest, strongCheck);
  slidify(root, ctx.sprint.understand?.layout, ctx.steps?.sketch ?? 0, (i) => { if (ctx.steps) ctx.steps.sketch = i; });
  root.append(bar.el);
  return { el: root, dispose: () => { window.clearInterval(tick); bar.dispose(); } };
}

/** A requirement: no tick, because every one is needed. Just the box saying where it is. */
function whereRow(label: string, into: Record<string, string>, id: string, placeholder: string, editable: boolean, change: () => void): HTMLElement {
  const row = el('label', 'sprint-row sprint-row--where');
  const input = el('input', 'qz-input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = placeholder;
  input.value = into[id] ?? '';
  input.disabled = !editable;
  input.addEventListener('input', () => { if (input.value.trim()) into[id] = input.value; else delete into[id]; change(); });
  const text = el('span', '', label);
  text.append(input);
  row.append(text);
  return row;
}

/** A tick with a "where" box; unticking clears it. */
function tickRow(label: string, into: Record<string, string>, id: string, placeholder: string, editable: boolean, change: () => void): HTMLElement {
  const row = el('label', 'sprint-row');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = !!into[id];
  box.disabled = !editable;
  const text = el('span', '', label);
  const where = el('input', 'qz-input');
  where.type = 'text';
  where.maxLength = 200;
  where.placeholder = placeholder;
  where.value = into[id] ?? '';
  where.hidden = !box.checked;
  where.disabled = !editable;
  box.addEventListener('change', () => {
    where.hidden = !box.checked;
    if (!box.checked) delete into[id];
    change();
  });
  where.addEventListener('input', () => { into[id] = where.value; change(); });
  text.append(where);
  row.append(box, text);
  return row;
}

export const sketchSignature = (s: SprintStatus) => `${s.question?.text ?? ''}|${s.brief?.audience?.who ?? ''}|${s.brief?.answers.length ?? 0}`;

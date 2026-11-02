import { KNOWLEDGE_LIMITS, type AlreadyKnow, type KnowledgeItem, type KnowledgePlan, type KnowledgeWeek, type ScopeSequence } from '@/schemas';
import {
  alreadyState, blankWeek, buildRows, emptyPlan, indexItems, markFromBefore, newInWeek, newItemId, pieceSuggestions, placedLater, planIssues, removeItem, setsUp,
  teachIn, threadOf, unitPlanFor, unplacedCount, type ItemIndex, type PlanRow
} from './plan';
import './plan.css';

type PlanUnit = { id: string; title: string; deep_understandings?: ReadonlyArray<{ pieces?: ReadonlyArray<{ id: string; text: string; tier: string }> }> };

export type KnowledgePlanOptions = {
  getScope: () => ScopeSequence;
  units: readonly PlanUnit[];
  onSave: (plan: KnowledgePlan) => Promise<void>;
  onGoTimeline: () => void;
};

const NS = 'http://www.w3.org/2000/svg';
const PLAY_MS = 2300;
/** The year arrives once per page load, not on each return to the tab. */
const arrived = new Set<string>();
/** The newest plan per scope, so returning to the tab mid-save shows what was typed. */
const latest = new Map<string, KnowledgePlan>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function btn(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
const fit = (area: HTMLTextAreaElement) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shorten = (text: string, max = 44) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const termLabel = (row: PlanRow) => (row.term === null ? `${row.weeks} weeks` : `Term ${row.term} · ${row.weeks} week${row.weeks === 1 ? '' : 's'}`);

/**
 * Scope & Sequence → Knowledge plan: the year as a written plan, in teaching
 * order, read top to bottom. Read follows a piece of knowledge through the
 * year; Edit writes the plan and saves as it goes.
 */
export function mountKnowledgePlan(host: HTMLElement, options: KnowledgePlanOptions): void {
  const scopeId = options.getScope().id;
  const plan: KnowledgePlan = structuredClone(latest.get(scopeId) ?? options.getScope().knowledge_plan ?? emptyPlan());
  const piecesByUnit = new Map(options.units.map((u) => [u.id, (u.deep_understandings ?? []).flatMap((d) => d.pieces ?? [])]));
  const pieceText = new Map([...piecesByUnit.values()].flat().map((p) => [p.id, p.text]));

  let editing = false;
  let trace: string | null = null;
  let playTimer: number | undefined;
  const open = new Set<string>();
  const showAllPieces = new Set<string>();
  let justOpened: string | null = null;
  let rows: PlanRow[] = [];
  let index: ItemIndex = new Map();

  const root = el('section', 'kplan');
  const band = el('div', 'kplan-target');
  const bar = el('div', 'kplan-bar');
  const readout = el('div', 'kplan-readout');
  readout.setAttribute('aria-live', 'polite');
  const right = el('div', 'kplan-right');
  const scroll = el('div', 'kplan-scroll');
  const grid = el('div', 'kplan-grid');
  const note = el('p', 'kplan-note');
  scroll.append(grid);
  bar.append(readout, right);
  root.append(band, bar, scroll, note);
  host.replaceChildren(root);

  /* Saving: one request at a time, always ending on the newest plan. */
  let saveTimer: number | undefined;
  let inFlight = false;
  let dirty = false;
  const status = el('span', 'kplan-status');
  const flush = async (): Promise<void> => {
    window.clearTimeout(saveTimer);
    if (inFlight) { dirty = true; return; }
    inFlight = true;
    status.textContent = 'Saving…';
    try {
      await options.onSave(structuredClone(plan));
      status.textContent = 'Saved';
    } catch {
      status.textContent = 'Could not save. Your changes are still here.';
    }
    inFlight = false;
    if (dirty) { dirty = false; void flush(); }
  };
  const touched = (): void => {
    latest.set(scopeId, plan);
    status.textContent = 'Saving…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void flush(), 500);
  };
  /** After a change of shape: save and redraw. */
  const changed = (): void => { touched(); render(); };
  /** Redraw just after a blur, so the click that caused it still lands. */
  const changedSoon = (): void => { touched(); window.setTimeout(render, 140); };

  const read = (): void => {
    rows = buildRows(options.getScope(), options.units, plan);
    index = indexItems(plan, rows, pieceText);
  };

  /* Editing controls */
  function area(value: string, label: string, focusKey: string, max: number, onInput: (v: string) => void, onBlur?: (v: string) => void): HTMLTextAreaElement {
    const node = el('textarea', 'kplan-field');
    node.rows = 1;
    node.value = value;
    node.maxLength = max;
    node.placeholder = label;
    node.setAttribute('aria-label', label);
    node.dataset.focus = focusKey;
    node.addEventListener('input', () => { fit(node); onInput(node.value); touched(); });
    node.addEventListener('blur', () => { onBlur ? onBlur(node.value) : refreshDerived(); });
    return node;
  }
  const removeBtn = (label: string, onClick: () => void): HTMLButtonElement => {
    const node = btn('kplan-x', '×', onClick);
    node.setAttribute('aria-label', label);
    return node;
  };

  /* Cells */
  function label(cell: HTMLElement, text: string): void { cell.append(el('span', 'kplan-flabel', text)); }

  function teachFix(row: PlanRow, text: string): HTMLButtonElement {
    const dest = rows[row.n - 2];
    if (dest) {
      return btn('kplan-fix', `Teach it in Unit ${dest.n}`, () => {
        const id = teachIn(plan, dest.unit_id, text);
        if (!editing) trace = id;
        changed();
      });
    }
    return btn('kplan-fix', 'It comes from last year', () => { markFromBefore(plan, text); changed(); });
  }

  function alreadyCell(row: PlanRow, list: () => AlreadyKnow[], name: string, weekIndex?: number): HTMLElement {
    const cell = el('div', 'kplan-c-start');
    label(cell, 'Already know');
    const ul = el('ul', 'kplan-items');
    for (const entry of list()) {
      const state = alreadyState(entry, row.n, index);
      if (!state) continue;
      const li = el('li', 'kplan-li');
      const lateWeek = weekIndex !== undefined && state.state === 'ok' ? placedLater(row.plan, weekIndex, state.item_id) : null;
      if (lateWeek) {
        const gap = el('div', 'kplan-gap', state.text);
        gap.append(el('small', undefined, `Placed in ${lateWeek.label || 'a later week'}, after this week needs it`));
        li.append(gap);
      } else if (state.state === 'ok' && !editing) {
        const item = btn('kplan-item', state.text, () => follow(state.item_id));
        item.dataset.k = state.item_id;
        item.dataset.role = 'known';
        item.append(el('small', undefined, `Unit ${state.n}`));
        li.append(item);
      } else if (state.state === 'ok' || state.state === 'before') {
        const item = el('div', 'kplan-item kplan-item--plain', state.text);
        item.append(el('small', undefined, state.state === 'ok' ? `Unit ${state.n}` : 'Last year'));
        li.append(item);
      } else {
        const gap = el('div', 'kplan-gap', state.text);
        if (state.state === 'untaught') {
          gap.append(el('small', undefined, 'Assumed here, taught nowhere yet'), teachFix(row, state.text));
        } else if (state.state === 'later') {
          gap.append(el('small', undefined, `Taught in Unit ${state.n}, after this unit needs it`));
        } else {
          gap.append(el('small', undefined, 'Its unit is off the Timeline'));
        }
        li.append(gap);
      }
      if (editing) {
        li.append(removeBtn('Remove', () => {
          const entries = list();
          entries.splice(entries.indexOf(entry), 1);
          changed();
        }));
      }
      ul.append(li);
    }
    cell.append(ul);
    if (editing) cell.append(btn('kplan-add', '+ Add', () => openPicker(row, list, name)));
    return cell;
  }

  function taughtList(row: PlanRow, items: KnowledgeItem[], kind: 'must' | 'skills', addLabel: string, focusPrefix: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const ul = el('ul', 'kplan-items');
    for (const item of items) {
      const li = el('li', 'kplan-li');
      const shown = index.get(item.id)?.text ?? item.text;
      if (!editing) {
        const node = btn('kplan-item', shown, () => follow(item.id));
        node.dataset.k = item.id;
        node.dataset.role = 'taught';
        li.append(node);
      } else if (item.piece_id) {
        const node = el('div', 'kplan-item kplan-item--plain', shown);
        node.append(el('small', undefined, 'From deep understandings'));
        li.append(node, removeBtn('Remove', () => { removeItem(plan, row.unit_id, item.id, shown); changed(); }));
      } else {
        li.append(
          area(item.text, 'Type it', `${focusPrefix}:${item.id}`, KNOWLEDGE_LIMITS.text, (v) => { item.text = v; }, (v) => {
            if (!v.trim()) { removeItem(plan, row.unit_id, item.id, ''); changedSoon(); } else refreshDerived();
          }),
          removeBtn('Remove', () => { removeItem(plan, row.unit_id, item.id, item.text); changed(); })
        );
      }
      ul.append(li);
    }
    frag.append(ul);
    if (editing) {
      frag.append(btn('kplan-add', addLabel, () => {
        const item: KnowledgeItem = { id: newItemId(), text: '' };
        unitPlanFor(plan, row.unit_id)[kind].push(item);
        pendingFocus = `${focusPrefix}:${item.id}`;
        changed();
      }));
    }
    return frag;
  }

  function suggestionsFor(row: PlanRow): HTMLElement | null {
    const offered = pieceSuggestions(row.plan, piecesByUnit.get(row.unit_id) ?? []);
    if (!offered.essential.length && !offered.others.length) return null;
    const box = el('div', 'kplan-suggest');
    box.append(el('span', 'kplan-suggest__label', 'From deep understandings'));
    const showing = showAllPieces.has(row.unit_id) ? [...offered.essential, ...offered.others] : offered.essential;
    for (const piece of showing) {
      box.append(btn('kplan-suggest__piece', `+ ${piece.text}`, () => {
        unitPlanFor(plan, row.unit_id).must.push({ id: newItemId(), text: piece.text, piece_id: piece.id });
        changed();
      }));
    }
    if (offered.others.length && !showAllPieces.has(row.unit_id)) {
      box.append(btn('kplan-add', `Show ${offered.others.length} more`, () => { showAllPieces.add(row.unit_id); render(); }));
    }
    return box;
  }

  function wordTags(words: readonly string[]): HTMLElement {
    const box = el('div', 'kplan-words');
    for (const word of words) box.append(el('span', 'kplan-word', word));
    return box;
  }

  function wordsEditor(row: PlanRow): DocumentFragment {
    const frag = document.createDocumentFragment();
    const box = el('div', 'kplan-words');
    for (const word of row.plan.words) {
      const tag = el('span', 'kplan-word', word);
      tag.append(removeBtn(`Remove ${word}`, () => {
        const unit = unitPlanFor(plan, row.unit_id);
        unit.words = unit.words.filter((w) => w !== word);
        for (const week of unit.weeks) week.words = week.words.filter((w) => w !== word);
        changed();
      }));
      box.append(tag);
    }
    const input = el('input', 'kplan-field kplan-field--word');
    input.placeholder = 'Add a word';
    input.maxLength = KNOWLEDGE_LIMITS.word;
    input.setAttribute('aria-label', 'Add a vocabulary word');
    input.dataset.focus = `${row.unit_id}:word`;
    const commit = (): boolean => {
      const unit = unitPlanFor(plan, row.unit_id);
      const fresh = input.value.split(',').map((w) => w.trim()).filter((w) => w && !unit.words.includes(w));
      input.value = '';
      unit.words.push(...fresh.slice(0, Math.max(0, KNOWLEDGE_LIMITS.words - unit.words.length)));
      return fresh.length > 0;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      if (commit()) changed();
    });
    input.addEventListener('blur', () => { if (commit()) changedSoon(); });
    frag.append(box, input);
    return frag;
  }

  function setsUpCell(row: PlanRow, i: number): HTMLElement {
    const cell = el('div', 'kplan-c-next');
    cell.dataset.setsup = row.unit_id;
    fillSetsUp(cell, row, i);
    return cell;
  }
  function fillSetsUp(cell: HTMLElement, row: PlanRow, i: number): void {
    const keep = cell.querySelector('.kplan-leads');
    cell.replaceChildren();
    label(cell, 'Sets up');
    for (const link of setsUp(rows, i, index)) {
      const line = el('div', 'kplan-next');
      line.append(el('b', undefined, `Unit ${link.n}`), ` ${link.texts.map((t) => shorten(t)).join(', ')}`);
      cell.append(line);
    }
    if (editing) {
      const leads = keep ?? area(row.plan.leads_on, 'Beyond this plan', `${row.unit_id}:leads`, KNOWLEDGE_LIMITS.text, (v) => { unitPlanFor(plan, row.unit_id).leads_on = v; });
      leads.classList.add('kplan-leads');
      cell.append(leads);
    } else if (row.plan.leads_on) {
      cell.append(el('div', 'kplan-next', row.plan.leads_on));
    }
  }

  function unitRow(row: PlanRow, i: number): HTMLElement {
    const node = el('div', 'kplan-row kplan-u-row');
    node.dataset.unit = row.unit_id;
    node.style.setProperty('--i', String(i));
    const toggle = (): void => {
      if (open.has(row.unit_id)) open.delete(row.unit_id);
      else { open.add(row.unit_id); justOpened = row.unit_id; }
      render();
      justOpened = null;
    };
    const isOpen = open.has(row.unit_id);
    const first = el('div', 'kplan-first kplan-unit');
    first.append(el('div', 'kplan-u-term', termLabel(row)), btn('kplan-u-name', `${row.n}. ${row.title}`, toggle));
    const openBtn = btn('kplan-u-open', isOpen ? 'Close weeks' : 'Plan the weeks', toggle);
    openBtn.setAttribute('aria-expanded', String(isOpen));
    first.append(openBtn);

    const concept = el('div', 'kplan-c-concept');
    label(concept, 'Big idea');
    if (editing) concept.append(area(row.plan.big_idea, 'The big idea', `${row.unit_id}:idea`, KNOWLEDGE_LIMITS.text, (v) => { unitPlanFor(plan, row.unit_id).big_idea = v; }));
    else concept.append(el('div', 'kplan-big', row.plan.big_idea));

    const content = el('div', 'kplan-c-content');
    label(content, 'Must know');
    content.append(taughtList(row, row.plan.must, 'must', '+ Add knowledge', `${row.unit_id}:must`));
    if (editing) {
      const offered = suggestionsFor(row);
      if (offered) content.append(offered);
    }

    const words = el('div', 'kplan-c-words');
    label(words, 'Vocabulary');
    words.append(editing ? wordsEditor(row) : wordTags(row.plan.words));

    const skills = el('div', 'kplan-c-skills');
    label(skills, 'Skills');
    skills.append(taughtList(row, row.plan.skills, 'skills', '+ Add skill', `${row.unit_id}:skills`));

    const evaluation = el('div', 'kplan-c-eval');
    label(evaluation, 'Assessed by');
    if (editing) evaluation.append(area(row.plan.assessed_by, 'The assessment', `${row.unit_id}:eval`, KNOWLEDGE_LIMITS.text, (v) => { unitPlanFor(plan, row.unit_id).assessed_by = v; }));
    else if (row.plan.assessed_by) evaluation.append(el('div', 'kplan-eval-card', row.plan.assessed_by));

    node.append(first, alreadyCell(row, () => unitPlanFor(plan, row.unit_id).already, row.title), concept, content, words, skills, evaluation, setsUpCell(row, i));
    return node;
  }

  function toggles(items: readonly KnowledgeItem[], chosen: () => string[], set: (ids: string[]) => void, textOf: (item: KnowledgeItem) => string): HTMLElement {
    const box = el('div', 'kplan-toggles');
    for (const item of items) {
      if (!textOf(item).trim()) continue;
      const on = chosen().includes(item.id);
      const node = btn(`kplan-toggle${on ? ' is-on' : ''}`, textOf(item), () => {
        set(on ? chosen().filter((id) => id !== item.id) : [...chosen(), item.id]);
        changed();
      });
      node.setAttribute('aria-pressed', String(on));
      box.append(node);
    }
    return box;
  }

  function weekRow(row: PlanRow, week: KnowledgeWeek, w: number, i: number): HTMLElement {
    const node = el('div', `kplan-row kplan-w-row${justOpened === row.unit_id ? ' is-fresh' : ''}`);
    node.style.setProperty('--i', String(w));
    const first = el('div', 'kplan-first kplan-unit');
    if (editing) {
      const name = el('input', 'kplan-field kplan-field--week');
      name.value = week.label;
      name.placeholder = 'Weeks 1–2';
      name.maxLength = KNOWLEDGE_LIMITS.label;
      name.setAttribute('aria-label', 'Which weeks');
      name.dataset.focus = `${week.id}:label`;
      name.addEventListener('input', () => { week.label = name.value; touched(); });
      first.append(name, removeBtn('Remove these weeks', () => {
        const unit = unitPlanFor(plan, row.unit_id);
        unit.weeks = unit.weeks.filter((x) => x !== week);
        changed();
      }));
    } else {
      first.append(el('div', 'kplan-w-name', week.label || `Part ${w + 1}`));
    }
    const fresh = newInWeek(row.plan, w);
    if (fresh) first.append(el('div', 'kplan-w-new', `${fresh} new`));

    const concept = el('div', 'kplan-c-concept');
    label(concept, 'Question');
    if (editing) concept.append(area(week.question, 'The question for these weeks', `${week.id}:q`, KNOWLEDGE_LIMITS.text, (v) => { week.question = v; }));
    else concept.append(el('div', 'kplan-w-q', week.question));

    const textOf = (item: KnowledgeItem) => index.get(item.id)?.text ?? item.text;
    const taught = (ids: readonly string[], role: 'must' | 'skill'): HTMLElement => {
      const ul = el('ul', 'kplan-items');
      const items = role === 'must' ? row.plan.must : row.plan.skills;
      for (const item of items.filter((x) => ids.includes(x.id))) {
        const li = el('li', 'kplan-li');
        const node2 = btn('kplan-item', textOf(item), () => follow(item.id));
        node2.dataset.k = item.id;
        node2.dataset.role = 'taught';
        li.append(node2);
        ul.append(li);
      }
      return ul;
    };

    const content = el('div', 'kplan-c-content');
    label(content, 'Must know');
    content.append(editing
      ? toggles(row.plan.must, () => week.must_ids, (ids) => { week.must_ids = ids; }, textOf)
      : taught(week.must_ids, 'must'));

    const words = el('div', 'kplan-c-words');
    label(words, 'Vocabulary');
    if (editing) {
      const box = el('div', 'kplan-toggles');
      for (const word of row.plan.words) {
        const on = week.words.includes(word);
        const tag = btn(`kplan-toggle kplan-toggle--word${on ? ' is-on' : ''}`, word, () => {
          week.words = on ? week.words.filter((x) => x !== word) : [...week.words, word];
          changed();
        });
        tag.setAttribute('aria-pressed', String(on));
        box.append(tag);
      }
      words.append(box);
    } else {
      words.append(wordTags(week.words));
    }

    const skills = el('div', 'kplan-c-skills');
    label(skills, 'Skills');
    skills.append(editing
      ? toggles(row.plan.skills, () => week.skill_ids, (ids) => { week.skill_ids = ids; }, textOf)
      : taught(week.skill_ids, 'skill'));

    const evaluation = el('div', 'kplan-c-eval');
    label(evaluation, 'Check');
    if (editing) evaluation.append(area(week.check, 'How you will check', `${week.id}:check`, KNOWLEDGE_LIMITS.text, (v) => { week.check = v; }));
    else if (week.check) evaluation.append(el('div', 'kplan-eval-card', week.check));

    const next = el('div', 'kplan-c-next');
    label(next, 'Next');
    const after = row.plan.weeks[w + 1];
    const nextUnit = rows[i + 1];
    const line = after ? (after.label || `Part ${w + 2}`) + (after.question ? `: ${after.question}` : '') : nextUnit ? `Unit ${nextUnit.n}: ${nextUnit.title}` : row.plan.leads_on;
    if (line) next.append(el('div', 'kplan-next', line));

    node.append(first, alreadyCell(row, () => week.already, week.label || row.title, w), concept, content, words, skills, evaluation, next);
    return node;
  }

  /* Choosing what a unit already relies on */
  function openPicker(row: PlanRow, list: () => AlreadyKnow[], name: string): void {
    const dialog = el('dialog', 'kplan-picker');
    const close = (): void => { dialog.close(); dialog.remove(); };
    dialog.append(el('h3', 'kplan-picker__title', `What does ${name} rely on?`));
    const body = el('div', 'kplan-picker__body');
    const chosen = new Set(list().flatMap((e) => (e.from === 'plan' ? [e.item_id] : [])));
    const add = (entry: AlreadyKnow): void => { list().push(entry); close(); changed(); };
    let offered = 0;
    for (const earlier of rows.slice(0, row.n)) {
      const items = [...earlier.plan.must, ...earlier.plan.skills].filter((x) => !chosen.has(x.id) && (index.get(x.id)?.text ?? x.text).trim());
      if (!items.length || (earlier.n === row.n && list() === row.plan.already)) continue;
      body.append(el('h4', 'kplan-picker__unit', `Unit ${earlier.n}. ${earlier.title}`));
      for (const item of items) {
        body.append(btn('kplan-picker__item', index.get(item.id)?.text ?? item.text, () => add({ from: 'plan', item_id: item.id })));
        offered += 1;
      }
    }
    if (!offered) body.append(el('p', 'kplan-picker__empty', 'Nothing has been planned before this yet. Add it from last year, or as not taught yet.'));
    dialog.append(body);
    const typed = el('div', 'kplan-picker__typed');
    const input = el('input', 'kplan-field');
    input.placeholder = 'Or type it';
    input.maxLength = KNOWLEDGE_LIMITS.text;
    input.setAttribute('aria-label', 'Type what students rely on');
    const typedAdd = (from: 'before' | 'untaught') => () => { if (input.value.trim()) add({ from, text: input.value.trim() }); else input.focus(); };
    typed.append(input, btn('btn btn--ghost', 'From last year', typedAdd('before')), btn('btn btn--ghost', 'Not taught yet', typedAdd('untaught')));
    dialog.append(typed, btn('kplan-picker__cancel', 'Cancel', close));
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    dialog.addEventListener('cancel', () => dialog.remove());
    root.append(dialog);
    dialog.showModal();
  }

  /* Following a piece through the year */
  function follow(id: string): void {
    stopPlay();
    trace = trace === id ? null : id;
    paintTrace();
  }

  function drawThread(): void {
    grid.querySelector('.kplan-thread')?.remove();
    if (!trace || editing || window.innerWidth <= 760) return;
    const box = grid.getBoundingClientRect();
    const points = [...grid.querySelectorAll<HTMLElement>('.kplan-item.is-src, .kplan-item.is-use')]
      .map((node) => ({ r: node.getBoundingClientRect(), row: node.closest('.kplan-row')!.getBoundingClientRect() }))
      .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    if (points.length < 2) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'kplan-thread');
    svg.setAttribute('width', String(grid.offsetWidth));
    svg.setAttribute('height', String(grid.offsetHeight));
    svg.setAttribute('aria-hidden', 'true');
    const part = (tag: string, attrs: Record<string, string | number>): void => {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      svg.append(node);
    };
    const X = (v: number) => Math.round(v - box.left);
    const Y = (v: number) => Math.round(v - box.top);
    points.slice(1).forEach((b, n) => {
      const a = points[n]!;
      const ax = X(a.r.left), ay = Y(a.r.top + a.r.height / 2);
      const bx = X(b.r.left), by = Y(b.r.top + b.r.height / 2);
      const lane = Y(a.row.bottom) - 1;
      const d = `M${ax} ${ay}H${ax - 5}V${lane}H${bx - 5}V${by}H${bx}`;
      const style = `--d:${(n * 0.28).toFixed(2)}s`;
      part('path', { class: 'kplan-thread__halo', pathLength: 1, d, style });
      part('path', { class: 'kplan-thread__line', pathLength: 1, d, style });
      part('circle', { cx: bx - 5, cy: by, r: 3.5, style: `--d:${(n * 0.28 + 0.5).toFixed(2)}s` });
    });
    grid.append(svg);
  }

  function paintTrace(): void {
    root.classList.toggle('is-tracing', !!trace);
    for (const node of grid.querySelectorAll<HTMLElement>('.kplan-item[data-k]')) {
      const on = node.dataset.k === trace;
      node.classList.toggle('is-src', on && node.dataset.role === 'taught');
      node.classList.toggle('is-use', on && node.dataset.role === 'known');
    }
    drawThread();
    paintBar();
  }

  function paintReadout(): void {
    readout.replaceChildren();
    if (trace) {
      const { home, usedIn } = threadOf(trace, rows, index);
      if (!home) { trace = null; paintReadout(); return; }
      readout.append(el('b', undefined, home.text), `: ${home.n === null ? 'its unit is off the Timeline' : `taught in Unit ${home.n}`}. `);
      readout.append(usedIn.length ? `Relied on in ${usedIn.map((n) => `Unit ${n}`).join(', ')}.` : 'Nothing later relies on it yet.');
      return;
    }
    const issues = planIssues(rows, index);
    const planned = plan.year_target.trim() || rows.some((r) => r.plan.big_idea.trim() || r.plan.must.length);
    if (!planned && !editing) {
      readout.append('Nothing planned yet. Press Edit and start with where the year ends.');
      return;
    }
    if (issues.length) {
      const untaught = issues.filter((x) => x.state === 'untaught').length;
      const later = issues.filter((x) => x.state === 'later').length;
      const off = issues.filter((x) => x.state === 'off').length;
      const order = issues.filter((x) => x.state === 'week_order').length;
      const parts = [
        untaught ? `${untaught} assumed and taught nowhere` : '',
        later ? `${later} taught after ${later === 1 ? 'it is' : 'they are'} needed` : '',
        off ? `${off} from a unit off the Timeline` : '',
        order ? `${order} placed in a week after ${order === 1 ? 'it is' : 'they are'} needed` : ''
      ].filter(Boolean);
      readout.append(el('span', 'kplan-warn', `${parts.join(', ')}: `), issues.slice(0, 3).map((x) => `${shorten(x.text, 32)} in Unit ${x.n}`).join(', '));
      if (issues.length > 3) readout.append(` and ${issues.length - 3} more`);
      readout.append('.');
    } else if (rows.some((r) => r.plan.already.length)) {
      readout.append('Everything the year assumes is taught before it is needed.');
    }
    const loose = unplacedCount(rows);
    if (loose) readout.append(el('span', 'kplan-quiet', ` ${loose} must-know ${loose === 1 ? 'piece is' : 'pieces are'} not in a week yet.`));
  }

  function paintBar(): void {
    paintReadout();
    const buttons: HTMLElement[] = [];
    if (trace) buttons.push(btn('btn btn--ghost', 'Clear thread', () => { trace = null; paintTrace(); }));
    if (editing) buttons.push(status);
    else {
      const playing = playTimer !== undefined;
      buttons.push(btn('btn btn--primary kplan-play', playing ? 'Stop' : 'Play the year', () => {
        if (playTimer !== undefined) { stopPlay(); paintBar(); } else startPlay();
      }));
    }
    const allOpen = rows.length > 0 && open.size >= rows.length;
    buttons.push(btn('btn btn--ghost', allOpen ? 'Close all weeks' : 'Open all weeks', () => {
      if (allOpen) open.clear();
      else rows.forEach((r) => open.add(r.unit_id));
      render();
    }));
    const mode = el('div', 'kplan-mode');
    mode.setAttribute('role', 'group');
    mode.setAttribute('aria-label', 'Read or edit the plan');
    const setMode = (next: boolean) => () => {
      if (editing === next) return;
      editing = next;
      trace = null;
      stopPlay();
      if (!editing) void flush();
      render();
    };
    const readBtn = btn(`kplan-mode__btn${editing ? '' : ' is-on'}`, 'Read', setMode(false));
    const editBtn = btn(`kplan-mode__btn${editing ? ' is-on' : ''}`, 'Edit', setMode(true));
    readBtn.setAttribute('aria-pressed', String(!editing));
    editBtn.setAttribute('aria-pressed', String(editing));
    mode.append(readBtn, editBtn);
    buttons.push(mode);
    right.replaceChildren(...buttons);
  }

  /* Play the year */
  function stopPlay(): void {
    window.clearTimeout(playTimer);
    playTimer = undefined;
    root.classList.remove('is-playing');
    grid.querySelectorAll('.is-lit').forEach((n) => n.classList.remove('is-lit'));
    band.querySelectorAll('.is-lit').forEach((n) => n.classList.remove('is-lit'));
  }
  function playStep(i: number): void {
    if (!root.isConnected) { stopPlay(); return; }
    const row = rows[i];
    if (!row) {
      playTimer = window.setTimeout(() => { stopPlay(); paintBar(); }, 1400);
      return;
    }
    grid.querySelectorAll<HTMLElement>('.kplan-u-row').forEach((n) => n.classList.toggle('is-lit', n.dataset.unit === row.unit_id));
    band.querySelector(`[data-seg="${CSS.escape(row.unit_id)}"]`)?.classList.add('is-lit');
    readout.replaceChildren(el('b', undefined, `Unit ${row.n}, ${row.title}`), row.plan.big_idea ? `: ${row.plan.big_idea}` : '');
    grid.querySelector(`[data-unit="${CSS.escape(row.unit_id)}"]`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    playTimer = window.setTimeout(() => playStep(i + 1), PLAY_MS);
  }
  function startPlay(): void {
    trace = null;
    paintTrace();
    root.classList.add('is-playing');
    playTimer = window.setTimeout(() => undefined, 0);
    paintBar();
    playStep(0);
  }

  /* Refresh what is worked out, leaving the fields being typed in alone. */
  function refreshDerived(): void {
    read();
    rows.forEach((row, i) => {
      const cell = grid.querySelector<HTMLElement>(`[data-setsup="${CSS.escape(row.unit_id)}"]`);
      if (cell) fillSetsUp(cell, row, i);
    });
    paintReadout();
  }

  function paintBand(): void {
    band.replaceChildren(el('div', 'kplan-lab', 'The year ends here'));
    if (editing) {
      const say = area(plan.year_target, 'By the end of the year, students can…', 'target', KNOWLEDGE_LIMITS.target, (v) => { plan.year_target = v; });
      say.classList.add('kplan-say-field');
      band.append(say);
    } else {
      band.append(el('div', `kplan-say${plan.year_target.trim() ? '' : ' kplan-say--empty'}`, plan.year_target.trim() || 'Press Edit to write where the year ends.'));
    }
    const strip = el('div', 'kplan-strip');
    strip.setAttribute('aria-label', 'The year\'s units');
    for (const row of rows) {
      const seg = btn('kplan-seg', '', () => {
        grid.querySelector(`[data-unit="${CSS.escape(row.unit_id)}"]`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      });
      seg.dataset.seg = row.unit_id;
      seg.style.flex = `${row.weeks} 1 0`;
      seg.append(
        el('b', 'kplan-seg__long', termLabel(row)),
        el('b', 'kplan-seg__short', `${row.term === null ? 'U' : 'T'}${row.term ?? row.n} · ${row.weeks}w`),
        el('span', undefined, row.title)
      );
      seg.setAttribute('aria-label', `${row.title}, ${termLabel(row)}`);
      strip.append(seg);
    }
    band.append(strip);
  }

  function heads(): DocumentFragment {
    const frag = document.createDocumentFragment();
    const groups = el('div', 'kplan-row kplan-groups');
    const group = (cls: string, text: string, step?: string): HTMLElement => {
      const node = el('div', cls);
      if (step) node.append(el('span', 'kplan-step', step));
      node.append(text);
      return node;
    };
    groups.append(el('div', 'kplan-first'), group('kplan-c-start', 'Starts from'), group('kplan-c-concept', 'Concept', '1'), group('kplan-c-content kplan-span2', 'Content', '2'), group('kplan-c-skills', 'Skills', '3'), group('kplan-c-eval', 'Evaluation', '4'), group('kplan-c-next', 'Leads to'));
    const names = el('div', 'kplan-row kplan-heads');
    names.append(el('div', 'kplan-first', 'Unit'), el('div', 'kplan-c-start', 'Already know'), el('div', 'kplan-c-concept', 'Big idea'), el('div', 'kplan-c-content', 'Must know'), el('div', 'kplan-c-words', 'Vocabulary'), el('div', 'kplan-c-skills', 'Skills'), el('div', 'kplan-c-eval', 'Assessed by'), el('div', 'kplan-c-next', 'Sets up'));
    frag.append(groups, names);
    return frag;
  }

  let pendingFocus: string | null = null;

  function render(): void {
    if (!root.isConnected) return;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = pendingFocus ?? (root.contains(active) ? active?.dataset.focus ?? null : null);
    const caret = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active.selectionStart : null;
    const refocus = pendingFocus === null;
    pendingFocus = null;
    stopPlay();
    read();
    root.classList.toggle('is-editing', editing);
    if (!rows.length) {
      band.replaceChildren();
      bar.hidden = true;
      note.replaceChildren();
      const empty = el('div', 'kplan-empty');
      empty.append(el('p', undefined, 'Place your units on the Timeline and they will appear here in teaching order.'), btn('btn btn--ghost', 'Go to Timeline', options.onGoTimeline));
      grid.replaceChildren(empty);
      return;
    }
    bar.hidden = false;
    paintBand();
    grid.replaceChildren(heads());
    rows.forEach((row, i) => {
      grid.append(unitRow(row, i));
      if (!open.has(row.unit_id)) return;
      row.plan.weeks.forEach((week, w) => grid.append(weekRow(row, week, w, i)));
      if (editing) {
        const addRow = el('div', 'kplan-add-weeks');
        addRow.append(btn('kplan-add', '+ Add weeks', () => {
          const week = blankWeek();
          unitPlanFor(plan, row.unit_id).weeks.push(week);
          pendingFocus = `${week.id}:label`;
          changed();
        }));
        grid.append(addRow);
      } else if (!row.plan.weeks.length) {
        grid.append(el('div', 'kplan-no-weeks', 'No weeks planned yet. Press Edit to add them.'));
      }
    });
    note.textContent = editing ? 'Changes save as you go.' : 'Tap any piece of knowledge to follow it through the year. Tap a unit to see it week by week.';
    if (!arrived.has(scopeId)) {
      arrived.add(scopeId);
      grid.classList.add('is-arriving');
      window.setTimeout(() => grid.classList.remove('is-arriving'), 1300);
    }
    root.querySelectorAll('textarea').forEach(fit);
    paintTrace();
    if (focusKey) {
      const target = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-focus="${CSS.escape(focusKey)}"]`);
      target?.focus();
      if (refocus && caret !== null && target) target.setSelectionRange(caret, caret);
    }
  }

  const resize = new ResizeObserver(() => {
    if (!root.isConnected) { resize.disconnect(); return; }
    if (trace) drawThread();
  });
  resize.observe(grid);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trace) { trace = null; paintTrace(); }
  });

  render();
}

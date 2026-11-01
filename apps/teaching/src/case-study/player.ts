import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Block } from '@/schemas/block';
import { studentUnitAnthology } from '@/blocks/anthology-load';
import { renderBlock } from '@/blocks/render';
import { casePartOf, isCaseBriefSection, isCaseOutcomeSection } from './model';
import { button, el } from '@/quiz/dom';
import { coach } from '@/sprint/form-kit';
import { buildCaseRail, type CaseRailItem, type CaseRailState } from './rail';
import { helpGuide } from './help';
import { CASE_DOC_LABELS, CASE_REFLECTION_DEFAULT, CASE_STATIONS, CASE_STATION_LABELS, type CaseDoc, type CaseStation, type PublicCase } from './schema';
import type { CaseClient, CaseStatus } from './api';
import '@/sprint/sprint.css';
import './case-study.css';

export type CasePlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  /** Null when opened without a class: the student is asked to open it from their class page. */
  client: CaseClient | null;
  renderHero: (host: HTMLElement) => void;
  /** Reserved for a practice clock; the real time is used when absent. */
  now?: () => number;
};

const POLL_MS = 8000;
const QUOTE_MAX = 280;
const RULE_MAX = 200;
const LETTERS = ['A', 'B', 'C', 'D'];
const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/** What the student has typed and not yet sent. Kept here so a repaint never loses it. */
type Drafts = {
  firstOpt?: string; firstText?: string; firstWhy?: string;
  answers: Record<string, string>;
  decOpt?: string; decText?: string; because?: string; confidence?: number;
  objIndex?: number; objAnswer?: string;
  reflection?: string;
  rule?: { when: string; then: string; unless: string };
  transfer?: string; confirmTransfer?: boolean;
};

const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches;
const paragraphs = (text: string) => text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);

/**
 * One document paragraph. A paragraph of `| a | b |` rows is a table (the first row is
 * the header; a `|---|` row is skipped), `## ` starts a heading, and `NAME: ` at the start
 * of a paragraph is a speaker turn in a transcript. Anything else is plain text.
 */
export function paragraphEl(text: string): HTMLElement {
  const lines = text.split('\n').map((l) => l.trim());
  if (lines.length > 1 && lines.every((l) => l.startsWith('|'))) {
    const cells = (l: string) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const rows = lines.filter((l) => !/^\|[\s:|-]+\|?$/.test(l)).map(cells);
    const wrap = el('div', 'cs-table');
    const table = el('table', '');
    const head = el('tr', '');
    for (const c of rows[0] ?? []) head.append(el('th', '', c));
    const thead = el('thead', '');
    thead.append(head);
    const tbody = el('tbody', '');
    for (const r of rows.slice(1)) {
      const tr = el('tr', '');
      r.forEach((c, i) => tr.append(el(i === 0 ? 'th' : 'td', '', c)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }
  if (text.startsWith('## ')) return el('h4', 'cs-doc__sub', text.slice(3));
  const turn = /^([A-Z][A-Z ]{1,24}):\s+([\s\S]*)$/.exec(text);
  if (turn) {
    const p = el('p', 'cs-turn');
    p.dataset.who = turn[1]!.toLowerCase();
    p.append(el('b', 'cs-turn__who', turn[1]!), document.createTextNode(` ${turn[2]}`));
    return p;
  }
  return el('p', '', text);
}
const clip = (text: string) => (text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
const dayOf = (day: string) => new Date(`${day}T12:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

export function mountCasePlayer(host: HTMLElement, options: CasePlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const cs = lesson.case as PublicCase;
  const pageBlocks = lesson.blocks as Block[];
  // The Brief section's blocks sit in the Brief; every other block is Decide content.
  const briefSection = pageBlocks.find(isCaseBriefSection);
  const briefBlocks = briefSection?.block_type === 'section' ? (briefSection.content.blocks as Block[]) : [];
  const blocks = pageBlocks.filter((b) => !isCaseBriefSection(b) && casePartOf(b) === undefined && !isCaseOutcomeSection(b));
  const outcomeSection = pageBlocks.find(isCaseOutcomeSection);
  const outcomeBlocks = outcomeSection?.block_type === 'section' ? (outcomeSection.content.blocks as Block[]) : [];
  // Each part's blocks (hinges, a reasoning step) sit in the work panel while that part is open.
  const partBlocks = new Map<string, Block[]>();
  for (const b of pageBlocks) {
    const id = casePartOf(b);
    if (id && b.block_type === 'section') partBlocks.set(id, b.content.blocks as Block[]);
  }
  let status: CaseStatus | null = null;
  let chosen: number | null = null;
  let helpOpen = false;
  let pane: 'case' | 'work' = 'work';
  let caseDot = false;
  let showResume = false;
  let firstLoad = true;
  let lastIdx = -1;
  let caseSig = '';
  let gateKey = '';
  let workSig = '';
  let deferred = false;
  let poll = 0;
  let selTimer = 0;
  let disposed = false;
  let loadFailed = false;
  let pending: { doc_id: string; quote: string } | null = null;
  const drafts: Drafts = { answers: {} };
  /** The Brief and Decide blocks are built once so a repaint keeps whatever a student did in them (a recording keeps playing). */
  let blocksEl: HTMLElement | null = null;
  let briefEl: HTMLElement | null = null;
  const partEls = new Map<string, HTMLElement>();
  let outcomeEl: HTMLElement | null = null;
  /** A part's (or the Outcome's) blocks under its documents, built once so a repaint keeps what a student did in them. */
  const partTasks = (id: string): HTMLElement | null => {
    const list = partBlocks.get(id);
    if (!list?.length) return null;
    if (!partEls.has(id)) partEls.set(id, Object.assign(blockList(list), { className: 'cs-blocks cs-tasks' }));
    return partEls.get(id)!;
  };
  const blockList = (list: Block[]) => {
    const wrap = el('div', 'cs-blocks');
    for (const b of list) wrap.append(renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks, loadAnthology: () => studentUnitAnthology(lesson.unit_id) }));
    return wrap;
  };

  const shell = el('div', 'cs');
  const hero = el('div', 'cs__hero');
  options.renderHero(hero);
  const railHost = el('div', 'cs__rail');
  const gate = el('div', 'cs__gate');
  const study = el('div', 'cs__study');
  const caseCol = el('section', 'cs__case');
  caseCol.setAttribute('aria-label', 'The case');
  const caseHead = el('div', 'cs-head');
  const caseTitle = el('h2', '', 'The case');
  caseHead.append(caseTitle);
  const caseBody = el('div', 'cs__docs');
  caseCol.append(caseHead, caseBody);
  const workCol = el('section', 'cs__work');
  workCol.setAttribute('aria-label', 'Your work');
  const errEl = el('p', 'cs-err');
  errEl.setAttribute('role', 'alert');
  const workBody = el('div', 'cs__panelhost');
  workCol.append(el('div', 'cs-head'), errEl, workBody);
  workCol.firstElementChild!.append(el('h2', '', 'Your work'));
  study.append(caseCol, workCol);
  const switchBar = el('div', 'cs-switch');
  const seg = el('span', 'cs-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Show');
  const swCase = el('button', 'cs-seg__btn');
  const swWork = el('button', 'cs-seg__btn', 'Your work');
  for (const b of [swCase, swWork]) b.type = 'button';
  swCase.addEventListener('click', () => setPane('case'));
  swWork.addEventListener('click', () => setPane('work'));
  seg.append(swCase, swWork);
  switchBar.append(seg);
  const pop = el('button', 'cs-pop', 'Use as evidence');
  pop.type = 'button';
  pop.hidden = true;
  shell.append(hero, railHost, gate, study, switchBar);
  host.replaceChildren(shell);
  document.body.append(pop);

  // ------------------------------------------------------------ state helpers

  const index = (key: CaseStation) => CASE_STATIONS.indexOf(key);
  /** The stations this case runs: Rules drops off when the teacher turns it off. */
  const stations = cs.rules_off ? CASE_STATIONS.filter((k) => k !== 'rules') : CASE_STATIONS;
  const locked = () => !!status?.work.decision;
  const stationDone = (s: CaseStatus, i: number) => s.done.includes(CASE_STATIONS[i]!) || (i < 2 && !!s.work.decision);

  /** Open at the highest open station with unfinished work, or where the student chose to be. */
  function currentIndex(s: CaseStatus): number {
    if (chosen !== null && chosen <= s.open_to) return chosen;
    for (let i = s.open_to; i >= 0; i--) if (!stationDone(s, i) && (i <= 2 || s.work.decision)) return i;
    return s.open_to;
  }

  const optionLabel = (d: { option_id?: string; text?: string } | undefined): string => {
    if (!d) return '';
    const at = cs.decision.options.findIndex((o) => o.id === d.option_id);
    return at >= 0 ? `${LETTERS[at]} · ${cs.decision.options[at]!.label}` : d.text ?? '';
  };
  const sameChoice = (a: { option_id?: string; text?: string }, b: { option_id?: string; text?: string }) =>
    a.option_id ? a.option_id === b.option_id : (a.text ?? '').trim().toLowerCase() === (b.text ?? '').trim().toLowerCase();

  function setPane(next: 'case' | 'work'): void {
    pane = next;
    if (next === 'case') caseDot = false;
    paintSwitch();
    window.scrollTo?.({ top: 0 });
  }

  async function run(go: () => Promise<CaseStatus>, btn?: HTMLButtonElement): Promise<void> {
    if (!client) return;
    errEl.textContent = '';
    if (btn) btn.disabled = true;
    try {
      const next = await go();
      showResume = false;
      apply(next, true);
    } catch (e) {
      errEl.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
      if (btn) btn.disabled = false;
    }
  }

  function apply(next: CaseStatus, force = false): void {
    const prev = status;
    status = next;
    if (prev) {
      if (next.open_to > prev.open_to && chosen === prev.open_to) chosen = null;
      if (next.parts.length > prev.parts.length || (!prev.outcome && next.outcome)) caseDot = pane === 'work';
    }
    paint(force);
  }

  // ------------------------------------------------------------ small builders

  function note(text: string, cls = 'cs-note'): HTMLElement {
    return el('p', cls, text);
  }
  function wait(text: string): HTMLElement {
    const w = el('div', 'cs-wait');
    w.append(el('span', 'cs-wait__dot'), el('span', '', text));
    return w;
  }
  function area(label: string, value: string, max: number, onInput: (v: string) => void, opts: { placeholder?: string; disabled?: boolean; rows?: number } = {}): HTMLTextAreaElement {
    const t = el('textarea', 'qz-input cs-input');
    t.rows = opts.rows ?? 3;
    t.maxLength = max;
    t.value = value;
    t.disabled = !!opts.disabled;
    t.placeholder = opts.placeholder ?? '';
    t.setAttribute('aria-label', label);
    t.addEventListener('input', () => onInput(t.value));
    return t;
  }
  function optionCards(selected: string | undefined, onPick: (id: string) => void, disabled = false): HTMLElement {
    const box = el('div', 'cs-opts');
    box.setAttribute('role', 'group');
    cs.decision.options.forEach((o, i) => {
      const b = el('button', 'cs-opt');
      b.type = 'button';
      b.disabled = disabled;
      b.setAttribute('aria-pressed', String(o.id === selected));
      const body = el('span', '');
      body.append(el('b', '', o.label));
      if (o.detail) body.append(el('span', 'cs-opt__d', o.detail));
      b.append(el('span', 'cs-opt__k', LETTERS[i]), body);
      b.addEventListener('click', () => onPick(o.id));
      box.append(b);
    });
    return box;
  }
  function bar(pct: number): HTMLElement {
    const b = el('div', 'cs-bar');
    const fill = el('span');
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    b.append(fill);
    return b;
  }

  /** One work panel: the station name, a ? that opens the coach, then the content. */
  function panel(key: CaseStation, eyebrow: string): HTMLElement {
    const box = el('div', 'cs-panel');
    const top = el('div', 'cs-panel__top');
    const help = el('button', 'cs-help', '?');
    help.type = 'button';
    help.setAttribute('aria-label', 'Help with this step');
    help.setAttribute('aria-expanded', String(helpOpen));
    help.addEventListener('click', () => { helpOpen = !helpOpen; paintWork(true); });
    top.append(el('p', 'cs-panel__eyebrow', eyebrow), help);
    box.append(top);
    if (showResume) box.append(note('Back where you left off', 'cs-resume'));
    if (helpOpen) box.append(coach(helpGuide(key, cs.help?.[key])));
    return box;
  }

  function evidencePad(s: CaseStatus, removable: boolean): HTMLElement {
    const list = el('div', 'cs-evidence');
    list.setAttribute('aria-label', 'Your evidence');
    const evidence = s.work.evidence ?? [];
    if (!evidence.length) list.append(note('Select a line in the case, then choose Use as evidence.', 'cs-hint'));
    for (const ev of evidence) {
      const chip = el('div', 'cs-ev');
      const text = el('div', '', `“${ev.quote}”`);
      text.append(el('small', '', sourceOf(s, ev.doc_id)));
      chip.append(text);
      if (removable) {
        const x = el('button', '', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove this quote');
        x.addEventListener('click', () => void run(() => client!.save({ kind: 'evidence_remove', id: ev.id }), x));
        chip.append(x);
      }
      list.append(chip);
    }
    return list;
  }

  function sourceOf(s: CaseStatus, docId: string): string {
    const doc = s.parts.flatMap((p) => p.docs).find((d) => d.id === docId);
    return doc ? `${CASE_DOC_LABELS[doc.kind]} · ${doc.source || doc.title}` : '';
  }

  function decisionCard(d: NonNullable<CaseStatus['work']['decision']>): HTMLElement {
    const card = el('div', 'cs-decision');
    const top = el('div', 'cs-decision__top');
    top.insertAdjacentHTML('beforeend', LOCK_ICON);
    top.append(`Locked at ${timeOf(d.locked_at)}`);
    card.append(top, el('div', 'cs-decision__choice', optionLabel(d)), bar(d.confidence));
    const conf = el('div', 'cs-decision__conf');
    conf.append(el('span', '', 'How sure'), el('span', '', `${d.confidence}%`));
    card.append(conf);
    if (d.because) card.append(el('p', 'cs-decision__because', `Because ${d.because}`));
    return card;
  }

  /** Own pace: the button to the next station once this one is done. Teacher pace: a waiting note. */
  function pacing(s: CaseStatus, i: number): HTMLElement | null {
    if (i >= stations.length - 1 || !s.done.includes(CASE_STATIONS[i]!) || i < s.open_to) return null;
    const next = CASE_STATION_LABELS[CASE_STATIONS[i + 1]!];
    if (cs.pace === 'own') {
      const row = el('div', 'cs-row');
      row.append(button(`Next: ${next}`, 'primary', function () { void run(() => client!.advance(), this); }));
      return row;
    }
    return wait(i === 2 ? 'Your teacher shows the outcome to everyone at once.' : `Your teacher moves the class on to ${next}.`);
  }

  // ------------------------------------------------------------ work panels

  function briefPanel(s: CaseStatus): HTMLElement {
    const box = panel('brief', 'Brief');
    if (briefBlocks.length) box.append(briefEl ??= blockList(briefBlocks));
    box.append(el('p', 'cs-ask', cs.decision.prompt));
    const take = s.work.first_take;
    if (take) {
      box.append(el('h3', '', optionLabel(take)), el('p', '', take.why), note('Kept for later. You’ll see it again beside the outcome.', 'cs-hint'));
      const next = pacing(s, 0);
      if (next) box.append(next);
      return box;
    }
    box.append(note('Your first take, before you read the case. Go with what you know.', 'cs-hint'));
    const free = cs.decision.options.length === 0;
    const save = button('Save my first take', 'primary', function () {
      void run(() => client!.save({ kind: 'first_take', ...(free ? { text: drafts.firstText!.trim() } : { option_id: drafts.firstOpt }), why: (drafts.firstWhy ?? '').trim() }), this);
    });
    const sync = () => { save.disabled = free ? !(drafts.firstText ?? '').trim() : !drafts.firstOpt; };
    if (free) box.append(area('Your first take', drafts.firstText ?? '', 300, (v) => { drafts.firstText = v; sync(); }, { placeholder: 'What would you do?' }));
    else box.append(optionCards(drafts.firstOpt, (id) => { drafts.firstOpt = id; paintWork(true); }));
    box.append(area('Why?', drafts.firstWhy ?? '', 300, (v) => { drafts.firstWhy = v; }, { placeholder: 'One line: why?', rows: 2 }));
    const row = el('div', 'cs-row');
    row.append(save);
    sync();
    box.append(row);
    return box;
  }

  function casePanel(s: CaseStatus): HTMLElement {
    const latest = s.parts.at(-1);
    const box = panel('case', s.parts_total > 1 ? `Part ${s.parts.length}${s.parts.length < s.parts_total ? '' : ' (last)'}` : 'The case');
    if (!latest) {
      box.append(note('The case opens soon.'));
      return box;
    }
    for (const p of s.parts.slice(0, -1)) {
      if (p.question) box.append(el('p', 'cs-hint', p.question), el('p', 'cs-saved', s.work.answers?.[p.id] ?? ''));
    }
    const remaining = s.parts.length < s.parts_total;
    if (partBlocks.get(latest.id)?.length) box.append(note(`Work through the tasks under Part ${s.parts.length} in the case first.`, 'cs-hint'));
    if (!latest.question) {
      box.append(el('h3', '', 'Read the documents'), note('Collect evidence as you read. It comes with you when you decide.', 'cs-hint'), evidencePad(s, true));
      const next = pacing(s, 1);
      if (next) box.append(next);
      return box;
    }
    const saved = s.work.answers?.[latest.id] ?? '';
    const text = drafts.answers[latest.id] ?? saved;
    box.append(el('h3', '', latest.question), note('Back it with a line from the case.', 'cs-hint'), evidencePad(s, true));
    box.append(area('Your answer', text, 1500, (v) => { drafts.answers[latest.id] = v; sync(); }, { placeholder: 'My answer…' }));
    const row = el('div', 'cs-row');
    const own = cs.pace === 'own';
    const label = remaining && own ? (text.trim() === saved && saved ? `Open part ${s.parts.length + 1}` : `Answer and open part ${s.parts.length + 1}`) : 'Save answer';
    const go = button(label, 'primary', function () {
      void run(async () => {
        let next = s;
        const now = (drafts.answers[latest.id] ?? text).trim();
        if (now !== saved || !remaining || !own) next = await client!.save({ kind: 'answer', part_id: latest.id, text: now });
        return remaining && own ? client!.nextPart() : next;
      }, this);
    });
    const sync = () => { go.disabled = !(drafts.answers[latest.id] ?? text).trim(); };
    sync();
    row.append(go);
    box.append(row);
    if (remaining && !own && saved) box.append(wait(`Sent. Part ${s.parts.length + 1} opens when your teacher is ready.`));
    const next = pacing(s, 1);
    if (next) box.append(next);
    return box;
  }

  function objectionCard(s: CaseStatus): HTMLElement | null {
    if (!s.objections?.length || s.work.objection) return null;
    const card = el('div', 'cs-objection');
    card.append(el('p', 'cs-panel__eyebrow', 'Before the outcome: someone disagrees with you'), note('Pick one challenge to your decision and answer it.', 'cs-hint'));
    const pick = el('div', 'cs-opts');
    const chosenAt = drafts.objIndex ?? 0;
    s.objections.forEach((text, i) => {
      const b = el('button', 'cs-opt');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === chosenAt));
      b.append(el('span', 'cs-opt__k', String(i + 1)), el('span', '', text));
      b.addEventListener('click', () => { drafts.objIndex = i; paintWork(true); });
      pick.append(b);
    });
    const send = button('Send', 'primary', function () {
      void run(() => client!.save({ kind: 'objection', index: chosenAt, answer: (drafts.objAnswer ?? '').trim() }), this);
    });
    const sync = () => { send.disabled = !(drafts.objAnswer ?? '').trim(); };
    sync();
    const answer = area('Your answer to the objection', drafts.objAnswer ?? '', 1500, (v) => { drafts.objAnswer = v; sync(); }, { placeholder: 'Answer it. Your decision stays locked; your answer defends it.' });
    const row = el('div', 'cs-row');
    row.append(send);
    card.append(pick, answer, row);
    return card;
  }

  function decidePanel(s: CaseStatus): HTMLElement {
    const d = s.work.decision;
    const box = panel('decide', d ? 'Decided' : 'Decide');
    if (d) {
      box.append(el('h3', '', 'Your decision is locked'), decisionCard(d), note('It stays as it is. You’ll see it beside what actually happened.', 'cs-hint'));
      box.append(evidencePad(s, false));
      const objection = objectionCard(s);
      if (!s.outcome && s.held_until) box.append(note(`Your teacher is holding the Outcome until ${dayOf(s.held_until)}.`, 'cs-wait cs-wait--plain'));
      else if (objection) box.append(objection);
      const next = pacing(s, 2);
      if (next && !objection) box.append(next);
      return box;
    }
    if (blocks.length) {
      box.append(blocksEl ??= blockList(blocks));
    }
    box.append(el('h3', '', cs.decision.prompt), note('Once you lock it in, it can’t change.', 'cs-hint'));
    const free = cs.decision.options.length === 0;
    const confidence = drafts.confidence ?? 60;
    const lock = button('Lock in my decision', 'primary', function () {
      void run(() => client!.lock({ ...(free ? { text: (drafts.decText ?? '').trim() } : { option_id: drafts.decOpt }), because: (drafts.because ?? '').trim(), confidence: drafts.confidence ?? 60 }), this);
    });
    const sync = () => { lock.disabled = !((free ? (drafts.decText ?? '').trim() : drafts.decOpt) && (drafts.because ?? '').trim()); };
    if (free) box.append(area('Your decision', drafts.decText ?? '', 300, (v) => { drafts.decText = v; sync(); }, { placeholder: 'What do you decide?', rows: 2 }));
    else box.append(optionCards(drafts.decOpt, (id) => { drafts.decOpt = id; paintWork(true); }));
    const conf = el('div', 'cs-conf');
    const readout = el('span', '', `${confidence}%`);
    const top = el('div', 'cs-conf__top');
    top.append(el('span', '', 'How sure are you?'), readout);
    const range = el('input');
    range.type = 'range';
    range.min = '0'; range.max = '100'; range.step = '5';
    range.value = String(confidence);
    range.setAttribute('aria-label', 'How sure are you');
    range.addEventListener('input', () => { drafts.confidence = Number(range.value); readout.textContent = `${range.value}%`; });
    const ends = el('div', 'cs-conf__ends');
    ends.append(el('span', '', 'A guess'), el('span', '', 'Certain'));
    conf.append(top, range, ends);
    box.append(conf, area('Because…', drafts.because ?? '', 1500, (v) => { drafts.because = v; sync(); }, { placeholder: 'Because…' }), evidencePad(s, true));
    const row = el('div', 'cs-row');
    row.append(lock);
    sync();
    box.append(row);
    return box;
  }

  function spreadView(s: CaseStatus): HTMLElement {
    const sp = s.spread!;
    const wrap = el('div', 'cs-spread');
    wrap.append(el('p', 'cs-panel__eyebrow', 'Where the class landed'));
    if (sp.early) {
      wrap.append(note('You’re early. Come back later to see where others landed.', 'cs-hint'));
      return wrap;
    }
    const mine = s.work.decision;
    const rows = cs.decision.options.length ? cs.decision.options.map((o, i) => ({ id: o.id, label: `${LETTERS[i]} · ${o.label}` })) : Object.keys(sp.options).map((id) => ({ id, label: id }));
    for (const r of rows) {
      const n = sp.options[r.id] ?? 0;
      const line = el('div', 'cs-spread__row');
      if (mine && (mine.option_id === r.id || (!mine.option_id && sameChoice(mine, { text: r.id })))) line.dataset.mine = 'true';
      const head = el('div', 'cs-spread__head');
      head.append(el('span', '', r.label), el('span', '', String(n)));
      line.append(head, bar(sp.total ? (n / sp.total) * 100 : 0));
      wrap.append(line);
    }
    wrap.append(note(`${sp.total} decided${sp.confidence_avg !== null ? `, about ${Math.round(sp.confidence_avg)}% sure on average` : ''}. The highlighted option is yours. No names.`, 'cs-hint'));
    return wrap;
  }

  function outcomePanel(s: CaseStatus): HTMLElement {
    const box = panel('outcome', 'Outcome');
    const d = s.work.decision;
    if (!s.outcome || !d) {
      box.append(el('h3', '', 'The outcome is on its way'));
      box.append(s.held_until ? note(`Your teacher is holding the Outcome until ${dayOf(s.held_until)}.`, 'cs-wait cs-wait--plain') : wait('Your teacher shows the outcome to everyone at once.'));
      return box;
    }
    box.append(el('h3', '', 'Your decision beside what happened'));
    const take = s.work.first_take;
    const changed = !!take && !sameChoice(take, d);
    const cmp = el('div', 'cs-compare');
    const a = el('div', changed ? 'cs-compare__changed' : '');
    a.append(el('b', '', 'First take'), take ? optionLabel(take) : '—');
    const b = el('div', '');
    b.append(el('b', '', 'Locked in'), `${optionLabel(d)} · ${d.confidence}% sure`);
    cmp.append(a, b);
    box.append(cmp, decisionCard(d));
    if (s.spread) box.append(spreadView(s));
    const objection = objectionCard(s);
    if (objection) box.append(objection);
    const next = pacing(s, 3) ?? (cs.rules_off && s.done.includes('outcome') ? note('That’s the end of the case.', 'cs-hint') : null);
    const ask = cs.reflection;
    if (ask?.off) {
      if (next) box.append(next);
      return box;
    }
    const question = ask?.question.trim() || CASE_REFLECTION_DEFAULT;
    box.append(el('p', 'cs-panel__eyebrow', question));
    if (question === CASE_REFLECTION_DEFAULT) box.append(note('The documents you didn’t cite are marked in the case.', 'cs-hint'));
    const saved = s.work.reflection ?? '';
    const text = drafts.reflection ?? saved;
    const send = button(saved ? 'Update reflection' : 'Save reflection', 'primary', function () {
      void run(() => client!.save({ kind: 'reflection', text: (drafts.reflection ?? text).trim() }), this);
    });
    const sync = () => { send.disabled = !(drafts.reflection ?? text).trim(); };
    sync();
    box.append(area(question, text, 1500, (v) => { drafts.reflection = v; sync(); }, question === CASE_REFLECTION_DEFAULT ? { placeholder: 'The document I skipped showed…' } : {}));
    const row = el('div', 'cs-row');
    row.append(send);
    box.append(row);
    if (next) box.append(next);
    return box;
  }

  function rulesPanel(s: CaseStatus): HTMLElement {
    const box = panel('rules', 'Your rule of thumb');
    box.append(el('h3', '', 'What would you tell the next person making this call?'));
    const saved = s.work.rule;
    const rule = (drafts.rule ??= { when: saved?.when ?? '', then: saved?.then ?? '', unless: saved?.unless ?? '' });
    const send = button(saved ? 'Update my rule' : 'Send to the class rules', 'primary', function () {
      void run(() => client!.save({ kind: 'rule', when: rule.when.trim(), then: rule.then.trim(), unless: rule.unless.trim() }), this);
    });
    const sync = () => { send.disabled = !(rule.when.trim() && rule.then.trim() && rule.unless.trim()); };
    const frame = el('div', 'cs-frame');
    const field = (label: string, key: 'when' | 'then' | 'unless', hint: string) => {
      const l = el('label', '', label);
      const i = el('input', 'qz-input');
      i.maxLength = RULE_MAX;
      i.value = rule[key];
      i.placeholder = hint;
      i.addEventListener('input', () => { rule[key] = i.value; sync(); });
      l.append(i);
      frame.append(l);
    };
    field('When…', 'when', 'a risk builds slowly');
    field('…this tends to follow', 'then', 'people treat each year as normal');
    field('…as long as', 'unless', 'nothing breaks in the year they look at');
    box.append(frame);
    const row = el('div', 'cs-row');
    row.append(send);
    sync();
    box.append(row);
    if (saved) box.append(note('Sent to the class rules.', 'cs-hint'));
    if (s.transfer) box.append(transferView(s, s.transfer));
    return box;
  }

  function transferView(s: CaseStatus, t: NonNullable<CaseStatus['transfer']>): HTMLElement {
    const wrap = el('div', 'cs-transfer');
    wrap.append(el('p', 'cs-panel__eyebrow', 'An unseen case, on your own'), el('h3', '', t.question));
    const sent = s.work.transfer;
    if (sent) {
      wrap.append(el('p', 'cs-saved', sent.answer), wait(`Sent at ${timeOf(sent.sent_at)}. It stays as you sent it.`));
      return wrap;
    }
    const go = button('Send my answer', 'primary', () => { drafts.confirmTransfer = true; paintWork(true); });
    const sync = () => { go.disabled = !(drafts.transfer ?? '').trim(); };
    wrap.append(area('Your answer to the unseen case', drafts.transfer ?? '', 3000, (v) => { drafts.transfer = v; sync(); }, { placeholder: 'Which rule helped? Say how…', rows: 5 }));
    sync();
    const row = el('div', 'cs-row');
    if (drafts.confirmTransfer && (drafts.transfer ?? '').trim()) {
      row.append(el('span', 'cs-confirm', 'Once you send it, it can’t change. Send now?'));
      row.append(button('Yes, send', 'primary', function () { void run(() => client!.save({ kind: 'transfer', answer: (drafts.transfer ?? '').trim() }), this); }));
      row.append(button('Keep editing', 'ghost', () => { drafts.confirmTransfer = false; paintWork(true); }));
    } else row.append(go);
    wrap.append(row);
    return wrap;
  }

  // ------------------------------------------------------------ case column

  function docCard(s: CaseStatus, doc: CaseDoc, cite: boolean, cited: Set<string>): HTMLElement {
    const card = el('article', 'cs-doc');
    card.dataset.doc = doc.id;
    const head = el('div', 'cs-doc__head');
    head.append(el('span', `cs-chip cs-chip--${doc.kind}`, CASE_DOC_LABELS[doc.kind]));
    if (doc.source) head.append(el('span', 'cs-doc__from', doc.source));
    if (s.outcome && !cite && s.not_used.includes(doc.id) && !cited.has(doc.id)) head.append(el('span', 'cs-doc__unused', 'Not used'));
    else if (cited.has(doc.id)) head.append(el('span', 'cs-doc__cited', 'Cited'));
    card.append(head, el('h3', '', doc.title));
    const body = el('div', 'cs-doc__body');
    for (const text of paragraphs(doc.text)) {
      const row = el('div', 'cs-para');
      row.append(paragraphEl(text));
      if (cite && client) {
        const c = el('button', 'cs-para__cite', 'Cite');
        c.type = 'button';
        c.setAttribute('aria-label', `Cite this paragraph from ${doc.title}`);
        c.addEventListener('click', () => addEvidence(doc.id, clip(text)));
        row.append(c);
      }
      body.append(row);
    }
    card.append(body);
    return card;
  }

  function closedCard(title: string, line: string): HTMLElement {
    const c = el('div', 'cs-locked');
    c.insertAdjacentHTML('beforeend', LOCK_ICON);
    const text = el('div', '');
    text.append(el('b', '', title), el('span', '', line));
    c.append(text);
    return c;
  }

  function paintCase(s: CaseStatus, idx: number): void {
    const cited = new Set((s.work.evidence ?? []).map((e) => e.doc_id));
    const sig = JSON.stringify([idx, s.parts, s.parts_total, s.outcome, s.not_used, [...cited], locked(), s.transfer]);
    if (sig === caseSig) return;
    caseSig = sig;
    hidePop();
    const showOutcome = idx === 3 && !!s.outcome;
    const cite = !!client && (idx === 1 || idx === 2) && !locked();
    caseTitle.textContent = idx === 4 ? 'The unseen case' : 'The case';
    const out: HTMLElement[] = [];
    if (idx === 4) {
      if (s.transfer) {
        out.push(el('p', 'cs-part-label', s.transfer.title));
        for (const d of s.transfer.docs) out.push(docCard(s, d, false, new Set()));
      } else out.push(closedCard('The unseen case', 'It opens once you reach the rules.'));
    } else if (!s.parts.length) {
      out.push(closedCard('The case opens after your first take', cs.pace === 'own' ? 'Save your first take, then move on.' : 'Your teacher opens it for the class.'));
    } else {
      if (showOutcome) {
        const o = s.outcome!;
        const card = el('article', 'cs-doc cs-doc--outcome');
        const head = el('div', 'cs-doc__head');
        head.append(el('span', 'cs-chip cs-chip--outcome', 'What happened'));
        card.append(head);
        for (const text of paragraphs(o.text)) card.append(el('p', '', text));
        card.append(el('p', 'cs-doc__source', `Source: ${o.source}`));
        out.push(card);
        if (outcomeBlocks.length) out.push(outcomeEl ??= Object.assign(blockList(outcomeBlocks), { className: 'cs-blocks cs-tasks' }));
        out.push(el('p', 'cs-part-label', 'The case you worked from'));
      }
      const layered = s.parts_total > 1;
      s.parts.forEach((p, i) => {
        if (layered) out.push(el('p', 'cs-part-label', `Part ${i + 1} · ${p.title}`));
        for (const d of p.docs) out.push(docCard(s, d, cite, cited));
        const tasks = partTasks(p.id);
        if (tasks) out.push(tasks);
      });
      for (let i = s.parts.length; i < s.parts_total; i++) {
        out.push(el('p', 'cs-part-label', `Part ${i + 1}`));
        out.push(closedCard(cs.part_titles[i] ?? `Part ${i + 1}`, cs.pace === 'own' ? `Opens when you answer the part ${i} question.` : 'Your teacher opens this part.'));
      }
    }
    caseBody.replaceChildren(...out);
  }

  // ------------------------------------------------------------ evidence by selection

  function addEvidence(docId: string, quote: string): void {
    if (!client) return;
    if (isPhone()) pane = 'work';
    void run(() => client.save({ kind: 'evidence', doc_id: docId, quote }));
  }

  function hidePop(): void {
    pop.hidden = true;
    pending = null;
  }

  function checkSelection(): void {
    const sel = window.getSelection?.();
    const idx = status ? currentIndex(status) : -1;
    if (!client || !sel || sel.isCollapsed || !sel.rangeCount || (idx !== 1 && idx !== 2) || locked()) return hidePop();
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const at = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const body = at?.closest('.cs-doc__body');
    const doc = body?.closest<HTMLElement>('[data-doc]');
    const text = sel.toString().trim().replace(/\s+/g, ' ');
    if (!body || !doc || !caseCol.contains(body) || text.length < 4) return hidePop();
    pending = { doc_id: doc.dataset.doc!, quote: clip(text) };
    const r = range.getBoundingClientRect?.();
    pop.hidden = false;
    if (r) {
      pop.style.top = `${r.bottom + window.scrollY + 8}px`;
      pop.style.left = `${Math.max(12, Math.min(window.innerWidth - 170, r.left + window.scrollX))}px`;
    }
  }
  const onSelectionChange = () => {
    window.clearTimeout(selTimer);
    selTimer = window.setTimeout(checkSelection, 200);
  };
  document.addEventListener('selectionchange', onSelectionChange);
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('click', () => {
    const p = pending;
    if (!p) return;
    window.getSelection?.()?.removeAllRanges();
    hidePop();
    addEvidence(p.doc_id, p.quote);
  });

  // ------------------------------------------------------------ rail, switch, paint

  function stationNote(s: CaseStatus, key: CaseStation): string {
    const d = s.work.decision;
    switch (key) {
      case 'brief': return s.work.first_take ? 'First take in' : 'Your first take';
      case 'case':
        if (!s.parts.length) return s.parts_total > 1 ? `${s.parts_total} parts` : 'The documents';
        return s.parts.length < s.parts_total ? `Part ${s.parts.length + 1} to come` : `${s.parts.reduce((n, p) => n + p.docs.length, 0)} documents`;
      case 'decide': return d ? `Locked ${timeOf(d.locked_at)}` : 'Lock it in';
      case 'outcome':
        if (s.outcome) return 'What happened';
        if (s.held_until) return `Held until ${dayOf(s.held_until)}`;
        if (!d) return 'After you decide';
        return cs.pace === 'own' ? (cs.has_objections && !s.work.objection ? 'After one objection' : 'Opens soon') : 'Teacher shows it';
      case 'rules': return s.work.transfer ? 'Sent' : 'Rule and unseen case';
    }
  }

  function paintRail(s: CaseStatus, idx: number): void {
    const items: CaseRailItem[] = stations.map((key, i) => {
      const state: CaseRailState = i === idx ? 'now' : i > s.open_to ? 'later' : stationDone(s, i) ? 'in' : 'open';
      return { key, state, note: stationNote(s, key) };
    });
    railHost.replaceChildren(buildCaseRail(items, (key) => {
      chosen = index(key);
      showResume = false;
      helpOpen = false;
      pane = key === 'case' || key === 'rules' ? 'case' : 'work';
      if (pane === 'case') caseDot = false;
      if (status) paint(true);
    }));
  }

  function paintSwitch(): void {
    study.dataset.pane = pane;
    const idx = status ? currentIndex(status) : 0;
    swCase.replaceChildren(idx === 4 ? 'The unseen case' : 'The case');
    if (caseDot && pane === 'work') swCase.append(el('span', 'cs-seg__new'));
    swCase.setAttribute('aria-pressed', String(pane === 'case'));
    swWork.setAttribute('aria-pressed', String(pane === 'work'));
  }

  const typing = () => {
    const a = document.activeElement;
    return !!a && workCol.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT');
  };

  function paintWork(force = false): void {
    if (disposed || !status) return;
    const s = status;
    const idx = currentIndex(s);
    const sig = JSON.stringify([idx, helpOpen, showResume, drafts.confirmTransfer, drafts.objIndex, s]);
    if (!force && sig === workSig) return;
    // A poll never rebuilds a form while the student is typing in it; it waits for them to finish.
    if (!force && typing()) { deferred = true; return; }
    workSig = sig;
    deferred = false;
    const key = CASE_STATIONS[idx]!;
    const make = { brief: briefPanel, case: casePanel, decide: decidePanel, outcome: outcomePanel, rules: rulesPanel }[key];
    workBody.replaceChildren(make(s));
  }

  workCol.addEventListener('focusout', () => {
    window.setTimeout(() => { if (deferred && !typing()) paintWork(); }, 0);
  });

  function claimForm(): HTMLElement {
    const f = el('form', 'sprint-claim');
    const input = el('input', 'qz-input');
    input.maxLength = 5;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--primary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'sprint-claim__err');
    err.setAttribute('role', 'alert');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!client) return;
      try {
        const next = await client.claim(input.value.trim());
        if (next.identity.need === 'initials') err.textContent = 'Those initials aren’t on your class list. Check them and try again.';
        else apply(next, true);
      } catch (error) {
        err.textContent = error instanceof Error ? error.message : 'That didn’t work. Try again.';
      }
    });
    f.append(el('p', '', 'Type your initials to start the case.'), input, go, err);
    return f;
  }

  function gateMessage(s: CaseStatus | null): HTMLElement | null {
    if (!client) return note('Open this case from your class page.');
    if (!s) return note(loadFailed ? 'This case couldn’t be loaded. Check your connection and it will try again.' : 'Loading…');
    if (s.identity.need === 'initials') return claimForm();
    if (s.not_for_you) return note('This case is set for other classes. Ask your teacher where to find yours.');
    if (s.anonymous || s.identity.need === 'class') return note(s.identity.need === 'class' ? 'Open this case from your class page.' : 'Your teacher hasn’t added a class list yet.');
    return null;
  }

  function paint(forceWork = false): void {
    if (disposed) return;
    const blocked = gateMessage(status);
    study.hidden = !!blocked;
    railHost.hidden = !!blocked;
    switchBar.hidden = !!blocked;
    gate.hidden = !blocked;
    if (blocked) {
      // The initials form stays put while polling, so what is typed in it is kept.
      const key = blocked.tagName === 'FORM' ? 'claim' : blocked.textContent ?? '';
      if (key !== gateKey) gate.replaceChildren(blocked);
      gateKey = key;
      return;
    }
    if (!status) return;
    gateKey = '';
    gate.replaceChildren();
    const s = status;
    const idx = currentIndex(s);
    if (firstLoad) {
      firstLoad = false;
      showResume = idx > 0 || !!s.work.first_take;
      pane = idx === 1 || idx === 4 ? 'case' : 'work';
    }
    if (idx !== lastIdx) {
      if (lastIdx !== -1) helpOpen = false;
      lastIdx = idx;
    }
    paintRail(s, idx);
    paintCase(s, idx);
    paintWork(forceWork);
    paintSwitch();
  }

  async function refresh(): Promise<void> {
    if (!client || disposed) return;
    try {
      const next = await client.status();
      loadFailed = false;
      apply(next);
    } catch {
      // The next poll tries again. Until a first status arrives, say so rather than leaving "Loading…" up forever.
      if (!status && !loadFailed) {
        loadFailed = true;
        paint();
      }
    }
  }

  paint();
  if (client) {
    void refresh();
    poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, POLL_MS);
  }

  return {
    dispose() {
      disposed = true;
      window.clearInterval(poll);
      window.clearTimeout(selTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      pop.remove();
    }
  };
}

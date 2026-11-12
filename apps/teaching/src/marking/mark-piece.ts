/**
 * Teacher marking screen for one handed-in piece of typed work: tap a code, select the student's
 * words to tag them, place the piece on each criterion's steps, write a comment, then Return.
 * The same codes and highlights the viva marker uses; the steps set where the student sits, the codes do not.
 */
import { el, button } from '@/quiz/dom';
import { paper, offsetOf, trimRange, type Mark } from '@/blocks/peer-annotate';
import { drawPick, pickCaption, pickMark, placedPick, stepHead, type StepPick } from './step-pick';
import type { Rubric } from './rubric-model';
import { mountRubricPanel, type RubricAiRead, type RubricPanel, type RubricSetup } from './rubric-panel';
import { changesSheet } from './draft-diff';
import './marking.css';

type Criterion = { id: string; label: string; outcomes: string[]; concepts: string[]; skill?: string };
type Code = { id: string; code: string; label: string; colour: string; group: string; descriptor: string; strength_descriptor?: string };
type Tag = { code_id: string; positive: boolean; part: string; field: string; start: number; end: number; note?: string };
/** A code the AI suggests on the student's words: dashed until the teacher keeps it, and never saved otherwise. */
export type SuggestedMarkTag = { code_id: string; part: string; field: string; start: number; end: number; why?: string };
type ShownTag = Tag & { ai?: boolean; why?: string };
export type RedraftScope = 'whole' | { part: string; field: string; start: number; end: number };
export type EarlierDraft = { n: number; text: Record<string, Record<string, string>>; tags: Tag[]; comment: string; returned_at: string; steps: Record<string, string>; scope: RedraftScope | null };
export type MarkPieceData = {
  column: { id: string; title: string; criteria: Criterion[]; piece?: { lesson_id: string; block_id: string } };
  student: { id: string; initials: string; name: string };
  text: Record<string, Record<string, string>>;
  /** The student's own next-step picks, by the answer each sits in. */
  steps?: Array<{ part: string; field: string; pick: StepPick }>;
  feedback: { tags: Tag[]; comment: string; status: 'draft' | 'returned'; rubric?: Rubric } | null;
  mark: { steps?: Record<string, string> } | null;
  codes: Code[];
  recent_codes: string[][];
  position: { index: number; total: number };
  draft?: number;
  drafts?: EarlierDraft[];
  redraft?: { scope: RedraftScope; asked_at: string };
};
export type MarkPieceActions = {
  save: (body: { tags: Tag[]; comment: string; steps: Record<string, string>; rubric?: Rubric | null; today?: string }) => Promise<unknown>;
  returnIt: (ask?: { redraft: { scope: RedraftScope } }) => Promise<unknown>;
  takeBack: () => Promise<unknown>;
  move: (by: -1 | 1) => void;
};

const STEPS = [['starting', 'Starting'], ['building', 'Building'], ['secure', 'Secure'], ['extending', 'Extending']] as const;
const RUNGS = [['capable', 'Capable'], ['skilled', 'Skilled'], ['accomplished', 'Accompl.'], ['excellent', 'Excellent']] as const;
const first = (name: string) => name.split(' ')[0] ?? name;

const MENU_GAP = 6;

/** The part of the window `node` can actually be seen in, inside any scrolling box around it. */
function visibleBand(node: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let at: HTMLElement | null = node; at; at = at.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(at).overflowY)) continue;
    const r = at.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, bottom };
}

/** A rough selection grows to the whole words it touches, so a highlight never stops mid-word. */
export function wholeWords(text: string, r: { start: number; end: number } | null): { start: number; end: number } | null {
  if (!r) return null;
  let { start, end } = r;
  while (start > 0 && /[\p{L}\p{N}'’]/u.test(text[start - 1]!)) start--;
  while (end < text.length && /[\p{L}\p{N}'’]/u.test(text[end]!)) end++;
  return { start, end };
}

/**
 * Where a selection point falls in a sheet's text. A drag often starts or ends on the space between
 * sentences, past a paragraph's end, or at the start of the next paragraph: none of those sit inside
 * a run, so the point snaps to the nearest run edge rather than the whole selection being dropped.
 */
export function pointIn(sheet: HTMLElement, node: Node, offset: number): number | null {
  const exact = offsetOf(node, offset);
  if (exact !== null && sheet.contains(node)) return exact;
  const runs = [...sheet.querySelectorAll<HTMLElement>('.pa-run')];
  if (!runs.length) return null;
  const at = document.createRange();
  try { at.setStart(node, offset); } catch { return null; }
  // The end of the last run before the point, or the start of the first run when the point comes first.
  let found: number | null = null;
  for (const run of runs) {
    if (at.comparePoint(run, run.childNodes.length) <= 0) found = Number(run.dataset.end);
    else break;
  }
  return found ?? Number(runs[0]!.dataset.start);
}

/** The words a selection covers in one sheet, grown to whole words; null when it covers none. */
export function selectionIn(sheet: HTMLElement, text: string, s: Selection): { start: number; end: number } | null {
  if (s.isCollapsed || !s.anchorNode || !s.focusNode) return null;
  const a = pointIn(sheet, s.anchorNode, s.anchorOffset);
  const b = pointIn(sheet, s.focusNode, s.focusOffset);
  if (a === null || b === null) return null;
  return wholeWords(text, trimRange(text, Math.min(a, b), Math.max(a, b)));
}

/** How the To mark flow embeds this screen: its own bar replaces ours, and `aside` tops the side column in place of a rubric. */
export type MarkPieceOptions = {
  embedded?: boolean;
  aside?: HTMLElement;
  suggested?: SuggestedMarkTag[];
  draftComment?: string;
  /** What this work is tagged with. Left out, or null for untagged work, and the marking has no rubric panel. */
  rubric?: RubricSetup | null;
  rubricAi?: RubricAiRead | null;
  /** A single score for this work, for the panel's Mark row. */
  rubricMarks?: { max: number; value?: number | null; ai?: number | null };
  /** Handed-in writing only: offers Return for a redraft. */
  redraft?: boolean;
};

export function markPieceView(d: MarkPieceData, act: MarkPieceActions, o: MarkPieceOptions = {}): HTMLElement {
  return openMarkPiece(d, act, o).el;
}

export type MarkPieceHandle = {
  el: HTMLElement;
  save: () => Promise<void>;
  /** Saves and returns. False when a step stayed practice: it isn't returned, and the panel says why. */
  finish: () => Promise<boolean>;
  rubric: RubricPanel | null;
};

/** The same code on the same words: a second copy of a tag, which only ever doubles the tally. */
const sameTag = (a: Omit<Tag, 'positive'>, b: Omit<Tag, 'positive'>): boolean =>
  a.code_id === b.code_id && a.part === b.part && a.field === b.field && a.start === b.start && a.end === b.end;

export function openMarkPiece(d: MarkPieceData, act: MarkPieceActions, o: MarkPieceOptions = {}): MarkPieceHandle {
  let tags: ShownTag[] = [];
  /** Puts a code on the words, unless that code is already there; an AI copy waiting there is kept instead. */
  const addTag = (t: ShownTag): void => {
    const there = tags.find((x) => sameTag(x, t));
    if (!there) tags.push(t);
    else if (there.ai && !t.ai) { delete there.ai; delete there.why; }
  };
  for (const t of d.feedback?.tags ?? []) addTag({ ...t });
  for (const t of o.suggested ?? []) addTag({ ...t, positive: false, ai: true });
  const steps: Record<string, string> = { ...(d.mark?.steps ?? {}) };
  let armed: { id: string; positive: boolean } | null = null;
  let status = d.feedback?.status ?? 'draft';
  let justTagged = false;
  let selected: { part: string; field: string; start: number; end: number } | null = null;
  let clearSelected = 0;
  const codes = new Map(d.codes.map((c) => [c.id, c]));
  const draft = d.draft ?? 1;
  const drafts = d.drafts ?? [];
  const lastDraft = drafts.at(-1);
  // A redraft opens on what changed; codes only go on the latest words.
  let view: 'changes' | 'latest' | number = lastDraft ? 'changes' : 'latest';
  let ask: 'none' | 'section' | 'whole' = 'none';
  let section: { part: string; field: string; start: number; end: number } | null = null;
  const askBody = (): { redraft: { scope: RedraftScope } } | undefined =>
    ask === 'whole' ? { redraft: { scope: 'whole' } } : ask === 'section' && section ? { redraft: { scope: section } } : undefined;
  const missingSection = (): boolean => ask === 'section' && !section;

  const root = el('section', 'mk');
  const bar = el('div', 'mk-bar');
  bar.append(el('h2', 'mk-bar__name', d.student.name), el('span', 'mk-bar__pos', `${d.position.index + 1} of ${d.position.total}`));
  const prev = button('←', 'secondary', () => act.move(-1));
  prev.setAttribute('aria-label', 'Previous student');
  const next = button('→', 'secondary', () => act.move(1));
  next.setAttribute('aria-label', 'Next student');
  const saveBtn = button('Save', 'secondary', () => void save());
  saveBtn.dataset.action = 'save';
  const retBtn = button('', 'primary', () => {
    if (status === 'returned') void act.takeBack().then(() => { status = 'draft'; paint(); });
    else if (missingSection()) askHint.textContent = 'Drag across the section first.';
    else void save().then(() => act.returnIt(askBody())).then(() => { status = 'returned'; paint(); });
  });
  retBtn.dataset.action = 'return';
  bar.append(prev, next, saveBtn, retBtn);

  const palette = el('div', 'mk-palette');
  palette.append(el('span', 'mk-palette__hint', 'Select the words, then tap a code or press its number. Hold Shift for a strength, which shows green.'));
  const pressCode = (id: string, positive: boolean): void => {
    onSelection();
    if (selected) {
      addTag({ code_id: id, positive, ...selected });
      selected = null;
      window.getSelection()?.removeAllRanges();
    } else armed = armed?.id === id ? null : { id, positive };
    paint();
  };
  d.codes.forEach((c, n) => {
    const chip = el('button', `mk-chip mk-chip--${c.colour}`);
    chip.type = 'button';
    chip.dataset.code = c.id;
    if (n < 9) chip.append(el('kbd', 'mk-chip__key', String(n + 1)));
    chip.append(el('b', undefined, c.code), document.createTextNode(` ${c.label}`));
    // Keeps the student's words selected while the button is pressed.
    chip.addEventListener('mousedown', (e) => e.preventDefault());
    chip.addEventListener('click', (e) => pressCode(c.id, e.shiftKey));
    palette.append(chip);
  });

  const sheets = el('div', 'mk-sheets');
  const menu = el('div', 'mk-menu');
  menu.hidden = true;
  const left = el('div', 'mk-left');
  const side = el('div', 'mk-side');
  const tally = el('div', 'mk-tally');
  const warn = el('p', 'mk-warn');
  const comment = el('textarea', 'mk-comment');
  comment.value = d.feedback?.comment ?? o.draftComment ?? '';
  comment.setAttribute('aria-label', 'Comment the student will see');

  // A criterion on a skill the rubric already has a row for takes its place from that row's rung.
  const skillRows = new Set((o.rubric?.rows.skills ?? []).map((s) => s.ref));
  const linked = d.column.criteria.filter((c) => c.skill && skillRows.has(c.skill));
  const own = d.column.criteria.filter((c) => !linked.includes(c));
  const rubric = el('div', 'mk-rubric');
  for (const c of own) {
    const row = el('div', 'mk-rubric__row');
    row.append(el('b', undefined, c.label), el('small', undefined, c.skill ? `Skill · ${(c as { skill_name?: string }).skill_name ?? c.skill}` : (c as { self?: string }).self ?? [...c.outcomes, ...c.concepts].join(' · ')));
    const btns = el('div', 'mk-rubric__steps');
    const ladder = (c as { ladder?: readonly (readonly [string, string])[] }).ladder;
    for (const [id, name] of ladder ?? (c.skill ? RUNGS : STEPS)) {
      const b = el('button', 'mk-step', name);
      b.type = 'button';
      b.dataset.step = `${c.id}:${id}`;
      b.addEventListener('click', () => { steps[c.id] = id; paint(); });
      btns.append(b);
    }
    row.append(btns);
    rubric.append(row);
  }
  if (o.aside) side.append(o.aside);
  let panel: RubricPanel | null = null;
  if (o.rubric) {
    const seeded = linked.flatMap((c) => (steps[c.id] ? [[c.skill!, steps[c.id]!] as const] : []));
    const held = d.feedback?.rubric;
    const criteria = el('div', 'mk-rubric__host');
    criteria.append(rubric, el('p', 'mk-hint', 'Your step sets where the student sits. The codes don’t.'));
    panel = mountRubricPanel(o.rubric, {
      saved: held || seeded.length ? { skills: { ...Object.fromEntries(seeded), ...(held?.skills ?? {}) } as Rubric['skills'], pieces: held?.pieces ?? {}, steps: held?.steps ?? {}, ...(held?.next_step ? { next_step: held.next_step } : {}) } : null,
      ...(o.rubricAi ? { ai: o.rubricAi } : {}),
      ...(o.rubricMarks ? { marks: o.rubricMarks } : {}),
      tagged: () => tags.filter((t) => !t.ai),
      ...(own.length ? { criteria: { el: criteria, placed: () => own.filter((c) => steps[c.id]).length } } : {}),
      ...(o.suggested?.length ? { aiExtra: { waiting: () => tags.some((t) => t.ai), keep: () => { for (const t of tags) { delete t.ai; delete t.why; } paint(); } } } : {}),
      studentId: d.student.id
    });
    side.append(panel.el);
  } else if (d.column.criteria.length) side.append(el('h3', 'mk-side__title', 'Rubric · where this piece sits'), rubric, el('p', 'mk-hint', 'Your step sets where the student sits. The codes don’t.'));
  const draftNote = el('p', 'mk-hint mk-ai', 'The AI drafted this comment. Change it or clear it before you return.');
  draftNote.hidden = !(o.draftComment && !d.feedback?.comment);
  comment.addEventListener('input', () => { draftNote.hidden = true; });
  side.append(el('h3', 'mk-side__title', 'Codes on this piece'), tally, warn, el('h3', 'mk-side__title', 'Comment'), draftNote, comment);
  if (lastDraft) {
    const earlier = el('div', 'mk-earlier');
    earlier.append(el('h3', 'mk-side__title', `What you said on Draft ${lastDraft.n}`));
    for (const id of new Set(lastDraft.tags.map((t) => t.code_id))) {
      const c = codes.get(id);
      if (c) earlier.append(el('p', 'mk-hint', `${c.code} ${c.label}`));
    }
    if (lastDraft.comment) earlier.append(el('p', 'mk-earlier__comment', lastDraft.comment));
    else if (!lastDraft.tags.length) earlier.append(el('p', 'mk-hint', 'No codes or comment.'));
    side.prepend(earlier);
  }
  const askHint = el('p', 'mk-hint');
  askHint.setAttribute('role', 'status');
  if (o.redraft) {
    const box = el('fieldset', 'mk-ask');
    box.append(el('legend', 'mk-side__title', 'When you return it'));
    const again = draft > 1 ? 'Ask for another redraft' : 'Return for a redraft';
    const options: Array<['none' | 'section' | 'whole', string]> = [['none', 'Return, finished'], ['section', `${again}: this section`], ['whole', `${again}: the whole piece`]];
    for (const [value, label] of options) {
      const line = el('label', 'mk-ask__line');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'mk-ask';
      radio.value = value;
      radio.checked = value === 'none';
      radio.addEventListener('change', () => {
        ask = value;
        askHint.textContent = value === 'section' && !section ? 'Drag across the words you want rewritten.' : '';
        if (value === 'section') view = 'latest';
        paint();
      });
      line.append(radio, document.createTextNode(` ${label}`));
      box.append(line);
    }
    box.append(askHint);
    side.append(box);
  }

  root.addEventListener('pm:select', (e) => {
    const sel = (e as CustomEvent<{ part: string; field: string; start: number; end: number }>).detail;
    if (ask === 'section') {
      section = sel;
      selected = null;
      justTagged = true;
      window.getSelection()?.removeAllRanges();
      askHint.textContent = '';
      paint();
      return;
    }
    if (!armed) return;
    addTag({ code_id: armed.id, positive: armed.positive, ...sel });
    // These words are tagged now, so a quick press of another code arms it rather than tagging them again.
    selected = null;
    window.clearTimeout(clearSelected);
    justTagged = true;
    paint();
  });

  function hideMenu(): void {
    menu.hidden = true;
    left.style.minHeight = '';
  }

  /** Opens under the line that was clicked, or over it when there's no room below in the visible part of the page. */
  function placeMenu(run: HTMLElement, y: number): void {
    // Measured at its own height, so switching codes in an open menu doesn't keep the old growth.
    left.style.minHeight = '';
    const box = left.getBoundingClientRect();
    const lines = [...run.getClientRects()];
    const line = lines.find((r) => y >= r.top && y <= r.bottom) ?? lines.at(-1) ?? run.getBoundingClientRect();
    const seen = visibleBand(left);
    const tall = menu.offsetHeight;
    const over = line.bottom + MENU_GAP + tall > seen.bottom && line.top - MENU_GAP - tall >= seen.top;
    const top = (over ? line.top - MENU_GAP - tall : line.bottom + MENU_GAP) - box.top + left.scrollTop;
    menu.style.top = `${top}px`;
    // Short writing makes a short column, which would cut the menu off at its buttons: it grows while the menu is open.
    const need = top + tall + MENU_GAP;
    left.style.minHeight = need > left.clientHeight ? `${Math.ceil(need)}px` : '';
    menu.style.left = `${Math.max(0, Math.min(line.left - box.left, left.clientWidth - menu.offsetWidth))}px`;
    menu.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * A small menu on an existing highlight, beside the words: add a note, flip strength or growth, remove.
   * Words carrying several codes list them all at the top, so each one can be reached and removed.
   */
  function openMenu(stack: ShownTag[], tag: ShownTag, run: HTMLElement, y: number): void {
    const c = codes.get(tag.code_id);
    menu.replaceChildren();
    if (stack.length > 1) {
      const picks = el('div', 'mk-menu__picks');
      picks.setAttribute('aria-label', 'Codes on these words');
      for (const t of stack) {
        const tc = codes.get(t.code_id);
        const b = el('button', `mk-menu__pick mk-menu__pick--${tc?.colour ?? 'blue'}`, tc?.code ?? '?');
        b.type = 'button';
        b.title = `${tc?.code ?? ''} ${tc?.label ?? ''}${t.positive ? ' (strength)' : ''}`;
        b.setAttribute('aria-pressed', String(t === tag));
        b.addEventListener('click', () => openMenu(stack, t, run, y));
        picks.append(b);
      }
      menu.append(picks);
    }
    menu.append(el('b', 'mk-menu__title', `${c?.code ?? ''} ${c?.label ?? ''}${tag.positive ? ' (strength)' : ''}`));
    const note = el('input', 'mk-menu__note');
    note.type = 'text';
    note.value = tag.note ?? '';
    note.placeholder = 'Add a note for the student (optional)';
    note.setAttribute('aria-label', 'Note for the student');
    // Kept as it's typed, so a shortcut that saves from inside the box still has the whole note.
    note.addEventListener('input', () => {
      if (note.value.trim()) tag.note = note.value.trim();
      else delete tag.note;
    });
    note.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === 'Escape') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        hideMenu();
      }
    });
    if (tag.why) menu.append(el('p', 'mk-ai', tag.why));
    const actions = el('div', 'mk-menu__actions');
    if (tag.ai) actions.append(button('Keep it', 'primary', () => { delete tag.ai; delete tag.why; paint(); }));
    const flip = button(tag.positive ? 'Not a strength' : 'Make it a strength', 'secondary', () => { tag.positive = !tag.positive; paint(); });
    const remove = button(tag.ai ? 'Drop it' : 'Remove', 'secondary', () => { tags = tags.filter((t) => t !== tag); paint(); });
    const close = button('Done', 'ghost', () => { hideMenu(); });
    actions.append(flip, remove, close);
    menu.append(note, actions);
    menu.hidden = false;
    placeMenu(run, y);
    // Straight to typing, except on a touch screen where the keyboard would cover the words.
    if (window.matchMedia?.('(hover: hover)').matches) note.focus({ preventScroll: true });
  }

  /**
   * A highlight draws two codes' colours at most, so words carrying more say how many more ("+1"),
   * once at the end of each stretch, rather than a new code going on and seeming to vanish.
   */
  function markStacks(sheet: HTMLElement, mine: ShownTag[]): void {
    const runs = [...sheet.querySelectorAll<HTMLElement>('.pa-run--mark')];
    const more = runs.map((run) => {
      const [a, b] = [Number(run.dataset.start), Number(run.dataset.end)];
      return Math.max(0, mine.filter((t) => t.start < b && t.end > a).length - 2);
    });
    runs.forEach((run, i) => {
      const next = runs[i + 1];
      const joined = next && next.dataset.start === run.dataset.end;
      if (more[i]! > 0 && !(joined && more[i + 1] === more[i])) run.dataset.more = `+${more[i]}`;
    });
  }

  function draftPills(): HTMLElement | null {
    if (!lastDraft) return null;
    const row = el('div', 'mk-drafts');
    const pill = (label: string, to: typeof view): void => {
      const b = el('button', `mk-draft-pill${view === to ? ' is-on' : ''}`, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(view === to));
      b.addEventListener('click', () => { view = to; paint(); });
      row.append(b);
    };
    pill('Changes', 'changes');
    pill(`Draft ${draft}`, 'latest');
    for (const past of [...drafts].reverse()) pill(`Draft ${past.n}`, past.n);
    return row;
  }

  /** The non-editable views: what changed, or an earlier draft with its own codes. */
  function readOnlySheets(): HTMLElement[] {
    const out: HTMLElement[] = [];
    if (view === 'changes') {
      for (const [part, fields] of Object.entries(d.text)) {
        if (part.startsWith('step.')) continue;
        for (const [field, text] of Object.entries(fields)) out.push(changesSheet(lastDraft?.text[part]?.[field] ?? '', text));
      }
      return out;
    }
    const past = drafts.find((x) => x.n === view);
    for (const [part, fields] of Object.entries(past?.text ?? {})) {
      // A frozen draft keeps the student's step picks as JSON, which are never writing to show.
      if (part.startsWith('step.')) continue;
      for (const [field, text] of Object.entries(fields)) {
        const mine = (past?.tags ?? []).filter((t) => t.part === part && t.field === field);
        out.push(paper(text, mine.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${t.positive ? 'sage' : codes.get(t.code_id)?.colour ?? 'blue'}-ink)` })), null));
      }
    }
    return out;
  }

  function paint(): void {
    hideMenu();
    sheets.replaceChildren();
    const pills = draftPills();
    if (pills) sheets.append(pills);
    palette.hidden = view !== 'latest';
    if (view !== 'latest') sheets.append(...readOnlySheets());
    else for (const [part, fields] of Object.entries(d.text)) {
      // A step pick is JSON for its own layer, never writing to mark.
      if (part.startsWith('step.')) continue;
      for (const [field, text] of Object.entries(fields)) {
        const mine = tags.filter((t) => t.part === part && t.field === field);
        // A strength is green, as it is in the student's returned writing.
        const marks: Mark[] = mine.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${t.positive ? 'sage' : codes.get(t.code_id)?.colour ?? 'blue'}-ink)` }));
        if (ask === 'section' && section?.part === part && section.field === field) marks.push({ start: section.start, end: section.end, layer: marks.length, colour: 'var(--pastel-gold-ink)' });
        const step = d.steps?.find((s) => s.part === part && s.field === field);
        const pick = placedPick(step?.pick, text);
        const pickCode = pick ? codes.get(pick.code_id) : undefined;
        if (pick) sheets.append(stepHead(pick, pickCode));
        const sheet = paper(text, pick ? [...marks, pickMark(pick, pickCode)] : marks, null);
        if (pick) drawPick(sheet, pick, pickCode, marks);
        sheet.dataset.part = part;
        sheet.dataset.field = field;
        for (const t of mine.filter((x) => x.ai)) {
          sheet.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
            if (Number(run.dataset.start) >= t.start && Number(run.dataset.end) <= t.end) run.classList.add('mk-run--ai');
          });
        }
        sheet.addEventListener('mouseup', () => {
          const s = window.getSelection();
          if (!s || s.isCollapsed) return;
          const range = selectionIn(sheet, text, s);
          if (range) root.dispatchEvent(new CustomEvent('pm:select', { detail: { part, field, ...range } }));
          // With no code armed the words stay selected, waiting for one.
          if (armed) s.removeAllRanges();
        });
        sheet.addEventListener('click', (e) => {
          if (justTagged) { justTagged = false; return; }
          // A double-click on a highlight selects the word for another code: the menu the first click
          // opened goes, so its note box stops taking the number keys meant for a code.
          if (e.detail > 1) {
            if ((document.activeElement as HTMLElement | null)?.closest('.mk-menu')) (document.activeElement as HTMLElement).blur();
            hideMenu();
            return;
          }
          if (window.getSelection()?.isCollapsed === false) return;
          const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark');
          if (!run) return;
          const at = Number(run.dataset.start);
          const stack = mine.filter((t) => t.start <= at && t.end > at);
          // The newest code on the words first: it's the one just put there.
          if (stack.length) openMenu(stack, stack.at(-1)!, run, e.clientY);
        });
        markStacks(sheet, mine);
        sheets.append(sheet);
        if (pick) sheets.append(pickCaption(d.student.initials, pickCode));
      }
    }
    for (const chip of palette.querySelectorAll<HTMLElement>('.mk-chip')) {
      const on = armed?.id === chip.dataset.code;
      chip.classList.toggle('is-armed', on);
      chip.setAttribute('aria-pressed', String(on));
    }
    for (const b of rubric.querySelectorAll<HTMLElement>('.mk-step')) {
      const [cid, step] = b.dataset.step!.split(':');
      const on = steps[cid!] === step;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-was', !on && lastDraft?.steps[cid!] === step);
    }
    const counts = new Map<string, number>();
    for (const t of tags) if (!t.ai) counts.set(t.code_id, (counts.get(t.code_id) ?? 0) + 1);
    tally.textContent = [...counts].map(([id, n]) => `${codes.get(id)?.code} ${n}`).join(' · ') || 'No codes yet.';
    // How many of the student's most recent returned pieces in a row carried this growth code.
    const run = (id: string) => { let n = 0; for (const list of [...d.recent_codes].reverse()) { if (!list.includes(id)) break; n += 1; } return n; };
    const flagged = [...counts.keys()].map((id) => [id, run(id)] as const).filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1])[0];
    warn.textContent = flagged ? `${codes.get(flagged[0])?.code} has come up on ${first(d.student.name)}’s last ${flagged[1]} pieces.` : '';
    retBtn.textContent = status === 'returned' ? 'Take back' : ask !== 'none' ? 'Return for a redraft' : draft > 1 ? 'Return, finished' : `Return to ${first(d.student.name)}`;
    panel?.refresh();
  }

  let stayedPractice = false;
  async function save(): Promise<void> {
    const fields = panel?.saveFields() ?? {};
    // Criteria sharing a skill with a rubric row follow its rung. Their ladder starts at Capable.
    if (panel) {
      const rungs = panel.value()?.skills ?? {};
      for (const c of linked) {
        const rung = rungs[c.skill!];
        if (rung && rung !== 'below') steps[c.id] = rung;
        else delete steps[c.id];
      }
    }
    try {
      const reply = await act.save({ tags: tags.filter((t) => !t.ai).map(({ ai: _ai, why: _why, ...t }) => t), comment: comment.value.trim(), steps, ...fields });
      stayedPractice = panel?.applyReply(reply) ?? false;
    } catch (error) {
      panel?.failed();
      throw error;
    }
  }

  // What's selected right now. It outlives the tap by a moment, since some touch screens clear the selection before the button's click.
  const onSelection = (): void => {
    if (!root.isConnected) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.anchorNode || !s.focusNode) {
      window.clearTimeout(clearSelected);
      clearSelected = window.setTimeout(() => { selected = null; }, 500);
      return;
    }
    // The sheet the drag started in, or the one it ended in when it started outside any.
    const sheetOf = (n: Node): HTMLElement | null =>
      (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement)?.closest<HTMLElement>('.mk-sheets [data-part]') ?? null;
    const sheet = sheetOf(s.anchorNode) ?? sheetOf(s.focusNode);
    const text = sheet ? d.text[sheet.dataset.part!]?.[sheet.dataset.field!] : undefined;
    if (!sheet || text === undefined) return;
        const range = selectionIn(sheet, text, s);
    if (!range) return;
    window.clearTimeout(clearSelected);
    selected = { part: sheet.dataset.part!, field: sheet.dataset.field!, ...range };
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected || view !== 'latest') return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    const code = n ? d.codes[Number(n) - 1] : undefined;
    if (code) pressCode(code.id, e.shiftKey);
  };
  document.addEventListener('selectionchange', onSelection);
  document.addEventListener('keydown', onKey);

  if (o.embedded) root.append(palette);
  else root.append(bar, palette);
  const cols = el('div', `mk-cols${panel ? ' mk-cols--rubric' : ''}`);
  left.append(sheets, menu);
  // Press anywhere else and the note box goes; the note is already kept.
  root.addEventListener('pointerdown', (e) => {
    const on = e.target as HTMLElement;
    if (!menu.hidden && !menu.contains(on) && !on.closest('.pa-run--mark')) hideMenu();
  });
  cols.append(left, side);
  root.append(cols);
  paint();
  return {
    el: root,
    save,
    rubric: panel,
    finish: async () => {
      if (missingSection()) {
        askHint.textContent = 'Drag across the section first.';
        return false;
      }
      await save();
      if (stayedPractice) return false;
      await act.returnIt(askBody());
      status = 'returned';
      return true;
    }
  };
}

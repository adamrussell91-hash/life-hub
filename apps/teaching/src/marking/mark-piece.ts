/**
 * Teacher marking screen for one handed-in piece of typed work: tap a code, select the student's
 * words to tag them, place the piece on each criterion's steps, write a comment, then Return.
 * The same codes and highlights the viva marker uses; the steps set where the student sits, the codes do not.
 */
import { el, button } from '@/quiz/dom';
import { paper, offsetOf, trimRange, type Mark } from '@/blocks/peer-annotate';
import { drawPick, pickCaption, pickMark, placedPick, stepHead, type StepPick } from './step-pick';
import './marking.css';

type Criterion = { id: string; label: string; outcomes: string[]; concepts: string[]; skill?: string };
type Code = { id: string; code: string; label: string; colour: string; group: string; descriptor: string; strength_descriptor?: string };
type Tag = { code_id: string; positive: boolean; part: string; field: string; start: number; end: number; note?: string };
/** A code the AI suggests on the student's words: dashed until the teacher keeps it, and never saved otherwise. */
export type SuggestedMarkTag = { code_id: string; part: string; field: string; start: number; end: number; why?: string };
type ShownTag = Tag & { ai?: boolean; why?: string };
export type MarkPieceData = {
  column: { id: string; title: string; criteria: Criterion[] };
  student: { id: string; initials: string; name: string };
  text: Record<string, Record<string, string>>;
  /** The student's own next-step picks, by the answer each sits in. */
  steps?: Array<{ part: string; field: string; pick: StepPick }>;
  feedback: { tags: Tag[]; comment: string; status: 'draft' | 'returned' } | null;
  mark: { steps?: Record<string, string> } | null;
  codes: Code[];
  recent_codes: string[][];
  position: { index: number; total: number };
};
export type MarkPieceActions = {
  save: (body: { tags: Tag[]; comment: string; steps: Record<string, string> }) => Promise<unknown>;
  returnIt: () => Promise<unknown>;
  takeBack: () => Promise<unknown>;
  move: (by: -1 | 1) => void;
};

const STEPS = [['starting', 'Starting'], ['building', 'Building'], ['secure', 'Secure'], ['extending', 'Extending']] as const;
const RUNGS = [['capable', 'Capable'], ['skilled', 'Skilled'], ['accomplished', 'Accompl.'], ['excellent', 'Excellent']] as const;
const first = (name: string) => name.split(' ')[0] ?? name;

/** A rough selection grows to the whole words it touches, so a highlight never stops mid-word. */
export function wholeWords(text: string, r: { start: number; end: number } | null): { start: number; end: number } | null {
  if (!r) return null;
  let { start, end } = r;
  while (start > 0 && /[\p{L}\p{N}'’]/u.test(text[start - 1]!)) start--;
  while (end < text.length && /[\p{L}\p{N}'’]/u.test(text[end]!)) end++;
  return { start, end };
}

/** How the To mark flow embeds this screen: its own bar replaces ours, and `aside` tops the side column in place of a rubric. */
export type MarkPieceOptions = { embedded?: boolean; aside?: HTMLElement; suggested?: SuggestedMarkTag[]; draftComment?: string };

export function markPieceView(d: MarkPieceData, act: MarkPieceActions): HTMLElement {
  return openMarkPiece(d, act).el;
}

export function openMarkPiece(d: MarkPieceData, act: MarkPieceActions, o: MarkPieceOptions = {}): { el: HTMLElement; save: () => Promise<void>; finish: () => Promise<void> } {
  let tags: ShownTag[] = [...(d.feedback?.tags ?? []), ...(o.suggested ?? []).map((t) => ({ ...t, positive: false, ai: true }))];
  const steps: Record<string, string> = { ...(d.mark?.steps ?? {}) };
  let armed: { id: string; positive: boolean } | null = null;
  let status = d.feedback?.status ?? 'draft';
  let justTagged = false;
  let selected: { part: string; field: string; start: number; end: number } | null = null;
  let clearSelected = 0;
  const codes = new Map(d.codes.map((c) => [c.id, c]));

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
    else void save().then(() => act.returnIt()).then(() => { status = 'returned'; paint(); });
  });
  retBtn.dataset.action = 'return';
  bar.append(prev, next, saveBtn, retBtn);

  const palette = el('div', 'mk-palette');
  palette.append(el('span', 'mk-palette__hint', 'Select the words, then tap a code or press its number. Hold Shift for a strength.'));
  const pressCode = (id: string, positive: boolean): void => {
    onSelection();
    if (selected) {
      tags.push({ code_id: id, positive, ...selected });
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
  const side = el('div', 'mk-side');
  const tally = el('div', 'mk-tally');
  const warn = el('p', 'mk-warn');
  const comment = el('textarea', 'mk-comment');
  comment.value = d.feedback?.comment ?? o.draftComment ?? '';
  comment.setAttribute('aria-label', 'Comment the student will see');

  const rubric = el('div', 'mk-rubric');
  for (const c of d.column.criteria) {
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
  if (d.column.criteria.length) side.append(el('h3', 'mk-side__title', 'Rubric · where this piece sits'), rubric, el('p', 'mk-hint', 'Your step sets where the student sits. The codes don’t.'));
  const draftNote = el('p', 'mk-hint mk-ai', 'The AI drafted this comment. Change it or clear it before you return.');
  draftNote.hidden = !(o.draftComment && !d.feedback?.comment);
  comment.addEventListener('input', () => { draftNote.hidden = true; });
  side.append(el('h3', 'mk-side__title', 'Codes on this piece'), tally, warn, el('h3', 'mk-side__title', 'Comment'), draftNote, comment);

  root.addEventListener('pm:select', (e) => {
    const sel = (e as CustomEvent<{ part: string; field: string; start: number; end: number }>).detail;
    if (!armed) return;
    tags.push({ code_id: armed.id, positive: armed.positive, ...sel });
    justTagged = true;
    paint();
  });

  /** A small menu on an existing highlight: add a note, flip strength or growth, remove. */
  function openMenu(tag: ShownTag): void {
    const c = codes.get(tag.code_id);
    menu.replaceChildren(el('b', 'mk-menu__title', `${c?.code ?? ''} ${c?.label ?? ''}${tag.positive ? ' (strength)' : ''}`));
    const note = el('input', 'mk-menu__note');
    note.type = 'text';
    note.value = tag.note ?? '';
    note.placeholder = 'Add a note for the student (optional)';
    note.setAttribute('aria-label', 'Note for the student');
    note.addEventListener('change', () => {
      if (note.value.trim()) tag.note = note.value.trim();
      else delete tag.note;
    });
    if (tag.why) menu.append(el('p', 'mk-ai', tag.why));
    if (tag.ai) {
      menu.append(button('Keep it', 'primary', () => { delete tag.ai; delete tag.why; menu.hidden = true; paint(); }));
    }
    const flip = button(tag.positive ? 'Make it growth' : 'Make it a strength', 'secondary', () => { tag.positive = !tag.positive; menu.hidden = true; paint(); });
    const remove = button(tag.ai ? 'Drop it' : 'Remove', 'secondary', () => { tags = tags.filter((t) => t !== tag); menu.hidden = true; paint(); });
    const close = button('Done', 'ghost', () => { note.dispatchEvent(new Event('change')); menu.hidden = true; });
    menu.append(note, flip, remove, close);
    menu.hidden = false;
  }

  function paint(): void {
    sheets.replaceChildren();
    for (const [part, fields] of Object.entries(d.text)) {
      // A step pick is JSON for its own layer, never writing to mark.
      if (part.startsWith('step.')) continue;
      for (const [field, text] of Object.entries(fields)) {
        const mine = tags.filter((t) => t.part === part && t.field === field);
        const marks: Mark[] = mine.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${codes.get(t.code_id)?.colour ?? 'blue'}-ink)` }));
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
          if (!s || s.isCollapsed || !s.anchorNode || !s.focusNode) return;
          const a = offsetOf(s.anchorNode, s.anchorOffset);
          const b = offsetOf(s.focusNode, s.focusOffset);
          if (a === null || b === null) return;
          const range = wholeWords(text, trimRange(text, Math.min(a, b), Math.max(a, b)));
          if (range) root.dispatchEvent(new CustomEvent('pm:select', { detail: { part, field, ...range } }));
          // With no code armed the words stay selected, waiting for one.
          if (armed) s.removeAllRanges();
        });
        sheet.addEventListener('click', (e) => {
          if (justTagged) { justTagged = false; return; }
          if (window.getSelection()?.isCollapsed === false) return;
          const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark');
          if (!run) return;
          const at = Number(run.dataset.start);
          const tag = mine.find((t) => t.start <= at && t.end > at);
          if (tag) openMenu(tag);
        });
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
    }
    const counts = new Map<string, number>();
    for (const t of tags) if (!t.ai) counts.set(t.code_id, (counts.get(t.code_id) ?? 0) + 1);
    tally.textContent = [...counts].map(([id, n]) => `${codes.get(id)?.code} ${n}`).join(' · ') || 'No codes yet.';
    // How many of the student's most recent returned pieces in a row carried this growth code.
    const run = (id: string) => { let n = 0; for (const list of [...d.recent_codes].reverse()) { if (!list.includes(id)) break; n += 1; } return n; };
    const flagged = [...counts.keys()].map((id) => [id, run(id)] as const).filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1])[0];
    warn.textContent = flagged ? `${codes.get(flagged[0])?.code} has come up on ${first(d.student.name)}’s last ${flagged[1]} pieces.` : '';
    retBtn.textContent = status === 'returned' ? 'Take back' : `Return to ${first(d.student.name)}`;
  }

  async function save(): Promise<void> {
    await act.save({ tags: tags.filter((t) => !t.ai).map(({ ai: _ai, why: _why, ...t }) => t), comment: comment.value.trim(), steps });
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
    const sheet = (s.anchorNode.parentElement ?? null)?.closest<HTMLElement>('.mk-sheets [data-part]');
    const text = sheet ? d.text[sheet.dataset.part!]?.[sheet.dataset.field!] : undefined;
    const a = offsetOf(s.anchorNode, s.anchorOffset);
    const b = offsetOf(s.focusNode, s.focusOffset);
    if (!sheet || text === undefined || a === null || b === null) return;
    const range = wholeWords(text, trimRange(text, Math.min(a, b), Math.max(a, b)));
    if (!range) return;
    window.clearTimeout(clearSelected);
    selected = { part: sheet.dataset.part!, field: sheet.dataset.field!, ...range };
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    const code = n ? d.codes[Number(n) - 1] : undefined;
    if (code) pressCode(code.id, e.shiftKey);
  };
  document.addEventListener('selectionchange', onSelection);
  document.addEventListener('keydown', onKey);

  if (o.embedded) root.append(palette);
  else root.append(bar, palette);
  const cols = el('div', 'mk-cols');
  const left = el('div');
  left.append(sheets, menu);
  cols.append(left, side);
  root.append(cols);
  paint();
  return {
    el: root,
    save,
    finish: async () => {
      await save();
      await act.returnIt();
      status = 'returned';
    }
  };
}

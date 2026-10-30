/**
 * Teacher marking screen for one handed-in piece of typed work: tap a code, select the student's
 * words to tag them, place the piece on each criterion's steps, write a comment, then Return.
 * The same codes and highlights the viva marker uses; the steps set where the student sits, the codes do not.
 */
import { el, button } from '@/quiz/dom';
import { paper, offsetOf, trimRange, type Mark } from '@/blocks/peer-annotate';
import './marking.css';

type Criterion = { id: string; label: string; outcomes: string[]; concepts: string[]; skill?: string };
type Code = { id: string; code: string; label: string; colour: string; group: string; descriptor: string; strength_descriptor?: string };
type Tag = { code_id: string; positive: boolean; part: string; field: string; start: number; end: number; note?: string };
export type MarkPieceData = {
  column: { id: string; title: string; criteria: Criterion[] };
  student: { id: string; initials: string; name: string };
  text: Record<string, Record<string, string>>;
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

export function markPieceView(d: MarkPieceData, act: MarkPieceActions): HTMLElement {
  let tags: Tag[] = [...(d.feedback?.tags ?? [])];
  const steps: Record<string, string> = { ...(d.mark?.steps ?? {}) };
  let armed: { id: string; positive: boolean } | null = null;
  let status = d.feedback?.status ?? 'draft';
  let justTagged = false;
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
  palette.append(el('span', 'mk-palette__hint', 'Tap a code, then the words. Hold Shift for a strength.'));
  for (const c of d.codes) {
    const chip = el('button', `mk-chip mk-chip--${c.colour}`);
    chip.type = 'button';
    chip.dataset.code = c.id;
    chip.append(el('b', undefined, c.code), document.createTextNode(` ${c.label}`));
    chip.addEventListener('click', (e) => {
      armed = armed?.id === c.id ? null : { id: c.id, positive: e.shiftKey };
      paint();
    });
    palette.append(chip);
  }

  const sheets = el('div', 'mk-sheets');
  const menu = el('div', 'mk-menu');
  menu.hidden = true;
  const side = el('div', 'mk-side');
  const tally = el('div', 'mk-tally');
  const warn = el('p', 'mk-warn');
  const comment = el('textarea', 'mk-comment');
  comment.value = d.feedback?.comment ?? '';
  comment.setAttribute('aria-label', 'Comment the student will see');

  const rubric = el('div', 'mk-rubric');
  for (const c of d.column.criteria) {
    const row = el('div', 'mk-rubric__row');
    row.append(el('b', undefined, c.label), el('small', undefined, c.skill ? `Skill · ${c.skill}` : [...c.outcomes, ...c.concepts].join(' · ')));
    const btns = el('div', 'mk-rubric__steps');
    for (const [id, name] of c.skill ? RUNGS : STEPS) {
      const b = el('button', 'mk-step', name);
      b.type = 'button';
      b.dataset.step = `${c.id}:${id}`;
      b.addEventListener('click', () => { steps[c.id] = id; paint(); });
      btns.append(b);
    }
    row.append(btns);
    rubric.append(row);
  }
  side.append(el('h3', 'mk-side__title', 'Rubric · where this piece sits'), rubric, el('p', 'mk-hint', 'Your step sets where the student sits. The codes don’t.'), el('h3', 'mk-side__title', 'Codes on this piece'), tally, warn, el('h3', 'mk-side__title', 'Comment'), comment);

  root.addEventListener('pm:select', (e) => {
    const sel = (e as CustomEvent<{ part: string; field: string; start: number; end: number }>).detail;
    if (!armed) return;
    tags.push({ code_id: armed.id, positive: armed.positive, ...sel });
    justTagged = true;
    paint();
  });

  /** A small menu on an existing highlight: add a note, flip strength or growth, remove. */
  function openMenu(tag: Tag): void {
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
    const flip = button(tag.positive ? 'Make it growth' : 'Make it a strength', 'secondary', () => { tag.positive = !tag.positive; menu.hidden = true; paint(); });
    const remove = button('Remove', 'secondary', () => { tags = tags.filter((t) => t !== tag); menu.hidden = true; paint(); });
    const close = button('Done', 'ghost', () => { note.dispatchEvent(new Event('change')); menu.hidden = true; });
    menu.append(note, flip, remove, close);
    menu.hidden = false;
  }

  function paint(): void {
    sheets.replaceChildren();
    for (const [part, fields] of Object.entries(d.text)) {
      for (const [field, text] of Object.entries(fields)) {
        const mine = tags.filter((t) => t.part === part && t.field === field);
        const marks: Mark[] = mine.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${codes.get(t.code_id)?.colour ?? 'blue'}-ink)` }));
        const sheet = paper(text, marks, null);
        sheet.addEventListener('mouseup', () => {
          const s = window.getSelection();
          if (!s || s.isCollapsed || !s.anchorNode || !s.focusNode) return;
          const a = offsetOf(s.anchorNode, s.anchorOffset);
          const b = offsetOf(s.focusNode, s.focusOffset);
          if (a === null || b === null) return;
          const range = trimRange(text, Math.min(a, b), Math.max(a, b));
          if (range) root.dispatchEvent(new CustomEvent('pm:select', { detail: { part, field, ...range } }));
          s.removeAllRanges();
        });
        sheet.addEventListener('click', (e) => {
          if (justTagged) { justTagged = false; return; }
          const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark');
          if (!run) return;
          const at = Number(run.dataset.start);
          const tag = mine.find((t) => t.start <= at && t.end > at);
          if (tag) openMenu(tag);
        });
        sheets.append(sheet);
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
    for (const t of tags) counts.set(t.code_id, (counts.get(t.code_id) ?? 0) + 1);
    tally.textContent = [...counts].map(([id, n]) => `${codes.get(id)?.code} ${n}`).join(' · ') || 'No codes yet.';
    // How many of the student's most recent returned pieces in a row carried this growth code.
    const run = (id: string) => { let n = 0; for (const list of [...d.recent_codes].reverse()) { if (!list.includes(id)) break; n += 1; } return n; };
    const flagged = [...counts.keys()].map((id) => [id, run(id)] as const).filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1])[0];
    warn.textContent = flagged ? `${codes.get(flagged[0])?.code} has come up on ${first(d.student.name)}’s last ${flagged[1]} pieces.` : '';
    retBtn.textContent = status === 'returned' ? 'Take back' : `Return to ${first(d.student.name)}`;
  }

  async function save(): Promise<void> {
    await act.save({ tags, comment: comment.value.trim(), steps });
  }

  root.append(bar, palette);
  const cols = el('div', 'mk-cols');
  const left = el('div');
  left.append(sheets, menu);
  cols.append(left, side);
  root.append(cols);
  paint();
  return root;
}

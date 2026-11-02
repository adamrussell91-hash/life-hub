import type { FeedbackCode, TaggedCode } from '@/blocks/feedback-codes';
import { STEP_LABEL, type DeepUnderstanding, type PlacedStep } from '@/deep/schema';
import { RUNG_ORDER, type LadderRung } from '@/progress/wording';
import type { NextStepBank } from '@/quiz/core';
import { el } from '@/quiz/dom';
import type { SkillsContinuum } from '@/skills/schema';
import { RUBRIC_LIMITS, rubricTally, suggestedMark, suggestedNextStep, type PieceMark, type Rubric, type RubricPieceRow, type RubricRows } from './rubric-model';
import './marking.css';

/**
 * The marking rubric: one panel beside the student's work, built from what the
 * work is tagged with. Skills take a rung, expected pieces take Used or Missed,
 * DU steps take their checks and Pass, and Mark and Next step are suggested from
 * the rungs and stay the teacher's to change. Nothing here calls the server: the
 * host saves `saveFields()` with its own record and hands the reply to `applyReply`.
 */

/** What a screen needs to draw the rubric. rubric-setup.ts loads it. */
export type RubricSetup = {
  rows: RubricRows;
  /** Every piece on the unit, for Add a piece. */
  unitPieces: RubricPieceRow[];
  deep: readonly DeepUnderstanding[];
  continuum: SkillsContinuum | null;
  codes: readonly FeedbackCode[];
  bank?: NextStepBank | null;
  /** The student's current step on each deep understanding, where it could be read. */
  passed?: PassedSteps | null;
  unitId?: string | null;
};
export type PassedSteps = Readonly<Record<string, PlacedStep | null | undefined>>;

/** One pass check as the AI read it. */
export type AiCheck = { met: boolean; quote?: string; why?: string };
/**
 * An AI read in rubric terms: dashed until kept, never counted, never a pass.
 * `skills` is the input for a read that supplies rungs. The AI job has none today
 * (adding them makes each read longer, so measure the cost first); fill this in
 * and the rungs show dashed with no change here.
 */
export type RubricAiRead = {
  skills?: Readonly<Record<string, LadderRung>>;
  pieces?: Readonly<Record<string, PieceMark>>;
  steps?: Readonly<Record<string, readonly AiCheck[]>>;
};

export type RubricReply = { blocked?: string[]; deep?: { steps?: Record<string, Record<string, { step: PlacedStep }>> } | null };

export type RubricPanelOptions = {
  saved?: Rubric | null;
  ai?: RubricAiRead | null;
  /** A single score for this work. Left out where the record has none (a viva take, handed-in writing). */
  marks?: { max: number; value?: number | null; ai?: number | null };
  /** The growth codes on the work so far, tried first for the next step. */
  tagged?: () => readonly TaggedCode[];
  /** Rows the host saves itself (formal assessment criteria), shown here with their own heading. */
  criteria?: { el: HTMLElement; placed: () => number };
  /** Anything else the AI suggested that Keep should keep too, such as codes on the student's words. */
  aiExtra?: { waiting: () => boolean; keep: () => void };
  studentId?: string | null;
  onChange?: () => void;
};

export type RubricPanel = {
  el: HTMLElement;
  /** The rubric as it stands: only what the teacher has decided. Null when there's nothing. */
  value: () => Rubric | null;
  /** The mark to record: the teacher's, else the one the rungs suggest. */
  mark: () => number | null;
  /** The fields to send with the next save: empty when nothing changed, so the rubric stays as it was. */
  saveFields: () => { rubric?: Rubric | null; today?: string };
  /** The save those fields went with failed, so they go again with the next. */
  failed: () => void;
  /** Reads a save's reply. True when a step stayed practice, which the panel now says plainly. */
  applyReply: (reply: unknown) => boolean;
  /** Sends the rubric with the next save even if unchanged, as when a take gets its student. */
  touch: () => void;
  setPassed: (passed: PassedSteps | null, studentId?: string | null) => void;
  /** A line at the top of the panel, such as "pick the student first". Empty clears it. */
  setNote: (text: string) => void;
  /** Repaints after the host's own change: tagged codes, criteria. */
  refresh: () => void;
};

const PLACED: PlacedStep[] = ['2a', '2b', '3', '4'];
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const localDay = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The skill's reach: its R points, narrowed to those this unit's deep understandings name when any match, and its outcomes. */
export function skillReach(ref: string, continuum: SkillsContinuum | null, deep: readonly DeepUnderstanding[]): string {
  const [strandId, subId] = ref.split('.');
  const sub = continuum?.strands.find((s) => s.strand === strandId)?.sub_strands.find((s) => s.id === subId);
  if (!sub) return '';
  const inUnit = new Set(deep.flatMap((d) => d.dot_points));
  const all = (sub.points ?? []).filter((p) => p.point.startsWith('R'));
  const here = all.filter((p) => inUnit.has(`${p.area}:${p.point}`));
  const points = [...new Set((here.length ? here : all).map((p) => p.point))];
  const outcomes = sub.outcomes ?? [];
  return [points.join(', '), outcomes.length ? `${outcomes.length === 1 ? 'Outcome' : 'Outcomes'} ${outcomes.join(', ')}` : ''].filter(Boolean).join(' · ');
}

/** "a, b and c". */
const listed = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

export function mountRubricPanel(setup: RubricSetup, o: RubricPanelOptions = {}): RubricPanel {
  const { rows } = setup;
  const ai = o.ai ?? null;
  const skills = new Map<string, LadderRung>(Object.entries(o.saved?.skills ?? {}));
  const pieces = new Map<string, PieceMark>(Object.entries(o.saved?.pieces ?? {}));
  // A check is null until the teacher or a saved rubric decides it, which is when the AI's dash can show.
  const steps = new Map<string, { checks: (boolean | null)[]; pass: boolean }>();
  for (const [key, row] of Object.entries(o.saved?.steps ?? {})) steps.set(key, { checks: [...row.checks], pass: row.pass });
  for (const row of rows.steps) {
    const held = steps.get(row.key);
    steps.set(row.key, { checks: row.checks.map((_, i) => (held ? held.checks[i] ?? false : null)), pass: held?.pass ?? false });
  }
  const expected = new Set(rows.pieces.map((p) => p.id));
  const textOf = new Map([...setup.unitPieces, ...rows.pieces].map((p) => [p.id, p.text]));
  const added = (): string[] => [...pieces.keys()].filter((id) => !expected.has(id));

  let dirty = false;
  let handMark: number | null = o.marks?.value ?? null;
  let handNext: { text: string; code_id?: string } | null = o.saved?.next_step ? { ...o.saved.next_step } : null;
  let passed: PassedSteps | null = setup.passed ?? null;
  let studentId = o.studentId ?? null;
  const blocked = new Set<string>();
  let adding = false;

  const changed = (): void => {
    dirty = true;
    sync();
    o.onChange?.();
  };
  /** A tap by mouse or finger hands focus back, so the host's number and letter keys keep working. A keyboard press keeps its place. */
  const tap = (b: HTMLButtonElement, act: () => void): void => {
    b.type = 'button';
    b.addEventListener('click', (e) => {
      if (e.detail > 0) b.blur();
      act();
    });
  };

  const root = el('section', 'rb');
  root.setAttribute('aria-label', 'Rubric');
  const head = el('div', 'rb-head');
  const title = el('div');
  title.append(el('h2', 'rb-title', 'Rubric'), el('p', 'rb-sub', ai ? 'Built from this task’s tags. Dashed is the AI’s read, and nothing counts until you keep it.' : 'Built from this task’s tags.'));
  const keep = el('button', 'rb-keep', 'Keep the AI’s read');
  tap(keep, keepRead);
  head.append(title, keep);
  const note = el('p', 'rb-note');
  note.hidden = true;
  root.append(head, note);

  /* Skills */
  const paintSkills: Array<() => void> = [];
  if (rows.skills.length) {
    const box = el('div', 'rb-group');
    box.append(el('h3', 'rb-heading', 'Skills'));
    for (const skill of rows.skills) {
      const row = el('div', 'rb-skill');
      const name = el('div', 'rb-skill__name');
      name.append(el('b', undefined, skill.name));
      const reach = skillReach(skill.ref, setup.continuum, setup.deep);
      if (reach) name.append(el('span', 'rb-reach', reach));
      const grid = el('div', 'rb-rungs');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', `${skill.name}: rung`);
      const buttons = skill.rungs.map((rung) => {
        const b = el('button', 'rb-rung', rung.name);
        b.dataset.rung = `${skill.ref}:${rung.id}`;
        tap(b, () => {
          if (skills.get(skill.ref) === rung.id) skills.delete(skill.ref);
          else skills.set(skill.ref, rung.id);
          changed();
        });
        grid.append(b);
        return { b, rung };
      });
      const look = el('p', 'rb-look');
      row.append(name, grid, look);
      box.append(row);
      paintSkills.push(() => {
        const chosen = skills.get(skill.ref);
        const dashed = chosen ? null : ai?.skills?.[skill.ref] ?? null;
        for (const { b, rung } of buttons) {
          const on = chosen === rung.id;
          const isAi = dashed === rung.id;
          b.classList.toggle('is-on', on);
          b.classList.toggle('is-ai', isAi);
          b.setAttribute('aria-pressed', String(on));
          if (isAi) b.setAttribute('aria-label', `${rung.name}, the AI’s read`);
          else b.removeAttribute('aria-label');
        }
        const shown = chosen ?? dashed;
        look.textContent = lookFor(skill.rungs, shown);
      });
    }
    root.append(box);
  }

  /* Knowledge pieces */
  const piecesBox = el('div', 'rb-group');
  const pieceRows = el('div', 'rb-group');
  const others = (): RubricPieceRow[] => setup.unitPieces.filter((p) => !expected.has(p.id) && !pieces.has(p.id));
  const addBtn = el('button', 'rb-add', '+ Add a piece they used');
  tap(addBtn, () => {
    adding = !adding;
    sync();
    if (adding) picker.focus();
  });
  const picker = el('select', 'rb-picker');
  picker.setAttribute('aria-label', 'Choose a piece they used');
  picker.addEventListener('change', () => {
    if (picker.value && pieces.size < RUBRIC_LIMITS.pieces) pieces.set(picker.value, 'used');
    adding = false;
    changed();
  });
  piecesBox.append(el('h3', 'rb-heading', 'Knowledge pieces'), pieceRows, addBtn, picker);
  if (rows.pieces.length || setup.unitPieces.length || Object.keys(o.saved?.pieces ?? {}).length) root.append(piecesBox);

  function pieceRow(id: string, text: string, isAdded: boolean): HTMLElement {
    const row = el('div', 'rb-piece');
    row.dataset.piece = id;
    const label = el('span', 'rb-piece__text', text);
    if (isAdded) label.append(el('small', 'rb-piece__added', 'Used without being asked'));
    row.append(label);
    const mark = pieces.get(id);
    const dashed = mark ? null : ai?.pieces?.[id] ?? null;
    if (isAdded) {
      const b = el('button', 'rb-pill', 'Remove');
      tap(b, () => {
        pieces.delete(id);
        changed();
      });
      row.append(b);
      return row;
    }
    for (const [value, name] of [['used', 'Used'], ['missed', 'Missed']] as const) {
      const on = mark === value;
      const b = el('button', `rb-pill rb-pill--${value}${on ? ' is-on' : dashed === value ? ' is-ai' : ''}`, name);
      b.dataset.mark = value;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${text}: ${name}${!on && dashed === value ? ', the AI’s read' : ''}`);
      tap(b, () => {
        if (pieces.get(id) === value) pieces.delete(id);
        else pieces.set(id, value);
        changed();
      });
      row.append(b);
    }
    return row;
  }

  /* DU steps */
  const paintSteps: Array<() => void> = [];
  for (const row of rows.steps) {
    const box = el('div', 'rb-step');
    const label = `Step ${STEP_LABEL[row.step]}`;
    box.append(el('h3', 'rb-heading', row.du_number ? `DU ${row.du_number} · ${label}` : label));
    if (!row.du_number) box.append(el('p', 'rb-look', 'This deep understanding is no longer on the unit.'));
    const state = steps.get(row.key)!;
    const reads = ai?.steps?.[row.key] ?? [];
    const checks = row.checks.map((text, i) => {
      const b = el('button', 'rb-check');
      const mark = el('span', 'rb-check__mark');
      mark.setAttribute('aria-hidden', 'true');
      const words = el('span', 'rb-check__text', text);
      const read = reads[i];
      if (read?.quote || read?.why) words.append(el('small', 'rb-heard', read.quote ? `“${read.quote}”` : read.why));
      b.append(mark, words);
      tap(b, () => {
        state.checks[i] = !(state.checks[i] ?? false);
        changed();
      });
      box.append(b);
      return { b, mark, read, i };
    });
    const pass = el('button', 'rb-pass');
    pass.dataset.pass = row.key;
    tap(pass, () => {
      state.pass = !state.pass;
      blocked.delete(row.key);
      changed();
    });
    const line = el('p', 'rb-step__note');
    line.setAttribute('role', 'status');
    box.append(pass, line);
    root.append(box);
    paintSteps.push(() => {
      for (const c of checks) {
        const on = state.checks[c.i] === true;
        const dashed = state.checks[c.i] === null && c.read?.met === true;
        c.b.classList.toggle('is-ai', dashed);
        c.b.classList.toggle('is-on', on);
        c.b.setAttribute('aria-pressed', String(on));
        c.mark.textContent = on ? '✓' : '○';
      }
      pass.textContent = state.pass ? `Passed ${label}` : `Pass on ${label}`;
      pass.classList.toggle('is-on', state.pass);
      pass.setAttribute('aria-pressed', String(state.pass));
      const gate = stepGate(row.du, row.step, state.pass);
      pass.hidden = gate.hide;
      line.textContent = blocked.has(row.key) ? `${label} stays as practice. Pass Step ${STEP_LABEL[PLACED[PLACED.indexOf(row.step) - 1] ?? row.step]} first.` : gate.note;
    });
  }

  /** What's known about passing this step: the student's place, plus any earlier step pressed here. */
  function stepGate(du: string, step: PlacedStep, pressed: boolean): { hide: boolean; note: string } {
    if (pressed || !passed) return { hide: false, note: '' };
    const at = PLACED.indexOf(step);
    let now = PLACED.indexOf(passed[du] ?? ('' as PlacedStep));
    for (const r of rows.steps) if (r.du === du && steps.get(r.key)?.pass) now = Math.max(now, PLACED.indexOf(r.step));
    if (now >= at) return { hide: true, note: `Already passed Step ${STEP_LABEL[PLACED[now]!]}.` };
    if (now === at - 1) return { hide: false, note: at === 0 ? 'Check Step 1 is through first.' : '' };
    return { hide: true, note: `Pass Step ${STEP_LABEL[PLACED[at - 1]!]} first. This stays as practice.` };
  }

  /* Criteria the host saves */
  if (o.criteria) {
    const box = el('div', 'rb-group');
    box.append(el('h3', 'rb-heading', 'Where this piece sits'), o.criteria.el);
    root.append(box);
  }

  /* Mark, next step, tally */
  const foot = el('div', 'rb-foot');
  const markInput = el('input', 'rb-mark__input');
  const markNote = el('span', 'rb-mark__note');
  if (o.marks) {
    const row = el('div', 'rb-mark');
    const id = `rb-mark-${Math.random().toString(36).slice(2, 8)}`;
    const label = el('label', 'rb-heading', 'Mark');
    label.htmlFor = id;
    markInput.id = id;
    markInput.type = 'number';
    markInput.inputMode = 'decimal';
    markInput.min = '0';
    markInput.max = String(o.marks.max);
    markInput.step = '0.5';
    markInput.addEventListener('input', () => {
      const raw = markInput.value.trim();
      const n = Number(raw);
      handMark = raw === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(o.marks!.max, Math.round(n * 2) / 2));
      paintMark();
      o.onChange?.();
    });
    markInput.addEventListener('change', () => {
      if (handMark !== null) markInput.value = String(handMark);
    });
    row.append(label, markInput, el('span', 'rb-mark__max', `/ ${o.marks.max}`), markNote);
    foot.append(row);
  }
  const nextId = `rb-next-${Math.random().toString(36).slice(2, 8)}`;
  const nextLabel = el('label', 'rb-heading', 'Next step');
  nextLabel.htmlFor = nextId;
  const nextBox = el('textarea', 'rb-next');
  nextBox.id = nextId;
  nextBox.rows = 2;
  nextBox.maxLength = RUBRIC_LIMITS.next;
  nextBox.placeholder = 'Suggested from the lowest rung once you’ve tapped one.';
  nextBox.addEventListener('input', () => {
    // Emptied by hand stays empty: the teacher has decided there's no next step.
    const kept = handNext?.code_id && handNext.text === nextBox.value ? { code_id: handNext.code_id } : {};
    handNext = { text: nextBox.value, ...kept };
    dirty = true;
    paintTally();
    o.onChange?.();
  });
  const tally = el('p', 'rb-tally');
  tally.setAttribute('role', 'status');
  foot.append(nextLabel, nextBox, tally);
  root.append(foot);

  /* Reading the state */
  const rated = (): Rubric['skills'] => Object.fromEntries(rows.skills.flatMap((s) => (skills.has(s.ref) ? [[s.ref, skills.get(s.ref)!]] : []))) as Rubric['skills'];
  const allRated = (): boolean => rows.skills.length > 0 && rows.skills.every((s) => skills.has(s.ref));
  const suggestedScore = (): number | null => (o.marks && allRated() ? suggestedMark({ skills: rated() }, o.marks.max) : null);
  const suggestedLine = () => suggestedNextStep({ skills: rated() }, { bank: setup.bank ?? null, codes: setup.codes, continuum: setup.continuum, tagged: o.tagged?.() ?? [] });

  function value(): Rubric | null {
    const savedSteps: Rubric['steps'] = {};
    for (const [key, s] of steps) {
      const checks = s.checks.map((c) => c === true);
      if (s.pass || checks.some(Boolean)) savedSteps[key] = { checks, pass: s.pass };
    }
    const line = handNext ?? suggestedLine();
    const text = line?.text.trim() ?? '';
    const next = text ? { text, ...(line?.code_id ? { code_id: line.code_id } : {}) } : null;
    const out: Rubric = { skills: Object.fromEntries(skills) as Rubric['skills'], pieces: Object.fromEntries(pieces) as Rubric['pieces'], steps: savedSteps, ...(next ? { next_step: next } : {}) };
    return Object.keys(out.skills).length || Object.keys(out.pieces).length || Object.keys(out.steps).length || next ? out : null;
  }

  function dashesWaiting(): boolean {
    if (rows.skills.some((s) => !skills.has(s.ref) && ai?.skills?.[s.ref])) return true;
    if (rows.pieces.some((p) => !pieces.has(p.id) && ai?.pieces?.[p.id])) return true;
    if (rows.steps.some((s) => steps.get(s.key)!.checks.some((c, i) => c === null && ai?.steps?.[s.key]?.[i]?.met))) return true;
    if (o.marks && handMark === null && suggestedScore() === null && typeof o.marks.ai === 'number') return true;
    return o.aiExtra?.waiting() ?? false;
  }

  /** Keeps every dashed value. A Pass is always the teacher's own press. */
  function keepRead(): void {
    for (const s of rows.skills) {
      const read = ai?.skills?.[s.ref];
      if (read && !skills.has(s.ref)) skills.set(s.ref, read);
    }
    for (const p of rows.pieces) {
      const read = ai?.pieces?.[p.id];
      if (read && !pieces.has(p.id)) pieces.set(p.id, read);
    }
    for (const s of rows.steps) {
      const state = steps.get(s.key)!;
      state.checks = state.checks.map((c, i) => (c === null && ai?.steps?.[s.key]?.[i]?.met ? true : c));
    }
    if (o.marks && handMark === null && suggestedScore() === null && typeof o.marks.ai === 'number') handMark = o.marks.ai;
    o.aiExtra?.keep();
    changed();
  }

  function paintMark(): void {
    if (!o.marks) return;
    const suggested = suggestedScore();
    const shown = handMark ?? suggested ?? o.marks.ai ?? null;
    const isAi = handMark === null && suggested === null && shown !== null;
    if (document.activeElement !== markInput) markInput.value = shown === null ? '' : String(shown);
    markInput.classList.toggle('is-ai', isAi);
    markNote.textContent =
      handMark !== null ? (suggested !== null && suggested !== handMark ? `You set this. The rungs suggest ${suggested}.` : 'You set this.')
      : suggested !== null ? 'Suggested from the rungs. Tap to change.'
      : isAi ? 'The AI’s suggestion. Return keeps it unless you change it.'
      : rows.skills.length ? 'Suggested once every skill has a rung.' : 'Tap to set the mark.';
  }

  function paintTally(): void {
    const t = rubricTally(value());
    const parts: string[] = [];
    if (rows.skills.length || t.skills) parts.push(plural(t.skills, 'skill rung'));
    parts.push(plural(t.used + t.missed, 'piece'));
    if (rows.steps.length || t.passed) parts.push(plural(t.passed, 'DU step'));
    if (o.criteria) parts.push(plural(o.criteria.placed(), 'criterion', 'criteria'));
    tally.textContent = `This answer records ${listed(parts)}.`;
  }

  function sync(): void {
    paintSkills.forEach((p) => p());
    const focusKey = document.activeElement instanceof HTMLElement && pieceRows.contains(document.activeElement) ? (document.activeElement.closest<HTMLElement>('[data-piece]')?.dataset.piece ?? '') + (document.activeElement.dataset.mark ?? '') : '';
    pieceRows.replaceChildren(...rows.pieces.map((p) => pieceRow(p.id, p.text, false)), ...added().map((id) => pieceRow(id, textOf.get(id) ?? id, true)));
    if (focusKey) [...pieceRows.querySelectorAll<HTMLElement>('[data-mark]')].find((b) => (b.closest<HTMLElement>('[data-piece]')?.dataset.piece ?? '') + (b.dataset.mark ?? '') === focusKey)?.focus();
    const left = others();
    addBtn.hidden = !left.length || pieces.size >= RUBRIC_LIMITS.pieces;
    addBtn.setAttribute('aria-expanded', String(adding));
    picker.hidden = !adding || addBtn.hidden;
    picker.replaceChildren(Object.assign(el('option'), { value: '', textContent: 'Choose a piece' }), ...left.map((p) => Object.assign(el('option'), { value: p.id, textContent: p.text })));
    piecesBox.hidden = !rows.pieces.length && !added().length && addBtn.hidden;
    paintSteps.forEach((p) => p());
    if (document.activeElement !== nextBox) nextBox.value = (handNext ?? suggestedLine())?.text ?? '';
    paintMark();
    paintTally();
    keep.hidden = !dashesWaiting();
  }

  sync();
  return {
    el: root,
    value,
    mark: () => handMark ?? suggestedScore(),
    saveFields: () => {
      if (!dirty) return {};
      dirty = false;
      return { rubric: value(), today: localDay() };
    },
    failed: () => { dirty = true; },
    applyReply: (raw) => {
      const reply = (raw ?? {}) as RubricReply;
      const list = Array.isArray(reply.blocked) ? reply.blocked : [];
      for (const key of list) {
        const state = steps.get(key);
        if (state) state.pass = false;
        blocked.add(key);
      }
      const mine = studentId ? reply.deep?.steps?.[studentId] : null;
      if (mine) passed = Object.fromEntries(Object.entries(mine).map(([du, row]) => [du, row.step]));
      if (list.length || mine) sync();
      return list.length > 0;
    },
    touch: () => { if (value()) dirty = true; },
    setPassed: (next, id) => {
      passed = next;
      if (id !== undefined) studentId = id;
      sync();
    },
    setNote: (text) => {
      note.textContent = text;
      note.hidden = !text;
    },
    refresh: sync
  };
}

/** The "Look for" line for a rung. Below has no indicators of its own, so it points up at Capable's. */
function lookFor(rungs: RubricRows['skills'][number]['rungs'], shown: LadderRung | null): string {
  if (!shown) return 'Tap a rung to see what to look for.';
  const texts = (id: LadderRung): string => (rungs.find((r) => r.id === id)?.indicators ?? []).map((i) => i.text.trim()).filter(Boolean).join('; ') || (rungs.find((r) => r.id === id)?.i_can?.trim() ?? '');
  if (shown === RUNG_ORDER[0]) {
    const up = texts('capable');
    return up ? `Look for, at Capable: ${up}` : '';
  }
  const words = texts(shown);
  return words ? `Look for: ${words}` : '';
}


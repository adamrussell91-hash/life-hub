import { el } from '@/quiz/dom';
import type { InsightContext } from '@/evidence/context';
import { classEvidence } from '@/evidence/class-evidence';
import { moveKind, needKind, nextMoves, sortStudents, studentRows, syllabusRows, type Move, type Spread, type StudentSort, type SyllabusRow } from '@/evidence/next-moves';
import { byTag, type FocusPins } from '@/evidence/patterns';
import { RUNG_NAME, rungOf } from '@/evidence/syllabus-grid';
import { tagLabel } from '@/evidence/tags';
import { activeMembers, overlapsSaved } from '@/evidence/groups';
import { notYetOnMany, priorities, priorityMove, priorityNotes, studentCalls, type Priority, type StudentCall, type UpcomingLesson } from '@/evidence/priorities';
import type { Evidence } from '@/evidence/types';
import { PRIORITY } from '@/evidence/constants';
import { pct, sectionHead } from '@/evidence/views/parts';
import { agreement, closeCalls, closeText, gainText, groupGain, trustLines, type CloseCall } from '@/evidence/trust';
import type { SavedGroup } from './schema';
import type { MarkbookView, RosterStudent } from './types';
import { formatDay } from './calc';

/**
 * Next steps answers three questions: the biggest and most urgent priorities,
 * who needs support with what, and who can be extended on what. Each priority
 * shows its own set of groups, all on screen together, and pressing a student
 * finds them in every set. Saved and suggested groups, the syllabus and the
 * full student list sit in folds below.
 */

export type SyllabusSort = 'weakest' | 'syllabus' | 'change';
/** Kept by the markbook between redraws. */
export type NextState = { syllabusSort: SyllabusSort; studentSort: StudentSort; openOutcomes: Set<string>; showAllMoves: boolean; editingGroup: string | null; refocus: string | null; openFolds: Set<string>; showAllCalls: Set<string>; picked: string | null };
export const newNextState = (): NextState => ({ syllabusSort: 'weakest', studentSort: 'need', openOutcomes: new Set(), showAllMoves: false, editingGroup: null, refocus: null, openFolds: new Set(), showAllCalls: new Set(), picked: null });

export type NextActions = {
  openStudent: (studentId: string) => void;
  followUp?: (tag: string, students: string[], evidence: Evidence[]) => void;
  /** Small group cards: plan a tutorial for the students behind on one tag. */
  planTutorial?: (tag: string, students: string[], evidence: Evidence[]) => void;
  /** Save a suggested group so it can be targeted and tracked. */
  saveGroup?: (tags: string[], students: string[], name?: string) => void;
  /** Add students the evidence now flags to a saved group. */
  addFlagged?: (groupId: string, students: string[]) => void;
  /** Edit a saved group: the three together turn on its Edit button. */
  renameGroup?: (groupId: string, name: string) => void;
  addMember?: (groupId: string, student: string) => void;
  removeMember?: (groupId: string, student: string) => void;
  pins: (studentId: string) => FocusPins;
  repaint: () => void;
  /** The class's dated lessons from today, so a priority can say what is coming. */
  upcoming?: UpcomingLesson[];
  /** YYYY-MM-DD; defaults to the device's date. */
  today?: string;
};

/** Moves shown before "Show all". */
const FIRST_MOVES = 6;
/** Students shown per answer before "Show all". */
const FIRST_CALLS = 6;

const MOVE_TEXT: Record<Move['kind'], string> = { reteach: 'Reteach to the class', group: 'Pull a small group', move_on: 'Move on' };

function pills<T extends string>(label: string, options: Array<[T, string]>, current: T, onPick: (value: T) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const b = el('button', 'ev-switch__pill', text);
    b.type = 'button';
    b.dataset.sort = value;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => {
      const had = document.activeElement === b;
      onPick(value);
      // The view redraws: keep keyboard focus on the pill just pressed.
      if (had) document.querySelector<HTMLElement>(`.ev-switch[aria-label="${label}"] [data-sort="${value}"]`)?.focus();
    });
    group.append(b);
  }
  return group;
}

/** Students by band as one bar, widest band widest. */
function spreadBar(spread: Spread, small = false): HTMLElement {
  const bar = el('span', `mb-next__bar${small ? ' mb-next__bar--small' : ''}`);
  bar.setAttribute('role', 'img');
  const parts: Array<[keyof Spread, string]> = [['weak', 'not yet'], ['developing', 'developing'], ['secure', 'secure'], ['none', 'no marks']];
  bar.setAttribute('aria-label', parts.filter(([k]) => spread[k]).map(([k, text]) => `${spread[k]} ${text}`).join(', ') || 'No students');
  for (const [k] of parts) {
    if (!spread[k]) continue;
    const seg = el('span', `mb-next__seg mb-next__seg--${k}`);
    seg.style.flexGrow = String(spread[k]);
    bar.append(seg);
  }
  return bar;
}

const signed = (change: number | null): string => (change === null ? '' : `${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}`);

function legend(): HTMLElement {
  const row = el('p', 'mb-next__legend');
  for (const [k, text] of [['weak', 'not yet'], ['developing', 'developing'], ['secure', 'secure'], ['none', 'no marks']] as const) {
    const item = el('span', 'mb-next__key');
    item.append(el('span', `mb-next__swatch mb-next__seg--${k}`), document.createTextNode(text));
    row.append(item);
  }
  return row;
}

/** The open saved group card: its name and who is in it. Each change saves straight away, like a mark. */
function groupEditor(group: SavedGroup, active: string[], listed: RosterStudent[], nameOf: ReadonlyMap<string, string>, state: NextState, actions: NextActions): HTMLElement {
  const form = el('div', 'mb-saved__editor');
  // Saves redraw the card, so remember where the teacher is for each redraw.
  form.addEventListener('focusin', (event) => {
    const at = (event.target as HTMLElement).dataset.refocus;
    if (at) state.refocus = at;
  });

  const nameField = el('label', 'mb-form__field');
  nameField.append(el('span', 'mb-form__label', 'Group name'));
  const name = el('input', 'mb-form__input mb-saved__name-input');
  name.type = 'text';
  name.maxLength = 120;
  name.value = group.name;
  name.dataset.refocus = 'name';
  name.addEventListener('change', () => {
    const next = name.value.trim();
    if (!next || next === group.name) {
      name.value = group.name;
      return;
    }
    actions.renameGroup?.(group.id, next);
  });
  nameField.append(name);

  const list = el('ul', 'mb-saved__members');
  list.setAttribute('aria-label', 'Students in this group');
  for (const student of active) {
    const who = nameOf.get(student) ?? 'Removed student';
    const row = el('li', 'mb-saved__member');
    const remove = el('button', 'btn btn--ghost', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${who} from ${group.name}`);
    remove.dataset.refocus = `remove:${student}`;
    remove.addEventListener('click', () => {
      state.refocus = 'add';
      actions.removeMember?.(group.id, student);
    });
    row.append(el('span', 'mb-saved__member-name', who), remove);
    list.append(row);
  }

  const children: HTMLElement[] = [nameField, list];
  if (active.length === 1) children.push(el('p', 'mb__empty', 'Removing the last student retires the group. It stays in History.'));

  const others = listed.filter((s) => !active.includes(s.id));
  if (others.length) {
    const addField = el('label', 'mb-form__field');
    addField.append(el('span', 'mb-form__label', 'Add a student'));
    const add = el('select', 'mb-form__input mb-saved__add-student');
    add.dataset.refocus = 'add';
    const prompt = el('option', undefined, 'Choose a student');
    prompt.value = '';
    add.append(prompt);
    for (const s of others) {
      const option = el('option', undefined, s.name);
      option.value = s.id;
      add.append(option);
    }
    add.addEventListener('change', () => {
      if (!add.value) return;
      state.refocus = 'add';
      actions.addMember?.(group.id, add.value);
    });
    addField.append(add);
    children.push(addField);
  }

  const done = el('button', 'btn btn--secondary mb-saved__done', 'Done');
  done.type = 'button';
  done.dataset.refocus = 'done';
  done.addEventListener('click', () => {
    state.editingGroup = null;
    state.refocus = `edit:${group.id}`;
    actions.repaint();
  });
  children.push(done);
  form.append(...children);
  return form;
}

/** A closed section below the three answers; stays open across redraws. */
function fold(key: string, title: string, state: NextState, ...children: HTMLElement[]): HTMLElement {
  const details = el('details', 'mb-next__fold');
  details.dataset.fold = key;
  details.open = state.openFolds.has(key);
  details.addEventListener('toggle', () => {
    if (details.open) state.openFolds.add(key);
    else state.openFolds.delete(key);
  });
  const body = el('div', 'mb-next__fold-body');
  body.append(...children);
  details.append(el('summary', 'mb-next__fold-title', title), body);
  return details;
}

/** One answer as short rows: who, their average, and what on. The full reason sits on the row's tooltip. */
function callList(key: 'support' | 'extend', title: string, empty: string, calls: StudentCall[], nameOf: ReadonlyMap<string, string>, label: (tag: string) => string, state: NextState, actions: NextActions): HTMLElement {
  const section = el('section', `mb-call mb-call--${key}`);
  section.append(el('h3', 'mb-call__title', calls.length ? `${title} · ${calls.length}` : title));
  if (!calls.length) {
    section.append(el('p', 'mb__empty', empty));
    return section;
  }
  const all = state.showAllCalls.has(key);
  const list = el('ul', 'mb-call__list');
  for (const call of all ? calls : calls.slice(0, FIRST_CALLS)) {
    const item = el('li', 'mb-call__item');
    item.title = call.why;
    const name = el('button', 'mb-call__name mb-patterns__name', nameOf.get(call.student) ?? 'Removed student');
    name.type = 'button';
    name.dataset.student = call.student;
    name.addEventListener('click', () => actions.openStudent(call.student));
    const avg = el('span', 'mb-call__avg', pct(call.mean));
    if (call.change !== null && Math.abs(call.change) >= PRIORITY.falling) {
      const arrow = el('span', `mb-who__trend ${call.change < 0 ? 'is-down' : 'is-up'}`, call.change < 0 ? '↓' : '↑');
      arrow.setAttribute('aria-label', `${signed(call.change)} since their first`);
      avg.append(arrow);
    }
    const chips = el('span', 'mb-who__chips');
    for (const t of call.tags) {
      const tone = key === 'extend' ? 'is-high' : t.mean !== null && t.mean < 0.5 ? 'is-low' : 'is-mid';
      chips.append(el('span', `mb-who__chip ${tone}`, t.mean === null ? label(t.tag) : `${label(t.tag)} ${pct(t.mean)}`));
    }
    item.append(name, avg, chips);
    list.append(item);
  }
  section.append(list);
  if (calls.length > FIRST_CALLS) {
    const more = el('button', 'btn btn--ghost mb-call__more', all ? 'Show fewer' : `Show all ${calls.length}`);
    more.type = 'button';
    more.dataset.refocus = `calls:${key}`;
    more.addEventListener('click', () => {
      if (all) state.showAllCalls.delete(key);
      else state.showAllCalls.add(key);
      actions.repaint();
    });
    section.append(more);
  }
  return section;
}

const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
const BANDS_SHOWN = [['weak', 'Not yet'], ['developing', 'Developing'], ['secure', 'Secure']] as const;
const BAND_NAME = { weak: 'Not yet', developing: 'Developing', secure: 'Secure' } as const;

/** How much to trust these groups: marks agreeing, quizzes against marked work, close calls. */
function trustPanel(evidence: Evidence[], titleOf: (source: string) => string, close: { count: number; placed: number }): HTMLElement {
  const host = el('section', 'mb-trust');
  host.setAttribute('aria-label', 'How much to trust these groups');
  host.append(el('h3', 'mb-trust__title', 'How much to trust these groups'));
  const list = el('dl', 'mb-trust__list');
  for (const line of trustLines(evidence, titleOf, close)) {
    const row = el('div', `mb-trust__row is-${line.tone}`);
    row.dataset.trust = line.key;
    const term = el('dt', 'mb-trust__term');
    term.append(el('span', 'mb-trust__dot'), document.createTextNode(line.title));
    row.append(term, el('dd', 'mb-trust__text', line.text));
    list.append(row);
  }
  host.append(list);
  return host;
}

/** The priorities, each with its own groups, and the bar that follows one student through them all. */
function prioritySets(top: Priority[], close: ReadonlyMap<string, ReadonlyMap<string, CloseCall>>, listed: RosterStudent[], saved: SavedGroup[], onRoster: Evidence[], label: (tag: string) => string, day: (date: string) => string, state: NextState, actions: NextActions): HTMLElement {
  const host = el('section', 'mb-sets');
  const byId = new Map(listed.map((s) => [s.id, s]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? 'Removed student';
  const overlap = notYetOnMany(top);
  const many = new Set(overlap?.students ?? []);
  const bar = el('div', 'mb-sets__student');
  bar.setAttribute('role', 'status');

  const paintPick = (): void => {
    host.classList.toggle('is-picking', state.picked !== null);
    for (const t of host.querySelectorAll<HTMLElement>('.mb-tok')) {
      const on = t.dataset.token === state.picked;
      t.classList.toggle('is-picked', on);
      t.setAttribute('aria-pressed', String(on));
    }
    bar.hidden = state.picked === null;
    bar.replaceChildren();
    const id = state.picked;
    if (id === null) return;
    const where = el('span', 'mb-sets__where');
    for (const p of top) {
      const near = close.get(p.tag)?.get(id);
      const at = p.weak.includes(id) ? 'Not yet' : p.developing.includes(id) ? 'Developing' : p.secure.includes(id) ? 'Secure' : 'Too few marks';
      where.append(el('span', 'mb-sets__at', `${label(p.tag)}: ${at}${near ? ` (${closeText(near, BAND_NAME)})` : ''}`));
    }
    const open = el('button', 'mb-sets__open', 'Open student');
    open.type = 'button';
    open.addEventListener('click', () => actions.openStudent(id));
    bar.append(el('strong', 'mb-sets__who', nameOf(id)), where, open);
  };

  const token = (id: string, near?: CloseCall): HTMLElement => {
    const b = el('button', `mb-tok${many.has(id) ? ' is-many' : ''}${near ? ' is-close' : ''}`, byId.get(id)?.initials ?? '–');
    b.type = 'button';
    b.dataset.token = id;
    const notes = [many.has(id) ? 'Not yet on two or more' : '', near ? closeText(near, BAND_NAME) : ''].filter(Boolean);
    b.title = [nameOf(id), ...notes].join(' · ');
    b.setAttribute('aria-label', [nameOf(id), ...notes].join(', '));
    b.addEventListener('click', () => {
      state.picked = state.picked === id ? null : id;
      paintPick();
    });
    return b;
  };

  const saveButton = (text: string, tags: string[], students: string[], name?: string): HTMLElement => {
    if (overlapsSaved(students, tags, saved)) return el('span', 'mb-set__saved', 'Saved');
    const b = el('button', 'mb-set__save', text);
    b.type = 'button';
    b.addEventListener('click', () => actions.saveGroup?.(tags, students, name));
    return b;
  };

  const shared = top[0]?.next && top.every((p) => p.next?.id === top[0]!.next!.id) ? top[0].next : null;
  const lead = el('div', 'mb-sets__lead');
  const count = `${COUNT_WORD[top.length] ?? top.length} ${top.length === 1 ? 'priority' : 'priorities'}`;
  lead.append(
    el('h3', 'mb-sets__title', shared ? `${count} for ${shared.title}, ${day(shared.date)}` : count),
    el('p', 'mb-sets__hint', top.length > 1 ? 'One set of groups for each. Press a student to find them in every set.' : 'Press a student to see where they sit.')
  );

  const cards = el('div', 'mb-sets__cards');
  for (const p of top) {
    const move = priorityMove(p);
    const card = el('article', `mb-set mb-set--${move.kind}`);
    card.dataset.tag = p.tag;
    const titles = el('div', 'mb-set__titles');
    titles.append(el('h4', 'mb-set__name', label(p.tag)), el('p', 'mb-set__how', move.text));
    const top_ = el('div', 'mb-set__top');
    top_.append(titles, el('span', 'mb-set__pct', pct(p.mean)));
    card.append(top_, spreadBar({ weak: p.weak.length, developing: p.developing.length, secure: p.secure.length, none: 0 }));
    const notes = priorityNotes(p, day, shared);
    if (notes.length) card.append(el('p', 'mb-set__note', notes.join(' · ')));
    for (const [band, title] of BANDS_SHOWN) {
      const ids = p[band];
      const pile = el('div', `mb-pile mb-pile--${band}`);
      pile.dataset.band = band;
      const head = el('div', 'mb-pile__head');
      head.append(el('span', 'mb-pile__title', `${title} · ${ids.length}`));
      if (ids.length && actions.saveGroup) head.append(saveButton('Save group', [p.tag], ids, `${label(p.tag)} · ${title}`));
      pile.append(head);
      if (ids.length) {
        const row = el('div', 'mb-tokens');
        row.append(...ids.map((id) => token(id, close.get(p.tag)?.get(id))));
        pile.append(row);
      } else pile.append(el('p', 'mb-pile__empty', band === 'secure' ? 'Everyone is still building this one.' : 'Nobody here yet.'));
      if (band === 'weak' && ids.length) {
        const tools = el('div', 'mb-move__tools');
        if (actions.followUp) {
          const ann = el('button', 'btn btn--secondary mb-move__ann', 'Ann drafts follow-up');
          ann.type = 'button';
          ann.addEventListener('click', () => actions.followUp?.(p.tag, ids, onRoster));
          tools.append(ann);
        }
        if (!p.wholeClass && actions.planTutorial) {
          const plan = el('button', 'btn btn--secondary mb-move__tutorial', 'Plan a tutorial');
          plan.type = 'button';
          plan.addEventListener('click', () => actions.planTutorial?.(p.tag, ids, onRoster));
          tools.append(plan);
        }
        if (tools.children.length) pile.append(tools);
      }
      card.append(pile);
    }
    const unmarked = listed.filter((s) => !p.weak.includes(s.id) && !p.developing.includes(s.id) && !p.secure.includes(s.id)).length;
    if (unmarked) card.append(el('p', 'mb-set__note', `${unmarked} with too few marks to place`));
    cards.append(card);
  }
  host.append(lead, cards, bar);

  if (overlap) {
    const strip = el('div', 'mb-overlap');
    const text = el('p', 'mb-overlap__text');
    const n = overlap.students.length;
    text.append(el('strong', 'mb-overlap__title', n === 1 ? `${nameOf(overlap.students[0]!)} is Not yet on two or more` : `${n} students are Not yet on two or more`));
    if (n > 1) text.append(document.createTextNode(`One group can cover them, working on ${label(overlap.first)} first.`));
    const row = el('div', 'mb-tokens');
    row.append(...overlap.students.map((id) => token(id)));
    strip.append(text, row);
    if (n > 1 && actions.saveGroup) {
      if (overlapsSaved(overlap.students, overlap.tags, saved)) strip.append(el('span', 'mb-set__saved', 'Saved'));
      else {
        const save = el('button', 'btn btn--secondary mb-overlap__save', 'Save as one group');
        save.type = 'button';
        save.addEventListener('click', () => actions.saveGroup?.(overlap.tags, overlap.students));
        strip.append(save);
      }
    }
    host.append(strip);
  }
  paintPick();
  return host;
}

export function renderNextSteps(view: MarkbookView, students: RosterStudent[], ctx: InsightContext, state: NextState, actions: NextActions): HTMLElement {
  const root = el('div', 'mb-next');
  const { evidence, sources } = classEvidence(view, ctx);
  const label = (tag: string): string => tagLabel(tag, ctx);
  const listed = students.filter((s) => !s.removed);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const names = (ids: string[]): string => ids.map((id) => nameOf.get(id) ?? 'Removed student').join(', ');
  const kind = moveKind(evidence);
  const needs = needKind(evidence);
  const listedIds = new Set(listed.map((s) => s.id));
  const onRoster = evidence.filter((e) => listedIds.has(e.student));

  // The three answers.
  const top = needs ? priorities(onRoster, sources, needs, { upcoming: actions.upcoming, lessonPoints: ctx.lessonPoints, today: actions.today ?? new Date().toISOString().slice(0, 10) }) : [];
  const today = actions.today ?? new Date().toISOString().slice(0, 10);
  const day = (date: string): string => (date === today ? 'today' : formatDay(date));
  const savedGroups = (view.markbook.groups ?? []).filter((g) => g.retired === null);
  if (state.picked && !listedIds.has(state.picked)) state.picked = null;
  // One close-call model for the tokens, the picked-student bar and the trust panel.
  const close = new Map(top.map((p) => [p.tag, closeCalls(onRoster, p.tag)]));
  const placed = top.reduce((n, p) => n + p.weak.length + p.developing.length + p.secure.length, 0);
  const closeCount = [...close.values()].reduce((n, m) => n + m.size, 0);
  const titleOf = (source: string): string => sources.find((s) => s.source === source)?.title ?? 'One piece';
  if (onRoster.length) root.append(trustPanel(onRoster, titleOf, { count: closeCount, placed }));
  const topHost = top.length
    ? prioritySets(top, close, listed, savedGroups, onRoster, label, day, state, actions)
    : el('p', 'mb__empty', 'No clear priority yet. Tag quiz questions or task criteria, and it needs two or more questions from at least three students.');
  const calls = needs ? studentCalls(onRoster, sources, listed.map((s) => s.id), needs, actions.pins, label) : { support: [], extend: [] };
  const callsHost = el('div', 'mb-calls');
  callsHost.append(
    callList('support', 'Needs support', 'Nobody stands out as needing support on these marks.', calls.support, nameOf, label, state, actions),
    callList('extend', 'Ready to extend', 'Nobody is high enough across their marks to extend yet.', calls.extend, nameOf, label, state, actions)
  );
  root.append(topHost, callsHost);

  // Suggested groups, for when a group is what's wanted.
  const movesHost = el('div', 'mb-next__moves');
  const moves = kind ? nextMoves(evidence.filter((e) => nameOf.has(e.student)), kind) : [];
  if (!moves.length) {
    movesHost.append(el('p', 'mb__empty', kind ? 'No clear move yet. A tag needs marks from at least three students on two or more questions.' : 'No tagged marks yet. Tag quiz questions or task criteria to see next steps.'));
  }
  // A suggestion that repeats a saved group is folded into that group, with its new students offered.
  const saved = savedGroups;
  const repeats = new Map<string, string[]>();
  const drawn = moves.filter((m) => {
    if (m.kind !== 'group') return true;
    const same = overlapsSaved(m.students, m.parts.map((p) => p.tag), saved);
    if (!same) return true;
    const have = activeMembers(same);
    repeats.set(same.id, [...new Set([...(repeats.get(same.id) ?? []), ...m.students.filter((st) => !have.includes(st))])]);
    return false;
  });
  const shown = state.showAllMoves ? drawn : drawn.slice(0, FIRST_MOVES);
  for (const move of shown) {
    const card = el('article', `mb-move mb-move--${move.kind}`);
    card.dataset.tag = move.tag;
    card.append(el('p', 'mb-move__kind', MOVE_TEXT[move.kind]), el('h4', 'mb-move__tag', move.parts.map((p) => label(p.tag)).join(' · ')));
    const meta =
      move.kind === 'reteach'
        ? `${pct(move.mean)} · ${move.students.length} of ${move.assessed} not there yet`
        : move.kind === 'group'
          ? move.parts.length > 1
            ? `${move.students.length} students behind on ${move.parts.length}`
            : `Class ${pct(move.mean)} · ${move.students.length} well behind`
          : `${pct(move.mean)} · ${move.secure.length} of ${move.assessed} secure`;
    card.append(el('p', 'mb-move__meta', meta));
    if (move.tag.startsWith('dp:')) {
      // Inside a dot point: the outcome and the skill that need the most.
      const inside = evidence.filter((e) => e.tags.includes(move.tag) && nameOf.has(e.student));
      const weakest = byTag(inside, 'out')[0];
      const skill = byTag(inside, 'skill')[0];
      const bits = [
        weakest ? `Outcome to work on: ${label(weakest.tag)} ${pct(weakest.mean)}` : '',
        skill ? `Skill to build: ${label(skill.tag)}, class at ${rungOf(skill.mean) === 'below' ? 'building towards Capable' : RUNG_NAME[rungOf(skill.mean) as Exclude<ReturnType<typeof rungOf>, 'below'>]}` : ''
      ].filter(Boolean);
      if (bits.length) card.append(el('p', 'mb-move__meta mb-move__inside', bits.join(' · ')));
    }
    const who = move.kind === 'move_on' ? move.secure : move.students;
    const list = el('p', 'mb-move__who', move.kind === 'move_on' ? `Ready to extend: ${names(who)}` : names(who));
    list.hidden = move.kind !== 'group';
    const tools = el('div', 'mb-move__tools');
    if (move.kind !== 'group') {
      const toggle = el('button', 'btn btn--ghost mb-move__toggle', move.kind === 'move_on' ? 'Who can extend' : 'Who');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        list.hidden = !list.hidden;
        toggle.setAttribute('aria-expanded', String(!list.hidden));
      });
      tools.append(toggle);
    }
    if (move.kind !== 'move_on' && actions.followUp) {
      // A merged group gets a follow-up per tag, for the students behind on it; each quiz stays on one thing.
      for (const part of move.parts) {
        const ann = el('button', 'btn btn--secondary mb-move__ann', move.parts.length > 1 ? `Ann drafts: ${label(part.tag)}` : 'Ann drafts follow-up');
        ann.type = 'button';
        ann.addEventListener('click', () => actions.followUp?.(part.tag, part.students, evidence));
        tools.append(ann);
      }
    }
    if (move.kind === 'group' && actions.planTutorial) {
      for (const part of move.parts) {
        const plan = el('button', 'btn btn--secondary mb-move__tutorial', move.parts.length > 1 ? `Plan a tutorial: ${label(part.tag)}` : 'Plan a tutorial');
        plan.type = 'button';
        plan.addEventListener('click', () => actions.planTutorial?.(part.tag, part.students, evidence));
        tools.append(plan);
      }
    }
    if (move.kind === 'group' && actions.saveGroup) {
      const save = el('button', 'btn btn--secondary mb-move__save', 'Save group');
      save.type = 'button';
      save.addEventListener('click', () => actions.saveGroup?.(move.parts.map((p) => p.tag), move.students));
      tools.append(save);
    }
    card.append(list, tools);
    movesHost.append(card);
  }
  if (drawn.length > FIRST_MOVES) {
    const more = el('button', 'btn btn--ghost mb-next__more', state.showAllMoves ? 'Show fewer' : `Show all ${drawn.length}`);
    more.type = 'button';
    more.addEventListener('click', () => {
      state.showAllMoves = !state.showAllMoves;
      actions.repaint();
    });
    movesHost.append(more);
  }
  const groupParts: HTMLElement[] = [];
  if (moves.length) groupParts.push(sectionHead('Suggested'), movesHost);

  if (saved.length) {
    const savedHost = el('section', 'mb-saved-list');
    savedHost.append(sectionHead('Saved groups'), el('p', 'mb__empty', 'Students leave a group as their marks show they’re secure.'));
    const reliability = agreement(onRoster).r;
    for (const g of saved) {
      const card = el('article', 'mb-saved');
      card.dataset.group = g.id;
      // Someone who has left the class is no longer in the group.
      const active = activeMembers(g).filter((m) => listedIds.has(m));
      const counted = g.members.filter((m) => m.left !== null || listedIds.has(m.student)).length;
      card.append(
        el('h4', 'mb-saved__name', g.name),
        el('p', 'mb-move__meta', `${g.tags.map(label).join(' · ')} · since ${formatDay(g.started)} · ${active.length} of ${counted} still in`)
      );
      const gain = groupGain(g, onRoster, reliability);
      if (gain) card.append(el('p', 'mb-move__meta mb-saved__gain', gainText(gain)));
      // The open card lists them, each with its Remove.
      if (state.editingGroup !== g.id) card.append(el('p', 'mb-move__who', names(active)));
      const extra = repeats.get(g.id) ?? [];
      if (extra.length && actions.addFlagged) {
        const add = el('button', 'btn btn--secondary mb-saved__add', `${extra.length} more flagged, add?`);
        add.type = 'button';
        add.addEventListener('click', () => actions.addFlagged?.(g.id, extra));
        card.append(add);
      }
      if (actions.renameGroup && actions.addMember && actions.removeMember) {
        if (state.editingGroup === g.id) card.append(groupEditor(g, active, listed, nameOf, state, actions));
        else {
          const edit = el('button', 'btn btn--ghost mb-saved__edit', 'Edit');
          edit.type = 'button';
          edit.setAttribute('aria-label', `Edit ${g.name}`);
          edit.dataset.refocus = `edit:${g.id}`;
          edit.addEventListener('click', () => {
            state.editingGroup = g.id;
            state.refocus = 'name';
            actions.repaint();
          });
          card.append(edit);
        }
      }
      savedHost.append(card);
    }
    groupParts.push(savedHost);
    // A redraw replaces the card, so put focus back once the markbook has drawn it.
    const refocus = state.refocus;
    // Kept while the card is open: a save still on its way will redraw it again.
    if (!state.editingGroup) state.refocus = null;
    if (refocus) queueMicrotask(() => savedHost.querySelector<HTMLElement>(`[data-refocus="${refocus}"]`)?.focus());
  }

  if (groupParts.length) {
    const bits = [saved.length ? `${saved.length} saved` : '', drawn.filter((m) => m.kind === 'group').length ? `${drawn.filter((m) => m.kind === 'group').length} suggested` : ''].filter(Boolean);
    root.append(fold('groups', bits.length ? `Groups · ${bits.join(', ')}` : 'Suggested moves', state, ...groupParts));
  }

  // The syllabus, outcome by outcome.
  const syllabus = syllabusRows(evidence, sources, listed.map((s) => s.id));
  const outcomeOrder = new Map(ctx.outcomes.map((o, i) => [`out:${o.id}`, i]));
  const sorted = [...syllabus].sort((a, b) =>
    state.syllabusSort === 'syllabus'
      ? (outcomeOrder.get(a.tag) ?? 999) - (outcomeOrder.get(b.tag) ?? 999) || label(a.tag).localeCompare(label(b.tag), undefined, { numeric: true })
      : state.syllabusSort === 'change'
        ? (a.change === null ? 1 : 0) - (b.change === null ? 1 : 0) || (a.change ?? 0) - (b.change ?? 0)
        : a.mean - b.mean
  );
  const sylHost = el('div', 'mb-next__syllabus');
  if (!sorted.length) sylHost.append(el('p', 'mb__empty', 'No syllabus links yet. Add dot points to a quiz’s lesson, or outcomes to a task’s criteria.'));
  else sylHost.append(legend());
  const rowFace = (row: SyllabusRow, small: boolean): HTMLElement => {
    const face = el('span', 'mb-syl__face');
    const name = el('span', 'mb-syl__name');
    name.append(el('span', 'mb-syl__code', label(row.tag)));
    const title = row.tag.startsWith('out:') ? ctx.outcomes.find((o) => `out:${o.id}` === row.tag)?.title : undefined;
    if (title) name.append(el('span', 'mb-syl__title', title));
    const nums = el('span', 'mb-syl__nums', pct(row.mean));
    if (row.change !== null) nums.append(el('span', `mb-syl__change${row.change < 0 ? ' is-down' : ''}`, signed(row.change)));
    face.append(name, spreadBar(row.spread, small), nums);
    return face;
  };
  for (const row of sorted) {
    if (!row.parts.length) {
      const flat = el('div', 'mb-syl mb-syl--flat');
      flat.append(rowFace(row, false));
      sylHost.append(flat);
      continue;
    }
    const details = el('details', 'mb-syl');
    details.dataset.tag = row.tag;
    details.open = state.openOutcomes.has(row.tag);
    details.addEventListener('toggle', () => {
      if (details.open) state.openOutcomes.add(row.tag);
      else state.openOutcomes.delete(row.tag);
    });
    const summary = el('summary', 'mb-syl__summary');
    summary.append(rowFace(row, false));
    const parts = el('div', 'mb-syl__parts');
    for (const part of [...row.parts].sort((a, b) => a.mean - b.mean)) {
      const line = el('div', 'mb-syl__part');
      line.append(rowFace(part, true));
      parts.append(line);
    }
    details.append(summary, parts);
    sylHost.append(details);
  }
  root.append(fold('syllabus', 'Syllabus', state,
    sectionHead('Syllabus', sorted.length > 1 ? pills<SyllabusSort>('Sort outcomes', [['weakest', 'Weakest'], ['syllabus', 'Syllabus order'], ['change', 'Biggest drop']], state.syllabusSort, (v) => { state.syllabusSort = v; actions.repaint(); }) : undefined),
    sylHost
  ));

  // Students, most need first.
  const rows = needs ? sortStudents(studentRows(evidence, sources, listed.map((s) => s.id), needs, actions.pins), state.studentSort, (id) => nameOf.get(id) ?? '') : [];
  const list = el('ul', 'mb-next__students');
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const row of rows) {
    const s = byId.get(row.student)!;
    const item = el('li', 'mb-who');
    const name = el('button', 'mb-who__name mb-patterns__name', `${s.initials} · ${s.name}`);
    name.type = 'button';
    name.dataset.student = s.id;
    name.addEventListener('click', () => actions.openStudent(s.id));
    const avg = el('span', 'mb-who__avg', pct(row.mean));
    if (row.change !== null && Math.abs(row.change) >= 0.05) {
      const arrow = el('span', `mb-who__trend ${row.change < 0 ? 'is-down' : 'is-up'}`, row.change < 0 ? '↓' : '↑');
      arrow.setAttribute('aria-label', `${signed(row.change)} since their first`);
      avg.append(arrow);
    }
    const chips = el('span', 'mb-who__chips');
    if (row.mean === null) chips.append(el('span', 'mb-who__chip', 'No marks yet'));
    for (const need of row.need) chips.append(el('span', `mb-who__chip ${need.mean !== null && need.mean < 0.5 ? 'is-low' : 'is-mid'}`, `${label(need.tag)} ${pct(need.mean)}`));
    if (row.mean !== null && !row.need.length && row.secure) chips.append(el('span', 'mb-who__chip is-high', `Secure on ${row.secure} of ${row.tags} · extend`));
    item.append(name, avg, chips);
    list.append(item);
  }
  root.append(fold('students', 'All students', state,
    sectionHead('Students', rows.length > 1 ? pills<StudentSort>('Sort students', [['need', 'Most need'], ['name', 'Name'], ['overall', 'Lowest average'], ['change', 'Biggest drop']], state.studentSort, (v) => { state.studentSort = v; actions.repaint(); }) : undefined),
    rows.length ? list : el('p', 'mb__empty', 'No tagged marks yet.')
  ));
  return root;
}

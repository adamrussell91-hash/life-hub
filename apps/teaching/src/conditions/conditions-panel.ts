import type { Lesson } from '@/schemas/lesson';
import type { ClassEvidence } from '@/network/coverage-map/mount';
import { conditionsApply, lessonConditions, type Condition, type ConditionId } from './lesson-conditions';
import { lessonTags, readinessGroups, slotNotes, type ClassSlot, type ReadinessLevel } from './readiness';
import { STOP_LABEL, type SpacingRow, type SpacingStop } from './spacing';
import './conditions.css';

/**
 * Learning conditions, teacher-only. A chip in the lesson's meta row opens a
 * panel above the canvas with three parts:
 *
 *   This lesson   which conditions for learning its blocks meet (no score)
 *   Bring back    dot points from earlier lessons the unit's spacing plan
 *                 places here
 *   Readiness     per class: who the markbook suggests starts at support,
 *                 core or extend, and timetable notes on tiring slots
 *
 * Suggestions go to the lesson agent as a chat message, so every change still
 * arrives as a proposal the teacher confirms.
 */

export type ConditionsPanelOptions = {
  getLesson: () => Lesson;
  /** Saves the conditions the teacher set aside for this lesson. */
  onOff: (ids: ConditionId[]) => void;
  /** Sends a message to the lesson agent. Without it, Suggest is hidden. */
  onAsk?: (message: string) => void;
  /** This lesson's revisits from the unit's spacing plan. */
  revisits?: () => Array<{ row: SpacingRow; stop: SpacingStop }>;
  /** A dot point's words, for `human:U2`. Falls back to the ref. */
  pointLabel?: (ref: string) => string;
  /** Each class's first scheduled slot for this lesson. */
  slots?: () => ClassSlot[];
  /** Classes that teach the lesson, with their markbook evidence on demand. */
  classes?: () => Array<{ id: string; name: string }>;
  loadClass?: (classId: string) => Promise<ClassEvidence>;
};

export type ConditionsPanelHandle = {
  chip: HTMLButtonElement;
  panel: HTMLElement;
  refresh(): void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function jumpTo(blockId: string): void {
  const target = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

const STATE_TEXT: Record<Condition['state'], string> = { present: 'In place', missing: 'Missing', not_relevant: 'Not needed', off: 'Not for this lesson' };
const LEVEL_TEXT: Record<ReadinessLevel, string> = { support: 'Support', core: 'Core', extend: 'Extend' };

export function mountConditionsPanel(options: ConditionsPanelOptions): ConditionsPanelHandle {
  const chip = el('button', 'lc-chip');
  chip.type = 'button';
  chip.setAttribute('aria-expanded', 'false');
  const chipText = el('span', 'lc-chip__text', 'Conditions');
  chip.append(el('span', 'lc-chip__mark'), chipText);

  const panel = el('section', 'lc');
  panel.setAttribute('aria-label', 'Learning conditions');
  panel.hidden = true;
  chip.addEventListener('click', () => setOpen(panel.hidden));

  /** Per class: groups loaded once per panel open. */
  const loaded = new Map<string, Promise<ClassEvidence>>();

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    chip.classList.toggle('is-open', open);
    if (open) draw();
  }

  function drawChip(conditions: Condition[] | null, revisits: number): void {
    const gaps = conditions?.filter((c) => c.state === 'missing').length ?? 0;
    const parts: string[] = [];
    if (gaps) parts.push(`${gaps} to look at`);
    if (revisits) parts.push(`${revisits} to bring back`);
    chipText.textContent = parts.length ? `Conditions · ${parts.join(' · ')}` : 'Conditions';
    chip.classList.toggle('has-gaps', gaps + revisits > 0);
    chip.title = 'Learning conditions: what this lesson does for attention, memory and readiness';
  }

  function draw(): void {
    const lesson = options.getLesson();
    const applies = conditionsApply(lesson.pedagogical_mode);
    const conditions = applies ? lessonConditions({ blocks: lesson.blocks, pedagogicalMode: lesson.pedagogical_mode, off: lesson.conditions_off ?? [] }) : null;
    const revisits = options.revisits?.() ?? [];
    drawChip(conditions, revisits.length);
    if (panel.hidden) return;

    const head = el('div', 'lc__head');
    head.append(el('h3', 'lc__title', 'Learning conditions'), button('lc__btn lc__close', 'Close', () => setOpen(false)));
    const intro = el('p', 'lc__intro', 'What this lesson does for attention, memory and readiness. A gap is a question, not a fault: mark it not for this lesson when it is on purpose.');
    const parts: HTMLElement[] = [head, intro];

    if (conditions) parts.push(conditionsSection(conditions, lesson));
    else parts.push(el('p', 'lc__note', 'Quiz and assessment lessons are tests, not teaching sequences, so the lesson conditions do not apply.'));
    if (revisits.length) parts.push(revisitSection(revisits));
    const readiness = readinessSection(lesson);
    if (readiness) parts.push(readiness);
    panel.replaceChildren(...parts);
  }

  function conditionsSection(conditions: Condition[], lesson: Lesson): HTMLElement {
    const section = el('div', 'lc__section');
    section.append(el('h4', 'lc__subtitle', 'This lesson'));
    const list = el('ul', 'lc__list');
    for (const c of conditions) {
      const row = el('li', `lc__row lc__row--${c.state}`);
      row.dataset.condition = c.id;
      const status = el('span', 'lc__state', STATE_TEXT[c.state]);
      const body = el('div', 'lc__body');
      body.append(el('strong', 'lc__label', c.label), el('span', 'lc__detail', c.detail));
      if (c.state === 'missing') body.append(el('span', 'lc__why', c.why));
      const actions = el('div', 'lc__actions');
      if (c.blockId) actions.append(button('lc__btn', 'Show', () => jumpTo(c.blockId!)));
      if (c.state === 'missing' && options.onAsk) actions.append(button('lc__btn lc__btn--primary', 'Suggest a block', () => options.onAsk!(c.ask)));
      if (c.state === 'missing' || c.state === 'off') {
        const isOff = c.state === 'off';
        actions.append(button('lc__btn', isOff ? 'Check it again' : 'Not for this lesson', () => {
          const current = new Set((lesson.conditions_off ?? []) as ConditionId[]);
          if (isOff) current.delete(c.id);
          else current.add(c.id);
          // The page redraws this panel after the save, from the new lesson.
          options.onOff([...current]);
        }));
      }
      row.append(status, body, actions);
      list.append(row);
    }
    section.append(list);
    return section;
  }

  function revisitSection(revisits: Array<{ row: SpacingRow; stop: SpacingStop }>): HTMLElement {
    const section = el('div', 'lc__section');
    section.append(el('h4', 'lc__subtitle', 'Bring back'));
    section.append(el('p', 'lc__intro', 'Dot points taught once in an earlier lesson. Retrieval at growing gaps keeps them.'));
    const list = el('ul', 'lc__list');
    for (const { row, stop } of revisits) {
      const item = el('li', 'lc__row lc__row--revisit');
      const words = options.pointLabel?.(row.ref) ?? row.ref;
      const first = row.taughtIn[0]!;
      const body = el('div', 'lc__body');
      body.append(el('strong', 'lc__label', words), el('span', 'lc__detail', `Taught in “${first.title}”, ${stop.gap} ${stop.gap === 1 ? 'day' : 'days'} before this lesson. ${STOP_LABEL[stop.why]}.`));
      const actions = el('div', 'lc__actions');
      if (options.onAsk) {
        actions.append(button('lc__btn lc__btn--primary', 'Suggest retrieval', () => options.onAsk!(
          `Propose two or three short retrieval questions for the start of this lesson on the dot point “${words}” (${row.ref}), first taught in the earlier lesson “${first.title}”. Students should answer from memory, with no notes. Use a quiz question, flashcards or cloze block.`
        )));
      }
      item.append(el('span', 'lc__state', STOP_LABEL[stop.why]), body, actions);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function readinessSection(lesson: Lesson): HTMLElement | null {
    const classes = options.classes?.() ?? [];
    const notes = slotNotes(options.slots?.() ?? []);
    const tags = lessonTags(lesson);
    const canGroup = Boolean(options.loadClass && classes.length && tags.length);
    if (!canGroup && !notes.length) return null;
    const section = el('div', 'lc__section');
    section.append(el('h4', 'lc__subtitle', 'Readiness'));
    for (const note of notes) {
      section.append(el('p', 'lc__note', `${note.className}, ${note.date}: ${note.reason}. Consider less new content and more retrieval.`));
    }
    if (!canGroup) {
      if (classes.length && !tags.length) section.append(el('p', 'lc__note', 'Tick this lesson’s dot points to see who starts at support, core or extend.'));
      return section;
    }
    section.append(el('p', 'lc__intro', 'From each class’s markbook, on this lesson’s dot points, pieces and skills. Teacher-only: students never see a level.'));
    for (const c of classes) {
      const box = el('div', 'lc__class');
      const out = el('div', 'lc__groups');
      const show = button('lc__btn', `Groups for ${c.name}`, () => {
        show.disabled = true;
        out.replaceChildren(el('p', 'lc__note', 'Loading the markbook…'));
        if (!loaded.has(c.id)) loaded.set(c.id, options.loadClass!(c.id));
        loaded.get(c.id)!
          .then((data) => {
            const names = new Map(data.students.map((s) => [s.id, s.name] as const));
            const groups = readinessGroups(data.evidence, data.students.map((s) => s.id), tags);
            const cols: HTMLElement[] = [];
            for (const level of ['support', 'core', 'extend'] as const) {
              const col = el('div', `lc__group lc__group--${level}`);
              col.append(el('strong', 'lc__group-title', `${LEVEL_TEXT[level]} · ${groups[level].length}`));
              const ul = el('ul', 'lc__names');
              for (const id of groups[level]) ul.append(el('li', undefined, names.get(id) ?? id));
              col.append(ul);
              cols.push(col);
            }
            const foot = groups.unknown.length
              ? el('p', 'lc__note', `${groups.unknown.length} without enough marks on these yet: they start at core.`)
              : null;
            out.replaceChildren(...cols, ...(foot ? [foot] : []));
          })
          .catch(() => {
            loaded.delete(c.id);
            out.replaceChildren(el('p', 'lc__note', 'Could not load this class’s markbook.'));
            show.disabled = false;
          });
      });
      box.append(show, out);
      section.append(box);
    }
    return section;
  }

  return { chip, panel, refresh: draw };
}

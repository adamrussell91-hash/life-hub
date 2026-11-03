import './organiser.css';
import { navigate } from '@/app/router';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { lessonsByDate } from '@/teacher/unit-lesson-order';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Unit } from '@/schemas';
import { organiserApi } from './api';
import {
  anthologyFromLessons,
  anthologyItems,
  BRING_LABEL,
  bringLine,
  deepItems,
  freshItems,
  loadUnitLessons,
  planItems,
  renderBringPanel,
  type BringItem,
  type BringSource
} from './bring-in';
import { createSerialQueue, lessonCodes, noCardWarning, parsePaste, toggleHide, USUAL_THREE } from './editor-model';
import { printOrganiser } from './print';
import type { OrganiserChange, OrganiserKind, OrganiserSection, TeacherOrganiser } from './types';

/**
 * The whole sheet on the unit page: set for this week, sections and their lines, hide pills,
 * paste, bring in, reorder, print, run with the class, and the routine as help text.
 * Cell edits wait ~600ms, then go to the server one at a time. Every reply replaces the state,
 * but the page is not redrawn while a field has focus.
 */

export interface OrganiserSectionOptions {
  unit: Unit;
  lessons: Array<{ id: string; title: string; sequence: number }>;
  classes: Array<{ id: string; label: string }>;
  curriculum: CurriculumResponse;
}

const SAVE_DELAY_MS = 600;
const KINDS: Array<{ kind: OrganiserKind; label: string }> = [
  { kind: 'table', label: 'Table' },
  { kind: 'list', label: 'List' },
  { kind: 'sequence', label: 'Sequence' }
];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className = 'btn btn--ghost ko-btn', onClick?: () => void): HTMLButtonElement {
  const node = h('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function pill(label: string, pressed: boolean, onClick: () => void): HTMLButtonElement {
  const node = button(label, 'ko-pill', onClick);
  node.setAttribute('aria-pressed', String(pressed));
  return node;
}

function mini(label: string, aria: string, onClick: () => void, disabled = false, extra = ''): HTMLButtonElement {
  const node = button(label, `ko-mini${extra ? ` ${extra}` : ''}`, onClick);
  node.setAttribute('aria-label', aria);
  node.disabled = disabled;
  return node;
}

const isField = (node: Element | null): boolean => !!node && node.matches('input, textarea, select');
const sameCells = (a: readonly string[] | undefined, b: readonly string[]): boolean => !!a && a.length === b.length && a.every((c, i) => c === b[i]);
const shorten = (text: string, n: number): string => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

const ROUTINE: string[] = [
  'In the first lesson, model it: read a section aloud, cover a column, say it from memory, then uncover and check.',
  'Open most lessons with a three to five minute starter from the sheet, using Run with the class.',
  'Let pairs test each other, one covering and one checking, then swap.',
  'Name the sections students practise for the next review so homework has a clear job.',
  'Check it with review quizzes, and look for the same knowledge in their writing and vivas.'
];

export function mountOrganiserSection(host: HTMLElement, options: OrganiserSectionOptions): { dispose(): void } {
  const { unit, classes } = options;
  const root = h('div', 'ko-root');
  host.append(root);

  const ordered = lessonsByDate(
    options.lessons,
    options.curriculum.scheduled_lessons.filter((row) => row.unit_id === unit.id)
  );
  const order = ordered.map((lesson) => lesson.id);
  const codes = lessonCodes(order);
  const titleOf = new Map(options.lessons.map((lesson) => [lesson.id, lesson.title]));

  let data: TeacherOrganiser | null = null;
  let loadFailed = false;
  let status = '';
  let statusBad = false;
  let disposed = false;
  let renderPending = false;
  const open = new Set<string>();
  let openedFirst = false;
  const local = new Map<string, string[]>();
  const timers = new Map<string, number>();
  const drafts = new Map<string, string[]>();
  let weekDraft: { section_id: string; due: string; reason: string } | null = null;
  let weekDirty = false;
  let which: 'run' | 'print' | null = null;
  let panel: { kind: 'paste' | 'bring'; section_id: string; source?: BringSource } | null = null;
  let pasteText = '';
  let bringCache: Promise<{ deep: BringItem[]; anthology: BringItem[]; plan: BringItem[] }> | null = null;
  let focusAfter: (() => void) | null = null;
  const queue = createSerialQueue();

  const organiser = () => data?.organiser;
  const sectionOf = (id: string): OrganiserSection | undefined => organiser()?.sections.find((s) => s.id === id);

  // ---- talking to the server ---------------------------------------------------------------

  function say(text: string, bad = false): void {
    status = text;
    statusBad = bad;
  }

  function reason(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'That did not save. Try again.';
  }

  function softRender(): void {
    if (disposed) return;
    if (host.contains(document.activeElement) && isField(document.activeElement)) {
      renderPending = true;
      return;
    }
    render();
  }

  /** One change, in order. Resolves true when the server took it. */
  function send(change: OrganiserChange, after?: (before: TeacherOrganiser | null, next: TeacherOrganiser) => void): Promise<boolean> {
    return queue
      .add(() => organiserApi.change(unit.id, change))
      .then((next) => {
        const before = data;
        data = next;
        say('');
        after?.(before, next);
        softRender();
        return true;
      })
      .catch(async (error: unknown) => {
        say(reason(error), true);
        // Lines the server turned down are put back as the server holds them.
        await organiserApi.get(unit.id).then((fresh) => { data = fresh; }).catch(() => undefined);
        render();
        return false;
      });
  }

  function flushLine(lineId: string): void {
    window.clearTimeout(timers.get(lineId));
    timers.delete(lineId);
    const cells = local.get(lineId);
    if (!cells) return;
    const sent = cells.slice();
    void send({ op: 'update_line', line_id: lineId, cells: sent }, () => {
      if (sameCells(local.get(lineId), sent)) local.delete(lineId);
    });
  }

  function editLine(lineId: string, cells: string[]): void {
    local.set(lineId, cells);
    window.clearTimeout(timers.get(lineId));
    timers.set(lineId, window.setTimeout(() => flushLine(lineId), SAVE_DELAY_MS));
  }

  function load(): void {
    loadFailed = false;
    render();
    void organiserApi
      .get(unit.id)
      .then((next) => {
        if (disposed) return;
        data = next;
        if (!openedFirst) {
          openedFirst = true;
          if (next.organiser.sections[0]) open.add(next.organiser.sections[0].id);
        }
        render();
      })
      .catch(() => {
        if (disposed) return;
        loadFailed = true;
        render();
      });
  }

  // ---- pieces of the page ------------------------------------------------------------------

  function classThen(run: (classId: string) => void, which_: 'run' | 'print'): void {
    if (classes.length === 1) return run(classes[0].id);
    which = which === which_ ? null : which_;
    render();
  }

  function runWith(classId: string): void {
    which = null;
    navigate(`/units/${encodeURIComponent(unit.id)}/organiser/run?class=${encodeURIComponent(classId)}`);
  }

  function printFor(classId: string): void {
    which = null;
    say('Getting the sheet…');
    render();
    void organiserApi
      .get(unit.id, classId)
      .then((res) => {
        if (disposed) return;
        if (!res.sheet || !res.sheet.sections.length) {
          say('Nothing is released for that class yet, so there is nothing to print.');
          render();
          return;
        }
        say('');
        render();
        printOrganiser(res.sheet);
      })
      .catch((error: unknown) => {
        say(reason(error), true);
        render();
      });
  }

  function headBlock(): HTMLElement {
    const head = h('div', 'ko-head');
    const text = h('div');
    text.append(
      h('h2', 'ko-title', 'Organiser'),
      h('p', 'ko-sub', 'Lines come from your lessons. Students see a line once its lesson is published and its class date arrives.')
    );
    const actions = h('div', 'ko-actions');
    const runBtn = button('Run with the class', 'btn btn--ghost ko-btn', () => classThen(runWith, 'run'));
    const printBtn = button('Print', 'btn btn--ghost ko-btn', () => classThen(printFor, 'print'));
    if (!classes.length) {
      runBtn.disabled = true;
      printBtn.disabled = true;
      runBtn.title = printBtn.title = 'Give this unit to a class first.';
    }
    actions.append(runBtn, printBtn);
    head.append(text, actions);
    if (which && classes.length > 1) {
      const ask = h('div', 'ko-pills');
      ask.append(h('span', 'ko-label', which === 'run' ? 'Run with which class?' : 'Print for which class?'));
      for (const klass of classes) ask.append(pill(klass.label, false, () => (which === 'run' ? runWith(klass.id) : printFor(klass.id))));
      head.append(ask);
    }
    return head;
  }

  function weekBlock(): HTMLElement | null {
    const org = organiser();
    if (!org || !org.sections.length) return null;
    if (!weekDraft || !weekDirty) {
      weekDraft = org.week ? { section_id: org.week.section_id, due: org.week.due, reason: org.week.reason } : { section_id: '', due: '', reason: '' };
    }
    const draft = weekDraft;
    const save = (): void => {
      if (!draft.section_id) {
        if (org.week) void send({ op: 'set_week', week: null });
        weekDirty = false;
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.due)) return;
      weekDirty = false;
      void send({ op: 'set_week', week: { section_id: draft.section_id, due: draft.due, reason: draft.reason.trim().slice(0, 80) } });
    };
    const box = h('div', 'ko-block');
    box.append(h('b', 'ko-block__title', 'Set for this week'));
    const row = h('div', 'ko-setbox');
    const pills = h('div', 'ko-pills');
    for (const section of org.sections) {
      pills.append(
        pill(section.name || 'Untitled', draft.section_id === section.id, () => {
          draft.section_id = draft.section_id === section.id ? '' : section.id;
          weekDirty = true;
          save();
          render();
        })
      );
    }
    const date = h('input');
    date.type = 'date';
    date.value = draft.due;
    date.setAttribute('aria-label', 'Due date');
    date.addEventListener('change', () => { draft.due = date.value; weekDirty = true; save(); });
    const why = h('input');
    why.type = 'text';
    why.maxLength = 80;
    why.placeholder = 'Week 3 Review';
    why.value = draft.reason;
    why.setAttribute('aria-label', 'Reason');
    why.addEventListener('change', () => { draft.reason = why.value; weekDirty = true; save(); });
    row.append(pills, h('span', undefined, 'by'), date, h('span', undefined, 'for'), why);
    box.append(row);
    box.append(
      h(
        'p',
        'ko-status',
        draft.section_id && !draft.due
          ? 'Pick the day it is due and the banner turns on.'
          : 'Students see this banner on their Organiser tab until the day after the date.'
      )
    );
    return box;
  }

  function lessonPicker(lineId: string, current: string | undefined, gone: boolean): HTMLSelectElement {
    const select = h('select');
    select.setAttribute('aria-label', 'Lesson this line comes from');
    const none = h('option', undefined, 'No lesson');
    none.value = '';
    select.append(none);
    ordered.forEach((lesson) => {
      const opt = h('option', undefined, shorten(`${codes.get(lesson.id)} ${lesson.title}`, 30));
      opt.value = lesson.id;
      opt.title = lesson.title;
      select.append(opt);
    });
    if (current && !codes.has(current)) {
      const opt = h('option', undefined, gone ? 'Lesson removed' : 'Another lesson');
      opt.value = current;
      select.append(opt);
    }
    select.value = current ?? '';
    select.addEventListener('change', () => {
      void send({ op: 'update_line', line_id: lineId, lesson_id: select.value || null });
    });
    return select;
  }

  function fromCell(section: OrganiserSection, lineIndex: number, td: HTMLElement): void {
    const line = section.lines[lineIndex];
    const state = data?.status[line.id];
    td.append(lessonPicker(line.id, line.lesson_id, state === 'lesson_gone'));
    if (line.piece_id) td.append(' ', Object.assign(h('span', 'ko-chip', 'Piece'), { title: 'Linked to a knowledge piece. Only you see this.' }));
    if (state === 'waiting') td.append(h('small', undefined, 'Waiting'));
    if (state === 'lesson_gone') td.append(h('small', undefined, 'Lesson removed. Pick another.'));
  }

  function controls(section: OrganiserSection, i: number): HTMLElement {
    const line = section.lines[i];
    const box = h('div', 'ko-row');
    box.style.flexWrap = 'nowrap';
    box.append(
      mini('↑', 'Move line up', () => void send({ op: 'move_line', line_id: line.id, to: i - 1 }), i === 0),
      mini('↓', 'Move line down', () => void send({ op: 'move_line', line_id: line.id, to: i + 1 }), i === section.lines.length - 1),
      mini('✕', 'Delete line', () => {
        window.clearTimeout(timers.get(line.id));
        timers.delete(line.id);
        local.delete(line.id);
        void send({ op: 'delete_line', line_id: line.id });
      }, false, 'ko-mini--danger')
    );
    return box;
  }

  function cellField(section: OrganiserSection, i: number, c: number, label: string): HTMLTextAreaElement {
    const line = section.lines[i];
    const field = h('textarea');
    field.rows = 1;
    field.maxLength = 400;
    field.setAttribute('aria-label', label);
    field.value = (local.get(line.id) ?? line.cells)[c] ?? '';
    field.addEventListener('input', () => {
      const cells = (local.get(line.id) ?? line.cells).slice();
      cells[c] = field.value;
      editLine(line.id, cells);
    });
    field.addEventListener('change', () => flushLine(line.id));
    return field;
  }

  function draftFor(section: OrganiserSection): string[] {
    const width = section.kind === 'table' ? (section.columns ?? []).length : 1;
    let draft = drafts.get(section.id);
    if (!draft || draft.length !== width) {
      draft = new Array<string>(width).fill('');
      drafts.set(section.id, draft);
    }
    return draft;
  }

  function addDraft(section: OrganiserSection): void {
    const draft = draftFor(section);
    if (!draft.some((c) => c.trim())) return;
    const cells = draft.slice();
    drafts.set(section.id, new Array<string>(draft.length).fill(''));
    void send({ op: 'add_lines', section_id: section.id, lines: [{ cells }] }, () => {
      focusAfter = () => root.querySelector<HTMLTextAreaElement>(`[data-draft="${section.id}"] textarea`)?.focus();
    });
  }

  function draftFields(section: OrganiserSection, labels: string[]): HTMLTextAreaElement[] {
    const draft = draftFor(section);
    return labels.map((label, c) => {
      const field = h('textarea');
      field.rows = 1;
      field.maxLength = 400;
      field.placeholder = label;
      field.setAttribute('aria-label', `New line: ${label}`);
      field.value = draft[c] ?? '';
      field.addEventListener('input', () => { draft[c] = field.value; });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          draft[c] = field.value;
          addDraft(section);
        }
      });
      return field;
    });
  }

  function tableBlock(section: OrganiserSection): HTMLElement {
    const columns = section.columns ?? [];
    const scroll = h('div', 'ko-scroll');
    scroll.dataset.scrollFor = section.id;
    const table = h('table', 'ko-t');
    const head = h('tr');
    for (const column of columns) {
      const th = h('th');
      const input = h('input');
      input.value = column.label;
      input.maxLength = 60;
      input.setAttribute('aria-label', 'Column heading');
      input.addEventListener('change', () => {
        const label = input.value.trim() || column.label;
        void send({ op: 'update_section', section_id: section.id, columns: columns.map((c) => (c.id === column.id ? { ...c, label } : c)) });
      });
      th.append(input);
      head.append(th);
    }
    head.append(h('th', 'ko-from', 'From'), h('th', 'ko-ctl'));
    const thead = h('thead');
    thead.append(head);
    const body = h('tbody');
    section.lines.forEach((line, i) => {
      const tr = h('tr');
      const state = data?.status[line.id];
      if (state && state !== 'released') tr.className = 'is-wait';
      columns.forEach((column, c) => {
        const td = h('td');
        td.append(cellField(section, i, c, column.label));
        tr.append(td);
      });
      const from = h('td', 'ko-from');
      fromCell(section, i, from);
      const ctl = h('td', 'ko-ctl');
      ctl.append(controls(section, i));
      tr.append(from, ctl);
      body.append(tr);
    });
    const add = h('tr', 'ko-new');
    add.dataset.draft = section.id;
    for (const field of draftFields(section, columns.map((c) => c.label))) {
      const td = h('td');
      td.append(field);
      add.append(td);
    }
    const addCell = h('td', 'ko-ctl');
    addCell.colSpan = 2;
    addCell.append(button('Add line', 'btn btn--ghost ko-btn', () => addDraft(section)));
    add.append(addCell);
    body.append(add);
    table.append(thead, body);
    scroll.append(table);
    return scroll;
  }

  function listBlock(section: OrganiserSection): HTMLElement {
    const list = h('ul', 'ko-lines');
    section.lines.forEach((line, i) => {
      const li = h('li');
      const field = cellField(section, i, 0, section.kind === 'sequence' ? `Step ${i + 1}` : 'Item');
      const from = h('div', 'ko-from');
      fromCell(section, i, from);
      li.append(field, from, controls(section, i));
      if (data?.status[line.id] && data.status[line.id] !== 'released') li.style.opacity = '.75';
      list.append(li);
    });
    const li = h('li');
    li.dataset.draft = section.id;
    const [field] = draftFields(section, [section.kind === 'sequence' ? 'Next step' : 'New item']);
    li.append(field, button('Add line', 'btn btn--ghost ko-btn', () => addDraft(section)));
    list.append(li);
    return list;
  }

  async function removeColumn(section: OrganiserSection, columnId: string): Promise<void> {
    const columns = section.columns ?? [];
    const at = columns.findIndex((c) => c.id === columnId);
    const hasText = section.lines.some((l) => (local.get(l.id) ?? l.cells)[at]?.trim());
    if (hasText) {
      const ok = await askConfirmCard({
        title: `Remove the “${columns[at].label}” column?`,
        supporting: 'The words in that column are removed from every line.',
        confirmLabel: 'Remove column'
      });
      if (!ok) return;
    }
    const left = columns.filter((c) => c.id !== columnId);
    if (left.every((c) => c.hide)) left[0] = { ...left[0], hide: false };
    void send({ op: 'update_section', section_id: section.id, columns: left });
  }

  function sectionBody(section: OrganiserSection, index: number): HTMLElement {
    const box = h('div', 'ko-block');
    box.dataset.section = section.id;
    const top = h('div', 'ko-row');
    const name = h('input', 'ko-name');
    name.value = section.name;
    name.maxLength = 60;
    name.setAttribute('aria-label', 'Section name');
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (next && next !== section.name) void send({ op: 'update_section', section_id: section.id, name: next });
    });
    const kinds = h('div', 'ko-pills');
    for (const { kind, label } of KINDS) {
      kinds.append(
        pill(label, section.kind === kind, () => {
          if (section.kind !== kind) void send({ op: 'update_section', section_id: section.id, kind });
        })
      );
    }
    const total = organiser()?.sections.length ?? 0;
    top.append(
      name,
      kinds,
      mini('↑', 'Move section up', () => void send({ op: 'move_section', section_id: section.id, to: index - 1 }), index === 0),
      mini('↓', 'Move section down', () => void send({ op: 'move_section', section_id: section.id, to: index + 1 }), index === total - 1),
      mini('Hide', 'Fold this section', () => { open.delete(section.id); render(); }),
      mini('✕', 'Delete section', () => {
        void askConfirmCard({
          title: `Delete “${section.name}”?`,
          supporting: `Its ${section.lines.length} line${section.lines.length === 1 ? '' : 's'} are deleted too.`,
          confirmLabel: 'Delete section'
        }).then((ok) => { if (ok) void send({ op: 'delete_section', section_id: section.id }); });
      }, false, 'ko-mini--danger')
    );
    box.append(top);

    box.append(section.kind === 'table' ? tableBlock(section) : listBlock(section));

    if (section.kind === 'table') {
      const columns = section.columns ?? [];
      const hide = h('div', 'ko-pills');
      hide.append(h('span', 'ko-label', 'Usually hide:'));
      for (const column of columns) {
        hide.append(pill(column.label || 'Column', column.hide, () => void send({ op: 'update_section', section_id: section.id, columns: toggleHide(columns, column.id) })));
      }
      if (columns.length < 4) hide.append(button('Add column', 'btn btn--quiet ko-btn', () => void send({ op: 'update_section', section_id: section.id, columns: [...columns, { label: 'Column', hide: false }] })));
      if (columns.length > 2) {
        for (const column of columns) {
          hide.append(button(`Remove “${shorten(column.label || 'Column', 14)}”`, 'btn btn--quiet ko-btn', () => void removeColumn(section, column.id)));
        }
      }
      box.append(hide);
      const warn = noCardWarning(section);
      if (warn) box.append(h('p', 'ko-warn', warn));
    }

    const tools = h('div', 'ko-row');
    tools.append(
      button('Paste from Word or Sheets', 'btn btn--ghost ko-btn', () => {
        panel = panel?.kind === 'paste' && panel.section_id === section.id ? null : { kind: 'paste', section_id: section.id };
        render();
      }),
      h('span', 'ko-label', 'Bring in:')
    );
    for (const source of ['deep', 'anthology', 'plan'] as BringSource[]) {
      tools.append(
        pill(BRING_LABEL[source], panel?.kind === 'bring' && panel.section_id === section.id && panel.source === source, () => {
          panel = panel?.kind === 'bring' && panel.section_id === section.id && panel.source === source ? null : { kind: 'bring', section_id: section.id, source };
          render();
        })
      );
    }
    box.append(tools);

    if (panel && panel.section_id === section.id) box.append(panel.kind === 'paste' ? pastePanel(section) : bringHolder(section, panel.source as BringSource));
    return box;
  }

  function pastePanel(section: OrganiserSection): HTMLElement {
    const width = section.kind === 'table' ? (section.columns ?? []).length : 1;
    const wrap = h('div', 'ko-paste ko-bring');
    wrap.append(h('p', 'ko-bring__head', `Paste rows. Each new line is a line, each tab starts a cell${width > 1 ? `, and the first ${width} cells are used` : ''}.`));
    const area = h('textarea');
    area.value = pasteText;
    area.setAttribute('aria-label', 'Pasted rows');
    const count = h('p', 'ko-status');
    const update = (): void => {
      const rows = parsePaste(area.value, width);
      count.textContent = rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'} ready.` : 'Nothing to add yet.';
      add.disabled = !rows.length;
    };
    const add = button('Add these rows', 'btn btn--primary ko-btn', () => {
      const rows = parsePaste(area.value, width);
      if (!rows.length) return;
      add.disabled = true;
      pasteText = '';
      panel = null;
      void send({ op: 'add_lines', section_id: section.id, lines: rows.map((cells) => ({ cells })) });
    });
    area.addEventListener('input', () => { pasteText = area.value; update(); });
    update();
    const actions = h('div', 'ko-actions');
    actions.append(add, button('Close', 'btn btn--ghost ko-btn', () => { panel = null; render(); }));
    wrap.append(area, count, actions);
    return wrap;
  }

  function bringData() {
    bringCache ??= (async () => {
      const lessons = await loadUnitLessons(order);
      const deep = unit.deep_understandings ?? [];
      const plan = options.curriculum.scope_sequences
        .find((scope) => scope.subject_id === unit.subject_id && scope.knowledge_plan)
        ?.knowledge_plan?.units.find((row) => row.unit_id === unit.id);
      return {
        deep: deepItems(deep, lessons, order),
        anthology: anthologyItems(anthologyFromLessons(lessons, order)),
        plan: planItems(plan, lessons, order, deep)
      };
    })();
    return bringCache;
  }

  function bringHolder(section: OrganiserSection, source: BringSource): HTMLElement {
    const holder = h('div');
    holder.append(h('p', 'ko-status', 'Loading…'));
    void bringData().then(
      (all) => {
        if (disposed || !holder.isConnected || !data) return;
        const items = freshItems(all[source], data.organiser);
        const current = sectionOf(section.id) ?? section;
        holder.replaceChildren(
          renderBringPanel({
            title: BRING_LABEL[source],
            items,
            onAdd: async (chosen) => {
              const ok = await send({ op: 'add_lines', section_id: section.id, lines: chosen.map((item) => bringLine(item, current)) });
              if (!ok) throw new Error('not added');
            },
            onClose: () => { panel = null; render(); }
          })
        );
      },
      () => {
        holder.replaceChildren(h('p', 'ko-status ko-status--bad', 'Could not read the source. Close this and try again.'));
      }
    );
    return holder;
  }

  function collapsed(section: OrganiserSection): HTMLElement {
    const box = h('div', 'ko-block');
    const row = button('', 'ko-collapsed', () => { open.add(section.id); render(); });
    const released = section.lines.filter((l) => data?.status[l.id] === 'released').length;
    const kind = KINDS.find((k) => k.kind === section.kind)?.label ?? '';
    row.append(h('b', undefined, section.name || 'Untitled'), h('span', undefined, `${kind} · ${released} released, ${section.lines.length} written`));
    box.append(row);
    return box;
  }

  function startBlock(): HTMLElement {
    const box = h('div', 'ko-block');
    box.append(h('b', 'ko-block__title', 'Start your organiser'));
    box.append(h('p', 'ko-sub', 'Three sections most units use: Key ideas, Vocabulary and Key lines. In each, the middle column starts covered for practice.'));
    const go = button('Start with the usual three', 'btn btn--primary ko-btn', () => {
      go.disabled = true;
      void (async () => {
        for (const spec of USUAL_THREE) {
          const ok = await send({ op: 'add_section', name: spec.name, kind: 'table', columns: spec.columns });
          if (!ok) return;
        }
        const first = data?.organiser.sections[0];
        if (first) open.add(first.id);
        render();
      })();
    });
    box.append(go);
    return box;
  }

  function addSectionRow(): HTMLElement {
    const row = h('div', 'ko-row');
    row.append(h('span', 'ko-label', 'Add section:'));
    const count = organiser()?.sections.length ?? 0;
    for (const { kind, label } of KINDS) {
      const add = button(label, 'ko-pill', () => {
        const prior = new Set((organiser()?.sections ?? []).map((s) => s.id));
        void send(
          {
            op: 'add_section',
            name: `New ${label.toLowerCase()}`,
            kind,
            ...(kind === 'table' ? { columns: [{ label: 'Prompt', hide: false }, { label: 'Answer', hide: true }] } : {})
          },
          (_before, next) => {
            const created = next.organiser.sections.find((s) => !prior.has(s.id));
            if (!created) return;
            open.add(created.id);
            focusAfter = () => {
              const input = root.querySelector<HTMLInputElement>(`[data-section="${created.id}"] .ko-name`);
              input?.focus();
              input?.select();
            };
          }
        );
      });
      if (count >= 8) add.disabled = true;
      row.append(add);
    }
    if (count >= 8) row.append(h('span', 'ko-label', 'A unit can have 8 sections.'));
    return row;
  }

  function helpBlock(): HTMLElement {
    const details = h('details', 'ko-help');
    details.append(h('summary', undefined, 'The routine that makes the organiser work'));
    const list = h('ul');
    for (const step of ROUTINE) list.append(h('li', undefined, step));
    details.append(list);
    return details;
  }

  // ---- drawing -----------------------------------------------------------------------------

  function render(): void {
    if (disposed) return;
    renderPending = false;
    const scrolls = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('[data-scroll-for]').forEach((node) => scrolls.set(node.dataset.scrollFor ?? '', node.scrollLeft));

    root.replaceChildren(headBlock());
    if (status) {
      const line = h('p', `ko-status${statusBad ? ' ko-status--bad' : ''}`, status);
      line.setAttribute('role', 'status');
      root.append(line);
    }

    if (loadFailed) {
      const again = button('Try again', 'btn btn--ghost ko-btn', load);
      root.append(h('p', 'ko-status ko-status--bad', 'The organiser could not be loaded.'), again);
      return;
    }
    if (!data) {
      root.append(h('p', 'ko-status', 'Loading the organiser…'));
      return;
    }

    const sections = data.organiser.sections;
    const week = weekBlock();
    if (week) root.append(week);
    if (!sections.length) root.append(startBlock());
    sections.forEach((section, i) => root.append(open.has(section.id) ? sectionBody(section, i) : collapsed(section)));
    root.append(addSectionRow(), helpBlock());

    scrolls.forEach((left, id) => {
      const node = root.querySelector<HTMLElement>(`[data-scroll-for="${id}"]`);
      if (node) node.scrollLeft = left;
    });
    const run = focusAfter;
    focusAfter = null;
    run?.();
  }

  const onFocusOut = (): void => {
    window.setTimeout(() => {
      if (!renderPending || disposed) return;
      if (host.contains(document.activeElement) && isField(document.activeElement)) return;
      render();
    }, 0);
  };
  root.addEventListener('focusout', onFocusOut);

  load();

  return {
    dispose() {
      // Edits still waiting for their delay go now, so leaving the page loses nothing.
      for (const lineId of [...local.keys()]) flushLine(lineId);
      disposed = true;
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      root.removeEventListener('focusout', onFocusOut);
      root.remove();
    }
  };
}

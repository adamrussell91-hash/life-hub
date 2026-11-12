// apps/teaching/src/teacher/lesson-split.ts
import { apiPost } from '@/api/client';
import { navigate } from '@/app/router';
import { withAppBase } from '@/app/base-path';
import './lesson-split.css';

/**
 * Split lesson: the teacher moves some of a long lesson's sections into new
 * lessons, each with its own name and type. The server copies every piece of
 * student work across; this dialog shows the counts first so the teacher can
 * see nothing is lost, and keeps an Undo for every split.
 */

export type SplitRole = 'core' | 'support' | 'extension' | 'optional';

export type SplitPart = {
  name: string;
  role: SplitRole;
  section_ids: string[];
  whole_class?: boolean;
};

export type SplitNewLesson = { id: string; title: string; role: SplitRole };

export type SplitStatus = {
  sections: Array<{ id: string; title: string; has_quiz_questions: boolean }>;
  mode?: string;
  can_split: boolean;
  reason?: string;
  splits?: Array<{ split_id: string; at: string; new_lessons: SplitNewLesson[]; undone: boolean }>;
};

export type SplitPreview = {
  problems: string[];
  parts: Array<{ name: string; role: SplitRole; sections: Array<{ id: string; title: string }> }>;
  counts: { students_with_work: number; handins: number; marked: number; done_marks: number };
  notes: string[];
};

export type SplitResult = { split_id: string; new_lessons: SplitNewLesson[]; published: boolean };

export type SplitRequest =
  | { action: 'status' }
  | { action: 'preview'; parts: SplitPart[] }
  | { action: 'split'; parts: SplitPart[] }
  | { action: 'undo'; split_id: string };

export type SplitCall = (body: SplitRequest) => Promise<unknown>;

export type LessonSplitOptions = {
  lessonId: string;
  /** Posts to the split endpoint. Tests pass a fake. */
  call?: SplitCall;
  /** Saves the open draft before the split reads the lesson. */
  beforeSplit?: () => Promise<void>;
  /** After a split or an undo: reload the lesson so the editor shows what's there now. */
  onChanged?: () => void | Promise<void>;
  /** Opens a new lesson's editor. Defaults to the router. */
  openLesson?: (lessonId: string) => void;
  /** Where focus goes when the dialog closes (the page menu button). */
  returnFocus?: HTMLElement | null;
};

export type LessonSplitHandle = { close(): void };

const MAX_PARTS = 3;

const ROLE_LABELS: Record<SplitRole, string> = {
  core: 'Core',
  support: 'Support',
  extension: 'Extension',
  optional: 'Optional'
};

type DraftPart = { key: number; name: string; role: SplitRole; wholeClass: boolean };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, variant: 'primary' | 'secondary' | 'ghost', onClick: () => void): HTMLButtonElement {
  const node = el('button', `btn btn--${variant}`, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The preview counts as plain sentences. */
export function splitCountSentences(counts: SplitPreview['counts']): string[] {
  const lines: string[] = [];
  const students = counts.students_with_work;
  lines.push(
    students === 0
      ? "No students have work in the sections you're moving."
      : `${plural(students, 'student has', 'students have')} work in the sections you're moving.`
  );
  const pieces: string[] = [];
  if (counts.handins > 0) pieces.push(plural(counts.handins, 'hand-in', 'hand-ins'));
  if (counts.marked > 0) pieces.push(plural(counts.marked, 'marked piece', 'marked pieces'));
  if (pieces.length) {
    const total = counts.handins + counts.marked;
    lines.push(`${pieces.join(' and ')} ${total === 1 ? 'comes' : 'come'} across.`);
  }
  if (counts.done_marks > 0) {
    lines.push(`${plural(counts.done_marks, 'done tick carries', 'done ticks carry')} over.`);
  }
  return lines;
}

function formatSplitDate(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function openLessonSplit(options: LessonSplitOptions): LessonSplitHandle {
  const call: SplitCall =
    options.call ?? ((body) => apiPost(`/api/lessons/${encodeURIComponent(options.lessonId)}/split`, body));
  const openLesson = options.openLesson ?? ((id: string) => navigate(`/lessons/${encodeURIComponent(id)}`));
  const returnFocus = options.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  let busy = false;
  let closed = false;

  const overlay = el('div', 'confirm-card-overlay lesson-split-overlay');
  overlay.setAttribute('role', 'presentation');
  const card = el('section', 'confirm-card lesson-split');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'lesson-split-title');
  const heading = el('h2', 'lesson-split__title', 'Split lesson');
  heading.id = 'lesson-split-title';
  heading.tabIndex = -1;
  const body = el('div', 'lesson-split__body');
  card.append(heading, body);
  overlay.append(card);
  document.body.append(overlay);

  function setBusy(next: boolean): void {
    busy = next;
    card.setAttribute('aria-busy', next ? 'true' : 'false');
    for (const control of card.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      'button, input, select'
    )) {
      if (next) {
        control.dataset.splitWasDisabled = control.disabled ? '1' : '';
        control.disabled = true;
      } else {
        control.disabled = control.dataset.splitWasDisabled === '1';
        delete control.dataset.splitWasDisabled;
      }
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...card.querySelectorAll<HTMLElement>('button, input, select, a[href]')].filter(
      (node) => !(node as HTMLButtonElement).disabled
    );
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !card.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('keydown', onKey, true);

  function focusFirst(): void {
    const target = card.querySelector<HTMLElement>('input, select, button:not(:disabled)');
    (target ?? heading).focus();
  }

  function errorLine(): HTMLParagraphElement {
    const line = el('p', 'lesson-split__error');
    line.setAttribute('role', 'alert');
    return line;
  }

  /** Inline "are you sure" for an undo: no window.confirm. */
  function undoConfirm(host: HTMLElement, splitId: string, onUndone: () => void): void {
    const ask = el('div', 'lesson-split__undo-ask');
    const text = el(
      'p',
      'lesson-split__undo-text',
      'Undo this split? The sections and their student work go back into this lesson.'
    );
    const error = errorLine();
    const actions = el('div', 'confirm-card__actions lesson-split__actions');
    const keep = button('Keep the split', 'ghost', () => {
      ask.remove();
      trigger?.removeAttribute('hidden');
      trigger?.focus();
    });
    const yes = button('Yes, undo', 'primary', () => {
      error.textContent = '';
      setBusy(true);
      void call({ action: 'undo', split_id: splitId })
        .then(() => {
          setBusy(false);
          onUndone();
        })
        .catch((cause: unknown) => {
          setBusy(false);
          error.textContent = errorMessage(cause);
        });
    });
    actions.append(keep, yes);
    ask.append(text, actions, error);
    const trigger = host.querySelector<HTMLButtonElement>('.lesson-split__undo');
    trigger?.setAttribute('hidden', '');
    host.append(ask);
    yes.focus();
  }

  function showMessageOnly(message: string): void {
    body.replaceChildren();
    const text = el('p', 'lesson-split__reason', message);
    const actions = el('div', 'confirm-card__actions lesson-split__actions');
    actions.append(button('Close', 'secondary', close));
    body.append(text, actions);
    focusFirst();
  }

  async function loadStatus(flash?: string): Promise<void> {
    body.replaceChildren(el('p', 'lesson-split__status', 'Loading sections…'));
    setBusy(true);
    let status: SplitStatus;
    try {
      status = (await call({ action: 'status' })) as SplitStatus;
    } catch (cause) {
      setBusy(false);
      if (closed) return;
      body.replaceChildren();
      const error = errorLine();
      error.textContent = errorMessage(cause);
      const actions = el('div', 'confirm-card__actions lesson-split__actions');
      actions.append(button('Close', 'secondary', close));
      body.append(error, actions);
      focusFirst();
      return;
    }
    setBusy(false);
    if (closed) return;
    if (!status.can_split) {
      showMessageOnly(status.reason?.trim() || "This lesson can't be split.");
      return;
    }
    renderEditor(status, flash);
  }

  function renderEarlierSplits(status: SplitStatus): HTMLElement | null {
    const live = (status.splits ?? []).filter((split) => !split.undone);
    if (!live.length) return null;
    const wrap = el('section', 'lesson-split__earlier');
    wrap.setAttribute('aria-labelledby', 'lesson-split-earlier');
    const title = el('h3', 'lesson-split__subtitle', 'Earlier splits');
    title.id = 'lesson-split-earlier';
    const list = el('ul', 'lesson-split__earlier-list');
    for (const split of live) {
      const item = el('li', 'lesson-split__earlier-item');
      const names = split.new_lessons.map((lesson) => lesson.title).join(', ');
      const line = el('p', 'lesson-split__earlier-line');
      const when = el('span', 'lesson-split__earlier-date', formatSplitDate(split.at));
      line.append(when, document.createTextNode(` · ${names}`));
      const undo = button('Undo', 'ghost', () => {
        undoConfirm(item, split.split_id, () => {
          void Promise.resolve(options.onChanged?.()).finally(() => {
            void loadStatus('Split undone. The sections are back in this lesson.');
          });
        });
      });
      undo.classList.add('lesson-split__undo');
      undo.setAttribute('aria-label', `Undo the split from ${formatSplitDate(split.at)} (${names})`);
      item.append(line, undo);
      list.append(item);
    }
    wrap.append(title, list);
    return wrap;
  }

  function renderEditor(status: SplitStatus, flash?: string): void {
    body.replaceChildren();
    let nextKey = 1;
    const parts: DraftPart[] = [{ key: nextKey++, name: '', role: 'core', wholeClass: false }];
    /** section id → part key; missing means it stays here. */
    const moves = new Map<string, number>();
    let preview: SplitPreview | null = null;

    if (flash) {
      const note = el('p', 'lesson-split__flash', flash);
      note.setAttribute('role', 'status');
      body.append(note);
    }

    body.append(
      el(
        'p',
        'lesson-split__intro',
        'Move some sections into new lessons. Each new lesson gets its own name and type, and student work comes with the sections.'
      )
    );

    // New lessons
    const partsBox = el('fieldset', 'lesson-split__group');
    const partsLegend = el('legend', 'lesson-split__subtitle', 'New lessons');
    const partsList = el('div', 'lesson-split__parts');
    const addPart = button('Add another', 'ghost', () => {
      if (parts.length >= MAX_PARTS) return;
      parts.push({ key: nextKey++, name: '', role: 'core', wholeClass: false });
      edited();
      renderParts();
      renderSections();
      partsList.querySelector<HTMLInputElement>('.lesson-split__part:last-child .lesson-split__name')?.focus();
    });
    addPart.classList.add('lesson-split__add');
    partsBox.append(partsLegend, partsList, addPart);

    // Sections
    const sectionsBox = el('fieldset', 'lesson-split__group');
    const sectionsLegend = el('legend', 'lesson-split__subtitle', 'Which sections move?');
    const sectionList = el('ul', 'lesson-split__sections');
    const outside = el('p', 'lesson-split__hint', 'Anything not in a section stays here.');
    sectionsBox.append(sectionsLegend, sectionList, outside);

    const previewBox = el('div', 'lesson-split__preview');
    previewBox.setAttribute('aria-live', 'polite');
    const error = errorLine();

    const actions = el('div', 'confirm-card__actions lesson-split__actions');
    const cancel = button('Cancel', 'ghost', close);
    const check = button('Check', 'secondary', () => void runPreview());
    const split = button('Split', 'primary', () => void runSplit());
    split.disabled = true;
    actions.append(cancel, check, split);

    function partLabel(part: DraftPart, index: number): string {
      return part.name.trim() || `New lesson ${index + 1}`;
    }

    function edited(): void {
      preview = null;
      previewBox.replaceChildren();
      split.disabled = true;
      error.textContent = '';
    }

    function renderParts(): void {
      partsList.replaceChildren();
      parts.forEach((part, index) => {
        const row = el('div', 'lesson-split__part');
        const id = `lesson-split-part-${part.key}`;

        const nameField = el('div', 'lesson-split__field lesson-split__field--name');
        const nameLabel = el('label', 'lesson-split__label', 'Name');
        nameLabel.htmlFor = `${id}-name`;
        const name = el('input', 'create-modal__input lesson-split__name');
        name.type = 'text';
        name.id = `${id}-name`;
        name.required = true;
        name.placeholder = 'e.g. Viva practice';
        name.value = part.name;
        name.addEventListener('input', () => {
          part.name = name.value;
          edited();
          syncSectionOptions();
        });
        nameField.append(nameLabel, name);

        const roleField = el('div', 'lesson-split__field');
        const roleLabel = el('label', 'lesson-split__label', 'Type');
        roleLabel.htmlFor = `${id}-role`;
        const role = el('select', 'create-modal__select lesson-split__role');
        role.id = `${id}-role`;
        for (const value of Object.keys(ROLE_LABELS) as SplitRole[]) {
          const option = el('option', undefined, ROLE_LABELS[value]);
          option.value = value;
          role.append(option);
        }
        role.value = part.role;
        roleField.append(roleLabel, role);

        const wholeWrap = el('div', 'lesson-split__whole');
        const wholeLabel = el('label', 'lesson-split__check');
        const whole = el('input', 'lesson-split__whole-box');
        whole.type = 'checkbox';
        whole.id = `${id}-whole`;
        whole.checked = part.wholeClass;
        whole.setAttribute('aria-describedby', `${id}-whole-hint`);
        whole.addEventListener('change', () => {
          part.wholeClass = whole.checked;
          edited();
        });
        wholeLabel.append(whole, document.createTextNode(' Show to the whole class'));
        const hint = el(
          'p',
          'lesson-split__hint',
          "Otherwise only students you tick, and anyone who's already started it, will see it."
        );
        hint.id = `${id}-whole-hint`;
        wholeWrap.append(wholeLabel, hint);
        wholeWrap.hidden = part.role === 'core';

        role.addEventListener('change', () => {
          part.role = role.value as SplitRole;
          wholeWrap.hidden = part.role === 'core';
          edited();
        });

        row.append(nameField, roleField);
        if (parts.length > 1) {
          const remove = button('Remove', 'ghost', () => {
            parts.splice(parts.indexOf(part), 1);
            for (const [sectionId, key] of moves) if (key === part.key) moves.delete(sectionId);
            edited();
            renderParts();
            renderSections();
            partsList.querySelector<HTMLInputElement>('.lesson-split__name')?.focus();
          });
          remove.classList.add('lesson-split__remove');
          remove.setAttribute('aria-label', `Remove ${partLabel(part, index)}`);
          row.append(remove);
        }
        row.append(wholeWrap);
        partsList.append(row);
      });
      addPart.hidden = parts.length >= MAX_PARTS;
    }

    function fillSectionSelect(select: HTMLSelectElement, sectionId: string): void {
      select.replaceChildren();
      const stay = el('option', undefined, 'Stays here');
      stay.value = '';
      select.append(stay);
      parts.forEach((part, index) => {
        const option = el('option', undefined, partLabel(part, index));
        option.value = String(part.key);
        select.append(option);
      });
      const key = moves.get(sectionId);
      select.value = key === undefined ? '' : String(key);
    }

    function syncSectionOptions(): void {
      for (const select of sectionList.querySelectorAll<HTMLSelectElement>('select')) {
        fillSectionSelect(select, select.dataset.sectionId ?? '');
      }
    }

    function renderSections(): void {
      sectionList.replaceChildren();
      if (!status.sections.length) {
        sectionList.append(el('li', 'lesson-split__hint', 'This lesson has no sections yet.'));
        return;
      }
      status.sections.forEach((section, index) => {
        const item = el('li', 'lesson-split__section');
        const selectId = `lesson-split-section-${index}`;
        const label = el('label', 'lesson-split__section-title');
        label.htmlFor = selectId;
        label.append(document.createTextNode(section.title || 'Untitled section'));
        if (section.has_quiz_questions) {
          const tag = el('span', 'lesson-split__tag', 'quiz');
          tag.title = 'Has quiz questions';
          label.append(' ', tag);
        }
        const select = el('select', 'create-modal__select lesson-split__move');
        select.id = selectId;
        select.dataset.sectionId = section.id;
        fillSectionSelect(select, section.id);
        select.addEventListener('change', () => {
          if (select.value) moves.set(section.id, Number(select.value));
          else moves.delete(section.id);
          edited();
        });
        item.append(label, select);
        sectionList.append(item);
      });
    }

    function buildParts(): SplitPart[] {
      return parts.map((part) => {
        const section_ids = status.sections.filter((section) => moves.get(section.id) === part.key).map((s) => s.id);
        const out: SplitPart = { name: part.name.trim(), role: part.role, section_ids };
        if (part.role !== 'core') out.whole_class = part.wholeClass;
        return out;
      });
    }

    function localProblems(): string[] {
      const problems: string[] = [];
      if (parts.some((part) => !part.name.trim())) problems.push('Give each new lesson a name.');
      const request = buildParts();
      request.forEach((part, index) => {
        if (!part.section_ids.length) {
          problems.push(`Choose at least one section for ${partLabel(parts[index]!, index)}.`);
        }
      });
      return problems;
    }

    function renderPreview(result: SplitPreview): void {
      previewBox.replaceChildren();
      if (result.problems.length) {
        const list = el('ul', 'lesson-split__problems');
        for (const problem of result.problems) list.append(el('li', undefined, problem));
        previewBox.append(list);
      }
      if (result.parts.length) {
        const list = el('ul', 'lesson-split__summary');
        for (const part of result.parts) {
          const item = el('li');
          const name = el('strong', undefined, part.name);
          item.append(
            name,
            document.createTextNode(
              ` (${ROLE_LABELS[part.role] ?? part.role}): ${part.sections.map((section) => section.title).join(', ')}`
            )
          );
          list.append(item);
        }
        previewBox.append(list);
      }
      if (!result.problems.length) {
        for (const line of splitCountSentences(result.counts)) previewBox.append(el('p', 'lesson-split__count', line));
        previewBox.append(
          el('p', 'lesson-split__safe', "Nothing is deleted from this lesson's records, and you can undo the split.")
        );
        for (const note of result.notes) previewBox.append(el('p', 'lesson-split__note', note));
      }
      split.disabled = result.problems.length > 0;
    }

    async function runPreview(): Promise<void> {
      edited();
      const problems = localProblems();
      if (problems.length) {
        renderPreview({
          problems,
          parts: [],
          counts: { students_with_work: 0, handins: 0, marked: 0, done_marks: 0 },
          notes: []
        });
        return;
      }
      setBusy(true);
      try {
        const result = (await call({ action: 'preview', parts: buildParts() })) as SplitPreview;
        setBusy(false);
        if (closed) return;
        preview = result;
        renderPreview(result);
      } catch (cause) {
        setBusy(false);
        error.textContent = errorMessage(cause);
      }
    }

    async function runSplit(): Promise<void> {
      if (!preview || preview.problems.length) return;
      error.textContent = '';
      setBusy(true);
      try {
        await options.beforeSplit?.();
        const result = (await call({ action: 'split', parts: buildParts() })) as SplitResult;
        setBusy(false);
        if (closed) return;
        renderDone(result);
        void options.onChanged?.();
      } catch (cause) {
        setBusy(false);
        error.textContent = errorMessage(cause);
        split.disabled = true;
        preview = null;
      }
    }

    renderParts();
    renderSections();
    body.append(partsBox, sectionsBox, previewBox, error, actions);
    const earlier = renderEarlierSplits(status);
    if (earlier) body.append(earlier);
    focusFirst();
  }

  function renderDone(result: SplitResult): void {
    body.replaceChildren();
    const note = el('p', 'lesson-split__flash', 'Lesson split. These new lessons hold the sections you moved:');
    note.setAttribute('role', 'status');
    const list = el('ul', 'lesson-split__done-list');
    for (const lesson of result.new_lessons) {
      const item = el('li');
      const link = el('a', 'lesson-split__link', lesson.title);
      const path = `/lessons/${encodeURIComponent(lesson.id)}`;
      link.href = withAppBase(path);
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        close();
        openLesson(lesson.id);
      });
      item.append(link, document.createTextNode(` · ${ROLE_LABELS[lesson.role] ?? lesson.role}`));
      list.append(item);
    }
    const published = el(
      'p',
      'lesson-split__hint',
      result.published
        ? 'The new lessons are published, like this one.'
        : 'The new lessons stay unpublished until you publish them.'
    );
    const undoHost = el('div', 'lesson-split__undo-host');
    const actions = el('div', 'confirm-card__actions lesson-split__actions');
    const undo = button('Undo split', 'ghost', () => {
      undoConfirm(undoHost, result.split_id, () => {
        void Promise.resolve(options.onChanged?.()).finally(() => {
          void loadStatus('Split undone. The sections are back in this lesson.');
        });
      });
    });
    undo.classList.add('lesson-split__undo');
    undoHost.append(undo);
    actions.append(button('Close', 'primary', close));
    body.append(note, list, published, undoHost, actions);
    heading.focus();
  }

  void loadStatus();
  heading.focus();
  return { close };
}

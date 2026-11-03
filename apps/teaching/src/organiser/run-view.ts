import './organiser.css';
import { getCurriculum } from '@/app/curriculum-state';
import { navigate } from '@/app/router';
import { organiserApi } from './api';
import { recentLessonIds } from './editor-model';
import type { Sheet, SheetLine, SheetSection } from './types';

/**
 * Run with the class: a projector view that needs no block. Pick a section, choose the last two
 * lessons or everything so far, keep the "usually hide" columns covered until Reveal, and run a
 * three minute timer. Only released lines show. Nothing is recorded.
 */

export interface OrganiserRunOptions {
  root: HTMLElement;
  unitId: string;
  classId?: string | null;
  isStale?: () => boolean;
}

export const RUN_SECONDS = 180;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = h('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function pill(label: string, pressed: boolean, onClick: () => void): HTMLButtonElement {
  const node = button(label, 'ko-pill', onClick);
  node.setAttribute('aria-pressed', String(pressed));
  return node;
}

/** The lines a mode shows: "last" keeps the two most recent lessons' lines, "all" keeps every line. */
export function runLines(sheet: Sheet, section: SheetSection, mode: 'last' | 'all'): SheetLine[] {
  if (mode === 'all') return section.lines;
  const recent = recentLessonIds(sheet, 2);
  return section.lines.filter((line) => !!line.lesson_id && recent.has(line.lesson_id));
}

export const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

export function mountOrganiserRun(options: OrganiserRunOptions): { dispose(): void } {
  const { root, unitId } = options;
  const isStale = options.isStale ?? (() => false);
  const page = h('div', 'ko-run-page');
  const run = h('div', 'ko-run');
  page.append(run);
  root.replaceChildren(page);

  let disposed = false;
  let sheet: Sheet | null = null;
  let classLabel = '';
  let sectionId = '';
  let mode: 'last' | 'all' = 'all';
  let covered = true;
  let remaining = RUN_SECONDS;
  let endsAt = 0;
  let ticking: number | undefined;
  let timerEl: HTMLElement | null = null;

  const stopTick = (): void => {
    if (ticking !== undefined) window.clearInterval(ticking);
    ticking = undefined;
  };

  function paintTimer(): void {
    if (!timerEl) return;
    timerEl.textContent = remaining === 0 ? 'Time' : clock(remaining);
    timerEl.classList.toggle('is-done', remaining === 0);
  }

  function startTimer(): void {
    if (ticking !== undefined) return;
    if (remaining <= 0) remaining = RUN_SECONDS;
    endsAt = Date.now() + remaining * 1000;
    ticking = window.setInterval(() => {
      remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      paintTimer();
      if (remaining === 0) {
        stopTick();
        paint();
      }
    }, 250);
    paint();
  }

  function resetTimer(): void {
    stopTick();
    remaining = RUN_SECONDS;
    paint();
  }

  function back(): HTMLElement {
    return button('Back to the unit', 'ko-link', () => navigate(`/units/${encodeURIComponent(unitId)}`));
  }

  function message(text: string, extra?: HTMLElement[]): void {
    run.replaceChildren(h('h3', undefined, 'Organiser'), h('p', 'ko-run__empty', text), ...(extra ?? []), back());
  }

  function paint(): void {
    if (disposed) return;
    if (!sheet) return;
    const sections = sheet.sections;
    if (!sections.length) {
      message('Nothing is released for this class yet. Lines appear once their lesson is published and its date arrives.');
      return;
    }
    const section = sections.find((s) => s.id === sectionId) ?? sections.find((s) => s.kind === 'table') ?? sections[0];
    sectionId = section.id;
    const lines = runLines(sheet, section, mode);

    run.replaceChildren();
    const bar = h('div', 'ko-run__bar');
    const titleBox = h('div');
    titleBox.append(h('h3', undefined, section.name));
    titleBox.append(h('span', 'ko-label', [sheet.title, classLabel].filter(Boolean).join(' · ')));
    timerEl = h('span', 'ko-run__timer');
    timerEl.setAttribute('role', 'timer');
    bar.append(titleBox, timerEl);
    run.append(bar);
    paintTimer();

    const sectionPills = h('div', 'ko-pills');
    for (const s of sections) {
      sectionPills.append(pill(s.name, s.id === section.id, () => { sectionId = s.id; covered = true; paint(); }));
    }
    run.append(sectionPills);

    const modePills = h('div', 'ko-pills');
    modePills.append(
      h('span', 'ko-label', 'Show:'),
      pill('Last two lessons', mode === 'last', () => { mode = 'last'; covered = true; paint(); }),
      pill('Everything so far', mode === 'all', () => { mode = 'all'; covered = true; paint(); })
    );
    run.append(modePills);

    if (!lines.length) {
      run.append(h('p', 'ko-run__empty', mode === 'last' ? 'No lines from the last two lessons in this section. Try Everything so far.' : 'No lines released in this section yet.'));
    } else if (section.kind === 'table') {
      const columns = section.columns ?? [];
      const scroll = h('div', 'ko-run__scroll');
      const table = h('table');
      const head = h('tr');
      for (const column of columns) head.append(h('th', undefined, column.label));
      const thead = h('thead');
      thead.append(head);
      const tbody = h('tbody');
      for (const line of lines) {
        const row = h('tr');
        columns.forEach((column, i) => {
          const td = h('td', covered && column.hide ? 'cov' : undefined, line.cells[i] ?? '');
          row.append(td);
        });
        tbody.append(row);
      }
      table.append(thead, tbody);
      scroll.append(table);
      run.append(scroll);
    } else {
      // Lists and sequences are covered as a whole.
      const list = h(section.kind === 'sequence' ? 'ol' : 'ul');
      for (const line of lines) list.append(h('li', covered ? 'cov' : undefined, line.cells[0] ?? ''));
      run.append(list);
    }

    const hasCover = section.kind === 'table' ? (section.columns ?? []).some((c) => c.hide) : true;
    const actions = h('div', 'ko-actions');
    if (hasCover) actions.append(button(covered ? 'Reveal' : 'Cover again', 'ko-btn', () => { covered = !covered; paint(); }));
    const start = button(ticking !== undefined ? 'Running…' : 'Start timer', 'ko-btn ko-btn--out', startTimer);
    start.disabled = ticking !== undefined;
    actions.append(start, button('Reset', 'ko-btn ko-btn--out', resetTimer), back());
    run.append(actions);
  }

  async function begin(classId: string, label: string): Promise<void> {
    classLabel = label;
    message('Loading…');
    try {
      const res = await organiserApi.get(unitId, classId);
      if (disposed || isStale()) return;
      sheet = res.sheet ?? null;
      if (!sheet) {
        message('That class has no sheet for this unit.');
        return;
      }
      paint();
    } catch {
      if (disposed || isStale()) return;
      message('The organiser could not be loaded.', [button('Try again', 'ko-btn', () => void begin(classId, label))]);
    }
  }

  void (async () => {
    message('Loading…');
    let classes: Array<{ id: string; label: string }> = [];
    try {
      const curriculum = await getCurriculum();
      classes = curriculum.classes
        .filter((c) => c.current_unit_id === unitId || c.active_unit_ids.includes(unitId))
        .map((c) => ({ id: c.id, label: c.display_name || c.code }));
    } catch {
      // Without the class list the link's own class still works.
    }
    if (disposed || isStale()) return;
    if (options.classId) {
      await begin(options.classId, classes.find((c) => c.id === options.classId)?.label ?? '');
      return;
    }
    if (classes.length === 1) {
      await begin(classes[0].id, classes[0].label);
      return;
    }
    if (!classes.length) {
      message('Give this unit to a class first, then run its organiser.');
      return;
    }
    const ask = h('div', 'ko-pills');
    for (const klass of classes) ask.append(pill(klass.label, false, () => void begin(klass.id, klass.label)));
    run.replaceChildren(h('h3', undefined, 'Which class?'), ask, back());
  })();

  return {
    dispose() {
      disposed = true;
      stopTick();
      page.remove();
    }
  };
}

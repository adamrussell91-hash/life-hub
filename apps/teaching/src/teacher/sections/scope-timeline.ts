import { navigate } from '@/app/router';
import { pastelFromId } from '@/design/pastel';
import type { ScopeSequence, TimelineItem, Unit } from '@/schemas';
import {
  academicYearBounds,
  diffDays,
  formatDateRange,
  pxPerDay,
  resolveItemSpan,
  resolveTermSpan,
  termContainingDate,
  weekToDate,
  type TimelineZoom
} from '@/scope/timeline-dates';
import { applyDragDelta } from '@/scope/timeline-drag';
import { findFirstFreeStart } from '@/scope/timeline-weeks';
import { resolveScheduleToday } from '@/schedule/today';
import type { CurriculumResponse } from '@/teacher/nav';
import { patchScopeSequence } from '@/teacher/scope-api';
import { renderPageHeader } from '@/teacher/page-header';
import { mountOutcomeStrip } from '@/outcomes/strip';

export const SCOPE_TIMELINE_ZOOM_KEY = 'teaching-hub.scope-timeline-zoom';

export interface ScopeTimelineEditorOptions {
  onPatched?: (scope: ScopeSequence) => void;
  /** When set, select this timeline note in the inspector on first paint. */
  selectedNoteId?: string;
}

const UNIT_SPAN = 4;

function itemLabel(
  item: TimelineItem,
  unitsById: Map<string, { title: string }>
): string {
  if (item.kind === 'note') return item.title;
  return unitsById.get(item.unit_id)?.title ?? 'Unknown unit';
}

function isAssessmentItem(item: TimelineItem): boolean {
  if (item.kind !== 'note') return false;
  return /assessment/i.test(item.title);
}

function nextOrder(items: TimelineItem[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((item) => item.order)) + 1;
}

function newItemId(): string {
  return `ti_${crypto.randomUUID()}`;
}

function mergeScopeIntoCurriculum(
  curriculum: CurriculumResponse,
  scope: ScopeSequence
): void {
  const idx = curriculum.scope_sequences.findIndex((entry) => entry.id === scope.id);
  if (idx >= 0) {
    curriculum.scope_sequences[idx] = scope;
  } else {
    curriculum.scope_sequences.push(scope);
  }
}

function availableUnits(
  curriculum: CurriculumResponse,
  subjectId: string,
  scope: ScopeSequence
): Unit[] {
  const onTimeline = new Set(
    scope.timeline_items.filter((item) => item.kind === 'unit').map((item) => item.unit_id)
  );
  return curriculum.units
    .filter((unit) => unit.subject_id === subjectId && !onTimeline.has(unit.id))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function renderStatus(canvas: HTMLElement, message: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = message;
  canvas.append(status);
}

function readZoom(): TimelineZoom {
  try {
    return localStorage.getItem(SCOPE_TIMELINE_ZOOM_KEY) === 'year' ? 'year' : 'month';
  } catch {
    return 'month';
  }
}

function writeZoom(zoom: TimelineZoom): void {
  try {
    localStorage.setItem(SCOPE_TIMELINE_ZOOM_KEY, zoom);
  } catch {
    // Persistence is convenience.
  }
}

function openAddUnitPicker(options: {
  units: Unit[];
  onChoose: (unitId: string) => void;
}): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'schedule-modal scope-timeline__picker';
  backdrop.dataset.scopePicker = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'schedule-modal__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'scope-add-unit-title');

  const title = document.createElement('h2');
  title.id = 'scope-add-unit-title';
  title.className = 'schedule-modal__title';
  title.textContent = 'Add Unit';

  const body = document.createElement('div');
  body.className = 'schedule-modal__body';

  const footer = document.createElement('div');
  footer.className = 'schedule-modal__footer';

  const close = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  if (options.units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'schedule-modal__empty';
    empty.textContent = 'All subject units are already on this timeline.';
    body.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'schedule-modal__unit-list';
    for (const unit of options.units) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'schedule-modal__unit-button scope-timeline__picker-unit';
      button.textContent = unit.title;
      button.addEventListener('click', () => {
        close();
        options.onChoose(unit.id);
      });
      li.append(button);
      list.append(li);
    }
    body.append(list);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  footer.append(cancel);

  dialog.append(title, body, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);
}

function datesForWeekSpan(
  scope: ScopeSequence,
  startWeek: number,
  endWeek: number
): { start_date: string; end_date: string } {
  return {
    start_date: weekToDate(startWeek, scope.terms, scope.academic_year),
    end_date: weekToDate(endWeek, scope.terms, scope.academic_year)
  };
}

export function renderScopeTimelineEditor(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options?: ScopeTimelineEditorOptions
): void {
  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);
  if (!subject) {
    renderStatus(canvas, 'Subject not found.');
    return;
  }

  if (!subject.scope_id) {
    renderStatus(canvas, 'Scope & Sequence not found.');
    return;
  }

  const initial = curriculum.scope_sequences.find((entry) => entry.id === subject.scope_id);
  if (!initial) {
    renderStatus(canvas, 'Scope & Sequence not found.');
    return;
  }

  let scope: ScopeSequence = initial;
  let selectedId: string | null = null;
  let tab: 'timeline' | 'map' = 'timeline';
  let zoom = readZoom();
  let saving = false;
  let suppressClick = false;

  type DragMode = 'move' | 'resize-start' | 'resize-end';
  let activeDrag: {
    mode: DragMode;
    itemId: string;
    startX: number;
    origin: { start_week: number; end_week: number };
    current: { start_week: number; end_week: number };
    moved: boolean;
    bar: HTMLElement;
    labelWrap: HTMLElement;
  } | null = null;

  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const unitYearId = curriculum.units.find((unit) => unit.subject_id === subject.id)?.year_id;
  const year =
    curriculum.years.find((entry) => entry.id === unitYearId) ??
    curriculum.years.find((entry) => entry.subject_ids.includes(subject.id));
  const todayYmd = resolveScheduleToday(curriculum.schedule_anchor_date);

  canvas.replaceChildren();
  const pageHeader = renderPageHeader(canvas, { eyebrow: 'Scope & Sequence', title: subject.title });
  const stripHost = document.createElement('div');
  pageHeader.insertAdjacentElement('afterend', stripHost);
  mountOutcomeStrip(stripHost, {
    catalog: curriculum.outcomes ?? [],
    subject,
    attached: scope,
    editable: true,
    onChange: async (ids) => {
      scope = await patchScopeSequence(scope.id, { outcome_ids: ids });
      options?.onPatched?.(scope);
    },
    onCatalogChange: (created) => {
      curriculum.outcomes = [...(curriculum.outcomes ?? []), created];
      subject.outcome_ids = [...subject.outcome_ids, created.id];
    }
  });

  const root = document.createElement('div');
  root.className = 'scope-timeline';

  const tabs = document.createElement('div');
  tabs.className = 'hub-pills scope-timeline__tabs';
  tabs.setAttribute('role', 'tablist');

  const timelineTab = document.createElement('button');
  timelineTab.type = 'button';
  timelineTab.className = 'hub-pills__btn scope-timeline__tab';
  timelineTab.dataset.scopeTab = 'timeline';
  timelineTab.textContent = 'Timeline';

  const mapTab = document.createElement('button');
  mapTab.type = 'button';
  mapTab.className = 'hub-pills__btn scope-timeline__tab';
  mapTab.dataset.scopeTab = 'map';
  mapTab.textContent = 'Curriculum Map';

  tabs.append(timelineTab, mapTab);

  const toolbar = document.createElement('div');
  toolbar.className = 'scope-timeline__toolbar';

  const actions = document.createElement('div');
  actions.className = 'scope-timeline__actions';

  const addUnit = document.createElement('button');
  addUnit.type = 'button';
  addUnit.className = 'btn btn--primary scope-timeline__add-unit';
  addUnit.textContent = '+ Add Unit';

  const addNote = document.createElement('button');
  addNote.type = 'button';
  addNote.className = 'btn btn--ghost scope-timeline__add-note';
  addNote.textContent = 'Add note';

  const meta = document.createElement('span');
  meta.className = 'scope-timeline__meta';

  actions.append(addUnit, addNote, meta);

  const controls = document.createElement('div');
  controls.className = 'scope-timeline__controls';

  const termJump = document.createElement('div');
  termJump.className = 'scope-timeline__term-jump';
  for (const term of [...scope.terms].sort((a, b) => a.term_number - b.term_number)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scope-timeline__term-jump-btn';
    btn.dataset.termNumber = String(term.term_number);
    btn.textContent = `T${term.term_number}`;
    btn.setAttribute('aria-label', `Jump to ${term.title}`);
    termJump.append(btn);
  }

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'scope-timeline__today';
  todayBtn.textContent = 'Today';

  const zoomSeg = document.createElement('div');
  zoomSeg.className = 'scope-timeline__zoom';
  zoomSeg.setAttribute('role', 'group');
  zoomSeg.setAttribute('aria-label', 'Timeline zoom');

  const zoomMonth = document.createElement('button');
  zoomMonth.type = 'button';
  zoomMonth.className = 'scope-timeline__zoom-btn';
  zoomMonth.dataset.zoom = 'month';
  zoomMonth.textContent = 'Month';

  const zoomYear = document.createElement('button');
  zoomYear.type = 'button';
  zoomYear.className = 'scope-timeline__zoom-btn';
  zoomYear.dataset.zoom = 'year';
  zoomYear.textContent = 'Year';

  zoomSeg.append(zoomMonth, zoomYear);
  controls.append(termJump, todayBtn, zoomSeg);
  toolbar.append(actions, controls);

  const banner = document.createElement('div');
  banner.className = 'scope-timeline__banner';
  banner.hidden = true;
  banner.setAttribute('role', 'alert');

  const body = document.createElement('div');
  body.className = 'scope-timeline__body';

  const main = document.createElement('div');
  main.className = 'scope-timeline__main';

  const viewHost = document.createElement('div');
  viewHost.className = 'scope-timeline__view';

  const inspector = document.createElement('aside');
  inspector.className = 'scope-timeline__inspector';
  inspector.hidden = true;

  main.append(viewHost);
  body.append(main, inspector);
  root.append(tabs, toolbar, banner, body);
  canvas.append(root);

  const showBanner = (message: string, tone: 'error' | 'info' = 'error'): void => {
    banner.hidden = false;
    banner.textContent = message;
    banner.classList.toggle('scope-timeline__banner--info', tone === 'info');
  };

  const hideBanner = (): void => {
    banner.hidden = true;
    banner.textContent = '';
    banner.classList.remove('scope-timeline__banner--info');
  };

  const applyScope = (next: ScopeSequence): void => {
    scope = next;
    mergeScopeIntoCurriculum(curriculum, next);
    options?.onPatched?.(next);
  };

  let queuedItems: TimelineItem[] | null = null;
  let inFlight: Promise<boolean> | null = null;

  const persistItems = (items: TimelineItem[]): Promise<boolean> => {
    queuedItems = items;
    if (inFlight) {
      showBanner('Saving…', 'info');
      return inFlight;
    }

    inFlight = (async () => {
      saving = true;
      let lastOk = true;
      try {
        while (queuedItems) {
          const nextItems = queuedItems;
          queuedItems = null;
          try {
            const updated = await patchScopeSequence(scope.id, { timeline_items: nextItems });
            applyScope(updated);
            hideBanner();
            paintView();
            setSelection(selectedId);
            lastOk = true;
          } catch {
            showBanner('Unable to save timeline.');
            lastOk = false;
            break;
          }
        }
      } finally {
        saving = false;
        inFlight = null;
      }
      return lastOk;
    })();

    return inFlight;
  };

  const closeInspector = (): void => {
    selectedId = null;
    inspector.hidden = true;
    inspector.replaceChildren();
    for (const el of viewHost.querySelectorAll('.scope-timeline__item--selected')) {
      el.classList.remove('scope-timeline__item--selected');
    }
  };

  const renderInspectorContent = (item: TimelineItem): void => {
    inspector.hidden = false;
    inspector.replaceChildren();

    const top = document.createElement('div');
    top.className = 'scope-timeline__inspector-top';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'scope-timeline__inspector-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', closeInspector);
    top.append(close);

    const span = resolveItemSpan(
      item,
      scope.terms,
      scope.academic_year,
      item.kind === 'unit' ? unitsById.get(item.unit_id) : undefined
    );
    const term = termContainingDate(scope.terms, scope.academic_year, span.start);
    const tag = document.createElement('p');
    tag.className = 'scope-timeline__inspector-kind';
    tag.textContent = [
      term ? `TERM ${term.term_number}` : item.kind === 'unit' ? 'Unit' : 'Note',
      isAssessmentItem(item) ? 'ASSESSMENT' : null
    ]
      .filter(Boolean)
      .join(' · ');

    inspector.append(top, tag);

    if (item.kind === 'note') {
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'scope-timeline__note-title scope-timeline__inspector-title';
      titleInput.value = item.title;
      titleInput.setAttribute('aria-label', 'Note title');
      titleInput.addEventListener('blur', () => {
        const nextTitle = titleInput.value.trim() || 'Note';
        if (nextTitle === item.title) return;
        const previousTitle = item.title;
        const items = scope.timeline_items.map((entry) =>
          entry.id === item.id && entry.kind === 'note'
            ? { ...entry, title: nextTitle }
            : entry
        );
        void persistItems(items).then((ok) => {
          if (!ok) titleInput.value = previousTitle;
        });
      });
      const weeks = document.createElement('p');
      weeks.className = 'scope-timeline__inspector-weeks';
      weeks.textContent = formatDateRange(span.start, span.end);
      inspector.append(titleInput, weeks);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn--ghost scope-timeline__delete-note';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        const items = scope.timeline_items.filter((entry) => entry.id !== item.id);
        void persistItems(items).then((ok) => {
          if (ok) closeInspector();
        });
      });
      inspector.append(deleteBtn);
      return;
    }

    const title = document.createElement('h2');
    title.className = 'scope-timeline__inspector-title';
    title.textContent = itemLabel(item, unitsById);

    const weeks = document.createElement('p');
    weeks.className = 'scope-timeline__inspector-weeks';
    weeks.textContent = formatDateRange(span.start, span.end);

    const unit = unitsById.get(item.unit_id);
    const desc = document.createElement('p');
    desc.className = 'scope-timeline__inspector-desc';
    desc.textContent = unit?.description?.trim() || 'No description yet.';

    const lessonCount = unit?.lesson_ids.length ?? 0;
    const lessonsStat = document.createElement('div');
    lessonsStat.className = 'scope-timeline__inspector-stat';
    const lessonsLabel = document.createElement('span');
    lessonsLabel.textContent = 'Lessons planned';
    const lessonsValue = document.createElement('span');
    lessonsValue.textContent = String(lessonCount);
    lessonsStat.append(lessonsLabel, lessonsValue);

    const assessStat = document.createElement('div');
    assessStat.className = 'scope-timeline__inspector-stat';
    const assessLabel = document.createElement('span');
    assessLabel.textContent = 'Assessments';
    const assessValue = document.createElement('span');
    assessValue.textContent = '0';
    assessStat.append(assessLabel, assessValue);

    inspector.append(title, weeks, desc, lessonsStat, assessStat);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'scope-timeline__inspector-actions';

    const open = document.createElement('a');
    open.className = 'btn btn--secondary scope-timeline__open-unit';
    open.href = `/units/${item.unit_id}`;
    open.textContent = 'Edit';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(`/units/${item.unit_id}`);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost scope-timeline__remove-unit';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => {
      const items = scope.timeline_items.filter((entry) => entry.id !== item.id);
      void persistItems(items).then((ok) => {
        if (ok) closeInspector();
      });
    });

    actionsRow.append(open, remove);
    inspector.append(actionsRow);
  };

  const setSelection = (itemId: string | null): void => {
    selectedId = itemId;
    for (const el of viewHost.querySelectorAll<HTMLElement>('[data-item-id]')) {
      el.classList.toggle('scope-timeline__item--selected', el.dataset.itemId === selectedId);
    }
    const item = scope.timeline_items.find((entry) => entry.id === selectedId);
    if (!item) {
      closeInspector();
      return;
    }
    renderInspectorContent(item);
  };

  const yearBounds = (): { start: string; days: number; ppd: number; totalW: number } => {
    const bounds = academicYearBounds(scope.academic_year);
    const ppd = pxPerDay(zoom);
    return { start: bounds.start, days: bounds.days, ppd, totalW: bounds.days * ppd };
  };

  const offsetPx = (ymd: string, start: string, ppd: number): number =>
    diffDays(start, ymd) * ppd;

  const positionForWeeks = (
    startWeek: number,
    endWeek: number
  ): { left: number; width: number } => {
    const { start, ppd } = yearBounds();
    const spanStart = weekToDate(startWeek, scope.terms, scope.academic_year);
    const spanEnd = weekToDate(endWeek, scope.terms, scope.academic_year);
    return {
      left: offsetPx(spanStart, start, ppd),
      width: Math.max(diffDays(spanStart, spanEnd) * ppd, ppd * 1.2)
    };
  };

  const applyBarPosition = (
    bar: HTMLElement,
    labelWrap: HTMLElement,
    weeks: { start_week: number; end_week: number }
  ): void => {
    const pos = positionForWeeks(weeks.start_week, weeks.end_week);
    bar.style.left = `${pos.left}px`;
    bar.style.width = `${pos.width}px`;
    labelWrap.style.left = `${pos.left}px`;
    labelWrap.style.width = `${pos.width}px`;
  };

  const endDrag = async (event: PointerEvent): Promise<void> => {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    document.body.classList.remove('scope-timeline--dragging');
    drag.bar.removeEventListener('pointermove', onPointerMove);
    drag.bar.removeEventListener('pointerup', onPointerUp);
    drag.bar.removeEventListener('pointercancel', onPointerUp);
    if (drag.bar.hasPointerCapture?.(event.pointerId)) {
      drag.bar.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    suppressClick = true;
    const changed =
      drag.current.start_week !== drag.origin.start_week ||
      drag.current.end_week !== drag.origin.end_week;
    if (!changed) return;
    const dates = datesForWeekSpan(scope, drag.current.start_week, drag.current.end_week);
    const items = scope.timeline_items.map((entry) =>
      entry.id === drag.itemId ? { ...entry, ...drag.current, ...dates } : entry
    );
    const ok = await persistItems(items);
    if (!ok) paintView();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!activeDrag) return;
    const weekPx = yearBounds().ppd * 7;
    if (weekPx <= 0) return;
    const deltaWeeks = Math.round((event.clientX - activeDrag.startX) / weekPx);
    const next = applyDragDelta(
      activeDrag.mode,
      activeDrag.origin,
      deltaWeeks,
      scope.week_count
    );
    activeDrag.current = next;
    if (deltaWeeks !== 0) activeDrag.moved = true;
    applyBarPosition(activeDrag.bar, activeDrag.labelWrap, next);
  };

  const onPointerUp = (event: PointerEvent): void => {
    void endDrag(event);
  };

  const startDrag = (
    event: PointerEvent,
    item: TimelineItem,
    mode: DragMode,
    bar: HTMLElement,
    labelWrap: HTMLElement
  ): void => {
    if (event.button !== 0 || activeDrag || saving) return;
    event.preventDefault();
    setSelection(item.id);
    activeDrag = {
      mode,
      itemId: item.id,
      startX: event.clientX,
      origin: { start_week: item.start_week, end_week: item.end_week },
      current: { start_week: item.start_week, end_week: item.end_week },
      moved: false,
      bar,
      labelWrap
    };
    document.body.classList.add('scope-timeline--dragging');
    bar.setPointerCapture?.(event.pointerId);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);
  };

  let scrollEl: HTMLElement | null = null;

  const scrollToYmd = (ymd: string, pad = 30): void => {
    if (!scrollEl) return;
    const { start, ppd } = yearBounds();
    scrollEl.scrollTo({ left: Math.max(offsetPx(ymd, start, ppd) - pad, 0), behavior: 'smooth' });
  };

  const paintTimeline = (): void => {
    const { start, days, ppd, totalW } = yearBounds();
    const card = document.createElement('div');
    card.className = 'scope-gantt';

    const scroll = document.createElement('div');
    scroll.className = 'scope-gantt__scroll';
    scrollEl = scroll;

    const inner = document.createElement('div');
    inner.className = 'scope-gantt__inner';
    inner.style.width = `${totalW}px`;

    const months = document.createElement('div');
    months.className = 'scope-gantt__months';
    for (let month = 0; month < 12; month += 1) {
      const mStart = `${scope.academic_year}-${String(month + 1).padStart(2, '0')}-01`;
      const mEnd =
        month === 11
          ? `${scope.academic_year + 1}-01-01`
          : `${scope.academic_year}-${String(month + 2).padStart(2, '0')}-01`;
      const left = offsetPx(mStart, start, ppd);
      const width = diffDays(mStart, mEnd) * ppd;
      const cell = document.createElement('div');
      cell.className = 'scope-gantt__month';
      cell.style.left = `${left}px`;
      cell.style.width = `${width}px`;
      const useShort = zoom === 'year' || width < 70;
      cell.textContent = new Date(`${mStart}T00:00:00Z`).toLocaleDateString('en-AU', {
        month: useShort ? 'short' : 'long',
        timeZone: 'UTC'
      });
      months.append(cell);
    }

    const ticks = document.createElement('div');
    ticks.className = 'scope-gantt__ticks';
    if (zoom === 'month') {
      for (let d = 0; d < days; d += 7) {
        const tickDate = new Date(Date.UTC(scope.academic_year, 0, 1 + d));
        const tick = document.createElement('div');
        tick.className = 'scope-gantt__tick';
        tick.style.left = `${d * ppd}px`;
        tick.style.width = `${7 * ppd}px`;
        tick.textContent = String(tickDate.getUTCDate());
        ticks.append(tick);
      }
    } else {
      for (let month = 0; month < 12; month += 1) {
        const mStart = `${scope.academic_year}-${String(month + 1).padStart(2, '0')}-01`;
        const tick = document.createElement('div');
        tick.className = 'scope-gantt__tick';
        tick.style.left = `${offsetPx(mStart, start, ppd)}px`;
        tick.textContent = new Date(`${mStart}T00:00:00Z`).toLocaleDateString('en-AU', {
          month: 'short',
          timeZone: 'UTC'
        });
        ticks.append(tick);
      }
    }

    const bands = document.createElement('div');
    bands.className = 'scope-gantt__bands';
    for (const term of scope.terms) {
      const span = resolveTermSpan(term, scope.academic_year);
      const band = document.createElement('div');
      band.className = 'scope-gantt__band scope-timeline__term';
      band.style.left = `${offsetPx(span.start, start, ppd)}px`;
      band.style.width = `${Math.max(diffDays(span.start, span.end) * ppd, ppd)}px`;
      const label = document.createElement('span');
      label.className = 'scope-gantt__band-label';
      label.textContent = `TERM ${term.term_number}`;
      band.append(label);
      bands.append(band);
    }

    const todayLine = document.createElement('div');
    todayLine.className = 'scope-gantt__today-line';
    todayLine.style.left = `${offsetPx(todayYmd, start, ppd)}px`;
    const todayBadge = document.createElement('span');
    todayBadge.className = 'scope-gantt__today-badge';
    todayBadge.textContent = String(new Date(`${todayYmd}T00:00:00Z`).getUTCDate());
    todayLine.append(todayBadge);
    bands.append(todayLine);

    const rows = document.createElement('div');
    rows.className = 'scope-gantt__rows';

    const sorted = [...scope.timeline_items].sort((a, b) => {
      const aSpan = resolveItemSpan(
        a,
        scope.terms,
        scope.academic_year,
        a.kind === 'unit' ? unitsById.get(a.unit_id) : undefined
      );
      const bSpan = resolveItemSpan(
        b,
        scope.terms,
        scope.academic_year,
        b.kind === 'unit' ? unitsById.get(b.unit_id) : undefined
      );
      return aSpan.start.localeCompare(bSpan.start) || a.order - b.order;
    });

    for (const item of sorted) {
      const unit = item.kind === 'unit' ? unitsById.get(item.unit_id) : undefined;
      const span = resolveItemSpan(item, scope.terms, scope.academic_year, unit);
      const left = offsetPx(span.start, start, ppd);
      const width = Math.max(diffDays(span.start, span.end) * ppd, ppd * 1.2);

      const row = document.createElement('div');
      row.className = `scope-gantt__row scope-timeline__item scope-timeline__item--${item.kind}`;
      row.dataset.itemId = item.id;
      row.dataset.kind = item.kind;
      if (item.kind === 'unit') {
        row.dataset.unitId = item.unit_id;
        row.dataset.tint = pastelFromId(item.unit_id);
      } else {
        row.classList.add('scope-timeline__item--navy');
      }

      const bar = document.createElement('div');
      bar.className = 'scope-gantt__bar';
      if (item.kind === 'unit') bar.dataset.tint = pastelFromId(item.unit_id);
      if (isAssessmentItem(item)) bar.classList.add('scope-gantt__bar--assessment');
      bar.style.left = `${left}px`;
      bar.style.width = `${width}px`;

      const handleStart = document.createElement('span');
      handleStart.className = 'scope-timeline__handle scope-timeline__handle--start';
      handleStart.setAttribute('aria-hidden', 'true');
      const handleEnd = document.createElement('span');
      handleEnd.className = 'scope-timeline__handle scope-timeline__handle--end';
      handleEnd.setAttribute('aria-hidden', 'true');
      bar.append(handleStart, handleEnd);

      const labelWrap = document.createElement('div');
      labelWrap.className = 'scope-gantt__label-wrap';
      labelWrap.style.left = `${left}px`;
      labelWrap.style.width = `${width}px`;

      const label = document.createElement('div');
      label.className = 'scope-gantt__label';

      const tri = document.createElement('span');
      tri.className = 'scope-gantt__tri';
      tri.setAttribute('aria-hidden', 'true');
      tri.textContent = '▶';

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scope-gantt__chip';
      if (item.kind === 'unit') chip.dataset.tint = pastelFromId(item.unit_id);
      chip.textContent = itemLabel(item, unitsById);

      const subjTag = document.createElement('span');
      subjTag.className = 'scope-gantt__tag scope-gantt__tag--subject';
      subjTag.textContent = subject.title;

      const yearTag = document.createElement('span');
      yearTag.className = 'scope-gantt__tag scope-gantt__tag--year';

      label.append(tri, chip, subjTag);
      if (year?.title) {
        yearTag.textContent = year.title;
        label.append(yearTag);
      }
      if (isAssessmentItem(item)) {
        const assess = document.createElement('span');
        assess.className = 'scope-gantt__tag scope-gantt__tag--assess';
        assess.textContent = 'Assessment';
        label.append(assess);
      }

      labelWrap.append(label);
      row.append(bar, labelWrap);

      const select = (): void => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        setSelection(item.id);
      };
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        select();
      });
      row.addEventListener('click', select);
      bar.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.scope-timeline__handle--start')) {
          startDrag(event, item, 'resize-start', bar, labelWrap);
          return;
        }
        if (target.closest('.scope-timeline__handle--end')) {
          startDrag(event, item, 'resize-end', bar, labelWrap);
          return;
        }
        startDrag(event, item, 'move', bar, labelWrap);
      });
      if (item.kind === 'unit') {
        row.addEventListener('dblclick', () => {
          if (suppressClick) return;
          navigate(`/units/${item.unit_id}`);
        });
        chip.addEventListener('dblclick', () => {
          if (suppressClick) return;
          navigate(`/units/${item.unit_id}`);
        });
      }

      rows.append(row);
    }

    inner.append(months, ticks, bands, rows);
    scroll.append(inner);
    card.append(scroll);

    if (sorted.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'scope-gantt__empty';
      const icon = document.createElement('div');
      icon.className = 'scope-gantt__empty-icon';
      icon.setAttribute('aria-hidden', 'true');
      const heading = document.createElement('h2');
      heading.textContent = 'Map out your year';
      const copy = document.createElement('p');
      copy.textContent =
        "This scope & sequence doesn't have any units yet. Add your first unit and it'll appear here on the weeks it runs.";
      const emptyAdd = document.createElement('button');
      emptyAdd.type = 'button';
      emptyAdd.className = 'btn btn--primary';
      emptyAdd.textContent = '+ Add Unit';
      emptyAdd.addEventListener('click', () => addUnit.click());
      empty.append(icon, heading, copy, emptyAdd);
      card.append(empty);
    }

    const hint = document.createElement('p');
    hint.className = 'scope-gantt__hint';
    hint.textContent =
      'Scroll to browse the year · titles stay pinned to the left as you scroll past a unit’s start.';

    viewHost.replaceChildren(card, hint);

    requestAnimationFrame(() => {
      const first = scope.terms[0];
      if (!first) return;
      const span = resolveTermSpan(first, scope.academic_year);
      scroll.scrollLeft = Math.max(offsetPx(span.start, start, ppd) - 30, 0);
    });
  };

  const paintMap = (): void => {
    scrollEl = null;
    const wrap = document.createElement('div');
    wrap.className = 'scope-map';

    const cols = document.createElement('div');
    cols.className = 'scope-map__columns';

    for (const term of [...scope.terms].sort((a, b) => a.term_number - b.term_number)) {
      const span = resolveTermSpan(term, scope.academic_year);
      const col = document.createElement('section');
      col.className = 'scope-map__col';

      const head = document.createElement('header');
      head.className = 'scope-map__head';
      const name = document.createElement('span');
      name.className = 'scope-map__term-name';
      name.textContent = `TERM ${term.term_number}`;
      const range = document.createElement('span');
      range.className = 'scope-map__term-range';
      range.textContent = formatDateRange(span.start, span.end);
      head.append(name, range);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'scope-map__body';

      const termItems = scope.timeline_items.filter((item) => {
        const itemSpan = resolveItemSpan(
          item,
          scope.terms,
          scope.academic_year,
          item.kind === 'unit' ? unitsById.get(item.unit_id) : undefined
        );
        return itemSpan.start <= span.end && itemSpan.end >= span.start;
      });

      const addForTerm = (): void => {
        hideBanner();
        openAddUnitPicker({
          units: availableUnits(curriculum, subject.id, scope),
          onChoose: (unitId) => placeUnit(unitId, term.start_week)
        });
      };

      if (termItems.length === 0) {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'scope-map__add scope-map__add--empty';
        slot.textContent = '+ Add unit';
        slot.addEventListener('click', addForTerm);
        bodyEl.append(slot);
      } else {
        for (const item of termItems) {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = `scope-map__card scope-timeline__item scope-timeline__item--${item.kind}`;
          card.dataset.itemId = item.id;
          if (item.kind === 'unit') {
            card.dataset.unitId = item.unit_id;
            card.dataset.tint = pastelFromId(item.unit_id);
          }
          const itemSpan = resolveItemSpan(
            item,
            scope.terms,
            scope.academic_year,
            item.kind === 'unit' ? unitsById.get(item.unit_id) : undefined
          );
          const title = document.createElement('span');
          title.className = 'scope-map__card-title';
          title.textContent = itemLabel(item, unitsById);
          const dates = document.createElement('span');
          dates.className = 'scope-map__card-dates';
          dates.textContent = formatDateRange(itemSpan.start, itemSpan.end);
          card.append(title, dates);
          card.addEventListener('click', () => setSelection(item.id));
          bodyEl.append(card);
        }
        const mini = document.createElement('button');
        mini.type = 'button';
        mini.className = 'scope-map__add scope-map__add--mini';
        mini.textContent = '+ Add unit';
        mini.addEventListener('click', addForTerm);
        bodyEl.append(mini);
      }

      col.append(head, bodyEl);
      cols.append(col);
    }

    wrap.append(cols);
    viewHost.replaceChildren(wrap);
  };

  const paintView = (): void => {
    const unitCount = scope.timeline_items.filter((entry) => entry.kind === 'unit').length;
    meta.textContent = `${unitCount} ${unitCount === 1 ? 'unit' : 'units'} · ${scope.academic_year}`;
    timelineTab.classList.toggle('scope-timeline__tab--active', tab === 'timeline');
    mapTab.classList.toggle('scope-timeline__tab--active', tab === 'map');
    timelineTab.classList.toggle('is-active', tab === 'timeline');
    mapTab.classList.toggle('is-active', tab === 'map');
    controls.hidden = tab !== 'timeline';
    zoomMonth.classList.toggle('scope-timeline__zoom-btn--active', zoom === 'month');
    zoomYear.classList.toggle('scope-timeline__zoom-btn--active', zoom === 'year');
    zoomMonth.setAttribute('aria-pressed', zoom === 'month' ? 'true' : 'false');
    zoomYear.setAttribute('aria-pressed', zoom === 'year' ? 'true' : 'false');
    if (tab === 'timeline') paintTimeline();
    else paintMap();
  };

  const placeUnit = (unitId: string, preferredStart?: number): void => {
    let start: number | null = null;
    if (preferredStart != null) {
      const end = preferredStart + UNIT_SPAN - 1;
      const fits = end <= scope.week_count;
      const overlaps = scope.timeline_items.some(
        (item) => !(end < item.start_week || preferredStart > item.end_week)
      );
      if (fits && !overlaps) start = preferredStart;
    }
    if (start === null) {
      start = findFirstFreeStart(scope.week_count, UNIT_SPAN, scope.timeline_items);
    }
    if (start === null) {
      showBanner('No free span available for a 4-week unit.');
      return;
    }
    const end_week = start + UNIT_SPAN - 1;
    const item: TimelineItem = {
      id: newItemId(),
      kind: 'unit',
      unit_id: unitId,
      start_week: start,
      end_week,
      order: nextOrder(scope.timeline_items),
      ...datesForWeekSpan(scope, start, end_week)
    };
    selectedId = item.id;
    void persistItems([...scope.timeline_items, item]);
  };

  addUnit.addEventListener('click', () => {
    hideBanner();
    openAddUnitPicker({
      units: availableUnits(curriculum, subject.id, scope),
      onChoose: (unitId) => placeUnit(unitId)
    });
  });

  addNote.addEventListener('click', () => {
    hideBanner();
    const selected = scope.timeline_items.find((entry) => entry.id === selectedId);
    const startWeek = selected?.start_week ?? 1;
    const dates = datesForWeekSpan(scope, startWeek, startWeek);
    const item: TimelineItem = {
      id: newItemId(),
      kind: 'note',
      title: 'Note',
      start_week: startWeek,
      end_week: startWeek,
      order: nextOrder(scope.timeline_items),
      ...dates
    };
    selectedId = item.id;
    void persistItems([...scope.timeline_items, item]);
  });

  timelineTab.addEventListener('click', () => {
    if (tab === 'timeline') return;
    tab = 'timeline';
    paintView();
    setSelection(selectedId);
  });
  mapTab.addEventListener('click', () => {
    if (tab === 'map') return;
    tab = 'map';
    paintView();
    setSelection(selectedId);
  });

  zoomMonth.addEventListener('click', () => {
    if (zoom === 'month') return;
    zoom = 'month';
    writeZoom(zoom);
    paintView();
    setSelection(selectedId);
  });
  zoomYear.addEventListener('click', () => {
    if (zoom === 'year') return;
    zoom = 'year';
    writeZoom(zoom);
    paintView();
    setSelection(selectedId);
  });

  termJump.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-term-number]');
    if (!btn) return;
    const n = Number(btn.dataset.termNumber);
    const term = scope.terms.find((entry) => entry.term_number === n);
    if (!term) return;
    tab = 'timeline';
    paintView();
    scrollToYmd(resolveTermSpan(term, scope.academic_year).start);
  });

  todayBtn.addEventListener('click', () => {
    tab = 'timeline';
    paintView();
    scrollToYmd(todayYmd, 260);
  });

  paintView();

  const initialNoteId = options?.selectedNoteId;
  if (
    initialNoteId &&
    scope.timeline_items.some((item) => item.id === initialNoteId && item.kind === 'note')
  ) {
    setSelection(initialNoteId);
  } else {
    inspector.hidden = true;
  }
}

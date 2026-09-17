import type { ScopeSequence, TimelineItem, Unit } from '@/schemas';
import { diffDays, resolveItemSpan, weekToDate } from '@/scope/timeline-dates';
import type { CurriculumResponse } from '@/teacher/nav';
import { patchScopeSequence } from '@/teacher/scope-api';

export interface ScopeDateControlsOptions {
  onSaved?: (scope: ScopeSequence, item: TimelineItem) => void;
}

const cleanupByCanvas = new WeakMap<HTMLElement, () => void>();

function activeScope(
  curriculum: CurriculumResponse,
  subjectId: string
): ScopeSequence | undefined {
  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);
  if (!subject?.scope_id) return undefined;
  return curriculum.scope_sequences.find((entry) => entry.id === subject.scope_id);
}

function closestWeek(scope: ScopeSequence, ymd: string): number {
  let closest = 1;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let week = 1; week <= scope.week_count; week += 1) {
    const weekDate = weekToDate(week, scope.terms, scope.academic_year);
    const distance = Math.abs(diffDays(weekDate, ymd));
    if (distance < closestDistance) {
      closest = week;
      closestDistance = distance;
    }
  }

  return closest;
}

function replaceScope(curriculum: CurriculumResponse, updated: ScopeSequence): void {
  const index = curriculum.scope_sequences.findIndex((entry) => entry.id === updated.id);
  if (index >= 0) curriculum.scope_sequences[index] = updated;
}

function selectedTimelineItem(
  canvas: HTMLElement,
  scope: ScopeSequence
): TimelineItem | undefined {
  const selected = canvas.querySelector<HTMLElement>('.scope-timeline__item--selected[data-item-id]');
  const itemId = selected?.dataset.itemId;
  if (!itemId) return undefined;
  return scope.timeline_items.find((entry) => entry.id === itemId);
}

function unitForItem(
  curriculum: CurriculumResponse,
  item: TimelineItem
): Unit | undefined {
  if (item.kind !== 'unit') return undefined;
  return curriculum.units.find((entry) => entry.id === item.unit_id);
}

export function mountScopeDateControls(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options: ScopeDateControlsOptions = {}
): void {
  cleanupByCanvas.get(canvas)?.();

  let disposed = false;
  let decorateQueued = false;

  const decorate = (): void => {
    decorateQueued = false;
    if (disposed) return;

    const inspector = canvas.querySelector<HTMLElement>('.scope-timeline__inspector');
    if (!inspector || inspector.hidden) return;
    if (inspector.querySelector('[data-scope-date-controls]')) return;

    const scope = activeScope(curriculum, subjectId);
    if (!scope) return;
    const item = selectedTimelineItem(canvas, scope);
    if (!item || item.kind !== 'unit') return;

    const unit = unitForItem(curriculum, item);
    const span = resolveItemSpan(item, scope.terms, scope.academic_year, unit);

    const controls = document.createElement('div');
    controls.dataset.scopeDateControls = '';
    controls.className = 'scope-timeline__date-controls';
    controls.style.display = 'grid';
    controls.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    controls.style.gap = 'var(--space-3)';
    controls.style.margin = 'var(--space-3) 0';

    const heading = document.createElement('p');
    heading.textContent = 'Unit dates';
    heading.className = 'scope-timeline__inspector-kind';
    heading.style.gridColumn = '1 / -1';
    heading.style.margin = '0';

    const startField = document.createElement('label');
    startField.className = 'schedule-modal__field';
    const startLabel = document.createElement('span');
    startLabel.className = 'schedule-modal__label';
    startLabel.textContent = 'Start date';
    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.className = 'schedule-modal__date scope-timeline__start-date';
    startInput.value = span.start;
    startInput.setAttribute('aria-label', 'Unit start date');
    startField.append(startLabel, startInput);

    const endField = document.createElement('label');
    endField.className = 'schedule-modal__field';
    const endLabel = document.createElement('span');
    endLabel.className = 'schedule-modal__label';
    endLabel.textContent = 'End date';
    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.className = 'schedule-modal__date scope-timeline__end-date';
    endInput.value = span.end;
    endInput.setAttribute('aria-label', 'Unit end date');
    endField.append(endLabel, endInput);

    const error = document.createElement('p');
    error.className = 'class-page__error scope-timeline__date-error';
    error.hidden = true;
    error.style.gridColumn = '1 / -1';
    error.setAttribute('role', 'alert');

    controls.append(heading, startField, endField, error);

    const actions = inspector.querySelector('.scope-timeline__inspector-actions');
    if (actions) inspector.insertBefore(controls, actions);
    else inspector.append(controls);

    const saveDates = (): void => {
      const start = startInput.value;
      const end = endInput.value;
      if (!start || !end) return;

      if (end < start) {
        error.hidden = false;
        error.textContent = 'End date must be on or after the start date.';
        return;
      }

      error.hidden = true;
      error.textContent = '';
      startInput.disabled = true;
      endInput.disabled = true;

      const currentScope = activeScope(curriculum, subjectId);
      if (!currentScope) return;
      const currentItem = currentScope.timeline_items.find((entry) => entry.id === item.id);
      if (!currentItem) return;

      const startWeek = closestWeek(currentScope, start);
      const endWeek = closestWeek(currentScope, end);
      const nextStartWeek = Math.min(startWeek, endWeek);
      const nextEndWeek = Math.max(startWeek, endWeek);

      const timelineItems = currentScope.timeline_items.map((entry) =>
        entry.id === currentItem.id
          ? {
              ...entry,
              start_date: start,
              end_date: end,
              start_week: nextStartWeek,
              end_week: nextEndWeek
            }
          : entry
      );

      void patchScopeSequence(currentScope.id, { timeline_items: timelineItems })
        .then((updated) => {
          replaceScope(curriculum, updated);
          const updatedItem = updated.timeline_items.find((entry) => entry.id === currentItem.id);
          if (updatedItem) options.onSaved?.(updated, updatedItem);
        })
        .catch(() => {
          error.hidden = false;
          error.textContent = 'Unable to save unit dates.';
          startInput.disabled = false;
          endInput.disabled = false;
        });
    };

    startInput.addEventListener('change', saveDates);
    endInput.addEventListener('change', saveDates);
  };

  const queueDecorate = (): void => {
    if (decorateQueued || disposed) return;
    decorateQueued = true;
    queueMicrotask(decorate);
  };

  const observer = new MutationObserver(queueDecorate);
  observer.observe(canvas, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });
  canvas.addEventListener('click', queueDecorate, true);
  queueDecorate();

  const cleanup = (): void => {
    disposed = true;
    observer.disconnect();
    canvas.removeEventListener('click', queueDecorate, true);
  };
  cleanupByCanvas.set(canvas, cleanup);
}

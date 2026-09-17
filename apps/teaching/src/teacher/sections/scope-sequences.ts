import { mountCreateControl } from '@/teacher/create/control';
import type { EntityCreatedHandler } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { renderPageHeader } from '@/teacher/page-header';
import { mountScopeDateControls } from '@/teacher/sections/scope-date-controls';
import { renderScopeOverview, subjectsWithScope } from '@/teacher/sections/scope-overview';
import {
  renderScopeTimelineEditor as renderScopeTimelineEditorBase,
  type ScopeTimelineEditorOptions
} from '@/teacher/sections/scope-timeline';
import {
  curriculumForScopeTimeline,
  enhanceScopeUnitPicker
} from '@/teacher/sections/scope-unit-picker-context';

export interface ScopeSequencesIndexOptions {
  onCreated?: EntityCreatedHandler;
}

const pickerListeners = new WeakMap<HTMLElement, EventListener>();

export function renderScopeSequencesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options?: ScopeSequencesIndexOptions
): { dispose?: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const createHost = document.createElement('div');
  createHost.className = 'scope-sequences-index__create create-control';
  createHost.dataset.createHost = '';

  const scoped = subjectsWithScope(curriculum);
  const academicYear =
    scoped[0]?.scope.academic_year ??
    curriculum.scope_sequences[0]?.academic_year ??
    curriculum.classes[0]?.academic_year;

  renderPageHeader(canvas, {
    eyebrow: 'Workspace',
    title: 'Overall Scope & Sequence',
    supporting: academicYear != null ? `Academic year ${academicYear}` : 'Academic year',
    actions: [createHost]
  });

  const createControl = mountCreateControl(createHost, {
    context: 'scope-sequences',
    curriculum,
    onCreated: options?.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const overviewHost = document.createElement('div');
  overviewHost.className = 'scope-sequences-index__overview';

  canvas.append(overviewHost);
  renderScopeOverview(overviewHost, curriculum);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

export function renderScopeTimelineEditor(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options?: ScopeTimelineEditorOptions
): void {
  const priorListener = pickerListeners.get(canvas);
  if (priorListener) canvas.removeEventListener('click', priorListener);

  const visibleCurriculum = curriculumForScopeTimeline(curriculum, subjectId);
  renderScopeTimelineEditorBase(canvas, visibleCurriculum, subjectId, options);

  mountScopeDateControls(canvas, curriculum, subjectId, {
    onSaved: (scope, item) => {
      options?.onPatched?.(scope);
      renderScopeTimelineEditor(canvas, curriculum, subjectId, {
        ...options,
        selectedUnitId: item.kind === 'unit' ? item.unit_id : undefined,
        selectedNoteId: item.kind === 'note' ? item.id : undefined
      });
    }
  });

  const enhanceOpenPicker = (): void => {
    const picker = document.querySelector<HTMLElement>('.scope-timeline__picker');
    if (!picker) return;
    enhanceScopeUnitPicker(picker, curriculum, subjectId);
  };

  const listener: EventListener = () => {
    queueMicrotask(enhanceOpenPicker);
  };
  pickerListeners.set(canvas, listener);
  canvas.addEventListener('click', listener);
}

/** @deprecated Prefer renderScopeTimelineEditor. Kept as a thin wrapper for callers. */
export function renderScopeSequenceStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options?: ScopeTimelineEditorOptions
): void {
  renderScopeTimelineEditor(canvas, curriculum, subjectId, options);
}

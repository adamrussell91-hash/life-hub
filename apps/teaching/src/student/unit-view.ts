import { FAILURE } from '@/app/failure';
import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import type { PublishedUnit } from '@/schemas/published-unit';
import { renderStudentHero } from '@/student/hero';
import { mountPublicOutcomeChips } from '@/outcomes/strip';
import type { PublicOutcome } from '@/curriculum/outcome-catalog';
import {
  createStudentShell,
  renderStudentChrome,
  renderStudentStatus,
  studentAnchor
} from '@/student/shell';

export interface MountStudentUnitViewOptions {
  root: HTMLElement;
  unitId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentUnitViewHandle {
  dispose(): void;
}

function renderPublishedUnit(content: HTMLElement, unit: PublishedUnit): void {
  content.replaceChildren();

  content.append(
    renderStudentHero({
      title: unit.title,
      eyebrow: 'Unit',
      entityId: unit.unit_id,
      cover: unit.cover
    })
  );

  const publishedOutcomes = (unit as PublishedUnit & { outcomes?: PublicOutcome[] }).outcomes;
  if (publishedOutcomes && publishedOutcomes.length > 0) {
    mountPublicOutcomeChips(content, publishedOutcomes);
  }

  const planBlocks = unit.blocks ?? [];
  if (planBlocks.length > 0) {
    const plan = document.createElement('section');
    plan.className = 'student-panel student-unit__plan';
    plan.dataset.unitSection = 'plan';
    for (const block of planBlocks) {
      plan.append(renderBlock(block, 'student', { attachedOutcomes: publishedOutcomes }));
    }
    content.append(plan);
  }

  if (unit.lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'student-unit__empty';
    empty.textContent = 'No published lessons in this unit yet.';
    content.append(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'student-unit__lesson-list';

  unit.lessons.forEach((lesson, index) => {
    const item = document.createElement('li');
    item.className = 'student-unit__lesson-item';

    const href = `/s/lessons/${lesson.lesson_id}`;
    const link = studentAnchor(href, 'student-unit__lesson-link student-lesson-card');

    const indexEl = document.createElement('span');
    indexEl.className = 'student-lesson-card__index';
    indexEl.textContent = String(index + 1).padStart(2, '0');

    const title = document.createElement('span');
    title.className = 'student-lesson-card__title';
    title.textContent = lesson.title;

    link.append(indexEl, title);
    item.append(link);
    list.append(item);
  });

  content.append(list);
}

/**
 * Loads a published unit and renders the public student unit surface:
 * cover hero, plan overview blocks, and published lesson links.
 */
export function mountStudentUnitView(
  options: MountStudentUnitViewOptions
): StudentUnitViewHandle {
  const { root, unitId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell();
  root.append(surface);
  renderStudentChrome(header, { brand: 'Teaching Hub' });
  renderStudentStatus(content, 'Loading unit…');

  void apiGet<PublishedUnit>(`/api/published/units/${unitId}`)
    .then((unit) => {
      if (disposed || isStale()) return;
      renderPublishedUnit(content, unit);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Unit not found.'
          : FAILURE.network;
      renderStudentStatus(content, message);
    });

  return {
    dispose() {
      disposed = true;
    }
  };
}

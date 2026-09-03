import { FAILURE } from '@/app/failure';
import { apiGet, ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import { renderBlock } from '@/blocks/render';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { scheduleNeighbors } from '@/schedule/schedule-neighbors';
import { formatStudentDate } from '@/student/format';
import { renderStudentHero } from '@/student/hero';
import { mountPublicOutcomeChips } from '@/outcomes/strip';
import type { PublicOutcome } from '@/curriculum/outcome-catalog';
import { firstLeadFromBlocks } from '@/student/lesson-lead';
import {
  fetchPublishedClass,
  type PublishedClass
} from '@/student/published-class';
import {
  createStudentShell,
  renderStudentChrome,
  renderStudentStatus
} from '@/student/shell';

export interface MountStudentLessonViewOptions {
  root: HTMLElement;
  lessonId: string;
  classId?: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentLessonViewHandle {
  dispose(): void;
}

function renderPublishedLesson(
  content: HTMLElement,
  lesson: PublishedLesson,
  extras?: { cls?: PublishedClass }
): void {
  content.replaceChildren();

  const cls = extras?.cls;
  const classTitle = cls?.title?.trim() ?? '';
  const scheduleDate =
    cls?.schedule.find((row) => row.lesson_id === lesson.lesson_id)?.date ?? '';
  const lead = firstLeadFromBlocks(lesson.blocks);

  let meta: HTMLElement | undefined;
  if (classTitle || scheduleDate) {
    meta = document.createElement('aside');
    meta.className = 'lesson-hero__meta student-hero__meta';
    if (classTitle) {
      const classLine = document.createElement('p');
      classLine.className = 'lesson-hero__meta-class';
      classLine.textContent = classTitle;
      meta.append(classLine);
    }
    if (scheduleDate) {
      const dateLine = document.createElement('p');
      dateLine.className = 'lesson-hero__meta-date';
      dateLine.textContent = formatStudentDate(scheduleDate);
      meta.append(dateLine);
    }
  }

  content.append(
    renderStudentHero({
      title: lesson.title,
      eyebrow: classTitle || 'Lesson',
      lead: lead ?? undefined,
      entityId: lesson.lesson_id,
      cover: lesson.cover,
      media: lesson.cover ? 'cover' : 'never',
      extraClass: 'lesson-hero',
      titleClass: 'lesson-hero__title',
      eyebrowClass: 'lesson-hero__eyebrow',
      leadClass: 'lesson-hero__lead',
      meta
    })
  );

  const publishedOutcomes = (lesson as PublishedLesson & { outcomes?: PublicOutcome[] }).outcomes;
  if (publishedOutcomes && publishedOutcomes.length > 0) {
    mountPublicOutcomeChips(content, publishedOutcomes);
  }

  const blocks = document.createElement('div');
  blocks.className = 'lesson-blocks';
  for (const block of lesson.blocks) {
    blocks.append(
      renderBlock(block, 'student', {
        lessonId: lesson.lesson_id,
        attachedOutcomes: publishedOutcomes
      })
    );
  }
  content.append(blocks);
}

function renderLessonNav(
  content: HTMLElement,
  classId: string,
  lessonId: string,
  cls: PublishedClass
): void {
  const { prev, next } = scheduleNeighbors(cls.schedule, lessonId);
  if (!prev && !next) return;

  const nav = document.createElement('nav');
  nav.className = 'student-lesson__nav student-pager';
  nav.setAttribute('aria-label', 'Lesson');

  if (prev) {
    const href = `/s/classes/${classId}/lessons/${prev.lesson_id}`;
    const link = document.createElement('a');
    link.className = 'student-lesson__nav-prev student-pager__link';
    link.href = href;
    const dir = document.createElement('span');
    dir.className = 'student-pager__dir';
    dir.textContent = 'Previous';
    const title = document.createElement('span');
    title.className = 'student-pager__title';
    title.textContent = prev.title;
    link.append(dir, title);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(href);
    });
    nav.append(link);
  }

  if (next) {
    const href = `/s/classes/${classId}/lessons/${next.lesson_id}`;
    const link = document.createElement('a');
    link.className = 'student-lesson__nav-next student-pager__link';
    link.href = href;
    const dir = document.createElement('span');
    dir.className = 'student-pager__dir';
    dir.textContent = 'Next';
    const title = document.createElement('span');
    title.className = 'student-pager__title';
    title.textContent = next.title;
    link.append(dir, title);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(href);
    });
    nav.append(link);
  }

  content.append(nav);
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'not_found';
}

function loadErrorMessage(
  error: unknown,
  notFoundMessage: string,
  genericMessage = FAILURE.network
): string {
  return isNotFound(error) ? notFoundMessage : genericMessage;
}

/**
 * Loads a published lesson snapshot and renders the public student reading
 * surface: reading chrome, lesson title, and student-visible blocks only.
 * With `classId`, validates schedule membership and adds class chrome + footer.
 */
export function mountStudentLessonView(
  options: MountStudentLessonViewOptions
): StudentLessonViewHandle {
  const { root, lessonId, classId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell();
  root.append(surface);
  renderStudentChrome(header, { brand: 'Teaching Hub' });
  renderStudentStatus(content, 'Loading lesson…');

  if (classId) {
    void Promise.allSettled([
      apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`),
      fetchPublishedClass(classId)
    ]).then(([lessonResult, classResult]) => {
      if (disposed || isStale()) return;

      if (lessonResult.status === 'rejected') {
        renderStatusError(
          content,
          loadErrorMessage(
            lessonResult.reason,
            'Lesson not found.',
            FAILURE.network
          )
        );
        return;
      }

      if (classResult.status === 'rejected') {
        renderStatusError(
          content,
          loadErrorMessage(
            classResult.reason,
            'Class not found.',
            FAILURE.network
          )
        );
        return;
      }

      const lesson = lessonResult.value;
      const cls = classResult.value;
      const row = cls.schedule.find((entry) => entry.lesson_id === lessonId);
      if (!row || !row.published) {
        renderStatusError(content, 'Lesson not found.');
        return;
      }

      renderStudentChrome(header, {
        brand: cls.code || 'Teaching Hub',
        links: [
          {
            href: `/s/classes/${classId}`,
            label: 'Back to class',
            className: 'student-surface__back-class'
          },
          {
            href: `/s/units/${lesson.unit_id}`,
            label: 'Back to unit',
            className: 'student-surface__back-unit'
          }
        ]
      });
      renderPublishedLesson(content, lesson, { cls });
      renderLessonNav(content, classId, lessonId, cls);
    });
  } else {
    void apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`)
      .then((lesson) => {
        if (disposed || isStale()) return;
        renderStudentChrome(header, {
          links: [
            {
              href: `/s/units/${lesson.unit_id}`,
              label: 'Back to unit'
            }
          ]
        });
        renderPublishedLesson(content, lesson);
      })
      .catch((error: unknown) => {
        if (disposed || isStale()) return;
        renderStatusError(content, loadErrorMessage(error, 'Lesson not found.'));
      });
  }

  return {
    dispose() {
      disposed = true;
    }
  };
}

function renderStatusError(content: HTMLElement, message: string): void {
  renderStudentStatus(content, message);
}

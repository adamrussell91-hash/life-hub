import { FAILURE } from '@/app/failure';
import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { scheduleNeighbors } from '@/schedule/schedule-neighbors';
import { formatStudentDate } from '@/student/format';
import { renderEntityBanner } from '@/teacher/entity-banner';
import { mountPublicOutcomeChips } from '@/outcomes/strip';
import type { PublicOutcome } from '@/curriculum/outcome-catalog';
import {
  mountStudentClassExamples,
  type StudentClassExamplesHandle
} from '@/class-examples/student';
import {
  fetchPublishedClass,
  type PublishedClass
} from '@/student/published-class';
import {
  createStudentShell,
  studentAnchor,
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

  const hero = document.createElement('header');
  hero.className = 'lesson-hero';
  const coverHost = document.createElement('div');
  coverHost.className = 'lesson-page__cover';
  renderEntityBanner(coverHost, {
    title: lesson.title,
    eyebrow: 'Lesson',
    entityId: lesson.lesson_id,
    cover: lesson.cover,
    media: [],
    size: 'hero',
    fallback: 'marine'
  });
  coverHost.querySelector('.entity-banner__eyebrow')?.classList.add('lesson-hero__eyebrow');

  // Use the planner's title overlay and typography, with a semantic heading
  // instead of its editable input. The banner's decorative title stays hidden.
  const titleOverlay = document.createElement('div');
  titleOverlay.className = 'entity-page-title';
  const title = document.createElement('h1');
  title.className = 'entity-page-title__text lesson-hero__title';
  title.textContent = lesson.title;
  titleOverlay.append(title);
  coverHost.append(titleOverlay);
  hero.append(coverHost);
  if (meta) hero.append(meta);
  content.append(hero);

  const publishedOutcomes = (lesson as PublishedLesson & { outcomes?: PublicOutcome[] }).outcomes;
  if (publishedOutcomes && publishedOutcomes.length > 0) {
    mountPublicOutcomeChips(content, publishedOutcomes);
  }

  const openNoteId = readNoteHash();
  const blocks = document.createElement('div');
  blocks.className = 'lesson-blocks';
  for (const block of lesson.blocks) {
    blocks.append(
      renderBlock(block, 'student', {
        lessonId: lesson.lesson_id,
        pageBlocks: lesson.blocks,
        attachedOutcomes: publishedOutcomes,
        openNoteId
      })
    );
  }
  content.append(blocks);

  if (openNoteId && typeof history !== 'undefined' && history.replaceState) {
    const url = new URL(window.location.href);
    url.hash = '';
    history.replaceState(null, '', `${url.pathname}${url.search}`);
  }
}

/** `#note=<annotationId>` from anthology / deep links. */
function readNoteHash(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!raw.startsWith('note=')) return undefined;
  const id = decodeURIComponent(raw.slice('note='.length)).trim();
  return id || undefined;
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
    const link = studentAnchor(href, 'student-lesson__nav-prev student-pager__link');
    const dir = document.createElement('span');
    dir.className = 'student-pager__dir';
    dir.textContent = 'Previous';
    const title = document.createElement('span');
    title.className = 'student-pager__title';
    title.textContent = prev.title;
    link.append(dir, title);
    nav.append(link);
  }

  if (next) {
    const href = `/s/classes/${classId}/lessons/${next.lesson_id}`;
    const link = studentAnchor(href, 'student-lesson__nav-next student-pager__link');
    const dir = document.createElement('span');
    dir.className = 'student-pager__dir';
    dir.textContent = 'Next';
    const title = document.createElement('span');
    title.className = 'student-pager__title';
    title.textContent = next.title;
    link.append(dir, title);
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
  let examples: StudentClassExamplesHandle | null = null;
  const mountExamples = (content: HTMLElement) => {
    examples?.dispose();
    examples = mountStudentClassExamples(content, { lessonId, classId });
  };

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
          }
        ]
      });
      renderPublishedLesson(content, lesson, { cls });
      renderLessonNav(content, classId, lessonId, cls);
      mountExamples(content);
    });
  } else {
    void apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`)
      .then((lesson) => {
        if (disposed || isStale()) return;
        renderStudentChrome(header, {});
        renderPublishedLesson(content, lesson);
        mountExamples(content);
      })
      .catch((error: unknown) => {
        if (disposed || isStale()) return;
        renderStatusError(content, loadErrorMessage(error, 'Lesson not found.'));
      });
  }

  return {
    dispose() {
      disposed = true;
      examples?.dispose();
      examples = null;
    }
  };
}

function renderStatusError(content: HTMLElement, message: string): void {
  renderStudentStatus(content, message);
}

import { revealBlockFromHash } from '@/app/block-hash';
import { FAILURE } from '@/app/failure';
import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import { mountStudentBlockPulse } from '@/student/block-pulse';
import { mountStudentQuiz } from '@/quiz/student-quiz';
import { mountLecturePlayer, type LecturePlayerHandle } from '@/lecture/player';
import { lectureClient } from '@/lecture/api';
import { isSidePath } from '@/lecture/scenes';
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

/**
 * The lesson's cover, title, class/date line and outcome chips. Shared with
 * the teacher's Display view so the projector shows the same page students do.
 */
export function renderPublishedLessonHero(
  content: HTMLElement,
  lesson: PublishedLesson,
  cls?: PublishedClass
): PublicOutcome[] | undefined {
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
    eyebrow: lesson.pedagogical_mode === 'quiz' ? 'Quiz' : lesson.pedagogical_mode === 'lecture' ? 'Lecture' : 'Lesson',
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
  return publishedOutcomes;
}

/** Returns the lecture player's handle when the lesson plays as a lecture. */
function renderPublishedLesson(
  content: HTMLElement,
  lesson: PublishedLesson,
  extras?: { cls?: PublishedClass; quizClassId?: string }
): LecturePlayerHandle | null {
  content.replaceChildren();
  if (lesson.pedagogical_mode === 'lecture') {
    // The hero sits on the player's title card; hand-ups need the class link.
    const classId = extras?.cls?.id ?? extras?.quizClassId;
    const playerHost = document.createElement('div');
    content.append(playerHost);
    return mountLecturePlayer(playerHost, {
      lessonId: lesson.lesson_id,
      title: lesson.title,
      blocks: lesson.blocks,
      client: classId ? lectureClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => {
        renderPublishedLessonHero(hostEl, lesson, extras?.cls);
      }
    });
  }
  const publishedOutcomes = renderPublishedLessonHero(content, lesson, extras?.cls);

  const openNoteId = readNoteHash();
  const blocks = document.createElement('div');
  blocks.className = 'lesson-blocks';
  // A quiz lesson shows its other blocks as an introduction, then the quiz itself.
  const isQuiz = lesson.pedagogical_mode === 'quiz' && !!lesson.quiz;
  for (const block of lesson.blocks) {
    if (isQuiz && block.block_type === 'quiz_question') continue;
    // A side path only plays inside a lecture.
    if (isSidePath(block)) continue;
    blocks.append(
      renderBlock(block, 'student', {
        lessonId: lesson.lesson_id,
        pageBlocks: lesson.blocks,
        attachedOutcomes: publishedOutcomes,
        openNoteId
      })
    );
  }
  mountStudentBlockPulse(blocks, {
    lessonId: lesson.lesson_id,
    blocks: lesson.blocks,
    feedbackOff: lesson.feedback_off === true
  });
  content.append(blocks);
  if (isQuiz) content.append(mountStudentQuiz(lesson, { classId: extras?.cls?.id ?? extras?.quizClassId }));
  revealBlockFromHash(content);

  if (openNoteId && typeof history !== 'undefined' && history.replaceState) {
    const url = new URL(window.location.href);
    url.hash = '';
    history.replaceState(null, '', `${url.pathname}${url.search}`);
  }
  return null;
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
  let lecture: LecturePlayerHandle | null = null;
  const mountExamples = (content: HTMLElement) => {
    examples?.dispose();
    // Class examples hang off rendered blocks; the lecture player redraws them per scene.
    examples = lecture ? null : mountStudentClassExamples(content, { lessonId, classId });
  };
  const show = (content: HTMLElement, lesson: PublishedLesson, extras: Parameters<typeof renderPublishedLesson>[2]) => {
    lecture?.dispose();
    lecture = renderPublishedLesson(content, lesson, extras);
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
      show(content, lesson, { cls });
      renderLessonNav(content, classId, lessonId, cls);
      mountExamples(content);
    });
  } else {
    void apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`)
      .then((lesson) => {
        if (disposed || isStale()) return;
        renderStudentChrome(header, {});
        // The teacher's per-class Share link adds ?class= so the quiz knows the class list.
        const quizClassId = new URLSearchParams(window.location.search).get('class') ?? undefined;
        show(content, lesson, { quizClassId });
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
      lecture?.dispose();
      lecture = null;
    }
  };
}

function renderStatusError(content: HTMLElement, message: string): void {
  renderStudentStatus(content, message);
}

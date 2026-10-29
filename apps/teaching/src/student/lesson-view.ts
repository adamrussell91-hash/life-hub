import { revealBlockFromHash } from '@/app/block-hash';
import { FAILURE } from '@/app/failure';
import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import { mountStudentBlockPulse } from '@/student/block-pulse';
import { hasNestedQuizQuestion, mountStudentQuiz } from '@/quiz/student-quiz';
import { readJSON, writeJSON } from '@/quiz/dom';
import { mountLecturePlayer } from '@/lecture/player';
import { mountTutorialPlayer } from '@/tutorial/player';
import { tutorialClient } from '@/tutorial/api';
import { mountSprintPlayer } from '@/sprint/player';
import { sprintClient } from '@/sprint/api';
import { mountCasePlayer } from '@/case-study/player';
import { caseClient } from '@/case-study/api';
import '@/sprint/forms';
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
    eyebrow: lesson.pedagogical_mode === 'quiz' ? 'Quiz' : lesson.pedagogical_mode === 'lecture' ? 'Lecture' : lesson.pedagogical_mode === 'tutorial' ? 'Tutorial' : lesson.pedagogical_mode === 'design_sprint' ? 'Design Sprint' : lesson.pedagogical_mode === 'case_study' ? 'Case Study' : 'Lesson',
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

/** Returns the player's handle when the lesson plays as a lecture, a tutorial, a design sprint or a case study. */
function renderPublishedLesson(
  content: HTMLElement,
  lesson: PublishedLesson,
  extras?: { cls?: PublishedClass; quizClassId?: string }
): { dispose(): void } | null {
  content.replaceChildren();
  if (lesson.pedagogical_mode === 'design_sprint' && lesson.sprint) {
    // The brief and phase guides are in the snapshot; the group and submissions come from the server after the claim.
    const classId = extras?.cls?.id ?? extras?.quizClassId;
    const playerHost = document.createElement('div');
    content.append(playerHost);
    return mountSprintPlayer(playerHost, {
      lesson,
      classId,
      client: classId ? sprintClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => {
        renderPublishedLessonHero(hostEl, lesson, extras?.cls);
      }
    });
  }
  if (lesson.pedagogical_mode === 'case_study' && lesson.case) {
    // Only the brief, the decision and part titles are in the snapshot; documents come from the server by stage.
    const classId = extras?.cls?.id ?? extras?.quizClassId;
    const playerHost = document.createElement('div');
    content.append(playerHost);
    return mountCasePlayer(playerHost, {
      lesson,
      classId,
      client: classId ? caseClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => {
        renderPublishedLessonHero(hostEl, lesson, extras?.cls);
      }
    });
  }
  if (lesson.pedagogical_mode === 'tutorial') {
    // Common, the student's own group tab and the exit check; the tab comes from the server after the initials claim.
    const classId = extras?.cls?.id ?? extras?.quizClassId;
    const playerHost = document.createElement('div');
    content.append(playerHost);
    return mountTutorialPlayer(playerHost, {
      lesson,
      classId,
      client: classId ? tutorialClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => {
        renderPublishedLessonHero(hostEl, lesson, extras?.cls);
      }
    });
  }
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
  // Any other lesson runs its quiz where its first question sits, or at the end
  // when it only has group sets.
  const isQuiz = lesson.pedagogical_mode === 'quiz' && !!lesson.quiz;
  const inlineQuiz = !isQuiz && !!lesson.quiz;
  const quizClassId = extras?.cls?.id ?? extras?.quizClassId;
  // Questions inside sections or columns are answered where they sit; the quiz box at the end keeps the hand-in.
  const quizSlots = inlineQuiz && hasNestedQuizQuestion(lesson.blocks) ? new Map<string, HTMLElement>() : null;
  const quizSlot = quizSlots
    ? (id: string) => {
        const slot = quizSlots.get(id) ?? document.createElement('div');
        quizSlots.set(id, slot);
        return slot;
      }
    : undefined;
  let quizPlaced = false;
  for (const block of lesson.blocks) {
    if ((isQuiz || (inlineQuiz && !quizSlots)) && block.block_type === 'quiz_question') {
      if (inlineQuiz && !quizPlaced) {
        blocks.append(mountStudentQuiz(lesson, { classId: quizClassId }));
        quizPlaced = true;
      }
      continue;
    }
    // A side path only plays inside a lecture.
    if (isSidePath(block)) continue;
    blocks.append(
      renderBlock(block, 'student', {
        lessonId: lesson.lesson_id,
        classId: extras?.cls?.id ?? extras?.quizClassId,
        pageBlocks: lesson.blocks,
        attachedOutcomes: publishedOutcomes,
        openNoteId,
        ...(quizSlot ? { quizSlot } : {})
      })
    );
  }
  mountStudentBlockPulse(blocks, {
    lessonId: lesson.lesson_id,
    blocks: lesson.blocks,
    feedbackOff: lesson.feedback_off === true
  });
  if (inlineQuiz && !quizPlaced) blocks.append(mountStudentQuiz(lesson, { classId: quizClassId, ...(quizSlots ? { slots: quizSlots } : {}) }));
  content.append(blocks);
  if (isQuiz) content.append(mountStudentQuiz(lesson, { classId: quizClassId }));
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
  let lecture: { dispose(): void } | null = null;
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
        const fromLink = new URLSearchParams(window.location.search).get('class') ?? undefined;
        const choices = fromLink || lesson.pedagogical_mode === 'quiz' ? [] : lesson.classes ?? [];
        if (choices.length < 2) {
          // The one link is enough: a lecture, tutorial, sprint or case study finds its single class itself.
          show(content, lesson, { quizClassId: fromLink ?? choices[0]?.id });
          mountExamples(content);
          return;
        }
        // Two or more classes share the link: ask once, then this device remembers.
        const pickedKey = `lesson-class:${lessonId}`;
        const saved = readJSON<string>(pickedKey);
        if (saved && choices.some((c) => c.id === saved)) {
          show(content, lesson, { quizClassId: saved });
          mountExamples(content);
          return;
        }
        const box = document.createElement('div');
        box.className = 'qz-panel qz-class-pick';
        const title = document.createElement('p');
        title.className = 'qz-panel__title';
        title.textContent = 'Which class are you in?';
        const row = document.createElement('div');
        row.className = 'qz-actions';
        for (const c of choices) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn--secondary';
          b.textContent = c.title;
          b.addEventListener('click', () => {
            writeJSON(pickedKey, c.id);
            show(content, lesson, { quizClassId: c.id });
            mountExamples(content);
          });
          row.append(b);
        }
        box.append(title, row);
        content.replaceChildren(box);
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

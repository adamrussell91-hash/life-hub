import { FAILURE } from '@/app/failure';
import { apiGet, ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import { renderBlock } from '@/blocks/render';
import {
  createTeacherClassExamples,
  type TeacherClassExamplesHandle
} from '@/class-examples/teacher';
import { mountStudentQuiz } from '@/quiz/student-quiz';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { renderPublishedLessonHero } from '@/student/lesson-view';
import { createStudentShell, renderStudentStatus } from '@/student/shell';

/**
 * Display view: the page the teacher projects. It shows the published lesson,
 * the same page students have, with the teacher's live controls in place:
 * join codes, open and close, reveal, brainstorm boards and groups, class
 * example answers. No editing chrome and nothing marked teacher only, because
 * the published snapshot never carries it.
 */

export interface MountLessonDisplayViewOptions {
  root: HTMLElement;
  lessonId: string;
  isStale?: () => boolean;
}

export interface LessonDisplayViewHandle {
  dispose(): void;
}

export function lessonDisplayPath(lessonId: string): string {
  return `/lessons/${encodeURIComponent(lessonId)}/display`;
}

function chromeButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--ghost lesson-display__action';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

export function mountLessonDisplayView(
  options: MountLessonDisplayViewOptions
): LessonDisplayViewHandle {
  const { root, lessonId, isStale = () => false } = options;
  let disposed = false;
  let examples: TeacherClassExamplesHandle | null = null;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell();
  surface.classList.add('lesson-display');
  root.append(surface);

  header.replaceChildren();
  header.className = 'student-chrome student-surface__header lesson-display__chrome';
  const brand = document.createElement('span');
  brand.className = 'student-surface__brand student-chrome__brand';
  brand.textContent = 'Display';
  const actions = document.createElement('div');
  actions.className = 'lesson-display__actions';
  const fullScreen = chromeButton('Full screen', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  });
  const syncFullScreen = () => {
    fullScreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  };
  document.addEventListener('fullscreenchange', syncFullScreen);
  actions.append(
    chromeButton('Refresh', () => load()),
    fullScreen,
    chromeButton('Builder', () => navigate(`/lessons/${encodeURIComponent(lessonId)}`))
  );
  header.append(brand, actions);

  function render(lesson: PublishedLesson): void {
    examples?.dispose();
    content.replaceChildren();
    document.title = `${lesson.title || 'Lesson'} · Display`;
    const outcomes = renderPublishedLessonHero(content, lesson);

    examples = createTeacherClassExamples({ lessonId: lesson.lesson_id });
    const blocks = document.createElement('div');
    blocks.className = 'lesson-blocks';
    const isQuiz = lesson.pedagogical_mode === 'quiz' && !!lesson.quiz;
    for (const block of lesson.blocks) {
      if (isQuiz && block.block_type === 'quiz_question') continue;
      const row = document.createElement('div');
      row.className = 'lesson-display__block';
      row.append(
        renderBlock(block, 'teacher', {
          lessonId: lesson.lesson_id,
          pageBlocks: lesson.blocks,
          attachedOutcomes: outcomes
        })
      );
      examples.decorate(row, block);
      blocks.append(row);
    }
    content.append(blocks);
    if (isQuiz) content.append(mountStudentQuiz(lesson));
  }

  function load(): void {
    renderStudentStatus(content, 'Loading lesson…');
    void apiGet<PublishedLesson>(`/api/published/lessons/${encodeURIComponent(lessonId)}`)
      .then((lesson) => {
        if (disposed || isStale()) return;
        render(lesson);
      })
      .catch((error: unknown) => {
        if (disposed || isStale()) return;
        const notFound = error instanceof ApiClientError && error.code === 'not_found';
        renderStudentStatus(
          content,
          notFound ? 'Publish this lesson to put it on the display.' : FAILURE.network
        );
      });
  }

  load();

  return {
    dispose() {
      disposed = true;
      document.removeEventListener('fullscreenchange', syncFullScreen);
      examples?.dispose();
      examples = null;
    }
  };
}

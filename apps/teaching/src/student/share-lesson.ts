import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import { studentUnitAnthology } from '@/blocks/anthology-load';
import { isSidePath } from '@/lecture/scenes';
import { el } from '@/quiz/dom';
import type { Block } from '@/schemas/block';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor } from '@/student/shell';
import { renderPublishedLessonHero } from '@/student/lesson-view';
import { isSignInNeeded, sharePage } from '@/student/share-api';
import './share-view.css';

/**
 * A lesson as the student sees it, locked, for a Progress share viewer. No class id goes to the
 * blocks, so nothing saves or claims; `inert` stops every click, keypress and focus inside.
 * Collapsed parts and every tab open, because the viewer can't press the controls that would.
 */
export function renderLockedLesson(lesson: PublishedLesson, options: { backHref: string }): HTMLElement {
  const root = el('div', 'share-locked');
  const banner = el('div', 'share-locked__banner');
  banner.setAttribute('role', 'note');
  banner.append(el('span', '', 'Viewing only. Nothing here can be changed.'));
  banner.append(studentAnchor(options.backHref, 'share-locked__back', 'Back to progress'));
  root.append(banner);
  renderPublishedLessonHero(root, lesson);
  const blocks = el('div', 'lesson-blocks');
  const list = (lesson.blocks ?? []).filter((b) => !isSidePath(b as Block));
  for (const block of list) {
    blocks.append(renderBlock(block as Block, 'student', { lessonId: lesson.lesson_id, pageBlocks: lesson.blocks, loadAnthology: () => studentUnitAnthology(lesson.unit_id) }));
  }
  if (!list.length) blocks.append(el('p', 'share-empty', 'This lesson runs as an activity in class, so there’s nothing to read here.'));
  for (const d of blocks.querySelectorAll('details')) d.open = true;
  for (const panel of blocks.querySelectorAll<HTMLElement>('[role="tabpanel"][hidden]')) panel.hidden = false;
  blocks.setAttribute('inert', '');
  blocks.setAttribute('aria-readonly', 'true');
  root.append(blocks);
  return root;
}

export type MountShareLessonOptions = { root: HTMLElement; token: string; lessonId: string; isStale?: () => boolean };

export function mountShareLesson(options: MountShareLessonOptions): { dispose(): void } {
  const { root, token, lessonId, isStale = () => false } = options;
  let disposed = false;
  const live = () => !disposed && !isStale();
  const backHref = `/s/share/${token}`;
  root.replaceChildren();
  const { surface, header, content } = createStudentShell('share-shell');
  root.append(surface);
  renderStudentChrome(header, { brand: 'Progress share' });
  renderStudentStatus(content, 'Loading lesson…');
  const back = (text: string) => {
    const box = el('div', 'share-gone');
    box.append(el('p', '', text), studentAnchor(backHref, 'share-locked__back', 'Back to progress'));
    content.replaceChildren(box);
  };
  // This browser must be in for the share, and the lesson must be on the student's list.
  void sharePage(token)
    .then(async (reply) => {
      if (!live()) return;
      if (isSignInNeeded(reply)) return back('Sign in on the progress page first.');
      if (!reply.lesson_ids.includes(lessonId)) return back('That lesson isn’t on this student’s list.');
      const lesson = await apiGet<PublishedLesson>(`/api/published/lessons/${encodeURIComponent(lessonId)}`);
      if (!live()) return;
      document.title = lesson.title;
      content.replaceChildren(renderLockedLesson(lesson, { backHref }));
    })
    .catch((e: unknown) => {
      if (!live()) return;
      back(e instanceof ApiClientError && e.code === 'not_found' ? 'This link doesn’t work any more.' : 'The lesson didn’t load. Check your connection and try again.');
    });
  return {
    dispose() {
      disposed = true;
    }
  };
}

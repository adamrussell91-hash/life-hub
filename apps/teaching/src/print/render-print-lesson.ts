import { renderBlock } from '@/blocks/render';
import { filterBlocksForStudent } from '@/blocks/visibility';
import type { Lesson } from '@/schemas/lesson';

export function renderPrintLesson(lesson: Lesson): HTMLElement {
  const root = document.createElement('article');
  root.className = 'print-document';
  root.dataset.orientation = 'portrait';

  const title = document.createElement('h1');
  title.className = 'print-document__title';
  title.textContent = lesson.title.trim() || 'Untitled lesson';
  root.append(title);

  const body = document.createElement('div');
  body.className = 'print-document__body';

  const studentBlocks = filterBlocksForStudent(lesson.blocks);
  for (const block of studentBlocks) {
    body.append(renderBlock(block, 'print', { lessonId: lesson.id, pageBlocks: studentBlocks }));
  }

  root.append(body);
  return root;
}

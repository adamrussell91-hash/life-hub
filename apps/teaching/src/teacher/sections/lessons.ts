import { mountCreateControl } from '@/teacher/create/control';
import type { EntityCreatedHandler } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { promptLessonFromTemplate } from '@/teacher/lessons-library/from-template';
import { renderLessonsLibrary } from '@/teacher/lessons-library/render';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { renderPageHeader } from '@/teacher/page-header';

export interface LessonsIndexOptions {
  onCreated?: EntityCreatedHandler;
  onMutated?: () => void | Promise<void>;
}

export function renderLessonsIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: LessonsIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const createHost = document.createElement('div');
  createHost.className = 'lessons-index__create create-control';
  createHost.dataset.createHost = '';

  const templateMenu = mountPageOptionsMenu(
    [
      {
        label: 'From template',
        className: 'lessons-index__from-template',
        onSelect: () => {
          void promptLessonFromTemplate(curriculum).then((created) => {
            if (created) void options.onCreated?.('lesson', created.id, created);
          });
        }
      }
    ],
    { label: 'Lesson options' }
  );
  disposers.push(templateMenu.dispose);

  renderPageHeader(canvas, {
    eyebrow: 'Workspace',
    title: 'Lessons',
    actions: [templateMenu.el, createHost]
  });

  const createControl = mountCreateControl(createHost, {
    context: 'lessons',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const listHost = document.createElement('div');
  listHost.className = 'lessons-index__list';

  canvas.append(listHost);
  const library = renderLessonsLibrary(listHost, curriculum, { onMutated: options.onMutated });
  disposers.push(library.dispose);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

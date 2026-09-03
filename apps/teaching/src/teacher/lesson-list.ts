import { navigate } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';

export interface LessonListOptions {
  heading: string | null;
  /** Called after archive/trash so the caller can reload curriculum. */
  onMutated?: () => void | Promise<void>;
}

export function renderLessonList(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: LessonListOptions
): void {
  canvas.replaceChildren();

  if (options.heading) {
    const heading = document.createElement('h1');
    heading.className = 'home-heading';
    heading.textContent = options.heading;
    canvas.append(heading);
  }

  const lessons = curriculum.lessons
    .filter((lesson) => lesson.status === 'active')
    .sort((a, b) => {
      if (a.unit_id !== b.unit_id) return a.unit_id.localeCompare(b.unit_id);
      return a.sequence - b.sequence;
    });

  if (lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No lessons yet.';
    canvas.append(empty);
    return;
  }

  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const lesson of lessons) {
    const unit = unitsById.get(lesson.unit_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = lesson.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = [unit?.title ?? lesson.unit_id, lesson.published ? 'Published' : 'Draft'].join(
      ' · '
    );

    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'list-row-actions';

    const path = `/lessons/${lesson.id}`;
    const menu = mountPageOptionsMenu(
      [
        {
          label: 'Open',
          className: 'lesson-list__open',
          href: path,
          onSelect: () => {
            navigate(path);
          }
        },
        {
          label: 'Archive',
          onSelect: () => {
            confirmAndArchive('lesson', lesson.id, lesson.title, () => {
              void options.onMutated?.();
            });
          }
        },
        {
          label: 'Move to trash',
          danger: true,
          onSelect: () => {
            confirmAndTrash('lesson', lesson.id, lesson.title, () => {
              void options.onMutated?.();
            });
          }
        }
      ],
      { label: `Options for ${lesson.title}` }
    );

    actions.append(menu.el);
    item.append(info, actions);
    list.append(item);
  }

  canvas.append(list);
}

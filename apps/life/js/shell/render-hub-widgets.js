import { formatDueBadge, topOpenTasks } from './task-glance.js';

export function renderTeachingAgenda(root, lessons) {
  const list = root.querySelector?.('[data-teaching-agenda]');
  if (!list) return;
  list.replaceChildren();
  const rows = Array.isArray(lessons) ? lessons : [];
  if (!rows.length) {
    const empty = root.createElement('p');
    empty.className = 'hub-agenda__empty';
    empty.textContent = 'No lessons today.';
    list.append(empty);
    return;
  }
  for (const lesson of rows) {
    const row = root.createElement('div');
    row.className = 'hub-agenda__row';
    if (lesson.isPast) row.classList.add('is-past');
    if (lesson.isNext) row.classList.add('is-next');

    const marker = root.createElement('span');
    marker.className = 'hub-agenda__marker';
    row.append(marker);

    const body = root.createElement('div');
    body.className = 'hub-agenda__body';

    if (lesson.startTime) {
      const meta = root.createElement('p');
      meta.className = 'hub-agenda__meta';
      meta.textContent = lesson.isNext ? `${lesson.startTime} · next` : lesson.startTime;
      body.append(meta);
    }

    const title = root.createElement('p');
    title.className = 'hub-agenda__title';
    title.textContent = lesson.classTitle;
    body.append(title);

    if (lesson.lessonTitle) {
      const subtitle = root.createElement('p');
      subtitle.className = 'hub-agenda__subtitle';
      subtitle.textContent = lesson.lessonTitle;
      body.append(subtitle);
    }

    row.append(body);
    list.append(row);
  }
}

export function renderTaskChecklist(root, tasks, { today } = {}) {
  const list = root.querySelector?.('[data-task-checklist]');
  if (!list) return;
  list.replaceChildren();
  const rows = topOpenTasks(tasks, 3);
  if (!rows.length) {
    const empty = root.createElement('p');
    empty.className = 'hub-checklist__empty';
    empty.textContent = 'Nothing open.';
    list.append(empty);
    return;
  }
  for (const task of rows) {
    const row = root.createElement('label');
    row.className = 'hub-checklist__row';
    row.dataset.taskId = task.id;

    const checkbox = root.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'hub-checklist__box';
    checkbox.dataset.taskCheckbox = 'true';
    row.append(checkbox);

    const title = root.createElement('span');
    title.className = 'hub-checklist__title';
    title.textContent = task.title ?? '';
    row.append(title);

    const badge = formatDueBadge(task.due_date, { today });
    if (badge) {
      const due = root.createElement('span');
      due.className = 'hub-checklist__due';
      due.textContent = badge;
      row.append(due);
    }

    list.append(row);
  }
}

import { formatExerciseSetCount, formatExerciseSets, formatExerciseTitle } from './format-exercise.js';
import { muscleAssetPath, resolveExerciseThumbKey } from './muscle-maps.js';
import { formatWeekday } from '../core/time.js';

function create(root, name) {
  if (typeof root.createElement === 'function') return root.createElement(name);
  return globalThis.document.createElement(name);
}

function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function renderExercisePlanRow(root, exercise, libraryByName, {
  tag = 'li',
  detail = 'count',
  extraClass = ''
} = {}) {
  const row = create(root, tag);
  row.className = classNames('workout-plan-card__row', extraClass);

  const thumb = create(root, 'img');
  thumb.className = 'workout-plan-card__thumb';
  thumb.src = muscleAssetPath(resolveExerciseThumbKey(exercise, libraryByName));
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.decoding = 'async';
  thumb.addEventListener?.('error', () => {
    const fallback = create(root, 'span');
    fallback.className = 'workout-plan-card__thumb workout-plan-card__thumb--empty';
    thumb.replaceWith?.(fallback);
  });

  const copy = create(root, 'div');
  copy.className = 'workout-plan-card__copy';
  const title = create(root, 'strong');
  title.textContent = formatExerciseTitle(exercise);
  copy.append(title);
  if (detail === 'sets') {
    const setsDetail = formatExerciseSets(exercise);
    if (setsDetail) {
      const line = create(root, 'p');
      line.className = 'workout-plan-card__detail record-proposal__sets';
      line.textContent = setsDetail;
      copy.append(line);
    }
  }

  const sets = create(root, 'span');
  sets.className = 'workout-plan-card__sets';
  sets.textContent = formatExerciseSetCount(exercise);

  const chevron = create(root, 'span');
  chevron.className = 'workout-plan-card__chevron';
  chevron.setAttribute?.('aria-hidden', 'true');
  chevron.textContent = '›';

  row.append(thumb, copy, sets, chevron);
  return row;
}

export function appendWorkoutPlanCard(root, host, {
  record,
  libraryByName,
  includeHeader = true,
  detail
} = {}) {
  if (!host || !record) return null;
  const card = create(root, 'div');
  card.className = 'workout-plan-card';

  const resolvedDetail = detail ?? (record.status === 'planned' ? 'count' : 'sets');

  if (includeHeader) {
    const day = create(root, 'p');
    day.className = 'workout-plan-card__day';
    day.textContent = formatWeekday(record.date) || 'Session';

    const title = create(root, 'h3');
    title.className = 'workout-plan-card__title';
    title.textContent = record.title || 'Workout';

    const meta = create(root, 'p');
    meta.className = 'workout-plan-card__meta';
    meta.textContent = record.duration_min != null
      ? `${record.duration_min} min`
      : (record.status === 'planned' ? 'Planned' : '');

    card.append(day, title, meta);
  }

  const list = create(root, 'ul');
  list.className = 'workout-plan-card__exercises record-proposal__exercises';
  for (const exercise of record.exercises ?? []) {
    list.append(renderExercisePlanRow(root, exercise, libraryByName, { detail: resolvedDetail }));
  }
  card.append(list);
  host.append(card);
  return card;
}

export function fillExercisePlanList(root, host, {
  exercises = [],
  libraryByName,
  detail = 'count',
  extraClass = 'fitness-exercise'
} = {}) {
  if (!host) return;
  host.replaceChildren();
  const tag = /^(ul|ol)$/i.test(host.tagName ?? '') ? 'li' : 'div';
  for (const exercise of exercises) {
    host.append(renderExercisePlanRow(root, exercise, libraryByName, { tag, detail, extraClass }));
  }
}

export { formatExerciseSets };

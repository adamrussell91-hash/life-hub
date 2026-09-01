import { formatExerciseSetCount, formatExerciseSets, formatExerciseTitle } from './format-exercise.js';
import { muscleAssetPath, resolveExerciseThumbKey } from './muscle-maps.js';
import { formatWeekday } from '../core/time.js';
import {
  formatSupersetBlockLabel,
  groupWorkoutPlanExercises
} from '../core/workout-plan-groups.js';

function create(root, name) {
  if (typeof root.createElement === 'function') return root.createElement(name);
  return globalThis.document.createElement(name);
}

function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

function formatBetweenSetsLine(betweenSets) {
  if (!betweenSets?.name) return '';
  const sets = Array.isArray(betweenSets.sets) ? betweenSets.sets : [];
  if (!sets.length) return betweenSets.name;
  const first = sets[0];
  const count = sets.length;
  const reps = first.reps != null ? first.reps : '—';
  const weight = first.weight_kg != null ? `${first.weight_kg} kg` : 'bodyweight';
  const prefix = count > 1 ? `${count} × ` : '';
  return `${betweenSets.name} · ${prefix}${weight} × ${reps} reps`;
}

export function renderExercisePlanRow(root, exercise, libraryByName, {
  tag = 'li',
  detail = 'count',
  extraClass = '',
  showBetweenSets = true
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
  if (showBetweenSets && exercise?.between_sets?.name) {
    const between = create(root, 'p');
    between.className = 'workout-plan-card__between';
    between.textContent = `Between sets: ${formatBetweenSetsLine(exercise.between_sets)}`;
    copy.append(between);
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

function renderSupersetConnector(root) {
  const connector = create(root, 'li');
  connector.className = 'workout-plan-card__connector';
  connector.setAttribute?.('aria-hidden', 'true');
  connector.textContent = '↔';
  return connector;
}

function appendPlanBlock(root, list, block, libraryByName, detail, blockIndex) {
  if (block.kind === 'single' && !block.exercises[0]?.superset_group) {
    list.append(renderExercisePlanRow(root, block.exercises[0], libraryByName, { detail }));
    return;
  }

  const group = create(root, 'li');
  group.className = classNames(
    'workout-plan-card__group',
    block.kind === 'between' ? 'workout-plan-card__group--between' : 'workout-plan-card__group--superset'
  );

  const label = create(root, 'p');
  label.className = 'workout-plan-card__group-label';
  label.textContent = formatSupersetBlockLabel(block, blockIndex);
  group.append(label);

  const inner = create(root, 'ul');
  inner.className = 'workout-plan-card__group-exercises';
  block.exercises.forEach((exercise, index) => {
    if (index > 0) inner.append(renderSupersetConnector(root));
    inner.append(renderExercisePlanRow(root, exercise, libraryByName, {
      tag: 'li',
      detail,
      extraClass: 'workout-plan-card__row--paired',
      showBetweenSets: block.kind === 'between'
    }));
  });
  group.append(inner);
  list.append(group);
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
  const blocks = groupWorkoutPlanExercises(record.exercises ?? []);
  blocks.forEach((block, index) => {
    appendPlanBlock(root, list, block, libraryByName, resolvedDetail, index);
  });
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
  const blocks = groupWorkoutPlanExercises(exercises);
  for (const [index, block] of blocks.entries()) {
    if (block.kind === 'single' && !block.exercises[0]?.superset_group) {
      host.append(renderExercisePlanRow(root, block.exercises[0], libraryByName, {
        tag,
        detail,
        extraClass
      }));
      continue;
    }
    const wrap = create(root, tag === 'li' ? 'li' : 'div');
    wrap.className = classNames(
      'workout-plan-card__group',
      block.kind === 'between' ? 'workout-plan-card__group--between' : 'workout-plan-card__group--superset',
      extraClass
    );
    const label = create(root, 'p');
    label.className = 'workout-plan-card__group-label';
    label.textContent = formatSupersetBlockLabel(block, index);
    wrap.append(label);
    const inner = create(root, tag === 'li' ? 'ul' : 'div');
    inner.className = 'workout-plan-card__group-exercises';
    block.exercises.forEach((exercise, exerciseIndex) => {
      if (exerciseIndex > 0) inner.append(renderSupersetConnector(root));
      inner.append(renderExercisePlanRow(root, exercise, libraryByName, {
        tag: tag === 'li' ? 'li' : 'div',
        detail,
        extraClass: 'workout-plan-card__row--paired',
        showBetweenSets: block.kind === 'between'
      }));
    });
    wrap.append(inner);
    host.append(wrap);
  }
}

export { formatExerciseSets };

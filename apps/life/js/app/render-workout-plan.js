import { formatExerciseSetCount, formatExerciseSets, formatExerciseTitle } from './format-exercise.js';
import { exercisePoseImagePath, resolveExerciseThumbSrc } from './muscle-maps.js';
import { formatWeekday } from '../core/time.js';
import { describeSet, resolveTrackingType } from '../core/exercise-tracking.js';
import {
  blockMemberCode,
  formatBlockResult,
  formatBlockScheme,
  formatSupersetBlockLabel,
  groupWorkoutPlanExercises,
  isGroupedBlock
} from '../core/workout-plan-groups.js';

function create(root, name) {
  if (typeof root.createElement === 'function') return root.createElement(name);
  return globalThis.document.createElement(name);
}

function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

function assignedSrc(img) {
  return img?.getAttribute?.('src') ?? img?.src ?? '';
}

function collectThumbs(node, into = []) {
  if (!node) return into;
  const cls = String(node.className ?? '');
  if (cls.includes('workout-plan-card__thumb') && !cls.includes('--empty')) into.push(node);
  for (const child of node.children ?? []) collectThumbs(child, into);
  return into;
}

function takeThumb(pool, src) {
  const index = pool.findIndex(img => assignedSrc(img) === src);
  if (index < 0) return null;
  return pool.splice(index, 1)[0];
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
  showBetweenSets = true,
  reuseThumb = null,
  code = ''
} = {}) {
  const row = create(root, tag);
  row.className = classNames('workout-plan-card__row', extraClass);

  const src = resolveExerciseThumbSrc(exercise, libraryByName);
  const thumb = reuseThumb ?? create(root, 'img');
  thumb.className = classNames(
    'workout-plan-card__thumb',
    exercisePoseImagePath(exercise?.name) && 'workout-plan-card__thumb--pose'
  );
  if (assignedSrc(thumb) !== src) thumb.src = src;
  thumb.alt = '';
  if (!reuseThumb) {
    thumb.decoding = 'async';
    thumb.addEventListener?.('error', () => {
      const fallback = create(root, 'span');
      fallback.className = 'workout-plan-card__thumb workout-plan-card__thumb--empty';
      thumb.replaceWith?.(fallback);
    });
  }

  const copy = create(root, 'div');
  copy.className = 'workout-plan-card__copy';
  const title = create(root, 'strong');
  if (code) {
    const badge = create(root, 'span');
    badge.className = 'workout-plan-card__code';
    badge.textContent = code;
    const name = create(root, 'span');
    name.textContent = formatExerciseTitle(exercise);
    title.append(badge, name);
  } else {
    title.textContent = formatExerciseTitle(exercise);
  }
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

function formatRoundSet(exercise, set) {
  const tracking = resolveTrackingType(exercise);
  if (tracking === 'bodyweight_reps' && !(Number(set?.weight_kg) > 0) && set?.reps != null) {
    return `${set.reps} reps`;
  }
  const described = describeSet(set, tracking);
  if (described) return described;
  const weight = set?.weight_kg != null ? `${set.weight_kg} kg` : 'bodyweight';
  return `${weight} × ${set?.reps ?? '—'}`;
}

/**
 * Round-by-round order for a superset / circuit: "Round 1 · B1 30 kg × 10 → B2 7 kg × 8".
 * This is the AB, AB, AB the session is actually performed in.
 */
function renderRoundsList(root, block) {
  const list = create(root, 'ol');
  list.className = 'workout-plan-card__rounds';
  const rows = [];
  for (let round = 0; round < block.rounds; round += 1) {
    const text = block.exercises
      .map((exercise, memberIndex) => {
        const set = exercise?.sets?.[round];
        if (!set) return null;
        return `${blockMemberCode(block, memberIndex)} ${formatRoundSet(exercise, set)}${set.failed ? ' (failure)' : ''}`;
      })
      .filter(Boolean)
      .join(' → ');
    const previous = rows.at(-1);
    if (previous && previous.text === text) previous.last = round + 1;
    else rows.push({ first: round + 1, last: round + 1, text });
  }
  for (const row of rows) {
    const item = create(root, 'li');
    item.className = 'workout-plan-card__round';
    const label = create(root, 'span');
    label.className = 'workout-plan-card__round-label';
    label.textContent = row.first === row.last ? `Round ${row.first}` : `Rounds ${row.first}–${row.last}`;
    const steps = create(root, 'span');
    steps.className = 'workout-plan-card__round-steps';
    steps.textContent = row.text;
    item.append(label, steps);
    list.append(item);
  }
  return list;
}

function renderGroupedBlock(root, block, libraryByName, {
  tag = 'li',
  detail = 'count',
  extraClass = '',
  thumbPool = null
} = {}) {
  const grouped = isGroupedBlock(block);
  const wrap = create(root, tag);
  wrap.className = classNames(
    'workout-plan-card__group',
    grouped ? `workout-plan-card__group--${block.kind}` : 'workout-plan-card__group--between',
    grouped && block.kind === 'circuit' ? 'workout-plan-card__group--superset' : '',
    extraClass
  );
  if (grouped && wrap.dataset) wrap.dataset.blockKind = block.kind;

  const head = create(root, 'div');
  head.className = 'workout-plan-card__group-head';
  if (grouped) {
    const letter = create(root, 'span');
    letter.className = 'workout-plan-card__letter';
    letter.textContent = block.letter;
    head.append(letter);
  }
  const label = create(root, 'p');
  label.className = 'workout-plan-card__group-label';
  label.textContent = formatSupersetBlockLabel(block);
  head.append(label);
  wrap.append(head);

  const scheme = formatBlockScheme(block);
  if (scheme) {
    const line = create(root, 'p');
    line.className = 'workout-plan-card__scheme';
    line.textContent = scheme;
    wrap.append(line);
  }

  const innerTag = tag === 'li' ? 'ul' : 'div';
  const inner = create(root, innerTag);
  inner.className = 'workout-plan-card__group-exercises';
  block.exercises.forEach((exercise, memberIndex) => {
    inner.append(renderExercisePlanRow(root, exercise, libraryByName, {
      tag: innerTag === 'ul' ? 'li' : 'div',
      detail: grouped ? 'count' : detail,
      extraClass: 'workout-plan-card__row--paired',
      showBetweenSets: !grouped,
      code: grouped ? blockMemberCode(block, memberIndex) : '',
      reuseThumb: thumbPool ? takeThumb(thumbPool, resolveExerciseThumbSrc(exercise, libraryByName)) : null
    }));
  });
  wrap.append(inner);

  if (grouped && detail === 'sets' && block.rounds > 0) wrap.append(renderRoundsList(root, block));
  const result = formatBlockResult(block);
  if (result) {
    const score = create(root, 'p');
    score.className = 'workout-plan-card__scheme workout-plan-card__score';
    score.textContent = `Score: ${result}`;
    wrap.append(score);
  }
  return wrap;
}

function appendPlanBlock(root, list, block, libraryByName, detail) {
  if (block.kind === 'single') {
    list.append(renderExercisePlanRow(root, block.exercises[0], libraryByName, { detail }));
    return;
  }
  list.append(renderGroupedBlock(root, block, libraryByName, { tag: 'li', detail }));
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
  blocks.forEach(block => {
    appendPlanBlock(root, list, block, libraryByName, resolvedDetail);
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
  const thumbPool = collectThumbs(host);
  host.replaceChildren();
  const tag = /^(ul|ol)$/i.test(host.tagName ?? '') ? 'li' : 'div';
  const blocks = groupWorkoutPlanExercises(exercises);
  for (const block of blocks) {
    if (block.kind === 'single') {
      const exercise = block.exercises[0];
      host.append(renderExercisePlanRow(root, exercise, libraryByName, {
        tag,
        detail,
        extraClass,
        reuseThumb: takeThumb(thumbPool, resolveExerciseThumbSrc(exercise, libraryByName))
      }));
      continue;
    }
    host.append(renderGroupedBlock(root, block, libraryByName, {
      tag: tag === 'li' ? 'li' : 'div',
      detail,
      extraClass,
      thumbPool
    }));
  }
}

export { formatExerciseSets };

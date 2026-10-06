/**
 * Gym mode — the in-session logger.
 *
 * Full screen on every device (a fixed layer on <body>, so a transformed hub
 * card can't trap it). One set at a time in the order Adam actually performs
 * them: straight sets AAA, supersets B1 B2 · B1 B2, circuits one tap per round.
 * Big steppers for kg / reps, a thumb-reach dock (‹ Done ›), rest timer after
 * the right moments, per-set "hit failure" + notes, and a Plan sheet for
 * jumping, reordering and session details. Minimise drops back to a compact
 * bar on the Fitness card.
 */
import {
  createMorphingNotePopover,
  createMorphingValuesPopover
} from '../../../../packages/design-kit/js/morphing-popover.js';
import { describeSet, resolveTrackingType } from '../core/exercise-tracking.js';
import { TWINGE_SITES, compareToGhost, focusCue, ghostForSet, readinessAdvice } from './fitness-progression.js';
import { resolveExerciseThumbSrc } from './muscle-maps.js';
import { REGION_LABELS, resolveExerciseRegion } from './fitness-model.js';
import {
  blockMemberCode,
  formatBlockResult,
  formatBlockScheme,
  formatSupersetBlockLabel,
  isGroupedBlock
} from '../core/workout-plan-groups.js';
import {
  CABLE_TYPES,
  INTENSIFICATIONS,
  appendSet,
  finishLabel,
  formatElapsed,
  normalizeLoggerCableType
} from './fitness-logger-draft.js';

export const SET_NOTE_CHIPS = ['Form broke', 'Too light — go up', 'Too heavy', 'Twinge', 'AEKE cut the load', 'Swapped move'];

const cableLabel = value => String(normalizeLoggerCableType(value)).replaceAll('_', ' ');
const intensificationLabel = value => String(value ?? '').replaceAll('_', ' ');

function ownerDoc(root) {
  return root?.ownerDocument ?? root?.defaultView?.document ?? (root?.body ? root : null) ?? globalThis.document;
}

function el(root, tag, { className = '', text = null, data = null, attrs = null } = {}) {
  const node = root.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (data) {
    for (const [key, value] of Object.entries(data)) node.dataset[key] = value;
  }
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute?.(key, value);
  }
  return node;
}

function button(root, { className = '', text, marker, label = null, onClick, pressed = null, disabled = false }) {
  const node = el(root, 'button', {
    className,
    text,
    data: marker ? { fitnessLogger: marker } : null
  });
  node.type = 'button';
  if (label) node.setAttribute?.('aria-label', label);
  if (pressed != null) node.setAttribute?.('aria-pressed', pressed ? 'true' : 'false');
  node.disabled = Boolean(disabled);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// ── Anatomy art ────────────────────────────────────────────────────────────
// The muscle drawings are black-on-white. In gym mode they are inverted and
// screen-blended (CSS) so the figure glows out of the dark and the worked
// muscle lights up — the same pictures as the plan cards, made to motivate.

let anatomyLibrary = null;

function anatomyImage(root, src, className) {
  if (!src) return null;
  const img = root.createElement('img');
  img.className = className;
  img.alt = '';
  img.decoding = 'async';
  img.src = src;
  img.addEventListener?.('error', () => img.remove?.());
  return img;
}

/** The arm drawings are a wide forearm crop — in a tall tile the flexing arm reads far better. */
const WIDE_ART = /\/muscles\/arm-(?:bicep|forearm)\.png$/;

function exerciseArt(exercise) {
  if (!exercise) return null;
  const src = resolveExerciseThumbSrc(exercise, anatomyLibrary);
  return WIDE_ART.test(src) ? 'assets/fitness/regions/arms.png' : src;
}

function exerciseRegion(exercise, draft) {
  return exercise ? resolveExerciseRegion(exercise, draft?.focus, anatomyLibrary) : null;
}

/** The flexing figure for a region — reserved for PRs and the Pump Report. */
function regionArt(region) {
  return region && REGION_LABELS[region] ? `assets/fitness/regions/${region}.png` : null;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}

function formatShortDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1].slice(2)}` : '';
}

function lastTimeFor(lastPerformance, exercise) {
  if (!lastPerformance || !exercise?.name) return null;
  const key = String(exercise.name).replace(/\s+set\s+\d+\s*$/i, '').trim().toLowerCase();
  return lastPerformance[key] ?? null;
}

function describeLastTime(previous, exercise) {
  if (!previous?.sets?.length) return '';
  const tracking = resolveTrackingType(exercise);
  const sets = previous.sets
    .map(set => describeSet(set, tracking) || `${formatNumber(set.weight_kg)} kg × ${set.reps ?? '—'}`)
    .map((text, index) => (previous.sets[index]?.failed ? `${text} (failure)` : text));
  const date = formatShortDate(previous.date);
  return `${sets.join(' · ')}${date ? ` — ${date}` : ''}`;
}

/** Which fields a set shows, by how the move is measured. */
function setFields(exercise) {
  const tracking = resolveTrackingType(exercise);
  if (tracking === 'timed') {
    return [
      { field: 'duration_sec', label: 'secs', step: 5, inputMode: 'numeric' },
      { field: 'weight_kg', label: '+kg', step: 0.5, inputMode: 'decimal', optional: true }
    ];
  }
  if (tracking === 'reps_in_time') {
    return [
      { field: 'reps', label: 'reps', step: 1, inputMode: 'numeric' },
      { field: 'time_cap_sec', label: 'secs window', step: 5, inputMode: 'numeric' }
    ];
  }
  if (tracking === 'bodyweight_reps') {
    return [
      { field: 'reps', label: 'reps', step: 1, inputMode: 'numeric' },
      { field: 'weight_kg', label: '+kg', step: 0.5, inputMode: 'decimal', optional: true }
    ];
  }
  return [
    { field: 'weight_kg', label: 'kg', step: 0.5, inputMode: 'decimal' },
    { field: 'reps', label: 'reps', step: 1, inputMode: 'numeric' }
  ];
}

function stepper(root, { exercise, set, exerciseIndex, setIndex, spec, compact = false, actions, onCommitted = null }) {
  const wrap = el(root, 'div', {
    className: `gym-stepper${compact ? ' gym-stepper--compact' : ''}${spec.optional ? ' gym-stepper--optional' : ''}`,
    data: { field: spec.field }
  });
  const label = el(root, 'span', { className: 'gym-stepper__label', text: spec.label });
  const input = el(root, 'input', { className: 'gym-stepper__value' });
  input.type = 'number';
  input.inputMode = spec.inputMode;
  input.step = String(spec.step);
  input.min = '0';
  input.value = formatNumber(set?.[spec.field] ?? 0);
  input.dataset.fitnessLogger = `value-${spec.field}`;
  input.setAttribute?.('aria-label', `${exercise?.name ?? 'Exercise'} set ${setIndex + 1} ${spec.label}`);
  const commit = value => {
    const next = Math.max(0, Math.round(Number(value) * 100) / 100);
    actions.setField?.(exerciseIndex, setIndex, spec.field, Number.isFinite(next) ? next : 0);
    onCommitted?.();
  };
  input.addEventListener('input', () => {
    if (input.value === '') return;
    commit(input.value);
  });
  input.addEventListener('focus', () => input.select?.());
  const nudge = direction => {
    const current = Number(input.value) || 0;
    const next = Math.max(0, Math.round((current + direction * spec.step) * 100) / 100);
    input.value = formatNumber(next);
    commit(next);
  };
  const less = button(root, {
    className: 'gym-stepper__btn',
    text: '−',
    marker: `less-${spec.field}`,
    label: `Less ${spec.label}`,
    onClick: () => nudge(-1)
  });
  const more = button(root, {
    className: 'gym-stepper__btn',
    text: '+',
    marker: `more-${spec.field}`,
    label: `More ${spec.label}`,
    onClick: () => nudge(1)
  });
  const row = el(root, 'div', { className: 'gym-stepper__row' });
  row.append(less, input, more);
  wrap.append(label, row);
  return wrap;
}

function pills(root, { label, options, value, marker, onPick }) {
  const group = el(root, 'div', {
    className: 'hub-pills hub-pills--loose gym-pills',
    data: { fitnessLogger: marker },
    attrs: { role: 'group', 'aria-label': label }
  });
  for (const option of options) {
    const pill = button(root, {
      className: 'hub-pills__btn gym-pills__btn',
      text: option.label,
      pressed: option.value === value,
      onClick: () => onPick(option.value)
    });
    if (option.value === value) pill.className += ' is-active';
    group.append(pill);
  }
  return group;
}

function cueFor(exercise, setIndex) {
  const cues = exercise?.coach_cues ?? {};
  const count = exercise?.sets?.length ?? 0;
  if (setIndex === count - 1 && cues.final_set) return { kind: 'final-set', text: cues.final_set };
  if (setIndex === 0 && cues.start) return { kind: 'start', text: cues.start };
  return null;
}

function stepDone(draft, step) {
  return step.members.every(({ exerciseIndex, setIndex }) => (
    setIndex >= 0 && draft.exercises?.[exerciseIndex]?.sets?.[setIndex]?.done === true
  ));
}

function renderProgress(root, draft, { steps, stepIndex, actions }) {
  const wrap = el(root, 'div', { className: 'gym__progress', data: { fitnessLogger: 'progress' } });
  const doneCount = steps.filter(step => stepDone(draft, step)).length;
  const bar = el(root, 'div', { className: 'gym__progress-bar', attrs: { role: 'presentation' } });
  steps.forEach((step, index) => {
    const tick = el(root, 'span', { className: 'gym__progress-tick' });
    if (stepDone(draft, step)) tick.className += ' is-done';
    if (index === stepIndex) tick.className += ' is-current';
    bar.append(tick);
  });
  const text = el(root, 'p', {
    className: 'gym__progress-text',
    text: steps.length ? `${doneCount} of ${steps.length} done` : 'No sets yet'
  });
  wrap.append(bar, text);
  return wrap;
}

function renderRest(root, rest, actions) {
  const panel = el(root, 'section', {
    className: 'gym-rest',
    data: { fitnessLogger: 'rest' },
    attrs: { 'aria-live': 'polite' }
  });
  const head = el(root, 'p', { className: 'gym-rest__eyebrow', text: rest.label ?? 'Rest' });
  const clock = el(root, 'p', {
    className: 'gym-rest__clock',
    text: formatElapsed(Math.max(0, rest.remainingMs)),
    data: { fitnessLogger: 'rest-clock' }
  });
  panel.append(head, clock);
  if (rest.cue) panel.append(el(root, 'p', { className: 'gym-rest__cue fitness-logger__cue fitness-logger__cue--rest', text: rest.cue, data: { fitnessLogger: 'cue-rest' } }));
  if (rest.win) panel.append(el(root, 'p', { className: 'gym-rest__win', text: rest.win, data: { fitnessLogger: 'rest-win' } }));
  const row = el(root, 'div', { className: 'gym-rest__actions' });
  row.append(
    button(root, { className: 'gym-chip', text: '−15s', marker: 'rest-less', onClick: () => actions.adjustRest?.(-15) }),
    button(root, { className: 'gym-chip', text: '+15s', marker: 'rest-more', onClick: () => actions.adjustRest?.(15) }),
    button(root, { className: 'gym-chip gym-chip--strong', text: 'Skip rest', marker: 'rest-skip', onClick: () => actions.skipRest?.() })
  );
  panel.append(row);
  return panel;
}

function renderBlockBanner(root, draft, { block, step, circuit, actions }) {
  const banner = el(root, 'section', {
    className: `gym-block gym-block--${block.kind}`,
    data: { fitnessLogger: 'block', blockKind: block.kind }
  });
  const head = el(root, 'div', { className: 'gym-block__head' });
  head.append(el(root, 'span', { className: 'gym-block__letter', text: block.letter }));
  const copy = el(root, 'div', { className: 'gym-block__copy' });
  const kindText = block.kind === 'circuit' ? 'Circuit' : 'Superset';
  copy.append(el(root, 'strong', {
    text: block.label ? `${kindText} · ${block.label}` : kindText
  }));
  const roundText = block.format === 'amrap'
    ? `Round ${step.round}`
    : `Round ${step.round} of ${block.rounds}`;
  copy.append(el(root, 'span', { className: 'gym-block__round', text: roundText, data: { fitnessLogger: 'round' } }));
  head.append(copy);
  banner.append(head);

  const order = el(root, 'ol', {
    className: `gym-block__order${block.kind === 'superset' ? ' gym-split' : ''}`,
    data: { fitnessLogger: 'block-order' }
  });
  block.exercises.forEach((exercise, memberIndex) => {
    const item = el(root, 'li', { className: 'gym-block__member' });
    const set = exercise?.sets?.[step.setIndex];
    const current = step.members.some(member => member.exerciseIndex === block.indexes[memberIndex]);
    if (set?.done) item.className += ' is-done';
    if (current) item.className += ' is-current';
    item.append(el(root, 'span', { className: 'gym-block__code', text: blockMemberCode(block, memberIndex) }));
    if (block.kind === 'superset') {
      const art = anatomyImage(root, exerciseArt(exercise), 'gym-art gym-split__art');
      if (art) item.append(art);
      const tag = set?.done ? 'DONE' : current ? 'NOW' : 'NEXT · no rest';
      item.append(el(root, 'span', { className: `gym-split__tag${current ? ' is-now' : ''}`, text: tag }));
    }
    item.append(el(root, 'span', { className: 'gym-block__name', text: exercise?.name ?? 'Exercise' }));
    order.append(item);
  });
  banner.append(order);

  const scheme = formatBlockScheme(block);
  if (scheme) banner.append(el(root, 'p', { className: 'gym-block__scheme', text: scheme }));

  if (block.kind === 'circuit') banner.append(renderCircuitClock(root, draft, { block, circuit, actions }));
  return banner;
}

function renderCircuitClock(root, draft, { block, circuit, actions }) {
  const wrap = el(root, 'div', { className: 'gym-circuit', data: { fitnessLogger: 'circuit' } });
  const amrap = block.format === 'amrap';
  const running = Boolean(circuit?.running);
  const elapsed = circuit?.elapsedMs ?? 0;
  const capMs = (block.timeCapSec ?? 0) * 1000;
  const shown = amrap && capMs ? Math.max(0, capMs - elapsed) : elapsed;
  wrap.append(el(root, 'p', {
    className: 'gym-circuit__clock',
    text: formatElapsed(shown),
    data: { fitnessLogger: 'circuit-clock' }
  }));
  const row = el(root, 'div', { className: 'gym-circuit__actions' });
  row.append(button(root, {
    className: 'gym-chip gym-chip--strong',
    text: running ? 'Pause clock' : (elapsed > 0 ? 'Resume clock' : (amrap ? 'Start AMRAP' : 'Start clock')),
    marker: 'circuit-clock-toggle',
    onClick: () => actions.toggleCircuitClock?.(block)
  }));
  if (amrap) {
    row.append(button(root, {
      className: 'gym-chip',
      text: '+ Round',
      marker: 'circuit-add-round',
      onClick: () => actions.addRound?.(block)
    }));
  }
  wrap.append(row);
  const result = formatBlockResult(block);
  if (result) wrap.append(el(root, 'p', { className: 'gym-circuit__result', text: `Score: ${result}`, data: { fitnessLogger: 'circuit-result' } }));
  if (amrap) {
    const extra = el(root, 'label', { className: 'gym-circuit__extra' });
    extra.append(el(root, 'span', { text: 'Extra reps into the last round' }));
    const input = el(root, 'input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '0';
    input.value = formatNumber(block.result?.extra_reps ?? 0);
    input.addEventListener('input', () => actions.setCircuitResult?.(block, 'extra_reps', Number(input.value) || 0));
    extra.append(input);
    wrap.append(extra);
  }
  return wrap;
}

function renderNoteEditor(root, { title, value, placeholder, marker, chips = [], onInput }) {
  const wrap = el(root, 'div', { className: 'gym-note', data: { fitnessLogger: marker } });
  wrap.append(el(root, 'p', { className: 'gym-note__title', text: title }));
  const area = el(root, 'textarea', { className: 'gym-note__input' });
  area.rows = 2;
  area.value = value ?? '';
  area.placeholder = placeholder;
  area.setAttribute?.('aria-label', title);
  area.addEventListener('input', () => onInput(area.value));
  wrap.append(area);
  if (chips.length) {
    const row = el(root, 'div', { className: 'gym-note__chips' });
    for (const chip of chips) {
      row.append(button(root, {
        className: 'gym-chip',
        text: chip,
        onClick: () => {
          const current = area.value.trim();
          area.value = current ? `${current}; ${chip}` : chip;
          onInput(area.value);
        }
      }));
    }
    wrap.append(row);
  }
  return wrap;
}

function renderSetFlags(root, { exercise, set, exerciseIndex, setIndex, noteOpen, actions }) {
  const wrap = el(root, 'div', { className: 'gym-flags' });
  const row = el(root, 'div', { className: 'gym-flags__row' });
  row.append(
    button(root, {
      className: `gym-chip gym-chip--failure${set?.failed ? ' is-active' : ''}`,
      text: set?.failed ? 'Hit failure ✓' : 'Hit failure',
      marker: 'toggle-failure',
      pressed: Boolean(set?.failed),
      onClick: () => actions.toggleFailure?.(exerciseIndex, setIndex)
    }),
    button(root, {
      className: `gym-chip${noteOpen === 'set' ? ' is-active' : ''}${set?.note ? ' has-value' : ''}`,
      text: set?.note ? 'Set note ✎' : 'Set note',
      marker: 'open-set-note',
      pressed: noteOpen === 'set',
      onClick: () => actions.toggleNote?.('set')
    }),
    button(root, {
      className: `gym-chip${noteOpen === 'exercise' ? ' is-active' : ''}${exercise?.notes ? ' has-value' : ''}`,
      text: exercise?.notes ? 'Exercise note ✎' : 'Exercise note',
      marker: 'open-exercise-note',
      pressed: noteOpen === 'exercise',
      onClick: () => actions.toggleNote?.('exercise')
    }),
    button(root, {
      className: `gym-chip gym-chip--twinge${noteOpen === 'twinge' ? ' is-active' : ''}`,
      text: 'Twinge',
      marker: 'open-twinge',
      pressed: noteOpen === 'twinge',
      onClick: () => actions.toggleNote?.('twinge')
    })
  );
  wrap.append(row);
  if (noteOpen === 'twinge') {
    const picker = el(root, 'div', { className: 'gym-twinge', data: { fitnessLogger: 'twinge-picker' } });
    picker.append(el(root, 'p', { className: 'gym-note__title', text: 'Where? It goes to Sara as a pain flag.' }));
    const sites = el(root, 'div', { className: 'gym-note__chips' });
    for (const site of TWINGE_SITES) {
      sites.append(button(root, {
        className: 'gym-chip',
        text: site,
        onClick: () => actions.twinge?.(exerciseIndex, setIndex, site)
      }));
    }
    picker.append(sites);
    wrap.append(picker);
  }
  if (set?.failed) {
    wrap.append(el(root, 'p', {
      className: 'gym-flags__hint',
      text: `Log the reps you completed — this marks rep ${(Number(set.reps) || 0) + 1} as where it failed.`
    }));
  }
  if (noteOpen === 'set') {
    wrap.append(renderNoteEditor(root, {
      title: `Note · set ${setIndex + 1}`,
      value: set?.note ?? '',
      placeholder: 'e.g. failure on rep 7, grip slipped',
      marker: 'set-note',
      chips: SET_NOTE_CHIPS,
      onInput: value => actions.setNote?.(exerciseIndex, setIndex, value)
    }));
  } else if (noteOpen === 'exercise') {
    wrap.append(renderNoteEditor(root, {
      title: `Note · ${exercise?.name ?? 'exercise'}`,
      value: exercise?.notes ?? '',
      placeholder: 'How this move felt today, setup, swaps',
      marker: 'exercise-note',
      onInput: value => actions.setExerciseNote?.(exerciseIndex, value)
    }));
  }
  return wrap;
}

function renderSetDots(root, draft, { exerciseIndex, setIndex, actions }) {
  const exercise = draft.exercises?.[exerciseIndex];
  const row = el(root, 'div', { className: 'gym-sets', attrs: { role: 'group', 'aria-label': 'Sets' } });
  (exercise?.sets ?? []).forEach((set, index) => {
    const dot = button(root, {
      className: `gym-sets__dot${set?.done ? ' is-done' : ''}${index === setIndex ? ' is-current' : ''}${set?.failed ? ' is-failed' : ''}`,
      text: String(index + 1),
      label: `Set ${index + 1}${set?.done ? ', done' : ''}`,
      onClick: () => actions.jumpToSet?.(exerciseIndex, index)
    });
    row.append(dot);
  });
  row.append(button(root, {
    className: 'gym-sets__dot gym-sets__dot--add',
    text: '+',
    marker: 'add-set',
    label: `Add a set to ${exercise?.name ?? 'exercise'}`,
    onClick: () => actions.addSet?.(exerciseIndex)
  }));
  return row;
}

function describeGhostSet(ghost, exercise) {
  const tracking = resolveTrackingType(exercise);
  const text = describeSet(ghost, tracking) || `${formatNumber(ghost.weight_kg)} kg × ${ghost.reps ?? '—'}`;
  return ghost.failed ? `${text} (failure)` : text;
}

function verdictText(result) {
  if (!result) return '';
  if (result.verdict === 'beat') return `Beating it: ${result.label}`;
  if (result.verdict === 'matched') return 'Level with it — one more rep beats it';
  return `Behind it: ${result.label}`;
}

/** Ghost mode: the same set from last time, with a live verdict as you adjust. */
function renderGhost(root, { exercise, set, setIndex, previous }) {
  const ghost = ghostForSet(previous, setIndex);
  if (!ghost) return null;
  const tracking = resolveTrackingType(exercise);
  const wrap = el(root, 'div', { className: 'gym-ghost', data: { fitnessLogger: 'ghost' } });
  const date = formatShortDate(previous.date);
  wrap.append(el(root, 'p', {
    className: 'gym-ghost__line',
    text: `Ghost · set ${setIndex + 1} last time${date ? ` (${date})` : ''}: ${describeGhostSet(ghost, exercise)}`
  }));
  const verdict = el(root, 'p', { className: 'gym-ghost__verdict', data: { fitnessLogger: 'ghost-verdict' } });
  const update = () => {
    const result = compareToGhost(set, ghost, tracking);
    verdict.textContent = verdictText(result);
    verdict.dataset.verdict = result?.verdict ?? '';
    wrap.dataset.verdict = result?.verdict ?? '';
  };
  update();
  wrap.append(verdict);
  return { node: wrap, update };
}

function renderTarget(root, { exercise, set, exerciseIndex, setIndex, target, actions }) {
  if (!target || set?.done) return null;
  const tracking = resolveTrackingType(exercise);
  const weighted = tracking === 'weighted';
  const label = weighted ? `${formatNumber(target.weight_kg)} kg × ${target.reps}` : `${target.reps} reps`;
  const wrap = el(root, 'div', { className: `gym-target gym-target--${target.action}`, data: { fitnessLogger: 'target' } });
  const copy = el(root, 'div', { className: 'gym-target__copy' });
  copy.append(
    el(root, 'strong', { text: `Target ${label}` }),
    el(root, 'span', { text: target.reason })
  );
  wrap.append(copy);
  const already = (weighted ? Number(set?.weight_kg) === target.weight_kg : true) && Number(set?.reps) === target.reps;
  if (!already) {
    wrap.append(button(root, {
      className: 'gym-chip gym-chip--strong',
      text: 'Use',
      marker: 'use-target',
      label: `Use target ${label}`,
      onClick: () => actions.applyTarget?.(exerciseIndex, setIndex)
    }));
  }
  return wrap;
}

function renderTwingeOffer(root, { exercise, exerciseIndex, site, actions }) {
  const box = el(root, 'div', { className: 'gym-twinge-offer', data: { fitnessLogger: 'twinge-offer' } });
  box.append(el(root, 'p', {
    text: `${site} flagged for Sara on ${exercise?.name ?? 'this move'}. Lighten the rest of it, or carry on if it settled?`
  }));
  const row = el(root, 'div', { className: 'gym-flags__row' });
  row.append(
    button(root, { className: 'gym-chip gym-chip--strong', text: 'Lighten remaining −20%', marker: 'twinge-lighten', onClick: () => actions.lightenRemaining?.(exerciseIndex) }),
    button(root, { className: 'gym-chip', text: 'It settled — carry on', marker: 'twinge-dismiss', onClick: () => actions.dismissTwinge?.() })
  );
  box.append(row);
  return box;
}

function renderSetCard(root, draft, { step, block, lastPerformance, noteOpen, targetFor, twingeOffer, boardRows, actions }) {
  const { exerciseIndex, setIndex } = step.members[0];
  const exercise = draft.exercises?.[exerciseIndex];
  const set = exercise?.sets?.[setIndex];
  const card = el(root, 'article', { className: 'gym-card', data: { fitnessLogger: 'set-card' } });
  const memberIndex = Math.max(0, block?.indexes?.indexOf(exerciseIndex) ?? 0);
  // Supersets already show both muscles side by side in the banner.
  const art = block?.kind === 'superset' ? null : exerciseArt(exercise);
  const head = el(root, 'header', { className: art ? 'gym-card__head gym-hero' : 'gym-card__head' });
  if (art) {
    card.className += ' gym-card--hero';
    head.dataset.fitnessLogger = 'hero';
    const image = anatomyImage(root, art, 'gym-art gym-hero__art');
    if (image) head.append(image);
    head.append(el(root, 'span', { className: 'gym-hero__glow', attrs: { 'aria-hidden': 'true' } }));
    const region = exerciseRegion(exercise, draft);
    const row = region ? (boardRows ?? []).find(item => item.region === region) : null;
    if (row) {
      const total = row.done + (row.todayDone ?? 0);
      const meter = el(root, 'div', { className: 'gym-hero__meter', data: { fitnessLogger: 'hero-meter' } });
      meter.append(
        el(root, 'strong', { text: `${total}/${row.target}` }),
        el(root, 'span', { text: `${row.label.toUpperCase()} THIS WEEK` })
      );
      head.append(meter);
    }
  }
  const titleWrap = el(root, 'div', { className: 'gym-card__title' });
  const nameRow = el(root, 'div', { className: 'gym-card__name' });
  nameRow.append(
    el(root, 'span', { className: 'gym-card__code', text: blockMemberCode(block, memberIndex) }),
    el(root, 'h2', { text: exercise?.name ?? 'Exercise', data: { fitnessLogger: 'exercise-name' } })
  );
  titleWrap.append(nameRow);
  const chips = el(root, 'div', { className: 'gym-card__chips' });
  if (setIndex >= 0) {
    chips.append(el(root, 'span', { className: 'gym-card__chip', text: `Set ${setIndex + 1} of ${exercise?.sets?.length ?? 0}`, data: { fitnessLogger: 'set-meta' } }));
  }
  if (exercise?.equipment) chips.append(el(root, 'span', { className: 'gym-card__chip', text: exercise.equipment }));
  if (exercise?.bench_angle_deg != null) chips.append(el(root, 'span', { className: 'gym-card__chip', text: `bench ${exercise.bench_angle_deg}°` }));
  if (exercise?.intensification) chips.append(el(root, 'span', { className: 'gym-card__chip gym-card__chip--hot', text: intensificationLabel(exercise.intensification) }));
  titleWrap.append(chips);
  head.append(titleWrap);
  card.append(head);

  if (twingeOffer && twingeOffer.exerciseIndex === exerciseIndex) {
    card.append(renderTwingeOffer(root, { exercise, exerciseIndex, site: twingeOffer.site, actions }));
  }
  const focus = focusCue(exercise);
  if (focus) {
    const chip = el(root, 'p', { className: `gym-focus gym-focus--${focus.kind}`, data: { fitnessLogger: 'focus-cue' } });
    chip.append(el(root, 'strong', { text: 'Focus ' }), el(root, 'span', { text: focus.text }));
    card.append(chip);
  }
  const cue = setIndex >= 0 ? cueFor(exercise, setIndex) : null;
  if (cue) {
    card.append(el(root, 'p', {
      className: `fitness-logger__cue fitness-logger__cue--${cue.kind}`,
      text: cue.text,
      data: { fitnessLogger: `cue-${cue.kind}` }
    }));
  }

  const previousEntry = lastTimeFor(lastPerformance, exercise);
  const previous = describeLastTime(previousEntry, exercise);
  const ghost = set ? renderGhost(root, { exercise, set, setIndex, previous: previousEntry }) : null;
  if (ghost) card.append(ghost.node);
  else if (previous) {
    card.append(el(root, 'p', { className: 'gym-card__last', text: `Last time: ${previous}`, data: { fitnessLogger: 'last-time' } }));
  }
  const target = set && targetFor ? renderTarget(root, { exercise, set, exerciseIndex, setIndex, target: targetFor(exerciseIndex, setIndex), actions }) : null;
  if (target) card.append(target);

  if (!set) {
    card.append(el(root, 'p', { className: 'gym-card__empty', text: 'No sets planned for this move yet.' }));
    card.append(button(root, {
      className: 'gym-chip gym-chip--strong',
      text: '+ Add a set',
      marker: 'add-first-set',
      onClick: () => actions.addSet?.(exerciseIndex)
    }));
    return card;
  }

  const fields = el(root, 'div', { className: 'gym-card__fields' });
  for (const spec of setFields(exercise)) {
    fields.append(stepper(root, { exercise, set, exerciseIndex, setIndex, spec, actions, onCommitted: ghost?.update }));
  }
  card.append(fields);

  if (resolveTrackingType(exercise) === 'weighted') {
    card.append(pills(root, {
      label: 'Cable mode',
      marker: 'cable',
      value: normalizeLoggerCableType(set.cable_type),
      options: CABLE_TYPES.map(value => ({ value, label: cableLabel(value) })),
      onPick: value => actions.setField?.(exerciseIndex, setIndex, 'cable_type', value)
    }));
  }

  card.append(renderSetFlags(root, { exercise, set, exerciseIndex, setIndex, noteOpen, actions }));
  card.append(renderSetDots(root, draft, { exerciseIndex, setIndex, actions }));
  return card;
}

function renderRoundCard(root, draft, { step, block, noteOpen, actions }) {
  const card = el(root, 'article', { className: 'gym-card gym-card--round', data: { fitnessLogger: 'round-card' } });
  card.append(el(root, 'h2', {
    className: 'gym-card__round-title',
    text: block.format === 'amrap' ? `Round ${step.round}` : `Round ${step.round} of ${block.rounds}`
  }));
  const list = el(root, 'ol', { className: 'gym-round' });
  for (const { exerciseIndex, setIndex } of step.members) {
    const exercise = draft.exercises?.[exerciseIndex];
    const set = exercise?.sets?.[setIndex];
    const memberIndex = Math.max(0, block.indexes.indexOf(exerciseIndex));
    const item = el(root, 'li', { className: 'gym-round__item' });
    const head = el(root, 'div', { className: 'gym-round__head' });
    const thumb = el(root, 'span', { className: 'gym-round__thumb' });
    const thumbArt = anatomyImage(root, exerciseArt(exercise), 'gym-art');
    if (thumbArt) thumb.append(thumbArt);
    thumb.append(el(root, 'span', { className: 'gym-card__code', text: blockMemberCode(block, memberIndex) }));
    head.append(thumb, el(root, 'strong', { text: exercise?.name ?? 'Exercise' }));
    item.append(head);
    const fields = el(root, 'div', { className: 'gym-round__fields' });
    for (const spec of setFields(exercise).filter(item => !item.optional || Number(set?.[item.field]) > 0)) {
      fields.append(stepper(root, { exercise, set, exerciseIndex, setIndex, spec, compact: true, actions }));
    }
    item.append(fields);
    list.append(item);
  }
  card.append(list);
  const first = step.members[0];
  const firstExercise = draft.exercises?.[first.exerciseIndex];
  const cue = cueFor(firstExercise, first.setIndex);
  if (cue) {
    card.append(el(root, 'p', {
      className: `fitness-logger__cue fitness-logger__cue--${cue.kind}`,
      text: cue.text,
      data: { fitnessLogger: `cue-${cue.kind}` }
    }));
  }
  const notesWrap = el(root, 'div', { className: 'gym-flags__row' });
  notesWrap.append(button(root, {
    className: `gym-chip${noteOpen === 'exercise' ? ' is-active' : ''}`,
    text: 'Circuit note',
    marker: 'open-exercise-note',
    pressed: noteOpen === 'exercise',
    onClick: () => actions.toggleNote?.('exercise')
  }));
  card.append(notesWrap);
  if (noteOpen === 'exercise') {
    card.append(renderNoteEditor(root, {
      title: 'Note · circuit',
      value: firstExercise?.notes ?? '',
      placeholder: 'e.g. did bench dips instead of twists',
      marker: 'exercise-note',
      onInput: value => actions.setExerciseNote?.(first.exerciseIndex, value)
    }));
  }
  return card;
}

const READINESS_ROWS = [
  ['sleep', 'Sleep', ['Rough', '', 'OK', '', 'Great']],
  ['soreness', 'Body', ['Very sore', '', 'Some', '', 'Fresh']],
  ['energy', 'Energy', ['Flat', '', 'OK', '', 'Buzzing']]
];

/** 10-second check-in before the first set; the answer shapes the session. */
function renderReadiness(root, draft, { lastPainFlags, treat, actions }) {
  const card = el(root, 'section', { className: 'gym-card gym-ready', data: { fitnessLogger: 'readiness' } });
  card.append(el(root, 'h2', { className: 'gym-ready__title', text: 'How are you walking in?' }));
  const values = draft.readiness ?? {};
  for (const [field, label, hints] of READINESS_ROWS) {
    const row = el(root, 'div', { className: 'gym-ready__row' });
    row.append(el(root, 'span', { className: 'gym-ready__label', text: label }));
    const group = pills(root, {
      label,
      marker: `readiness-${field}`,
      value: values[field] ?? null,
      options: [1, 2, 3, 4, 5].map(value => ({ value, label: String(value) })),
      onPick: value => actions.setReadiness?.(field, value)
    });
    group.className += ' gym-ready__pills';
    row.append(group);
    const hint = hints[(values[field] ?? 0) - 1];
    row.append(el(root, 'span', { className: 'gym-ready__hint', text: hint || `${hints[0]} → ${hints[4]}` }));
    card.append(row);
  }
  if (lastPainFlags?.flags?.length) {
    const sites = lastPainFlags.flags.map(flag => (typeof flag === 'string' ? flag : flag?.site)).filter(Boolean).join(', ');
    card.append(el(root, 'p', {
      className: 'gym-ready__pain',
      text: `Last session flagged: ${sites} (${formatShortDate(lastPainFlags.date)}). Stop at any twinge — the Twinge button lightens the move.`
    }));
  }
  const advice = readinessAdvice(values);
  const actionsRow = el(root, 'div', { className: 'gym-flags__row' });
  if (advice) {
    const box = el(root, 'div', { className: `gym-ready__advice gym-ready__advice--${advice.adjusted}`, data: { fitnessLogger: 'readiness-advice' } });
    box.append(el(root, 'strong', { text: advice.title }), el(root, 'p', { text: advice.detail }));
    card.append(box);
    actionsRow.append(button(root, {
      className: 'gym-chip gym-chip--strong',
      text: advice.adjusted === 'lighter' ? 'Go lighter (−10%)' : "Let's go",
      marker: 'readiness-apply',
      onClick: () => actions.applyReadiness?.()
    }));
  }
  actionsRow.append(button(root, { className: 'gym-chip', text: 'Skip', marker: 'readiness-skip', onClick: () => actions.skipReadiness?.() }));
  card.append(actionsRow);
  if (treat) {
    card.append(el(root, 'p', { className: 'gym-ready__treat', text: `Gym-only treat: ${treat} — press play now.`, data: { fitnessLogger: 'treat' } }));
  }
  return card;
}

/** Last set done: grab the AEKE numbers while they're on screen, then finish. */
function renderWrapUp(root, draft, { actions }) {
  const card = el(root, 'section', { className: 'gym-card gym-wrap', data: { fitnessLogger: 'wrap-up' } });
  card.append(el(root, 'h2', { text: 'All sets done' }));
  card.append(el(root, 'p', { className: 'gym-card__meta', text: 'Copy the AEKE numbers in (optional), then hit Finish for your Pump Report.' }));
  const aeke = draft.aeke ?? {};
  const grid = el(root, 'div', { className: 'gym-wrap__grid' });
  const field = (key, label, { text = false } = {}) => {
    const wrap = el(root, 'label', { className: 'gym-wrap__field' });
    wrap.append(el(root, 'span', { text: label }));
    const input = el(root, 'input', { data: { fitnessLogger: `aeke-${key}` } });
    input.type = text ? 'text' : 'number';
    if (!text) input.inputMode = 'decimal';
    input.value = aeke[key] ?? '';
    input.addEventListener('input', () => actions.setAeke?.(key, input.value));
    wrap.append(input);
    return wrap;
  };
  grid.append(
    field('volume_kg', 'AEKE volume (kg)'),
    field('score', 'AEKE score'),
    field('strength_delta_pct', 'Strength change %'),
    field('strength_region', 'Which region', { text: true })
  );
  card.append(grid);
  return card;
}

function renderDock(root, draft, { steps, stepIndex, allDone, actions }) {
  const dock = el(root, 'footer', { className: 'gym__dock', data: { part: 'form-actions', fitnessLogger: 'dock' } });
  const step = steps[stepIndex];
  const prev = button(root, {
    className: 'gym__nav',
    text: '‹',
    marker: 'prev',
    label: 'Previous set',
    disabled: stepIndex <= 0,
    onClick: () => actions.go?.(stepIndex - 1)
  });
  const next = button(root, {
    className: 'gym__nav',
    text: '›',
    marker: 'next',
    label: 'Next set',
    disabled: stepIndex >= steps.length - 1,
    onClick: () => actions.go?.(stepIndex + 1)
  });
  let primary;
  if (allDone) {
    primary = button(root, {
      className: 'gym__primary gym__primary--finish fitness-logger__finish',
      text: finishLabel(draft.session_kind),
      marker: 'finish',
      onClick: () => actions.finish?.()
    });
  } else if (step && stepDone(draft, step)) {
    primary = button(root, {
      className: 'gym__primary gym__primary--undo',
      text: 'Done ✓ · undo',
      marker: 'undo-step',
      onClick: () => actions.undoStep?.()
    });
  } else {
    const text = !step ? 'Add a set'
      : step.kind === 'round' ? 'Round done'
        : 'Set done';
    primary = button(root, {
      className: 'gym__primary',
      text: `${text} ✓`,
      marker: 'done-step',
      disabled: !step || step.members.every(member => member.setIndex < 0),
      onClick: () => actions.doneStep?.()
    });
  }
  dock.append(prev, primary, next);
  return dock;
}

function renderPlanSheet(root, draft, { blocks, steps, stepIndex, timer, treat = '', actions }) {
  const sheet = el(root, 'section', {
    className: 'gym-sheet',
    data: { fitnessLogger: 'plan-sheet' },
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Session plan' }
  });
  const head = el(root, 'header', { className: 'gym-sheet__head' });
  head.append(el(root, 'h2', { text: 'Session' }));
  head.append(button(root, { className: 'gym-icon-btn', text: 'Close', marker: 'close-plan', onClick: () => actions.setPanel?.(null) }));
  sheet.append(head);

  const body = el(root, 'div', { className: 'gym-sheet__body' });
  const list = el(root, 'ol', { className: 'gym-plan', data: { fitnessLogger: 'plan-list' } });
  blocks.forEach(block => {
    const item = el(root, 'li', { className: `gym-plan__block gym-plan__block--${block.kind}` });
    if (isGroupedBlock(block)) {
      const blockHead = el(root, 'div', { className: 'gym-plan__block-head' });
      blockHead.append(el(root, 'span', { className: 'gym-block__letter', text: block.letter }));
      blockHead.append(el(root, 'span', { className: 'gym-plan__block-label', text: formatSupersetBlockLabel(block) }));
      item.append(blockHead);
    }
    const scheme = formatBlockScheme(block);
    if (scheme) item.append(el(root, 'p', { className: 'gym-plan__scheme', text: scheme }));
    block.exercises.forEach((exercise, memberIndex) => {
      const exerciseIndex = block.indexes[memberIndex];
      const row = el(root, 'div', { className: 'gym-plan__exercise', data: { fitnessLogger: 'plan-exercise' } });
      const top = el(root, 'div', { className: 'gym-plan__exercise-top' });
      top.append(
        el(root, 'span', { className: 'gym-card__code', text: blockMemberCode(block, memberIndex) }),
        el(root, 'strong', { text: exercise?.name ?? 'Exercise' })
      );
      const tools = el(root, 'div', { className: 'gym-plan__tools fitness-logger__exercise-tools' });
      tools.append(
        button(root, {
          className: 'gym-icon-btn',
          text: '↑',
          marker: 'move-up',
          label: `Move ${exercise?.name ?? 'exercise'} up`,
          disabled: exerciseIndex === 0,
          onClick: () => actions.moveExercise?.(exerciseIndex, exerciseIndex - 1)
        }),
        button(root, {
          className: 'gym-icon-btn',
          text: '↓',
          marker: 'move-down',
          label: `Move ${exercise?.name ?? 'exercise'} down`,
          disabled: exerciseIndex === (draft.exercises?.length ?? 1) - 1,
          onClick: () => actions.moveExercise?.(exerciseIndex, exerciseIndex + 1)
        }),
        button(root, {
          className: 'gym-icon-btn',
          text: 'Remove',
          marker: 'remove-exercise',
          label: `Remove ${exercise?.name ?? 'exercise'}`,
          onClick: () => actions.removeExercise?.(exerciseIndex)
        })
      );
      top.append(tools);
      row.append(top);
      const setsRow = el(root, 'div', { className: 'gym-plan__sets' });
      (exercise?.sets ?? []).forEach((set, setIndex) => {
        const described = describeSet(set, resolveTrackingType(exercise))
          || `${formatNumber(set.weight_kg)} kg × ${set.reps ?? '—'}`;
        const isCurrent = steps[stepIndex]?.members?.some(member => member.exerciseIndex === exerciseIndex && member.setIndex === setIndex);
        setsRow.append(button(root, {
          className: `gym-plan__set${set?.done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}${set?.failed ? ' is-failed' : ''}`,
          text: `${setIndex + 1}. ${described}${set?.failed ? ' · F' : ''}`,
          label: `Go to ${exercise?.name ?? 'exercise'} set ${setIndex + 1}`,
          onClick: () => {
            actions.jumpToSet?.(exerciseIndex, setIndex);
            actions.setPanel?.(null);
          }
        }));
      });
      row.append(setsRow);
      const technique = el(root, 'details', { className: 'gym-plan__technique' });
      technique.append(el(root, 'summary', {
        text: `Technique: ${exercise?.intensification ? intensificationLabel(exercise.intensification) : 'standard'}`
      }));
      const intensification = pills(root, {
        label: `Strength move for ${exercise?.name ?? 'exercise'}`,
        marker: 'intensification',
        value: exercise?.intensification ?? '',
        options: [{ value: '', label: 'standard' }, ...INTENSIFICATIONS.map(value => ({ value, label: intensificationLabel(value) }))],
        onPick: value => actions.change?.({ type: 'intensification', exerciseIndex, value })
      });
      intensification.className += ' gym-pills--small';
      technique.append(intensification);
      row.append(technique);
      item.append(row);
    });
    list.append(item);
  });
  body.append(list);

  const addExercise = el(root, 'div', { className: 'fitness-logger__add-exercise gym-plan__add' });
  const addName = el(root, 'input', { data: { fitnessLogger: 'add-exercise-name' } });
  addName.type = 'text';
  addName.placeholder = 'Add an exercise you did';
  addName.setAttribute?.('aria-label', 'New exercise name');
  const addButton = button(root, {
    className: 'btn btn--secondary quiet-button',
    text: 'Add exercise',
    marker: 'add-exercise',
    onClick: () => {
      actions.addExercise?.(addName.value);
      addName.value = '';
    }
  });
  addName.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault?.();
    actions.addExercise?.(addName.value);
    addName.value = '';
  });
  addExercise.append(addName, addButton);
  body.append(addExercise);

  body.append(renderSessionDetails(root, draft, { timer, actions }));
  const treatWrap = el(root, 'label', { className: 'fitness-logger__field gym-plan__treat' });
  treatWrap.append(el(root, 'span', { text: 'Gym-only treat (a podcast or playlist you only allow yourself while training)' }));
  const treatInput = el(root, 'input', { data: { fitnessLogger: 'treat-input' } });
  treatInput.type = 'text';
  treatInput.value = treat;
  treatInput.placeholder = 'e.g. the new Huberman episode';
  treatInput.addEventListener('input', () => actions.setTreat?.(treatInput.value));
  treatWrap.append(treatInput);
  body.append(treatWrap);
  sheet.append(body);

  const dock = el(root, 'footer', { className: 'gym-sheet__dock', data: { part: 'form-actions' } });
  dock.append(
    button(root, { className: 'btn btn--secondary gym-sheet__action', text: 'Back to set', marker: 'close-plan-dock', onClick: () => actions.setPanel?.(null) }),
    button(root, { className: 'btn btn--primary gym-sheet__action fitness-logger__finish', text: finishLabel(draft.session_kind), marker: 'finish-sheet', onClick: () => actions.finish?.() })
  );
  sheet.append(dock);
  return sheet;
}

function labeledNumber(root, { label, value, step = '1', onInput }) {
  const wrap = el(root, 'label', { className: 'fitness-logger__field' });
  wrap.append(el(root, 'span', { text: label }));
  const input = el(root, 'input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.step = step;
  input.value = value ?? '';
  input.addEventListener('input', () => onInput?.(input.value));
  wrap.append(input);
  return wrap;
}

function renderSessionDetails(root, draft, { timer, actions }) {
  const details = el(root, 'div', { className: 'fitness-logger__details' });
  details.append(el(root, 'h4', { text: 'Session details' }));

  const clock = el(root, 'div', { className: 'gym-sheet__clock', data: { fitnessLogger: 'controls' } });
  if (timer.state === 'completed') {
    clock.append(button(root, { className: 'gym-chip', text: 'Unlock time', marker: 'complete', onClick: () => actions.undoComplete?.() }));
  } else if (timer.everStarted) {
    clock.append(button(root, {
      className: 'gym-chip',
      text: 'Lock time',
      marker: 'complete',
      disabled: timer.state !== 'running' && timer.state !== 'paused',
      onClick: () => actions.complete?.()
    }));
  }
  if (clock.children.length) details.append(clock);

  const grid = el(root, 'div', { className: 'fitness-logger__details-grid' });
  grid.append(
    labeledNumber(root, { label: 'Avg HR', value: draft.avg_hr, onInput: value => actions.change?.({ type: 'session', field: 'avg_hr', value }) }),
    labeledNumber(root, { label: 'Calories', value: draft.calories_kcal, onInput: value => actions.change?.({ type: 'session', field: 'calories_kcal', value }) }),
    labeledNumber(root, { label: 'Distance (km)', value: draft.distance_km, step: '0.1', onInput: value => actions.change?.({ type: 'session', field: 'distance_km', value }) }),
    labeledNumber(root, { label: 'Duration (min)', value: draft.duration_min, onInput: value => actions.change?.({ type: 'session', field: 'duration_min', value }) })
  );
  details.append(grid);

  details.append(pills(root, {
    label: 'Day type',
    marker: 'day-type',
    value: draft.day_type ?? 'workout_30',
    options: [
      { value: 'movement', label: 'Movement' },
      { value: 'workout_30', label: 'Workout 30' },
      { value: 'workout_45_60', label: 'Workout 45–60' }
    ],
    onPick: value => actions.change?.({ type: 'session', field: 'day_type', value })
  }));

  const recovery = el(root, 'label', { className: 'fitness-logger__check' });
  const recoveryBox = el(root, 'input');
  recoveryBox.type = 'checkbox';
  recoveryBox.checked = Boolean(draft.recovery_flag_next_day);
  recoveryBox.addEventListener('change', () => {
    actions.change?.({ type: 'session', field: 'recovery_flag_next_day', value: recoveryBox.checked });
  });
  recovery.append(recoveryBox, el(root, 'span', { text: 'Recovery tomorrow' }));
  details.append(recovery);

  const pain = el(root, 'div', { className: 'fitness-logger__pain' });
  const painList = el(root, 'div', { className: 'fitness-logger__pain-list' });
  (draft.pain_flags ?? []).forEach((flag, index) => {
    const site = typeof flag === 'string' ? flag : flag?.site;
    const note = typeof flag === 'object' ? flag?.note : '';
    painList.append(button(root, {
      className: 'fitness-logger__pain-chip',
      text: note ? `${site} — ${note} ×` : `${site} ×`,
      marker: 'pain-remove',
      label: `Remove pain flag ${site}`,
      onClick: () => actions.change?.({ type: 'pain-remove', index })
    }));
  });
  const painPopover = createMorphingValuesPopover({
    root,
    label: 'Add pain flag',
    title: 'Pain flag',
    supporting: 'Site and an optional note.',
    layoutId: `fitness-pain-${draft.path ?? 'session'}`,
    triggerClass: 'btn btn--secondary quiet-button',
    className: 'fitness-logger__pain-form',
    submitLabel: 'Add',
    fields: [
      { name: 'site', label: 'Site', placeholder: 'Pain site', autoFocus: true },
      { name: 'note', label: 'Note', placeholder: 'Note' }
    ],
    onSubmit(values, api) {
      actions.change?.({ type: 'pain-add', site: values.site, note: values.note });
      api.close();
    }
  });
  pain.append(painList, painPopover.el);
  details.append(pain);

  const noteText = String(draft.notes ?? '').trim();
  const notesPopover = createMorphingNotePopover({
    root,
    label: noteText ? (noteText.length > 28 ? `${noteText.slice(0, 27).trimEnd()}…` : noteText) : 'Session notes',
    title: 'Session notes',
    supporting: 'The whole-session story. Per-set notes live on each set.',
    placeholder: 'How did it feel?',
    value: draft.notes ?? '',
    rows: 3,
    className: 'fitness-logger__notes',
    layoutId: `fitness-notes-${draft.path ?? 'session'}`,
    onChange: value => actions.change?.({ type: 'notes', value })
  });
  details.append(notesPopover.el);
  return details;
}

function attachSwipe(stage, actions, stepIndex) {
  if (typeof stage.addEventListener !== 'function') return;
  let start = null;
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    const tag = String(event.target?.tagName ?? '').toLowerCase();
    if (['input', 'textarea', 'select', 'button'].includes(tag)) return;
    start = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', event => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    actions.go?.(dx < 0 ? stepIndex + 1 : stepIndex - 1);
  });
  stage.addEventListener('pointercancel', () => { start = null; });
}

function ensureGymLayer(root, host) {
  const doc = ownerDoc(root);
  const body = doc?.body;
  if (!body?.append || typeof root.querySelector !== 'function') return host;
  let layer = root.querySelector('#fitness-gym');
  if (!layer) {
    layer = root.createElement('div');
    layer.id = 'fitness-gym';
    layer.className = 'gym';
    body.append(layer);
  }
  return layer;
}

function setBodyLock(root, locked) {
  const body = ownerDoc(root)?.body;
  body?.classList?.toggle?.('is-gym-mode', Boolean(locked));
}

/** The Chadwick voice player lives on the Fitness card; gym mode borrows it. */
function placeVoice(root, host, target, voice = root.querySelector?.('#chadwick-voice')) {
  if (!voice || voice === target) return;
  if (target) {
    target.append(voice);
    return;
  }
  if (host?.parentNode && voice.parentNode !== host.parentNode) host.parentNode.insertBefore?.(voice, host);
}

function renderDockedBar(root, host, draft, { elapsedMs, saveState, steps, actions }) {
  const bar = el(root, 'div', { className: 'gym-mini', data: { fitnessLogger: 'mini' } });
  const copy = el(root, 'div', { className: 'gym-mini__copy' });
  const doneCount = steps.filter(step => stepDone(draft, step)).length;
  copy.append(
    el(root, 'strong', { text: draft.title ?? 'Session' }),
    el(root, 'span', { className: 'fitness-logger__timer', text: formatElapsed(elapsedMs), data: { fitnessLogger: 'timer' } }),
    el(root, 'span', { className: 'metric-caption', text: `${doneCount}/${steps.length} done` }),
    el(root, 'span', { className: 'metric-caption', text: saveState, data: { fitnessLogger: 'save-state' } })
  );
  bar.append(copy, button(root, {
    className: 'btn btn--primary gym-mini__open',
    text: 'Back to workout',
    marker: 'open-gym',
    onClick: () => actions.openGym?.()
  }));
  host.append(bar);
}

export function renderFitnessLogger(root, draft, {
  elapsedMs = 0,
  saveState = '',
  timer = { state: 'idle', everStarted: false, completeVisible: false },
  view = 'gym',
  steps = [],
  blocks = [],
  stepIndex = 0,
  panel = null,
  noteOpen = null,
  rest = null,
  circuits = {},
  lastPerformance = null,
  celebration = null,
  targetFor = null,
  readinessOpen = false,
  libraryByName = null,
  boardRows = null,
  lastPainFlags = null,
  twingeOffer = null,
  treat = '',
  actions = {}
} = {}) {
  const host = root.querySelector('#fitness-logger');
  if (!host || !draft) return;

  anatomyLibrary = libraryByName;
  // Hold the voice player before any clear — it may sit inside the last gym render.
  const voice = root.querySelector?.('#chadwick-voice') ?? null;
  host.replaceChildren();
  host.removeAttribute('hidden');
  const layer = ensureGymLayer(root, host);

  if (view !== 'gym') {
    if (layer !== host) {
      layer.replaceChildren();
      layer.setAttribute('hidden', '');
    }
    setBodyLock(root, false);
    placeVoice(root, host, null, voice);
    renderDockedBar(root, host, draft, { elapsedMs, saveState, steps, actions });
    return;
  }

  if (layer !== host) {
    layer.replaceChildren();
    layer.removeAttribute('hidden');
    setBodyLock(root, true);
    host.append(el(root, 'p', { className: 'metric-caption', text: 'Workout open in gym mode.' }));
  }

  const shell = el(root, 'div', {
    className: 'gym__shell',
    data: { fitnessLogger: 'gym' },
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Workout: ${draft.title ?? 'Session'}` }
  });

  const top = el(root, 'header', { className: 'gym__top' });
  top.append(button(root, {
    className: 'gym-icon-btn',
    text: '⌄',
    marker: 'minimise',
    label: 'Minimise workout',
    onClick: () => actions.minimise?.()
  }));
  const titleWrap = el(root, 'div', { className: 'gym__title fitness-logger__header' });
  titleWrap.append(
    el(root, 'strong', { text: draft.title ?? 'Session' }),
    el(root, 'span', { className: 'gym__meta' })
  );
  titleWrap.children[1].append(
    el(root, 'span', { className: 'fitness-logger__timer', text: formatElapsed(elapsedMs), data: { fitnessLogger: 'timer' } }),
    el(root, 'span', { className: 'fitness-logger__save', text: saveState, data: { fitnessLogger: 'save-state' } })
  );
  top.append(titleWrap);
  const running = timer.state === 'running';
  top.append(button(root, {
    className: 'gym-icon-btn',
    text: running ? 'Pause' : (timer.state === 'paused' ? 'Resume' : 'Start'),
    marker: running ? 'pause' : 'start',
    disabled: timer.state === 'completed',
    onClick: () => (running ? actions.pause?.() : actions.start?.())
  }));
  top.append(button(root, {
    className: 'gym-icon-btn',
    text: 'Plan',
    marker: 'open-plan',
    label: 'Open session plan',
    pressed: panel === 'plan',
    onClick: () => actions.setPanel?.(panel === 'plan' ? null : 'plan')
  }));
  shell.append(top);
  shell.append(renderProgress(root, draft, { steps, stepIndex, actions }));

  const stage = el(root, 'main', { className: 'gym__stage', data: { fitnessLogger: 'stage' } });
  const step = steps[stepIndex];
  if (celebration) {
    const moment = el(root, 'section', {
      className: `gym-moment gym-moment--${celebration.kind}`,
      data: { fitnessLogger: 'celebration', kind: celebration.kind },
      attrs: { role: 'status', 'aria-live': 'assertive' }
    });
    const hero = draft.exercises?.[celebration.exerciseIndex];
    const momentArt = celebration.kind === 'pr'
      ? (regionArt(exerciseRegion(hero, draft)) ?? exerciseArt(hero))
      : exerciseArt(hero);
    const image = anatomyImage(root, momentArt, 'gym-art gym-moment__art');
    if (image) {
      moment.className += ' gym-moment--art';
      moment.append(image);
    }
    if (celebration.kind === 'pr') moment.append(el(root, 'span', { className: 'gym-moment__spark', attrs: { 'aria-hidden': 'true' } }));
    moment.append(
      el(root, 'p', { className: 'gym-moment__title', text: celebration.title }),
      el(root, 'p', { className: 'gym-moment__detail', text: celebration.detail })
    );
    stage.append(moment);
  }
  if (rest && rest.remainingMs > 0) stage.append(renderRest(root, rest, actions));
  const finishedAll = steps.length > 0 && steps.every(item => stepDone(draft, item));
  if (readinessOpen && steps.length) stage.append(renderReadiness(root, draft, { lastPainFlags, treat, actions }));
  if (finishedAll) stage.append(renderWrapUp(root, draft, { actions }));
  const block = step ? blocks[step.blockIndex] : null;
  if (block && isGroupedBlock(block)) {
    stage.append(renderBlockBanner(root, draft, { block, step, circuit: circuits[step.blockIndex], actions }));
  }
  if (!step) {
    const empty = el(root, 'article', { className: 'gym-card' });
    empty.append(el(root, 'h2', { text: 'Nothing planned yet' }));
    empty.append(el(root, 'p', { text: 'Open Plan to add the moves you did.' }));
    stage.append(empty);
  } else if (step.kind === 'round') {
    stage.append(renderRoundCard(root, draft, { step, block, noteOpen, actions }));
  } else {
    stage.append(renderSetCard(root, draft, { step, block, lastPerformance, noteOpen, targetFor, twingeOffer, boardRows, actions }));
  }
  const upcoming = steps[stepIndex + 1];
  if (upcoming) {
    const nextExercise = draft.exercises?.[upcoming.members[0].exerciseIndex];
    const nextBlock = blocks[upcoming.blockIndex];
    const label = upcoming.kind === 'round'
      ? `${formatSupersetBlockLabel(nextBlock)} · round ${upcoming.round}`
      : `${blockMemberCode(nextBlock, Math.max(0, nextBlock?.indexes?.indexOf(upcoming.members[0].exerciseIndex) ?? 0))} ${nextExercise?.name ?? ''} · set ${upcoming.members[0].setIndex + 1}`;
    stage.append(el(root, 'p', { className: 'gym__next', text: `Up next: ${label.trim()}`, data: { fitnessLogger: 'up-next' } }));
  }
  if (layer !== host) placeVoice(root, host, stage, voice);
  attachSwipe(stage, actions, stepIndex);
  shell.append(stage);

  const allDone = steps.length > 0 && steps.every(item => stepDone(draft, item));
  shell.append(renderDock(root, draft, { steps, stepIndex, allDone, actions }));

  if (panel === 'plan') shell.append(renderPlanSheet(root, draft, { blocks, steps, stepIndex, timer, treat, actions }));

  layer.append(shell);
}

function reportLayer(root) {
  const body = ownerDoc(root)?.body;
  if (!body?.append || typeof root.querySelector !== 'function') return root.querySelector?.('#fitness-logger') ?? null;
  let layer = root.querySelector('#fitness-report');
  if (!layer) {
    layer = root.createElement('div');
    layer.id = 'fitness-report';
    layer.className = 'gym gym-report-layer';
    body.append(layer);
  }
  return layer;
}

function statTile(root, value, label) {
  const tile = el(root, 'div', { className: 'pump-stat' });
  tile.append(el(root, 'strong', { text: value }), el(root, 'span', { text: label }));
  return tile;
}

/** Build Board bars: done before today (solid) + today's sets (bright). */
export function renderBuildBoardRows(root, rows, { live = true } = {}) {
  const list = el(root, 'ol', { className: 'build-board', data: { fitnessLogger: 'build-board' } });
  for (const row of rows ?? []) {
    const today = live ? (row.today ?? 0) : 0;
    const total = row.done + today;
    const item = el(root, 'li', { className: `build-board__row${total >= row.target ? ' is-hit' : ''}` });
    const head = el(root, 'div', { className: 'build-board__head' });
    head.append(
      el(root, 'span', { className: 'build-board__label', text: row.label }),
      el(root, 'span', {
        className: 'build-board__count',
        text: `${total}/${row.target}${today ? ` (+${today} today)` : ''}${total >= row.target ? ' ✓' : ''}`
      })
    );
    const bar = el(root, 'div', { className: 'build-board__bar', attrs: { role: 'presentation' } });
    const before = el(root, 'span', { className: 'build-board__fill' });
    const now = el(root, 'span', { className: 'build-board__fill build-board__fill--today' });
    if (before.style?.setProperty) {
      before.style.setProperty('--w', `${Math.min(100, (row.done / row.target) * 100)}%`);
      now.style.setProperty('--w', `${Math.max(0, Math.min(100 - (row.done / row.target) * 100, (today / row.target) * 100))}%`);
    }
    bar.append(before, now);
    item.append(head, bar);
    list.append(item);
  }
  return list;
}

/**
 * The Pump Report — the end of the session is what you remember (peak-end),
 * so it ends on everything you won. Pass null to close.
 */
export function renderPumpReport(root, report, { onClose } = {}) {
  const layer = reportLayer(root);
  if (!layer) return;
  const body = ownerDoc(root)?.body;
  if (!report) {
    layer.replaceChildren();
    layer.setAttribute?.('hidden', '');
    body?.classList?.toggle?.('is-gym-mode', false);
    return;
  }
  layer.replaceChildren();
  layer.removeAttribute?.('hidden');
  body?.classList?.toggle?.('is-gym-mode', true);

  const shell = el(root, 'div', {
    className: 'gym__shell pump',
    data: { fitnessLogger: 'pump-report' },
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pump report' }
  });
  const stage = el(root, 'main', { className: 'gym__stage pump__stage' });
  const hero = el(root, 'header', { className: 'pump__hero' });
  const topRegion = (report.buildBoard ?? []).reduce((best, row) => ((row.today ?? 0) > (best?.today ?? 0) ? row : best), null);
  const pumpArt = anatomyImage(root, regionArt(topRegion?.region ?? (report.prs.length ? 'arms' : 'full_body')), 'gym-art pump__art');
  if (pumpArt) {
    hero.className += ' pump__hero--art';
    hero.append(pumpArt);
  }
  hero.append(
    el(root, 'p', { className: 'pump__eyebrow', text: 'PUMP REPORT' }),
    el(root, 'h2', { className: 'pump__title', text: report.title })
  );
  if (report.ghostsRaced) {
    hero.append(el(root, 'p', {
      className: 'pump__ghosts',
      text: `Beat your ghost on ${report.ghostsBeaten} of ${report.ghostsRaced} sets`,
      data: { fitnessLogger: 'pump-ghosts' }
    }));
  }
  if (report.streak) hero.append(el(root, 'p', { className: 'pump__streak', text: report.streak, data: { fitnessLogger: 'pump-streak' } }));
  stage.append(hero);

  const quote = el(root, 'blockquote', { className: 'pump__chadwick', data: { fitnessLogger: 'pump-chadwick' } });
  quote.append(el(root, 'p', { text: report.chadwick }), el(root, 'cite', { text: 'Chadwick' }));
  stage.append(quote);

  const stats = el(root, 'div', { className: 'pump__stats' });
  stats.append(statTile(root, `${report.volume.toLocaleString?.('en-AU') ?? report.volume} kg`, report.volumeDeltaPct != null
    ? `volume · ${report.volumeDeltaPct > 0 ? '+' : ''}${report.volumeDeltaPct}% vs last`
    : 'volume'));
  if (report.minutes != null) stats.append(statTile(root, `${report.minutes} min`, 'session'));
  if (report.density != null) stats.append(statTile(root, `${report.density}`, 'kg per minute'));
  stats.append(statTile(root, `${report.setsLogged}`, `sets · ${report.failureSets} to failure`));
  if (report.aeke?.score != null) {
    const delta = report.aeke.strength_delta_pct != null
      ? ` · ${report.aeke.strength_delta_pct > 0 ? '+' : ''}${report.aeke.strength_delta_pct}% ${report.aeke.strength_region ?? 'strength'}`
      : '';
    stats.append(statTile(root, `${report.aeke.score}`, `AEKE score${delta}`));
  }
  stage.append(stats);

  if (report.prs.length) {
    const prs = el(root, 'section', { className: 'pump__section pump__prs', data: { fitnessLogger: 'pump-prs' } });
    prs.append(el(root, 'h3', { text: report.prs.length === 1 ? 'Personal best' : `${report.prs.length} personal bests` }));
    const list = el(root, 'ul');
    for (const pr of report.prs) list.append(el(root, 'li', { text: `${pr.name} — ${pr.label}` }));
    prs.append(list);
    stage.append(prs);
  }
  if (report.beats.length) {
    const beats = el(root, 'section', { className: 'pump__section' });
    beats.append(el(root, 'h3', { text: 'Ghosts beaten' }));
    const list = el(root, 'ul');
    for (const beat of report.beats) list.append(el(root, 'li', { text: `${beat.name} · ${beat.label}` }));
    beats.append(list);
    stage.append(beats);
  }
  if (report.circuits.length) {
    const circuits = el(root, 'section', { className: 'pump__section' });
    circuits.append(el(root, 'h3', { text: 'Circuits' }));
    const list = el(root, 'ul');
    for (const circuit of report.circuits) {
      list.append(el(root, 'li', { text: `${circuit.name}: ${formatBlockResult({ result: circuit.result })}` }));
    }
    circuits.append(list);
    stage.append(circuits);
  }
  if (report.buildBoard.length) {
    const board = el(root, 'section', { className: 'pump__section' });
    board.append(el(root, 'h3', { text: 'Build Board · this week' }));
    board.append(renderBuildBoardRows(root, report.buildBoard));
    stage.append(board);
  }
  shell.append(stage);

  const dock = el(root, 'footer', { className: 'gym__dock pump__dock', data: { part: 'form-actions' } });
  dock.append(button(root, {
    className: 'gym__primary',
    text: 'Done',
    marker: 'close-report',
    onClick: () => onClose?.()
  }));
  shell.append(dock);
  layer.append(shell);
}

export function updateLoggerChrome(root, { elapsedMs, saveState, timer, rest, circuitClock }) {
  const all = selector => (typeof root.querySelectorAll === 'function'
    ? [...root.querySelectorAll(selector)]
    : [root.querySelector(selector)].filter(Boolean));
  if (elapsedMs != null) {
    for (const node of all('[data-fitness-logger="timer"]')) node.textContent = formatElapsed(elapsedMs);
  }
  if (saveState != null) {
    for (const node of all('[data-fitness-logger="save-state"]')) node.textContent = saveState;
  }
  if (rest) {
    const clock = root.querySelector('[data-fitness-logger="rest-clock"]');
    if (clock) clock.textContent = formatElapsed(Math.max(0, rest.remainingMs));
  }
  if (circuitClock != null) {
    const clock = root.querySelector('[data-fitness-logger="circuit-clock"]');
    if (clock) clock.textContent = formatElapsed(Math.max(0, circuitClock));
  }
  if (!timer) return;
  const start = root.querySelector('[data-fitness-logger="start"]');
  if (start) {
    start.textContent = timer.state === 'paused' ? 'Resume' : 'Start';
    start.disabled = timer.state === 'completed';
  }
}

export function hideFitnessLogger(root) {
  const host = root.querySelector('#fitness-logger');
  const layer = root.querySelector('#fitness-gym');
  placeVoice(root, host, null);
  if (layer && layer !== host) {
    layer.replaceChildren();
    layer.setAttribute('hidden', '');
  }
  setBodyLock(root, false);
  if (!host) return;
  host.setAttribute('hidden', '');
  host.replaceChildren();
}

// re-export for tests that might import append from render path
export { appendSet };

import {
  CABLE_TYPES,
  INTENSIFICATIONS,
  appendSet,
  finishLabel,
  formatElapsed
} from './fitness-logger-draft.js';

const cableLabel = value => String(value ?? 'none').replaceAll('_', ' ');
const intensificationLabel = value => String(value ?? '').replaceAll('_', ' ');

function labeledNumber(root, { label, value, step = '1', inputMode = 'decimal', onInput }) {
  const wrap = root.createElement('label');
  wrap.className = 'fitness-logger__field';
  wrap.textContent = label;
  const input = root.createElement('input');
  input.type = 'number';
  input.inputMode = inputMode;
  input.step = step;
  input.value = value ?? '';
  input.addEventListener('input', () => onInput?.(input.value));
  wrap.append(input);
  return wrap;
}

export function renderFitnessLogger(root, draft, {
  elapsedMs = 0,
  saveState = '',
  timer = { state: 'idle', everStarted: false, completeVisible: false },
  onChange,
  onAddSet,
  onAddExercise,
  onMoveExercise,
  onRemoveExercise,
  onFinish,
  onStart,
  onPause,
  onComplete,
  onUndoComplete
} = {}) {
  const host = root.querySelector('#fitness-logger');
  if (!host || !draft) return;

  host.replaceChildren();
  host.removeAttribute('hidden');

  const header = root.createElement('div');
  header.className = 'fitness-logger__header';
  const title = root.createElement('strong');
  title.textContent = draft.title ?? 'Session';
  const timerEl = root.createElement('span');
  timerEl.className = 'fitness-logger__timer';
  timerEl.dataset.fitnessLogger = 'timer';
  timerEl.textContent = formatElapsed(elapsedMs);
  const kind = root.createElement('span');
  kind.className = 'metric-caption';
  kind.textContent = draft.session_kind ?? '';
  header.append(title, timerEl, kind);
  host.append(header);

  const controls = root.createElement('div');
  controls.className = 'fitness-logger__controls';
  controls.dataset.fitnessLogger = 'controls';

  const start = root.createElement('button');
  start.type = 'button';
  start.className = 'fitness-logger__control';
  start.dataset.fitnessLogger = 'start';
  const startable = timer.state === 'idle' || timer.state === 'paused';
  start.textContent = timer.state === 'paused' ? 'Resume' : 'Start';
  start.disabled = !startable;
  start.addEventListener('click', () => onStart?.());

  const pause = root.createElement('button');
  pause.type = 'button';
  pause.className = 'fitness-logger__control';
  pause.dataset.fitnessLogger = 'pause';
  pause.textContent = 'Pause';
  pause.disabled = timer.state !== 'running';
  pause.addEventListener('click', () => onPause?.());

  controls.append(start, pause);

  if (timer.completeVisible || timer.state === 'completed') {
    const complete = root.createElement('button');
    complete.type = 'button';
    complete.className = 'fitness-logger__control';
    complete.dataset.fitnessLogger = 'complete';
    if (timer.state === 'completed') {
      complete.textContent = 'Undo Complete';
      complete.addEventListener('click', () => onUndoComplete?.());
    } else {
      complete.textContent = 'Complete';
      complete.disabled = timer.state !== 'running' && timer.state !== 'paused';
      complete.addEventListener('click', () => onComplete?.());
    }
    controls.append(complete);
  }

  host.append(controls);

  const status = root.createElement('p');
  status.className = 'fitness-logger__save metric-caption';
  status.dataset.fitnessLogger = 'save-state';
  status.textContent = saveState;
  host.append(status);

  for (let exerciseIndex = 0; exerciseIndex < (draft.exercises ?? []).length; exerciseIndex++) {
    const exercise = draft.exercises[exerciseIndex];
    const card = root.createElement('div');
    card.className = 'fitness-logger__exercise';

    const head = root.createElement('div');
    head.className = 'fitness-logger__exercise-head';
    const name = root.createElement('h4');
    name.textContent = exercise.name ?? 'Exercise';
    const tools = root.createElement('div');
    tools.className = 'fitness-logger__exercise-tools';

    const moveUp = root.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'fitness-logger__icon-btn';
    moveUp.dataset.fitnessLogger = 'move-up';
    moveUp.setAttribute('aria-label', `Move ${exercise.name ?? 'exercise'} up`);
    moveUp.textContent = '↑';
    moveUp.disabled = exerciseIndex === 0;
    moveUp.addEventListener('click', () => onMoveExercise?.(exerciseIndex, exerciseIndex - 1));

    const moveDown = root.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'fitness-logger__icon-btn';
    moveDown.dataset.fitnessLogger = 'move-down';
    moveDown.setAttribute('aria-label', `Move ${exercise.name ?? 'exercise'} down`);
    moveDown.textContent = '↓';
    moveDown.disabled = exerciseIndex === (draft.exercises.length - 1);
    moveDown.addEventListener('click', () => onMoveExercise?.(exerciseIndex, exerciseIndex + 1));

    const remove = root.createElement('button');
    remove.type = 'button';
    remove.className = 'fitness-logger__icon-btn';
    remove.dataset.fitnessLogger = 'remove-exercise';
    remove.setAttribute('aria-label', `Remove ${exercise.name ?? 'exercise'}`);
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => onRemoveExercise?.(exerciseIndex));

    tools.append(moveUp, moveDown, remove);
    head.append(name, tools);
    card.append(head);

    // Mid-session presence (Phase 5): Chadwick's per-exercise cues, generated once up front
    // alongside the plan -- no extra API calls during the workout. The start cue greets the
    // exercise; rest/final-set cues are placed inline in the sets table below, at the moment
    // they're actually relevant (see the sets loop).
    if (exercise.coach_cues?.start) {
      const startCue = root.createElement('p');
      startCue.className = 'fitness-logger__cue fitness-logger__cue--start';
      startCue.dataset.fitnessLogger = 'cue-start';
      startCue.textContent = exercise.coach_cues.start;
      card.append(startCue);
    }

    if (exercise.bench_angle_deg != null || /bench/i.test(exercise.name ?? '')) {
      const benchRow = root.createElement('label');
      benchRow.className = 'fitness-logger__bench';
      benchRow.textContent = 'Bench ° ';
      const bench = root.createElement('input');
      bench.type = 'number';
      bench.min = '0';
      bench.max = '90';
      bench.step = '5';
      bench.value = exercise.bench_angle_deg ?? '';
      bench.addEventListener('input', () => {
        const value = bench.value.trim() === '' ? null : Number(bench.value);
        onChange?.({ type: 'bench', exerciseIndex, value: Number.isFinite(value) ? value : null });
      });
      benchRow.append(bench);
      card.append(benchRow);
    }

    const intensificationRow = root.createElement('label');
    intensificationRow.className = 'fitness-logger__bench';
    intensificationRow.textContent = 'Strength move ';
    const intensification = root.createElement('select');
    const none = root.createElement('option');
    none.value = '';
    none.textContent = 'Standard';
    intensification.append(none);
    for (const option of INTENSIFICATIONS) {
      const el = root.createElement('option');
      el.value = option;
      el.textContent = intensificationLabel(option);
      if (option === exercise.intensification) el.selected = true;
      intensification.append(el);
    }
    intensification.addEventListener('change', () => {
      onChange?.({ type: 'intensification', exerciseIndex, value: intensification.value });
    });
    intensificationRow.append(intensification);
    card.append(intensificationRow);

    const table = root.createElement('div');
    table.className = 'fitness-logger__sets';
    const setHead = root.createElement('div');
    setHead.className = 'fitness-logger__set fitness-logger__set--head';
    for (const label of ['#', 'kg', 'reps', 'cable']) {
      const cell = root.createElement('span');
      cell.textContent = label;
      setHead.append(cell);
    }
    table.append(setHead);

    const exerciseSets = exercise.sets ?? [];
    exerciseSets.forEach((set, setIndex) => {
      const row = root.createElement('div');
      row.className = 'fitness-logger__set';
      const index = root.createElement('span');
      index.textContent = String(setIndex + 1);

      const weight = root.createElement('input');
      weight.type = 'number';
      weight.inputMode = 'decimal';
      weight.step = '0.5';
      weight.value = set.weight_kg ?? 0;
      weight.addEventListener('input', () => {
        onChange?.({ type: 'set', exerciseIndex, setIndex, field: 'weight_kg', value: Number(weight.value) });
      });

      const reps = root.createElement('input');
      reps.type = 'number';
      reps.inputMode = 'numeric';
      reps.step = '1';
      reps.value = set.reps ?? 0;
      reps.addEventListener('input', () => {
        onChange?.({ type: 'set', exerciseIndex, setIndex, field: 'reps', value: Number(reps.value) });
      });

      const cable = root.createElement('select');
      for (const option of CABLE_TYPES) {
        const el = root.createElement('option');
        el.value = option;
        el.textContent = cableLabel(option);
        if (option === set.cable_type) el.selected = true;
        cable.append(el);
      }
      cable.addEventListener('change', () => {
        onChange?.({ type: 'set', exerciseIndex, setIndex, field: 'cable_type', value: cable.value });
      });

      row.append(index, weight, reps, cable);
      table.append(row);

      const isFinalSet = setIndex === exerciseSets.length - 1;
      if (isFinalSet) {
        if (exercise.coach_cues?.final_set) {
          const finalCue = root.createElement('p');
          finalCue.className = 'fitness-logger__cue fitness-logger__cue--final-set';
          finalCue.dataset.fitnessLogger = 'cue-final-set';
          finalCue.textContent = exercise.coach_cues.final_set;
          table.append(finalCue);
        }
      } else if (exercise.coach_cues?.rest) {
        const restCue = root.createElement('p');
        restCue.className = 'fitness-logger__cue fitness-logger__cue--rest';
        restCue.dataset.fitnessLogger = 'cue-rest';
        restCue.textContent = exercise.coach_cues.rest;
        table.append(restCue);
      }
    });

    card.append(table);

    const add = root.createElement('button');
    add.type = 'button';
    add.className = 'fitness-logger__add-set btn btn--secondary quiet-button';
    add.textContent = '+ Set';
    add.addEventListener('click', () => onAddSet?.(exerciseIndex));
    card.append(add);
    host.append(card);
  }

  const addExercise = root.createElement('div');
  addExercise.className = 'fitness-logger__add-exercise';
  const addName = root.createElement('input');
  addName.type = 'text';
  addName.placeholder = 'Add an exercise you did';
  addName.setAttribute('aria-label', 'New exercise name');
  addName.dataset.fitnessLogger = 'add-exercise-name';
  const addButton = root.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary quiet-button';
  addButton.dataset.fitnessLogger = 'add-exercise';
  addButton.textContent = 'Add exercise';
  addButton.addEventListener('click', () => {
    onAddExercise?.(addName.value);
    addName.value = '';
  });
  addName.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault?.();
    onAddExercise?.(addName.value);
    addName.value = '';
  });
  addExercise.append(addName, addButton);
  host.append(addExercise);

  const details = root.createElement('div');
  details.className = 'fitness-logger__details';
  const detailsTitle = root.createElement('h4');
  detailsTitle.textContent = 'Session details';
  details.append(detailsTitle);

  const detailsGrid = root.createElement('div');
  detailsGrid.className = 'fitness-logger__details-grid';
  detailsGrid.append(
    labeledNumber(root, {
      label: 'Avg HR',
      value: draft.avg_hr,
      onInput: value => onChange?.({ type: 'session', field: 'avg_hr', value })
    }),
    labeledNumber(root, {
      label: 'Calories',
      value: draft.calories_kcal,
      onInput: value => onChange?.({ type: 'session', field: 'calories_kcal', value })
    }),
    labeledNumber(root, {
      label: 'Distance (km)',
      value: draft.distance_km,
      step: '0.1',
      onInput: value => onChange?.({ type: 'session', field: 'distance_km', value })
    }),
    labeledNumber(root, {
      label: 'Duration (min)',
      value: draft.duration_min,
      onInput: value => onChange?.({ type: 'session', field: 'duration_min', value })
    })
  );
  details.append(detailsGrid);

  const recovery = root.createElement('label');
  recovery.className = 'fitness-logger__check';
  const recoveryBox = root.createElement('input');
  recoveryBox.type = 'checkbox';
  recoveryBox.checked = Boolean(draft.recovery_flag_next_day);
  recoveryBox.addEventListener('change', () => {
    onChange?.({ type: 'session', field: 'recovery_flag_next_day', value: recoveryBox.checked });
  });
  const recoveryText = root.createElement('span');
  recoveryText.textContent = 'Recovery tomorrow';
  recovery.append(recoveryBox, recoveryText);
  details.append(recovery);

  const pain = root.createElement('div');
  pain.className = 'fitness-logger__pain';
  const painList = root.createElement('div');
  painList.className = 'fitness-logger__pain-list';
  (draft.pain_flags ?? []).forEach((flag, index) => {
    const chip = root.createElement('button');
    chip.type = 'button';
    chip.className = 'fitness-logger__pain-chip';
    chip.dataset.fitnessLogger = 'pain-remove';
    const site = typeof flag === 'string' ? flag : flag?.site;
    const note = typeof flag === 'object' ? flag?.note : '';
    chip.textContent = note ? `${site} — ${note} ×` : `${site} ×`;
    chip.setAttribute('aria-label', `Remove pain flag ${site}`);
    chip.addEventListener('click', () => onChange?.({ type: 'pain-remove', index }));
    painList.append(chip);
  });
  const painForm = root.createElement('div');
  painForm.className = 'fitness-logger__pain-form';
  const painSite = root.createElement('input');
  painSite.type = 'text';
  painSite.placeholder = 'Pain site';
  painSite.setAttribute('aria-label', 'Pain site');
  const painNote = root.createElement('input');
  painNote.type = 'text';
  painNote.placeholder = 'Note';
  painNote.setAttribute('aria-label', 'Pain note');
  const painAdd = root.createElement('button');
  painAdd.type = 'button';
  painAdd.className = 'btn btn--secondary quiet-button';
  painAdd.textContent = 'Add pain flag';
  painAdd.addEventListener('click', () => {
    onChange?.({ type: 'pain-add', site: painSite.value, note: painNote.value });
    painSite.value = '';
    painNote.value = '';
  });
  painForm.append(painSite, painNote, painAdd);
  pain.append(painList, painForm);
  details.append(pain);
  host.append(details);

  const notesLabel = root.createElement('label');
  notesLabel.className = 'fitness-logger__notes';
  notesLabel.textContent = 'Session notes';
  const notes = root.createElement('textarea');
  notes.rows = 3;
  notes.value = draft.notes ?? '';
  notes.addEventListener('input', () => onChange?.({ type: 'notes', value: notes.value }));
  notesLabel.append(notes);
  host.append(notesLabel);

  const finish = root.createElement('button');
  finish.type = 'button';
  finish.className = 'fitness-logger__finish';
  finish.dataset.fitnessLogger = 'finish';
  finish.textContent = finishLabel(draft.session_kind);
  finish.addEventListener('click', () => onFinish?.());
  host.append(finish);
}

export function updateLoggerChrome(root, { elapsedMs, saveState, timer }) {
  const timerEl = root.querySelector('[data-fitness-logger="timer"]');
  if (timerEl && elapsedMs != null) timerEl.textContent = formatElapsed(elapsedMs);
  const save = root.querySelector('[data-fitness-logger="save-state"]');
  if (save && saveState != null) save.textContent = saveState;
  if (!timer) return;

  const start = root.querySelector('[data-fitness-logger="start"]');
  if (start) {
    const startable = timer.state === 'idle' || timer.state === 'paused';
    start.textContent = timer.state === 'paused' ? 'Resume' : 'Start';
    start.disabled = !startable;
  }
  const pause = root.querySelector('[data-fitness-logger="pause"]');
  if (pause) pause.disabled = timer.state !== 'running';
  const complete = root.querySelector('[data-fitness-logger="complete"]');
  if (complete) {
    if (timer.state === 'completed') {
      complete.textContent = 'Undo Complete';
      complete.disabled = false;
    } else {
      complete.textContent = 'Complete';
      complete.disabled = timer.state !== 'running' && timer.state !== 'paused';
    }
  }
}

export function hideFitnessLogger(root) {
  const host = root.querySelector('#fitness-logger');
  if (!host) return;
  host.setAttribute('hidden', '');
  host.replaceChildren();
}

// re-export for tests that might import append from render path
export { appendSet };

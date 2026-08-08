import { CABLE_TYPES, appendSet, finishLabel, formatElapsed } from './fitness-logger-draft.js';

const cableLabel = value => String(value ?? 'none').replaceAll('_', ' ');

export function renderFitnessLogger(root, draft, {
  elapsedMs = 0,
  saveState = '',
  timer = { state: 'idle', everStarted: false, completeVisible: false },
  onChange,
  onAddSet,
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

    const name = root.createElement('h4');
    name.textContent = exercise.name ?? 'Exercise';
    card.append(name);

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

    const table = root.createElement('div');
    table.className = 'fitness-logger__sets';
    const head = root.createElement('div');
    head.className = 'fitness-logger__set fitness-logger__set--head';
    for (const label of ['#', 'kg', 'reps', 'cable']) {
      const cell = root.createElement('span');
      cell.textContent = label;
      head.append(cell);
    }
    table.append(head);

    (exercise.sets ?? []).forEach((set, setIndex) => {
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
    });

    card.append(table);

    const add = root.createElement('button');
    add.type = 'button';
    add.className = 'fitness-logger__add-set quiet-button';
    add.textContent = '+ Set';
    add.addEventListener('click', () => onAddSet?.(exerciseIndex));
    card.append(add);
    host.append(card);
  }

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

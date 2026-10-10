import {
  AUTOSAVE_IDLE_MS,
  appendSet,
  clearDraft,
  cloneLoggerDraft,
  createExercise,
  draftFingerprint,
  moveExercise,
  normalizeLoggerCableType,
  optionalNumber,
  parsePainFlag,
  resolveDraft,
  saveDraft,
  toConfirmPayload
} from './fitness-logger-draft.js';
import { hideFitnessLogger, renderFitnessLogger, renderPumpReport, updateLoggerChrome } from './render-fitness-logger.js';
import {
  buildPumpReport,
  compareToGhost,
  detectPersonalBest,
  exerciseKey,
  ghostForSet,
  lighterLoad,
  projectBuildBoard,
  readinessAdvice,
  restWins,
  suggestTarget
} from './fitness-progression.js';
import { resolveTrackingType } from '../core/exercise-tracking.js';
import { DEFAULT_REST_SEC, buildLoggerSteps } from '../core/workout-plan-groups.js';

const NUMERIC_SET_FIELDS = ['reps', 'weight_kg', 'duration_sec', 'time_cap_sec'];

function isTextTarget(target) {
  const tag = String(target?.tagName ?? '').toLowerCase();
  return tag === 'textarea' || tag === 'select' || (tag === 'input' && target?.type !== 'number')
    || target?.isContentEditable === true;
}

export function createFitnessLoggerController({
  root,
  chatApi,
  voice,
  storage = globalThis.localStorage,
  documentTarget = globalThis.document,
  onSessionWritten,
  isOnline = () => globalThis.navigator?.onLine !== false,
  vibrate = pattern => globalThis.navigator?.vibrate?.(pattern),
  now = () => Date.now(),
  idleMs = AUTOSAVE_IDLE_MS,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
}) {
  if (!root || !chatApi) throw new TypeError('Fitness logger dependencies are unavailable');

  let draft = null;
  let syncedFingerprint = null;
  let timerState = 'idle';
  let accumulatedMs = 0;
  let segmentStartedAt = null;
  let everStarted = false;
  let timerId = null;
  let idleId = null;
  let saving = false;
  let finishing = false;
  let mountedPath = null;
  let saveState = '';

  // Gym-mode state.
  let stepIndex = 0;
  let view = 'gym';
  let panel = null;
  let noteOpen = null;
  let rest = null; // { endsAt, cue }
  let restTimerId = null;
  let lastPerformance = null;
  let lastCircuits = null;
  let motivation = { exerciseBests: null, buildBoard: null, lastSessionVolume: null, libraryByName: null };
  let sessionBests = {};
  let celebration = null; // { kind, title, detail }
  let celebrationTimerId = null;
  let lastReport = null;
  // Tier 2/3 state.
  let readinessOpen = true;
  let twingeOffer = null; // { exerciseIndex, site }
  let ghostsBeatenCount = 0;
  let prsToday = 0;
  let restCount = 0;
  const circuits = new Map(); // blockIndex → { accumulatedMs, startedAt }
  let layout = { blocks: [], steps: [] };

  function elapsedMs() {
    if (timerState === 'running' && segmentStartedAt != null) {
      return accumulatedMs + Math.max(0, now() - segmentStartedAt);
    }
    return accumulatedMs;
  }

  function getTimerState() {
    return {
      state: timerState,
      elapsedMs: elapsedMs(),
      everStarted,
      completeVisible: everStarted && (timerState === 'running' || timerState === 'paused' || timerState === 'completed')
    };
  }

  function restSnapshot() {
    if (!rest) return null;
    return { remainingMs: Math.max(0, rest.endsAt - now()), cue: rest.cue, label: rest.label, win: rest.win };
  }

  function circuitElapsed(blockIndex) {
    const clock = circuits.get(blockIndex);
    if (!clock) return 0;
    return clock.accumulatedMs + (clock.startedAt != null ? Math.max(0, now() - clock.startedAt) : 0);
  }

  function currentCircuitClock() {
    const step = layout.steps[stepIndex];
    const block = step ? layout.blocks[step.blockIndex] : null;
    if (block?.kind !== 'circuit') return null;
    const elapsed = circuitElapsed(step.blockIndex);
    if (block.format === 'amrap' && block.timeCapSec) return Math.max(0, block.timeCapSec * 1000 - elapsed);
    return elapsed;
  }

  function setSaveState(text) {
    saveState = text;
    updateLoggerChrome(root, { saveState, timer: getTimerState() });
  }

  function refreshChrome() {
    updateLoggerChrome(root, {
      elapsedMs: elapsedMs(),
      saveState,
      timer: getTimerState(),
      rest: restSnapshot(),
      circuitClock: currentCircuitClock()
    });
  }

  function tick() {
    if (timerState !== 'running') return;
    refreshChrome();
  }

  function stopInterval() {
    if (timerId != null) {
      clearIntervalImpl(timerId);
      timerId = null;
    }
  }

  function ensureInterval() {
    if (timerId != null) return;
    timerId = setIntervalImpl(tick, 1000);
  }

  function clearIdle() {
    if (idleId != null) {
      clearTimeoutImpl(idleId);
      idleId = null;
    }
  }

  function persistLocal() {
    if (!draft) return;
    saveDraft(storage, draft);
  }

  function scheduleAutosave() {
    clearIdle();
    if (!draft || finishing) return;
    idleId = setTimeoutImpl(() => {
      idleId = null;
      void flushAutosave();
    }, idleMs);
  }

  function relayout() {
    layout = draft ? buildLoggerSteps(draft.exercises ?? []) : { blocks: [], steps: [] };
    stepIndex = Math.min(Math.max(0, stepIndex), Math.max(0, layout.steps.length - 1));
  }

  function touchDraft({ rerenderAfter = false } = {}) {
    persistLocal();
    setSaveState('Unsaved edits');
    if (rerenderAfter) rerender();
    scheduleAutosave();
  }

  /** Progress ticks only — no autosave round trip for a tick. */
  function touchProgress() {
    persistLocal();
    rerender();
  }

  // ── Rest timer ─────────────────────────────────────────────────────────

  function stopRestInterval() {
    if (restTimerId != null) {
      clearIntervalImpl(restTimerId);
      restTimerId = null;
    }
  }

  function restTick() {
    if (!rest) {
      stopRestInterval();
      return;
    }
    if (now() >= rest.endsAt) {
      rest = null;
      stopRestInterval();
      vibrate([180, 90, 180]);
      rerender();
      return;
    }
    refreshChrome();
  }

  function pickRestWin(exercise) {
    const wins = restWins({
      exercise,
      bests: motivation.exerciseBests,
      buildBoard: motivation.buildBoard && draft ? projectBuildBoard(motivation.buildBoard, draft, motivation.libraryByName) : null,
      weekStreak: motivation.weekStreak,
      ghostsBeaten: ghostsBeatenCount,
      prsToday
    });
    if (!wins.length) return null;
    const win = wins[restCount % wins.length];
    restCount += 1;
    return win;
  }

  function startRest(seconds, { cue = null, label = 'Rest', exercise = null } = {}) {
    if (!(seconds > 0)) return;
    rest = { endsAt: now() + seconds * 1000, cue, label, win: pickRestWin(exercise) };
    stopRestInterval();
    restTimerId = setIntervalImpl(restTick, 1000);
  }

  function clearRest() {
    rest = null;
    stopRestInterval();
  }

  function adjustRest(deltaSec) {
    if (!rest) return;
    rest.endsAt = Math.max(now(), rest.endsAt + deltaSec * 1000);
    if (rest.endsAt <= now()) clearRest();
    rerender();
  }

  function restSecondsFor(step) {
    const block = layout.blocks[step.blockIndex];
    const exercise = draft.exercises?.[step.members[0].exerciseIndex];
    return block?.restSec
      ?? (Number(exercise?.rest_sec) > 0 ? Number(exercise.rest_sec) : null)
      ?? (block?.kind === 'circuit' ? 60 : DEFAULT_REST_SEC);
  }

  // ── Circuit clock ──────────────────────────────────────────────────────

  function blockOwner(block) {
    const index = block?.indexes?.[0];
    return index != null ? draft.exercises?.[index] : null;
  }

  function writeCircuitResult(blockIndex) {
    const block = layout.blocks[blockIndex];
    const owner = blockOwner(block);
    if (!owner) return;
    const roundsDone = layout.steps
      .filter(step => step.blockIndex === blockIndex && stepDone(step))
      .length;
    const timeSec = Math.round(circuitElapsed(blockIndex) / 1000);
    owner.block = { kind: 'circuit', ...(owner.block ?? {}) };
    owner.block.result = {
      ...(owner.block.result ?? {}),
      rounds: roundsDone,
      ...(timeSec > 0 ? { time_sec: timeSec } : {})
    };
    // Layout blocks snapshot result at relayout — keep the live score/ghost in sync.
    block.result = owner.block.result;
  }

  function toggleCircuitClock(block) {
    const blockIndex = layout.blocks.indexOf(block);
    if (blockIndex < 0) return;
    const clock = circuits.get(blockIndex) ?? { accumulatedMs: 0, startedAt: null };
    if (clock.startedAt != null) {
      clock.accumulatedMs += Math.max(0, now() - clock.startedAt);
      clock.startedAt = null;
    } else {
      clock.startedAt = now();
      if (timerState === 'idle' || timerState === 'paused') startTimer({ quiet: true });
    }
    circuits.set(blockIndex, clock);
    ensureCircuitTicker();
    rerender();
  }

  function stopCircuitClock(blockIndex) {
    const clock = circuits.get(blockIndex);
    if (!clock || clock.startedAt == null) return;
    clock.accumulatedMs += Math.max(0, now() - clock.startedAt);
    clock.startedAt = null;
  }

  let circuitTickerId = null;
  function ensureCircuitTicker() {
    const running = [...circuits.values()].some(clock => clock.startedAt != null);
    if (running && circuitTickerId == null) {
      circuitTickerId = setIntervalImpl(() => {
        const step = layout.steps[stepIndex];
        const block = step ? layout.blocks[step.blockIndex] : null;
        if (block?.format === 'amrap' && block.timeCapSec && circuitElapsed(step.blockIndex) >= block.timeCapSec * 1000) {
          stopCircuitClock(step.blockIndex);
          writeCircuitResult(step.blockIndex);
          vibrate([300, 120, 300]);
          ensureCircuitTicker();
          touchDraft({ rerenderAfter: true });
          return;
        }
        refreshChrome();
      }, 1000);
    } else if (!running && circuitTickerId != null) {
      clearIntervalImpl(circuitTickerId);
      circuitTickerId = null;
    }
  }

  function addRound(block) {
    for (const index of block?.indexes ?? []) {
      if (draft.exercises[index]) draft.exercises[index] = appendSet(draft.exercises[index]);
    }
    relayout();
    touchDraft({ rerenderAfter: true });
  }

  function setCircuitResult(block, field, value) {
    const owner = blockOwner(block);
    if (!owner) return;
    owner.block = { kind: 'circuit', ...(owner.block ?? {}) };
    owner.block.result = { ...(owner.block.result ?? {}), [field]: Math.max(0, Number(value) || 0) };
    block.result = owner.block.result;
    touchDraft();
  }

  // ── Edits ──────────────────────────────────────────────────────────────

  function applyChange(change) {
    if (!draft) return;
    if (change.type === 'notes') {
      draft.notes = change.value;
    } else if (change.type === 'session') {
      if (change.field === 'recovery_flag_next_day') {
        draft.recovery_flag_next_day = Boolean(change.value);
      } else if (change.field === 'day_type') {
        draft.day_type = change.value;
        touchDraft({ rerenderAfter: true });
        return;
      } else if (['avg_hr', 'calories_kcal', 'distance_km', 'duration_min'].includes(change.field)) {
        draft[change.field] = optionalNumber(change.value);
      } else {
        return;
      }
    } else if (change.type === 'bench') {
      const exercise = draft.exercises[change.exerciseIndex];
      if (!exercise) return;
      if (change.value == null) delete exercise.bench_angle_deg;
      else exercise.bench_angle_deg = change.value;
    } else if (change.type === 'intensification') {
      const exercise = draft.exercises[change.exerciseIndex];
      if (!exercise) return;
      if (!change.value) delete exercise.intensification;
      else exercise.intensification = change.value;
      touchDraft({ rerenderAfter: true });
      return;
    } else if (change.type === 'set') {
      setField(change.exerciseIndex, change.setIndex, change.field, change.value);
      return;
    } else if (change.type === 'pain-add') {
      const flag = parsePainFlag(change.site, change.note);
      if (!flag) return;
      draft.pain_flags = [...(draft.pain_flags ?? []), flag];
      touchDraft({ rerenderAfter: true });
      return;
    } else if (change.type === 'pain-remove') {
      draft.pain_flags = (draft.pain_flags ?? []).filter((_, index) => index !== change.index);
      touchDraft({ rerenderAfter: true });
      return;
    } else {
      return;
    }
    touchDraft();
  }

  /**
   * Change one set value. A new kg / reps also carries forward to this move's
   * later, not-yet-done sets that still held the old value — bump the weight
   * once and the rest of the sets follow, but a planned pyramid stays put.
   */
  function setField(exerciseIndex, setIndex, field, value) {
    const exercise = draft?.exercises?.[exerciseIndex];
    const set = exercise?.sets?.[setIndex];
    if (!set) return;
    if (field === 'cable_type') {
      const next = normalizeLoggerCableType(value);
      const previous = set.cable_type;
      set.cable_type = next;
      for (const later of exercise.sets.slice(setIndex + 1)) {
        if (!later.done && later.cable_type === previous) later.cable_type = next;
      }
      touchDraft({ rerenderAfter: true });
      return;
    }
    if (!NUMERIC_SET_FIELDS.includes(field)) return;
    const next = Number.isFinite(value) ? value : 0;
    const previous = set[field];
    set[field] = next;
    if (previous !== next) {
      for (const later of exercise.sets.slice(setIndex + 1)) {
        if (!later.done && later[field] === previous) later[field] = next;
      }
    }
    touchDraft();
  }

  function toggleFailure(exerciseIndex, setIndex) {
    const set = draft?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (!set) return;
    if (set.failed) delete set.failed;
    else set.failed = true;
    touchDraft({ rerenderAfter: true });
  }

  function setNote(exerciseIndex, setIndex, value) {
    const set = draft?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (!set) return;
    const text = String(value ?? '');
    if (text.trim()) set.note = text;
    else delete set.note;
    touchDraft();
  }

  function setExerciseNote(exerciseIndex, value) {
    const exercise = draft?.exercises?.[exerciseIndex];
    if (!exercise) return;
    const text = String(value ?? '');
    if (text.trim()) exercise.notes = text;
    else delete exercise.notes;
    touchDraft();
  }

  function addSet(exerciseIndex) {
    if (!draft?.exercises?.[exerciseIndex]) return;
    const exercise = appendSet(draft.exercises[exerciseIndex]);
    const added = exercise.sets.at(-1);
    delete added.done;
    delete added.failed;
    delete added.note;
    draft.exercises[exerciseIndex] = exercise;
    relayout();
    jumpToSet(exerciseIndex, exercise.sets.length - 1, { render: false });
    touchDraft({ rerenderAfter: true });
  }

  function firstStepFor(exerciseIndex, setIndex = 0) {
    const exact = layout.steps.findIndex(step => step.members.some(member => (
      member.exerciseIndex === exerciseIndex && member.setIndex === setIndex
    )));
    if (exact >= 0) return exact;
    return layout.steps.findIndex(step => step.members.some(member => member.exerciseIndex === exerciseIndex));
  }

  function addExercise(name) {
    if (!draft) return;
    const exercise = createExercise(name);
    if (!exercise) return;
    draft.exercises = [...(draft.exercises ?? []), exercise];
    relayout();
    const target = firstStepFor(draft.exercises.length - 1);
    if (target >= 0) stepIndex = target;
    panel = null;
    touchDraft({ rerenderAfter: true });
  }

  function reorderExercise(fromIndex, toIndex) {
    if (!draft) return;
    const next = moveExercise(draft.exercises, fromIndex, toIndex);
    if (next === draft.exercises) return;
    const current = currentMember();
    draft.exercises = next;
    relayout();
    if (current) {
      let exerciseIndex = current.exerciseIndex;
      if (exerciseIndex === fromIndex) exerciseIndex = toIndex;
      else if (fromIndex < exerciseIndex && toIndex >= exerciseIndex) exerciseIndex -= 1;
      else if (fromIndex > exerciseIndex && toIndex <= exerciseIndex) exerciseIndex += 1;
      const target = firstStepFor(exerciseIndex, current.setIndex);
      if (target >= 0) stepIndex = target;
    }
    touchDraft({ rerenderAfter: true });
  }

  function removeExercise(removeIndex) {
    if (!draft?.exercises?.[removeIndex]) return;
    const current = currentMember();
    draft.exercises = draft.exercises.filter((_, index) => index !== removeIndex);
    relayout();
    if (current) {
      let exerciseIndex = current.exerciseIndex;
      if (exerciseIndex === removeIndex) exerciseIndex = Math.max(0, removeIndex - 1);
      else if (exerciseIndex > removeIndex) exerciseIndex -= 1;
      const target = firstStepFor(exerciseIndex, exerciseIndex === current.exerciseIndex ? current.setIndex : 0);
      stepIndex = target >= 0 ? target : 0;
    }
    touchDraft({ rerenderAfter: true });
  }

  // ── Ghosts, PRs, targets ───────────────────────────────────────────────

  function previousFor(exercise) {
    return lastPerformance?.[exerciseKey(exercise?.name)] ?? null;
  }

  function celebrate(next) {
    celebration = next;
    if (celebrationTimerId != null) clearTimeoutImpl(celebrationTimerId);
    celebrationTimerId = setTimeoutImpl(() => {
      celebrationTimerId = null;
      celebration = null;
      rerender();
    }, 4000);
  }

  /** Race each ticked set against its ghost and the all-time best. */
  function judgeStep(step) {
    let headline = null;
    for (const { exerciseIndex, setIndex } of step.members) {
      const exercise = draft.exercises?.[exerciseIndex];
      const set = exercise?.sets?.[setIndex];
      if (!set) continue;
      const tracking = resolveTrackingType(exercise);
      const key = exerciseKey(exercise.name);
      const best = sessionBests[key];
      const pr = detectPersonalBest(set, best, tracking);
      if (pr) {
        const kg = Number(set.weight_kg) || 0;
        const reps = Number(set.reps) || 0;
        sessionBests[key] = {
          ...(best ?? {}),
          maxKg: Math.max(best?.maxKg ?? 0, kg),
          maxE1rm: Math.max(best?.maxE1rm ?? 0, kg * (1 + reps / 30)),
          maxReps: Math.max(best?.maxReps ?? 0, reps),
          maxSec: Math.max(best?.maxSec ?? 0, Number(set.duration_sec) || 0)
        };
        headline = { kind: 'pr', title: 'PERSONAL BEST', detail: `${exercise.name} — ${pr.label}`, exerciseIndex };
        continue;
      }
      const result = compareToGhost(set, ghostForSet(previousFor(exercise), setIndex), tracking);
      if (result?.verdict === 'beat' && headline?.kind !== 'pr') {
        headline = { kind: 'beat', title: 'GHOST BEATEN', detail: `${exercise.name} · ${result.label} on last time`, exerciseIndex };
      } else if (result?.verdict === 'matched' && !headline) {
        headline = { kind: 'matched', title: 'Matched your ghost', detail: `${exercise.name} — next time, one more`, exerciseIndex };
      }
    }
    if (!headline) return;
    if (headline.kind === 'pr') prsToday += 1;
    if (headline.kind === 'beat') ghostsBeatenCount += 1;
    celebrate(headline);
    if (headline.kind === 'pr') vibrate([60, 40, 60, 40, 220]);
    else if (headline.kind === 'beat') vibrate([40, 30, 90]);
  }

  /**
   * The auto-target belongs on the working (top-weight) sets only — a pyramid's
   * 30 kg opener is not where 38 kg × 9 goes. Without a set index, any set.
   */
  function targetFor(exerciseIndex, setIndex = null) {
    const exercise = draft?.exercises?.[exerciseIndex];
    if (!exercise) return null;
    if (setIndex != null && resolveTrackingType(exercise) === 'weighted') {
      const top = Math.max(0, ...(exercise.sets ?? []).map(set => Number(set?.weight_kg) || 0));
      if ((Number(exercise.sets?.[setIndex]?.weight_kg) || 0) < top) return null;
    }
    return suggestTarget(previousFor(exercise), exercise);
  }

  /** One tap: put the auto-target on this set (later matching sets follow). */
  function applyTarget(exerciseIndex, setIndex) {
    const target = targetFor(exerciseIndex, setIndex);
    const set = draft?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (!target || !set) return;
    if (resolveTrackingType(draft.exercises[exerciseIndex]) === 'weighted') {
      setField(exerciseIndex, setIndex, 'weight_kg', target.weight_kg);
    }
    setField(exerciseIndex, setIndex, 'reps', target.reps);
    rerender();
  }

  // ── Readiness, twinges, AEKE stats ─────────────────────────────────────

  function setReadiness(field, value) {
    if (!draft) return;
    draft.readiness = { ...(draft.readiness ?? {}), [field]: value };
    delete draft.readiness.adjusted;
    touchDraft({ rerenderAfter: true });
  }

  /** Commit the check-in; a flat day drops not-done weighted loads ~10%. */
  function applyReadiness() {
    if (!draft) return;
    const advice = readinessAdvice(draft.readiness);
    if (!advice) return;
    if (advice.adjusted === 'lighter') {
      for (const exercise of draft.exercises ?? []) {
        if (resolveTrackingType(exercise) !== 'weighted') continue;
        for (const set of exercise.sets ?? []) {
          if (!set.done) set.weight_kg = lighterLoad(set.weight_kg);
        }
      }
    }
    draft.readiness = { ...draft.readiness, adjusted: advice.adjusted };
    readinessOpen = false;
    touchDraft({ rerenderAfter: true });
  }

  function skipReadiness() {
    readinessOpen = false;
    rerender();
  }

  /** Twinge: pain flag for Sara + a note on the set, then offer to lighten the move. */
  function twinge(exerciseIndex, setIndex, site) {
    const exercise = draft?.exercises?.[exerciseIndex];
    if (!exercise || !site) return;
    const where = setIndex >= 0 ? `${exercise.name}, set ${setIndex + 1}` : exercise.name;
    const already = (draft.pain_flags ?? []).some(flag => flag?.site === site && String(flag?.note ?? '').includes(exercise.name));
    if (!already) draft.pain_flags = [...(draft.pain_flags ?? []), { site, note: `twinge on ${where}` }];
    const set = exercise.sets?.[setIndex];
    if (set) {
      const tag = `twinge: ${site.toLowerCase()}`;
      set.note = set.note ? (set.note.includes(tag) ? set.note : `${set.note}; ${tag}`) : tag;
    }
    noteOpen = null;
    twingeOffer = { exerciseIndex, site };
    touchDraft({ rerenderAfter: true });
  }

  function lightenRemaining(exerciseIndex) {
    const exercise = draft?.exercises?.[exerciseIndex];
    if (!exercise) return;
    for (const set of exercise.sets ?? []) {
      if (set.done) continue;
      set.weight_kg = Math.max(0, Math.round((Number(set.weight_kg) || 0) * 0.8 * 2) / 2);
    }
    exercise.notes = exercise.notes
      ? `${exercise.notes}; lightened after a twinge`
      : 'lightened after a twinge — swap the pattern next time';
    twingeOffer = null;
    touchDraft({ rerenderAfter: true });
  }

  function dismissTwinge() {
    twingeOffer = null;
    rerender();
  }

  function setAeke(field, value) {
    if (!draft) return;
    const next = { ...(draft.aeke ?? {}) };
    if (field === 'strength_region') {
      const text = String(value ?? '').trim();
      if (text) next.strength_region = text;
      else delete next.strength_region;
    } else {
      const number = optionalNumber(value);
      if (number == null) delete next[field];
      else next[field] = number;
    }
    draft.aeke = next;
    touchDraft();
  }

  const TREAT_KEY = 'life-hub:gym-treat';
  function readTreat() {
    try {
      return storage?.getItem?.(TREAT_KEY) ?? '';
    } catch {
      return '';
    }
  }
  function setTreat(value) {
    try {
      storage?.setItem?.(TREAT_KEY, String(value ?? '').slice(0, 120));
    } catch {
      // Per-device convenience only.
    }
  }

  // ── Navigation & progress ──────────────────────────────────────────────

  function currentMember() {
    return layout.steps[stepIndex]?.members?.[0] ?? null;
  }

  function stepDone(step) {
    return step.members.every(({ exerciseIndex, setIndex }) => (
      setIndex >= 0 && draft?.exercises?.[exerciseIndex]?.sets?.[setIndex]?.done === true
    ));
  }

  function go(next) {
    if (!draft) return;
    const clamped = Math.min(Math.max(0, next), Math.max(0, layout.steps.length - 1));
    if (clamped === stepIndex) return;
    stepIndex = clamped;
    noteOpen = null;
    rerender();
  }

  function jumpToSet(exerciseIndex, setIndex, { render = true } = {}) {
    const target = firstStepFor(exerciseIndex, setIndex);
    if (target < 0) return;
    stepIndex = target;
    noteOpen = null;
    if (render) rerender();
  }

  function nextOpenStep(from) {
    for (let index = from + 1; index < layout.steps.length; index += 1) {
      if (!stepDone(layout.steps[index])) return index;
    }
    for (let index = 0; index < from; index += 1) {
      if (!stepDone(layout.steps[index])) return index;
    }
    return Math.min(from + 1, layout.steps.length - 1);
  }

  function doneStep() {
    if (!draft) return;
    const step = layout.steps[stepIndex];
    if (!step || step.members.every(member => member.setIndex < 0)) return;
    for (const { exerciseIndex, setIndex } of step.members) {
      const set = draft.exercises?.[exerciseIndex]?.sets?.[setIndex];
      if (set) set.done = true;
    }
    judgeStep(step);
    if (!everStarted || timerState === 'paused') startTimer({ quiet: true });

    const block = layout.blocks[step.blockIndex];
    const blockSteps = layout.steps.filter(item => item.blockIndex === step.blockIndex);
    const blockFinished = blockSteps.every(stepDone);
    if (block?.kind === 'circuit') {
      if (blockFinished && block.format !== 'amrap') stopCircuitClock(step.blockIndex);
      writeCircuitResult(step.blockIndex);
      ensureCircuitTicker();
    }

    const finishedAll = layout.steps.every(stepDone);
    if (finishedAll) clearRest();
    if (step.restAfter && !finishedAll && !(block?.kind === 'circuit' && block.format !== 'rounds' && !blockFinished)) {
      const exercise = draft.exercises?.[step.members[0].exerciseIndex];
      const blockCue = block?.exercises?.find(item => item?.coach_cues?.rest)?.coach_cues?.rest;
      startRest(restSecondsFor(step), {
        cue: exercise?.coach_cues?.rest ?? blockCue ?? null,
        label: block?.kind === 'circuit' ? 'Rest — round done' : (block?.kind === 'superset' ? 'Rest — round done' : 'Rest'),
        exercise
      });
    } else if (!step.restAfter) {
      clearRest();
    }
    stepIndex = nextOpenStep(stepIndex);
    noteOpen = null;
    persistLocal();
    setSaveState('Unsaved edits');
    scheduleAutosave();
    rerender();
  }

  function undoStep() {
    const step = layout.steps[stepIndex];
    if (!step) return;
    for (const { exerciseIndex, setIndex } of step.members) {
      const set = draft.exercises?.[exerciseIndex]?.sets?.[setIndex];
      if (set) delete set.done;
    }
    clearRest();
    touchProgress();
  }

  // ── Session clock ──────────────────────────────────────────────────────

  function captureRunningSegment() {
    if (timerState !== 'running' || segmentStartedAt == null) return;
    accumulatedMs += Math.max(0, now() - segmentStartedAt);
    segmentStartedAt = null;
  }

  function startTimer({ quiet = false } = {}) {
    if (!draft) return;
    if (timerState !== 'idle' && timerState !== 'paused') return;
    everStarted = true;
    timerState = 'running';
    segmentStartedAt = now();
    ensureInterval();
    if (!quiet) rerender();
  }

  function pauseTimer() {
    if (!draft || timerState !== 'running') return;
    captureRunningSegment();
    timerState = 'paused';
    stopInterval();
    rerender();
  }

  function completeTimer() {
    if (!draft || !everStarted) return;
    if (timerState === 'completed') return;
    if (timerState === 'running') captureRunningSegment();
    timerState = 'completed';
    stopInterval();
    rerender();
  }

  function undoCompleteTimer() {
    if (!draft || timerState !== 'completed') return;
    timerState = 'paused';
    segmentStartedAt = null;
    stopInterval();
    rerender();
  }

  function resetTimer() {
    stopInterval();
    timerState = 'idle';
    accumulatedMs = 0;
    segmentStartedAt = null;
    everStarted = false;
  }

  // ── Keyboard (desktop) ─────────────────────────────────────────────────

  function onKeydown(event) {
    if (!draft || view !== 'gym') return;
    const target = event.target;
    if (event.key === 'Escape') {
      // I8: Escape while typing leaves the field, it never closes the workout.
      if (isTextTarget(target) || String(target?.tagName ?? '').toLowerCase() === 'input') {
        target?.blur?.();
        return;
      }
      event.preventDefault?.();
      if (panel) setPanel(null);
      else if (noteOpen) toggleNote(noteOpen);
      else minimise();
      return;
    }
    if (isTextTarget(target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (panel) return;
    const inNumber = String(target?.tagName ?? '').toLowerCase() === 'input';
    if (event.key === 'Enter') {
      if (String(target?.tagName ?? '').toLowerCase() === 'button') return;
      event.preventDefault?.();
      target?.blur?.();
      if (stepDone(layout.steps[stepIndex] ?? { members: [] })) go(stepIndex + 1);
      else doneStep();
      return;
    }
    if (inNumber) return;
    if (event.key === 'ArrowRight' || event.key === 'j') {
      event.preventDefault?.();
      go(stepIndex + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'k') {
      event.preventDefault?.();
      go(stepIndex - 1);
    } else if (event.key === 'f') {
      const member = currentMember();
      if (member && layout.steps[stepIndex]?.kind !== 'round') toggleFailure(member.exerciseIndex, member.setIndex);
    } else if (event.key === 'n') {
      event.preventDefault?.();
      toggleNote('set');
    } else if (event.key === 'p') {
      setPanel(panel === 'plan' ? null : 'plan');
    }
  }

  // ── View state ─────────────────────────────────────────────────────────

  function setPanel(next) {
    panel = next;
    rerender();
  }

  function toggleNote(kind) {
    noteOpen = noteOpen === kind ? null : kind;
    rerender();
  }

  function minimise() {
    view = 'docked';
    panel = null;
    rerender();
  }

  function openGym() {
    view = 'gym';
    rerender();
  }

  const actions = {
    go,
    doneStep,
    undoStep,
    jumpToSet,
    setField,
    toggleFailure,
    setNote,
    setExerciseNote,
    toggleNote,
    addSet,
    addExercise,
    moveExercise: reorderExercise,
    removeExercise,
    change: applyChange,
    setPanel,
    minimise,
    openGym,
    adjustRest,
    skipRest: () => {
      clearRest();
      rerender();
    },
    toggleCircuitClock,
    addRound,
    applyTarget,
    setCircuitResult,
    setReadiness,
    applyReadiness,
    skipReadiness,
    twinge,
    lightenRemaining,
    dismissTwinge,
    setAeke,
    setTreat,
    finish: () => void finish().catch(() => {}),
    start: () => startTimer(),
    pause: pauseTimer,
    complete: completeTimer,
    undoComplete: undoCompleteTimer
  };

  function rerender() {
    if (!draft) return;
    relayout();
    const circuitState = {};
    layout.blocks.forEach((block, index) => {
      if (block.kind !== 'circuit') return;
      const clock = circuits.get(index);
      circuitState[index] = { elapsedMs: circuitElapsed(index), running: clock?.startedAt != null };
    });
    renderFitnessLogger(root, draft, {
      elapsedMs: elapsedMs(),
      saveState,
      timer: getTimerState(),
      view,
      steps: layout.steps,
      blocks: layout.blocks,
      stepIndex,
      panel,
      noteOpen,
      rest: restSnapshot(),
      circuits: circuitState,
      lastPerformance,
      lastCircuits,
      celebration,
      targetFor,
      readinessOpen: readinessOpen && !draft.readiness?.adjusted && !layout.steps.some(stepDone),
      lastPainFlags: motivation.lastPainFlags,
      twingeOffer,
      treat: readTreat(),
      libraryByName: motivation.libraryByName,
      boardRows: motivation.buildBoard ? projectBuildBoard(motivation.buildBoard, draft, motivation.libraryByName) : null,
      actions
    });
  }

  async function flushAutosave() {
    if (!draft || saving || finishing) return;
    const fingerprint = draftFingerprint(draft);
    if (fingerprint === syncedFingerprint) {
      setSaveState('Saved');
      return;
    }
    if (!isOnline()) {
      setSaveState('Offline — edits kept on this device');
      return;
    }
    saving = true;
    setSaveState('Saving…');
    try {
      const payload = toConfirmPayload(draft, { status: 'planned' });
      await chatApi.confirm(payload);
      syncedFingerprint = fingerprint;
      persistLocal();
      setSaveState('Saved');
    } catch {
      setSaveState('Couldn’t save — will retry');
    } finally {
      saving = false;
    }
  }

  /** An AMRAP plans more rounds than you'll play; unplayed rounds don't get logged. */
  function trimUnplayedAmrapRounds() {
    for (const block of layout.blocks) {
      if (block.kind !== 'circuit' || block.format !== 'amrap') continue;
      const played = layout.steps.filter(step => step.blockIndex === layout.blocks.indexOf(block) && stepDone(step)).length;
      if (!played) continue;
      for (const index of block.indexes) {
        const exercise = draft.exercises[index];
        if (exercise?.sets?.length > played) exercise.sets = exercise.sets.slice(0, played);
      }
    }
  }

  async function finish() {
    if (!draft || finishing) return;
    finishing = true;
    clearIdle();
    clearRest();
    if (timerState === 'running') captureRunningSegment();
    stopInterval();
    layout.blocks.forEach((block, index) => {
      if (block.kind !== 'circuit' || !circuits.has(index)) return;
      stopCircuitClock(index);
      writeCircuitResult(index);
    });
    trimUnplayedAmrapRounds();
    const mins = Math.round(elapsedMs() / 60_000);
    if (mins > 0 && draft.duration_min == null) draft.duration_min = mins;
    setSaveState('Finishing…');
    const finishButtons = typeof root.querySelectorAll === 'function'
      ? [...root.querySelectorAll('[data-fitness-logger="finish"], [data-fitness-logger="finish-sheet"]')]
      : [root.querySelector('[data-fitness-logger="finish"]')].filter(Boolean);
    for (const node of finishButtons) node.disabled = true;
    try {
      if (!isOnline()) throw Object.assign(new Error('offline'), { code: 'offline' });
      const payload = toConfirmPayload(draft, { status: 'completed' });
      const result = await chatApi.confirm(payload);
      const report = buildPumpReport(draft, {
        lastPerformance,
        lastCircuits,
        exerciseBests: motivation.exerciseBests,
        board: motivation.buildBoard,
        libraryByName: motivation.libraryByName,
        previousVolume: motivation.lastSessionVolume,
        elapsedMs: elapsedMs(),
        weekStreak: motivation.weekStreak
      });
      clearDraft(storage, draft.date, draft.path);
      unmount();
      lastReport = report;
      renderPumpReport(root, report, { onClose: () => renderPumpReport(root, null) });
      onSessionWritten?.(result);
      return result;
    } catch (error) {
      finishing = false;
      for (const node of finishButtons) node.disabled = false;
      setSaveState(error?.code === 'offline'
        ? 'Connect to finish the session'
        : 'Finish failed — try again');
      throw error;
    }
  }

  function onVisibility() {
    if (documentTarget?.visibilityState === 'hidden') void flushAutosave();
  }

  function unmount({ keepVoice = false } = {}) {
    clearIdle();
    if (celebrationTimerId != null) clearTimeoutImpl(celebrationTimerId);
    celebrationTimerId = null;
    celebration = null;
    readinessOpen = true;
    twingeOffer = null;
    ghostsBeatenCount = 0;
    prsToday = 0;
    restCount = 0;
    resetTimer();
    clearRest();
    circuits.clear();
    ensureCircuitTicker();
    documentTarget?.removeEventListener?.('visibilitychange', onVisibility);
    documentTarget?.removeEventListener?.('keydown', onKeydown);
    hideFitnessLogger(root);
    draft = null;
    mountedPath = null;
    stepIndex = 0;
    view = 'gym';
    panel = null;
    noteOpen = null;
    layout = { blocks: [], steps: [] };
    saving = false;
    finishing = false;
    saveState = '';
    syncedFingerprint = null;
    if (!keepVoice) voice?.hide?.();
  }

  function mount(session, {
    lastPerformance: previous = null,
    lastCircuits: previousCircuits = null,
    exerciseBests = null,
    buildBoard = null,
    lastSessionVolume = null,
    libraryByName = null,
    weekStreak = null,
    lastPainFlags = null
  } = {}) {
    if (!session || session.status !== 'planned') {
      unmount();
      return;
    }
    if (previous) lastPerformance = previous;
    if (previousCircuits) lastCircuits = previousCircuits;
    if (exerciseBests || buildBoard || weekStreak) {
      motivation = { exerciseBests, buildBoard, lastSessionVolume, libraryByName, weekStreak, lastPainFlags };
    }

    const nextDraft = resolveDraft(session, storage);
    const sameSession = mountedPath && nextDraft.path && mountedPath === nextDraft.path && draft;

    if (sameSession) {
      refreshChrome();
      return;
    }

    unmount({ keepVoice: true });
    if (previous) lastPerformance = previous;
    if (previousCircuits) lastCircuits = previousCircuits;
    sessionBests = Object.fromEntries(Object.entries(motivation.exerciseBests ?? {}).map(([key, value]) => [key, { ...value }]));
    draft = nextDraft;
    mountedPath = draft.path;
    syncedFingerprint = draftFingerprint(cloneLoggerDraft(session));
    if (draftFingerprint(draft) !== syncedFingerprint) setSaveState('Unsaved edits');
    else setSaveState('');
    relayout();
    // Resume where you left off: the first set not yet ticked.
    const firstOpen = layout.steps.findIndex(step => !stepDone(step));
    stepIndex = firstOpen >= 0 ? firstOpen : 0;
    documentTarget?.addEventListener?.('visibilitychange', onVisibility);
    documentTarget?.addEventListener?.('keydown', onKeydown);
    rerender();
    void voice?.prepare?.(draft);
  }

  function destroy() {
    unmount();
  }

  return {
    mount,
    unmount,
    destroy,
    flushAutosave,
    finish,
    getDraft: () => draft,
    getExerciseIndex: () => currentMember()?.exerciseIndex ?? 0,
    getStepIndex: () => stepIndex,
    getSteps: () => layout.steps,
    getView: () => view,
    getRest: restSnapshot,
    getCelebration: () => celebration,
    getLastReport: () => lastReport,
    applyTarget,
    getTarget: targetFor,
    setReadiness,
    applyReadiness,
    twinge,
    lightenRemaining,
    setAeke,
    getTimerState,
    startTimer: () => startTimer(),
    pauseTimer,
    completeTimer,
    undoCompleteTimer,
    addExercise,
    reorderExercise,
    removeExercise,
    doneStep,
    undoStep,
    go,
    jumpToSet,
    setField,
    toggleFailure,
    setNote,
    setExerciseNote,
    minimise,
    openGym,
    handleKeydown: onKeydown,
    prepareVoice: session => voice?.prepare?.(session)
  };
}

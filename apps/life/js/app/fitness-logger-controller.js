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
import { closeActiveMorphingDialog } from '../../../../packages/design-kit/js/morphing-dialog.js';
import { collapseExerciseEditor, hideFitnessLogger, renderFitnessLogger, updateLoggerChrome } from './render-fitness-logger.js';

export function createFitnessLoggerController({
  root,
  chatApi,
  storage = globalThis.localStorage,
  documentTarget = globalThis.document,
  onSessionWritten,
  isOnline = () => globalThis.navigator?.onLine !== false,
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
  let exerciseIndex = 0;
  let expandedExerciseIndex = null;

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

  function setSaveState(text) {
    saveState = text;
    updateLoggerChrome(root, { saveState, timer: getTimerState() });
  }

  function refreshChrome() {
    updateLoggerChrome(root, {
      elapsedMs: elapsedMs(),
      saveState,
      timer: getTimerState()
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

  function touchDraft({ rerenderAfter = false } = {}) {
    persistLocal();
    setSaveState('Unsaved edits');
    if (rerenderAfter) rerender();
    scheduleAutosave();
  }

  function applyChange(change) {
    if (!draft) return;
    if (change.type === 'notes') {
      draft.notes = change.value;
    } else if (change.type === 'session') {
      if (change.field === 'recovery_flag_next_day') {
        draft.recovery_flag_next_day = Boolean(change.value);
      } else if (change.field === 'day_type') {
        draft.day_type = change.value;
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
    } else if (change.type === 'set') {
      const set = draft.exercises[change.exerciseIndex]?.sets?.[change.setIndex];
      if (!set) return;
      if (change.field === 'cable_type') set.cable_type = normalizeLoggerCableType(change.value);
      else set[change.field] = Number.isFinite(change.value) ? change.value : 0;
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

  function addSet(exerciseIndex) {
    if (!draft?.exercises?.[exerciseIndex]) return;
    draft.exercises[exerciseIndex] = appendSet(draft.exercises[exerciseIndex]);
    touchDraft({ rerenderAfter: true });
  }

  function addExercise(name) {
    if (!draft) return;
    const exercise = createExercise(name);
    if (!exercise) return;
    draft.exercises = [...(draft.exercises ?? []), exercise];
    exerciseIndex = draft.exercises.length - 1;
    expandedExerciseIndex = exerciseIndex;
    touchDraft({ rerenderAfter: true });
  }

  function reorderExercise(fromIndex, toIndex) {
    if (!draft) return;
    const next = moveExercise(draft.exercises, fromIndex, toIndex);
    if (next === draft.exercises) return;
    draft.exercises = next;
    if (exerciseIndex === fromIndex) exerciseIndex = toIndex;
    else if (fromIndex < exerciseIndex && toIndex >= exerciseIndex) exerciseIndex -= 1;
    else if (fromIndex > exerciseIndex && toIndex <= exerciseIndex) exerciseIndex += 1;
    touchDraft({ rerenderAfter: true });
  }

  function removeExercise(removeIndex) {
    if (!draft?.exercises?.[removeIndex]) return;
    draft.exercises = draft.exercises.filter((_, index) => index !== removeIndex);
    if (removeIndex <= exerciseIndex) exerciseIndex = Math.max(0, exerciseIndex - 1);
    if (expandedExerciseIndex === removeIndex) expandedExerciseIndex = null;
    else if (expandedExerciseIndex != null && removeIndex < expandedExerciseIndex) {
      expandedExerciseIndex -= 1;
    }
    touchDraft({ rerenderAfter: true });
  }

  function captureRunningSegment() {
    if (timerState !== 'running' || segmentStartedAt == null) return;
    accumulatedMs += Math.max(0, now() - segmentStartedAt);
    segmentStartedAt = null;
  }

  function startTimer() {
    if (!draft) return;
    if (timerState !== 'idle' && timerState !== 'paused') return;
    everStarted = true;
    timerState = 'running';
    segmentStartedAt = now();
    ensureInterval();
    rerender();
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

  function rerender() {
    if (!draft) return;
    renderFitnessLogger(root, draft, {
      elapsedMs: elapsedMs(),
      saveState,
      timer: getTimerState(),
      exerciseIndex,
      expandedExerciseIndex,
      onChange: applyChange,
      onAddSet: addSet,
      onAddExercise: addExercise,
      onMoveExercise: reorderExercise,
      onRemoveExercise: removeExercise,
      onExerciseIndexChange: next => {
        const clamped = Math.min(Math.max(0, next), Math.max(0, (draft?.exercises?.length ?? 1) - 1));
        const changed = clamped !== exerciseIndex;
        exerciseIndex = clamped;
        if (changed && expandedExerciseIndex != null) {
          expandedExerciseIndex = null;
          collapseExerciseEditor(root);
        }
      },
      onExpandExercise: next => {
        exerciseIndex = Math.min(Math.max(0, next), Math.max(0, (draft?.exercises?.length ?? 1) - 1));
        expandedExerciseIndex = exerciseIndex;
        rerender();
      },
      onCollapseExercise: () => {
        if (expandedExerciseIndex == null) return;
        expandedExerciseIndex = null;
        collapseExerciseEditor(root);
      },
      onFinish: () => void finish(),
      onStart: startTimer,
      onPause: pauseTimer,
      onComplete: completeTimer,
      onUndoComplete: undoCompleteTimer
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

  async function finish() {
    if (!draft || finishing) return;
    finishing = true;
    clearIdle();
    if (timerState === 'running') captureRunningSegment();
    stopInterval();
    const mins = Math.round(elapsedMs() / 60_000);
    if (mins > 0 && draft.duration_min == null) draft.duration_min = mins;
    setSaveState('Finishing…');
    const finishButton = root.querySelector('[data-fitness-logger="finish"]');
    if (finishButton) finishButton.disabled = true;
    try {
      if (!isOnline()) throw Object.assign(new Error('offline'), { code: 'offline' });
      const payload = toConfirmPayload(draft, { status: 'completed' });
      const result = await chatApi.confirm(payload);
      clearDraft(storage, draft.date, draft.path);
      unmount();
      onSessionWritten?.(result);
      return result;
    } catch (error) {
      finishing = false;
      if (finishButton) finishButton.disabled = false;
      setSaveState(error?.code === 'offline'
        ? 'Connect to finish the session'
        : 'Finish failed — try again');
      throw error;
    }
  }

  function onVisibility() {
    if (documentTarget?.visibilityState === 'hidden') void flushAutosave();
  }

  function unmount() {
    clearIdle();
    resetTimer();
    documentTarget?.removeEventListener?.('visibilitychange', onVisibility);
    hideFitnessLogger(root);
    draft = null;
    mountedPath = null;
    exerciseIndex = 0;
    expandedExerciseIndex = null;
    saving = false;
    finishing = false;
    saveState = '';
    syncedFingerprint = null;
  }

  function mount(session) {
    if (!session || session.status !== 'planned') {
      unmount();
      return;
    }

    const nextDraft = resolveDraft(session, storage);
    const sameSession = mountedPath && nextDraft.path && mountedPath === nextDraft.path && draft;

    if (sameSession) {
      refreshChrome();
      return;
    }

    unmount();
    draft = nextDraft;
    mountedPath = draft.path;
    syncedFingerprint = draftFingerprint(cloneLoggerDraft(session));
    if (draftFingerprint(draft) !== syncedFingerprint) setSaveState('Unsaved edits');
    else setSaveState('');
    documentTarget?.addEventListener?.('visibilitychange', onVisibility);
    rerender();
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
    getExerciseIndex: () => exerciseIndex,
    getExpandedExerciseIndex: () => expandedExerciseIndex,
    getTimerState,
    startTimer,
    pauseTimer,
    completeTimer,
    undoCompleteTimer,
    addExercise,
    reorderExercise,
    removeExercise
  };
}

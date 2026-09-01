import { formatExerciseSets, formatExerciseTitle } from './format-exercise.js';
import { buildLibraryByName, resolveMuscleMapKeys } from './muscle-maps.js';
import { renderMuscleStrip } from './render-fitness.js';
import { buildPlannedCandidateFromTemplate } from './template-to-planned.js';
import { getSydneyDateKey, getSydneyTimestamp } from '../core/time.js';

export function createFitnessTemplateLibrary({
  root,
  templatesApi,
  chatApi,
  getFitnessContext,
  onPlanned,
  confirmPrompt = (message) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true)
} = {}) {
  let state = { status: 'idle', templates: [], libraryByName: null };
  let selected = null;
  let useBusy = false;

  const sheet = () => root.querySelector('#fitness-template-sheet');
  const useButton = () => root.querySelector('#fitness-template-use-today');

  useButton()?.addEventListener('click', () => {
    void useToday();
  });

  async function ensureLoaded({ force = false } = {}) {
    if (!force && (state.status === 'ready' || state.status === 'loading')) return state;
    state = { ...state, status: 'loading' };
    try {
      const data = await templatesApi.list();
      state = {
        status: 'ready',
        templates: data.templates,
        libraryByName: buildLibraryByName(
          Object.entries(data.libraryIndex ?? {}).map(([name, meta]) => ({ name, ...meta }))
        )
      };
    } catch {
      state = { status: 'error', templates: [], libraryByName: state.libraryByName };
    }
    return state;
  }

  function getState() {
    return state;
  }

  function openTemplate(template) {
    selected = template;
    const dialog = sheet();
    if (!dialog || !template) return;

    const title = root.querySelector('#fitness-template-sheet-title');
    if (title) title.textContent = template.title ?? 'Template';

    const keys = resolveMuscleMapKeys({
      focus: template.focus,
      exercises: template.exercises,
      libraryByName: state.libraryByName
    });
    renderMuscleStrip(root.querySelector('#fitness-template-sheet-maps'), keys);

    const focus = root.querySelector('#fitness-template-sheet-focus');
    if (focus) {
      focus.replaceChildren();
      for (const tag of template.focus ?? []) {
        const pill = root.createElement('span');
        pill.className = 'fitness-tag';
        pill.textContent = String(tag);
        focus.append(pill);
      }
    }

    const list = root.querySelector('#fitness-template-sheet-exercises');
    if (list) {
      list.replaceChildren();
      for (const exercise of template.exercises ?? []) {
        const row = root.createElement('div');
        row.className = 'fitness-exercise';
        const name = root.createElement('strong');
        name.textContent = formatExerciseTitle(exercise);
        const sets = root.createElement('p');
        sets.className = 'fitness-exercise__sets';
        sets.textContent = formatExerciseSets(exercise) || 'No sets';
        row.append(name, sets);
        list.append(row);
      }
    }

    const note = root.querySelector('#fitness-template-sheet-note');
    const ctx = getFitnessContext?.() ?? {};
    const completedToday = Boolean(ctx.completedToday);
    const btn = useButton();
    if (btn) {
      btn.disabled = completedToday;
      btn.textContent = completedToday ? 'Today’s already logged' : 'Use today';
    }
    if (note) {
      note.textContent = completedToday
        ? 'A completed session is already on today’s hero.'
        : (template.source_session_date ? `Last actuals ${template.source_session_date}` : '');
    }

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  async function useToday() {
    if (!selected || useBusy) return;
    const ctx = getFitnessContext?.() ?? {};
    if (ctx.completedToday) return;

    if (ctx.plannedToday && ctx.plannedToday.title !== selected.title) {
      const ok = confirmPrompt(`Replace today’s plan (“${ctx.plannedToday.title}”) with “${selected.title}”?`);
      if (!ok) return;
    }

    useBusy = true;
    const btn = useButton();
    if (btn) btn.disabled = true;
    try {
      const date = ctx.date ?? getSydneyDateKey(new Date());
      const now = getSydneyTimestamp(new Date());
      const time = typeof now === 'string' ? now.slice(11, 16) : '07:30';
      const built = buildPlannedCandidateFromTemplate(selected, { date, time });
      await chatApi.confirm({
        candidate: built.candidate,
        slug: built.slug,
        overwrite: Boolean(ctx.plannedToday)
      });
      sheet()?.close?.();
      sheet()?.removeAttribute('open');
      await onPlanned?.();
    } catch (error) {
      const note = root.querySelector('#fitness-template-sheet-note');
      if (note) note.textContent = error?.message ?? 'Could not create today’s plan.';
      if (btn && !ctx.completedToday) btn.disabled = false;
    } finally {
      useBusy = false;
    }
  }

  return { ensureLoaded, getState, openTemplate, useToday };
}

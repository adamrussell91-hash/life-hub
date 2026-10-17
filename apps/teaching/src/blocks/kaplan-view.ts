import type { KaplanLens, KaplanQualifier } from '@/schemas/kaplan';
import { KAPLAN_LABELS, kaplanSteps, kaplanSymbol } from './kaplan';
import { loadActivityState, saveActivityState, storageKey } from './learning-activity';

type ViewOptions = { mode: 'student' | 'teacher' | 'print'; blockId: string; lessonId?: string };
type LensState = { step: number; notes: [string, string, string] };

function initialState(key?: string): LensState {
  const saved = key ? loadActivityState<unknown>(key) : null;
  if (saved && typeof saved === 'object' && 'notes' in saved && Array.isArray(saved.notes)) {
    const notes = saved.notes;
    return {
      step: 'step' in saved && Number.isInteger(saved.step) ? Math.max(0, Math.min(2, Number(saved.step))) : 0,
      notes: [0, 1, 2].map((i) => typeof notes[i] === 'string' ? notes[i].slice(0, 20000) : '') as LensState['notes']
    };
  }
  return { step: 0, notes: ['', '', ''] };
}

export function renderKaplanQualifiers(qualifiers: KaplanQualifier[], options: ViewOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'kaplan-qualifiers';
  const strip = document.createElement('div');
  strip.className = 'kaplan-qualifiers__strip';
  strip.setAttribute('aria-label', 'Kaplan qualifiers');
  const workspace = document.createElement('section');
  workspace.className = 'kaplan-workspace';
  workspace.hidden = true;
  const states = new Map<KaplanLens, LensState>();
  const triggers = new Map<KaplanLens, HTMLButtonElement>();
  let active: KaplanQualifier | null = null;
  const keyFor = (q: KaplanQualifier) => options.mode === 'student' && options.lessonId
    ? `${storageKey(options.lessonId, options.blockId)}.kaplan.${q.lens}` : undefined;

  if (options.mode === 'print') {
    root.classList.add('kaplan-qualifiers--print');
    for (const qualifier of qualifiers) {
      const section = document.createElement('section');
      const title = document.createElement('h3');
      title.className = 'kaplan-workspace__title';
      title.append(kaplanSymbol(qualifier.lens), document.createTextNode(KAPLAN_LABELS[qualifier.lens]));
      const list = document.createElement('ol');
      for (const step of kaplanSteps(qualifier)) {
        const li = document.createElement('li');
        const heading = document.createElement('strong');
        heading.textContent = `${step.title}. `;
        li.append(heading, document.createTextNode(step.prompt));
        if (step.support) {
          const hint = document.createElement('p');
          hint.className = 'kaplan-support';
          hint.textContent = step.support;
          li.append(hint);
        }
        list.append(li);
      }
      section.append(title, list);
      root.append(section);
    }
    return root;
  }

  function persist(q: KaplanQualifier, state: LensState): void {
    const key = keyFor(q);
    if (key) saveActivityState(key, state);
  }
  function showStep(focusHeading = false): void {
    if (!active) return;
    const qualifier = active;
    const state = states.get(qualifier.lens)!;
    const steps = kaplanSteps(qualifier);
    workspace.replaceChildren();
    const heading = document.createElement('h3');
    heading.className = 'kaplan-workspace__title';
    heading.append(kaplanSymbol(qualifier.lens), document.createTextNode(KAPLAN_LABELS[qualifier.lens]));
    const progress = document.createElement('nav');
    progress.className = 'kaplan-progress';
    progress.setAttribute('aria-label', `${KAPLAN_LABELS[qualifier.lens]} steps`);
    steps.forEach((step, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kaplan-progress__step';
      button.textContent = `${i + 1}. ${step.title}`;
      if (i === state.step) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => { state.step = i; persist(qualifier, state); showStep(true); });
      progress.append(button);
    });
    const label = document.createElement('p');
    label.className = 'kaplan-eyebrow';
    label.textContent = `Step ${state.step + 1} of 3${qualifier.focus ? ` · ${qualifier.focus}` : ''}`;
    const stepTitle = document.createElement('h4');
    stepTitle.className = 'kaplan-workspace__step-title';
    stepTitle.tabIndex = -1;
    stepTitle.textContent = steps[state.step]!.title;
    const prompt = document.createElement('p');
    prompt.className = 'kaplan-workspace__prompt';
    prompt.textContent = steps[state.step]!.prompt;
    workspace.append(heading, progress, label, stepTitle, prompt);

    if (qualifier.mode === 'notes') {
      const noteLabel = document.createElement('label');
      noteLabel.className = 'kaplan-field';
      noteLabel.append(document.createTextNode('Your thinking'));
      const notes = document.createElement('textarea');
      notes.className = 'kaplan-notes';
      notes.rows = 3;
      notes.maxLength = 20000;
      notes.placeholder = 'A brief note, quotation or explanation…';
      notes.value = state.notes[state.step]!;
      notes.addEventListener('input', () => { state.notes[state.step] = notes.value; persist(qualifier, state); });
      noteLabel.append(notes);
      const saved = document.createElement('p');
      saved.className = 'kaplan-caption';
      saved.textContent = options.mode === 'student' ? 'Thinking notes for this device. Not submitted or marked.' : 'Student preview · notes are not saved.';
      workspace.append(noteLabel, saved);
    } else {
      const discussion = document.createElement('p');
      discussion.className = 'kaplan-caption';
      discussion.textContent = 'Talk through this step, then move on when you are ready.';
      workspace.append(discussion);
    }
    const supportText = steps[state.step]!.support;
    if (supportText) {
      const support = document.createElement('details');
      support.className = 'kaplan-support';
      const summary = document.createElement('summary');
      summary.textContent = 'Need a little support?';
      const text = document.createElement('p');
      text.textContent = supportText;
      support.append(summary, text);
      workspace.append(support);
    }
    const actions = document.createElement('div');
    actions.className = 'kaplan-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn--ghost';
    back.textContent = 'Back';
    back.disabled = state.step === 0;
    back.addEventListener('click', () => { state.step--; persist(qualifier, state); showStep(true); });
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn--secondary';
    next.textContent = state.step < 2 ? 'Next step' : 'Return to the activity';
    next.addEventListener('click', () => {
      if (state.step < 2) { state.step++; persist(qualifier, state); showStep(true); }
      else {
        active = null;
        workspace.hidden = true;
        triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
        triggers.get(qualifier.lens)?.focus();
      }
    });
    actions.append(back, next);
    workspace.append(actions);
    if (focusHeading) stepTitle.focus();
  }

  for (const qualifier of qualifiers) {
    states.set(qualifier.lens, initialState(keyFor(qualifier)));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kaplan-chip';
    button.setAttribute('aria-expanded', 'false');
    button.append(kaplanSymbol(qualifier.lens), document.createTextNode(KAPLAN_LABELS[qualifier.lens]));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      active = active?.lens === qualifier.lens ? null : qualifier;
      triggers.forEach((trigger, lens) => trigger.setAttribute('aria-expanded', String(lens === active?.lens)));
      workspace.hidden = !active;
      if (active) showStep();
    });
    triggers.set(qualifier.lens, button);
    strip.append(button);
  }
  root.append(strip, workspace);
  // Qualifier interactions must not select/rebuild a canvas row underneath it.
  root.addEventListener('click', (event) => event.stopPropagation());
  return root;
}

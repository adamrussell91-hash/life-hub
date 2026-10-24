import { el } from '@/quiz/dom';
import { understandProblems } from './checks';
import { HMW_FRAME } from './defaults';
import { submitBar, type FormContext, type PhaseForm } from './form-kit';
import type { PhasePayload } from './schema';
import type { SprintStatus } from './api';

/** Understand: write the "How might we" questions, then star the strongest one from the group. */
export function mountUnderstand(ctx: FormContext): PhaseForm {
  const ideas = ctx.sprint.phases[0]!.ideas ?? 3;
  const mine = ctx.status.mine?.understand;
  const state: PhasePayload['understand'] = { notes: [...(mine?.notes ?? [])], star: mine?.star ?? '', stretch: mine?.stretch ?? '' };
  while (state.notes.length < ideas) state.notes.push('');
  const root = el('div', 'sprint-understand');
  root.append(el('h2', '', 'How might we…?'));
  if (ctx.sprint.phases[0]!.instruction) root.append(el('p', '', ctx.sprint.phases[0]!.instruction));
  if (ctx.support !== 'open') root.append(el('p', 'sprint-field__starter', `${HMW_FRAME.lead} ${HMW_FRAME.parts.join(' ')}`));
  const bar = submitBar(ctx, 'understand', () => ({ ...state, notes: state.notes.filter((n) => n.trim()) }), () => {
    const p = understandProblems(state, ideas);
    if (!state.star) p.push('Star the group question you think is strongest.');
    return p;
  });
  state.notes.forEach((text, i) => {
    const input = el('input', 'qz-input sprint-note-input');
    input.maxLength = 200;
    input.value = text || '';
    input.placeholder = 'How might we…';
    input.disabled = !ctx.editable;
    input.setAttribute('aria-label', `Question ${i + 1}`);
    input.addEventListener('input', () => { state.notes[i] = input.value; bar.changed(); });
    root.append(input);
  });
  const group = el('div', 'sprint-notes');
  group.append(el('h3', '', 'Your group’s questions'));
  const notes = ctx.status.notes ?? [];
  if (!notes.length) group.append(el('p', 'sprint-note', 'Your group’s questions show here as they write them.'));
  for (const n of notes) {
    const star = el('button', 'sprint-chip sprint-star', `☆ ${n.text}`);
    star.type = 'button';
    star.disabled = !ctx.editable;
    star.setAttribute('aria-pressed', String(state.star === n.id));
    star.addEventListener('click', () => {
      state.star = n.id;
      group.querySelectorAll('.sprint-star').forEach((b) => b.setAttribute('aria-pressed', String(b === star)));
      bar.changed();
    });
    group.append(star);
  }
  root.append(group, bar.el);
  return { el: root, dispose: bar.dispose };
}

/** Rebuild when the group's notes change (new questions to star), never while typing otherwise. */
export const understandSignature = (s: SprintStatus) => (s.notes ?? []).map((n) => n.id).join(',');

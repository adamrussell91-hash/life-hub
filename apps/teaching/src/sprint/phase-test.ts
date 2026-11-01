import { button, el } from '@/quiz/dom';
import { feedbackProblems, reflectionProblems } from './checks';
import { FEEDBACK_STARTERS } from './defaults';
import { LATER_GUIDE } from './guidance';
import { draftOf, frameField, submitBar, valueCheckField, type FormContext, type PhaseForm, slidify, stepify } from './form-kit';
import { LEVEL_LABELS, type FeedbackEntry, type Level, type PhasePayload } from './schema';
import type { SprintStatus } from './api';

/** Test: the pitch is live in class; this is the reflection on what the group's feedback showed. */
export function mountTest(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = draftOf(ctx, 'test');
  const prompts = ctx.sprint.reflection_prompts.length ? ctx.sprint.reflection_prompts : ['What did the feedback show your idea does well?', 'What would you change next, and why?'];
  const state: PhasePayload['test'] = { reflection: [...(mine?.reflection ?? [])], quote: mine?.quote ?? '', change_criterion: mine?.change_criterion ?? '', value_answer: mine?.value_answer ?? '' };
  while (state.reflection.length < 2) state.reflection.push('');
  const root = el('div', 'sprint-test');
  root.append(el('h2', '', 'What the test showed'));
  const got = el('div', 'sprint-received');
  if (!s.received) got.append(el('p', 'sprint-note', 'Your group’s feedback shows here once your teacher releases it.'));
  else {
    for (const c of ctx.sprint.criteria) {
      const counts = s.received.levels[c.id] ?? [0, 0, 0];
      got.append(el('p', '', `${c.text}: ${LEVEL_LABELS.map((l, i) => `${l} ${counts[i]}`).join(' · ')}`));
    }
    const ul = el('ul');
    for (const line of s.received.lines) ul.append(el('li', '', `${line.worked} ${line.next}`));
    got.append(ul);
  }
  root.append(got);
  const bar = submitBar(ctx, 'test', () => state, () => reflectionProblems(state, !!ctx.valueCheck));
  prompts.forEach((p, i) => root.append(frameField({ label: p, value: state.reflection[i] ?? '', max: 1000, rows: 4, frames: ctx.frames, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.reflection[i] = v; bar.changed(); } })));
  root.append(frameField({ label: 'Quote one piece of feedback your group received', value: state.quote, max: 300, rows: 2, support: 'open', disabled: !ctx.editable, onInput: (v) => { state.quote = v; bar.changed(); } }));
  const crit = el('select', 'qz-input');
  crit.setAttribute('aria-label', 'Criterion your change is about');
  crit.disabled = !ctx.editable;
  crit.append(el('option', '', 'The criterion your change is about'));
  (crit.firstChild as HTMLOptionElement).value = '';
  for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; o.selected = state.change_criterion === c.id; crit.append(o); }
  crit.addEventListener('change', () => { state.change_criterion = crit.value; bar.changed(); });
  root.append(crit);
  const value = valueCheckField(ctx, state.value_answer, (v) => { state.value_answer = v; bar.changed(); });
  if (value) root.append(value);
  stepify(root, [
    { pick: '.sprint-received', title: 'What your group got', guide: LATER_GUIDE.feedback },
    { pick: '.sprint-field, select.qz-input, .sprint-value', title: 'Think about what to change', guide: LATER_GUIDE.reflect }
  ], 'Test');
  slidify(root, ctx.sprint.understand?.layout, ctx.steps?.test ?? 0, (i) => { if (ctx.steps) ctx.steps.test = i; });
  root.append(bar.el);
  return { el: root, dispose: bar.dispose };
}

/** The card that pops up while another group pitches: a level per criterion and two short lines. */
export function mountFeedbackCard(ctx: FormContext, round: NonNullable<SprintStatus['round']>): HTMLElement {
  const card = el('section', 'sprint-card');
  const name = /^group\b/i.test(round.group_name) ? round.group_name : `Group ${round.group_name}`;
  card.setAttribute('aria-label', `Feedback for ${name}`);
  card.append(el('div', 'sprint-note', 'Feedback for'), el('h2', '', name), el('p', 'sprint-note', 'Your name stays hidden from the group.'));
  if (round.sent) { card.append(el('p', '', 'Sent. Thank you.')); return card; }
  const entry: FeedbackEntry = { levels: {}, worked: '', next: '', about: '' };
  for (const c of ctx.sprint.criteria) {
    card.append(el('p', 'sprint-field__label', c.text));
    const levels = el('div', 'sprint-levels');
    LEVEL_LABELS.forEach((name, i) => {
      const b = el('button', 'btn btn--secondary sprint-level', name);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        entry.levels[c.id] = (i + 1) as Level;
        levels.querySelectorAll('.sprint-level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      levels.append(b);
    });
    card.append(levels);
  }
  card.append(
    frameField({ label: 'What worked', value: '', max: 300, rows: 2, starter: FEEDBACK_STARTERS.worked, support: ctx.support, disabled: false, onInput: (v) => { entry.worked = v; } }),
    frameField({ label: 'One thing to try next', value: '', max: 300, rows: 2, starter: FEEDBACK_STARTERS.next, support: ctx.support, disabled: false, onInput: (v) => { entry.next = v; } })
  );
  const about = el('select', 'qz-input');
  about.setAttribute('aria-label', 'Your comments are about');
  about.append(el('option', '', 'Your comments are about…'));
  (about.firstChild as HTMLOptionElement).value = '';
  for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; about.append(o); }
  about.addEventListener('change', () => { entry.about = about.value; });
  const checks = el('ul', 'sprint-checks');
  const err = el('p', 'sprint-submit__err');
  const send = button('Send feedback', 'primary', async () => {
    const p = feedbackProblems(entry, ctx.sprint.criteria);
    checks.replaceChildren(...p.map((t) => el('li', '', t)));
    if (p.length) return;
    send.disabled = true;
    try { ctx.onStatus(await ctx.client.feedback(round.group_id, entry)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t send.'; send.disabled = false; }
  });
  card.append(about, checks, send, err);
  return card;
}

export const testSignature = (s: SprintStatus) => (s.received ? `r${s.received.lines.length}` : '');

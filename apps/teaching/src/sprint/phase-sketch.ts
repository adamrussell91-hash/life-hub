import { el } from '@/quiz/dom';
import { sketchProblems } from './checks';
import { SKETCH_STARTERS } from './defaults';
import { briefCard, draftOf, frameField, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import type { PhasePayload, SketchCard } from './schema';
import type { SprintStatus } from './api';

const blank = (i: number): SketchCard => ({ id: `k${i + 1}`, title: '', idea: '', answers: '', evidence: '', criteria: {}, requirements: {}, value_answer: '' });

/** Sketch: one tab per idea card, the checks for each, then the strongest pick. */
export function mountSketch(ctx: FormContext): PhaseForm {
  const ideas = ctx.sprint.phases[1]!.ideas ?? 3;
  const mine = draftOf(ctx, 'sketch');
  const state: PhasePayload['sketch'] = { cards: [...(mine?.cards ?? [])], strongest: mine?.strongest ?? '', strongest_why: mine?.strongest_why ?? '' };
  while (state.cards.length < ideas) state.cards.push(blank(state.cards.length));
  const reqs = ctx.sprint.requirements.filter((r) => r.phases.includes('sketch'));
  const root = el('div', 'sprint-sketch');
  root.append(el('h2', '', `Your ${ideas} ideas`));
  const brief = briefCard(ctx.status);
  if (brief) root.append(brief);
  const bar = submitBar(ctx, 'sketch', () => state, () => sketchProblems(state, { ideas, requirements: ctx.sprint.requirements }));
  const tabs = el('div', 'sprint-tabs');
  tabs.setAttribute('role', 'tablist');
  const pane = el('div', 'sprint-card-pane');
  let at = 0;

  const paintCard = () => {
    const c = state.cards[at]!;
    const change = () => bar.changed();
    pane.replaceChildren();
    const title = el('input', 'qz-input');
    title.maxLength = 80;
    title.value = c.title;
    title.disabled = !ctx.editable;
    title.setAttribute('aria-label', 'Title');
    title.addEventListener('input', () => { c.title = title.value; change(); });
    pane.append(el('label', 'sprint-field__label', 'Title'), title);
    pane.append(
      frameField({ label: SKETCH_STARTERS.idea, value: c.idea, max: 600, frames: ctx.frames.slice(0, 1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.idea = v; change(); } }),
      frameField({ label: SKETCH_STARTERS.answers, value: c.answers, max: 600, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.answers = v; change(); } }),
      frameField({ label: SKETCH_STARTERS.evidence, value: c.evidence, max: 600, frames: ctx.frames.slice(1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.evidence = v; change(); } })
    );
    const upload = el('input');
    upload.type = 'file';
    upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
    upload.disabled = !ctx.editable;
    upload.setAttribute('aria-label', 'Add a picture or PDF');
    upload.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      try {
        c.file = (await ctx.client.upload('sketch', file)).id;
        change();
      } catch (e) {
        pane.append(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'That didn’t upload.'));
      }
    });
    pane.append(el('label', 'sprint-field__label', c.file ? 'Picture or PDF added' : 'Add a picture or PDF (optional)'), upload);
    const check = el('div', 'sprint-card-check');
    check.append(el('h3', '', 'Criteria this idea meets'));
    for (const cr of ctx.sprint.criteria) check.append(tickRow(cr.text, c.criteria, cr.id, 'The line that shows it', ctx.editable, change));
    if (reqs.length) {
      check.append(el('h3', '', 'Requirements'));
      for (const r of reqs) check.append(tickRow(r.text, c.requirements, r.id, 'Where is it?', ctx.editable, change));
    }
    const value = valueCheckField(ctx, c.value_answer, (v) => { c.value_answer = v; change(); });
    if (value) check.append(value);
    pane.append(check);
  };

  const paintTabs = () => {
    tabs.replaceChildren(...state.cards.map((c, i) => {
      const t = el('button', 'btn btn--secondary sprint-tab', `Idea ${i + 1}${c.title ? `: ${c.title}` : ''}`);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(i === at));
      t.addEventListener('click', () => { at = i; paintTabs(); paintCard(); });
      return t;
    }));
  };

  const strongest = el('div', 'sprint-strongest');
  const pick = el('select', 'qz-input');
  pick.disabled = !ctx.editable;
  pick.setAttribute('aria-label', 'Your strongest idea');
  const refreshPick = () => {
    pick.replaceChildren(el('option', '', 'Pick your strongest idea'), ...state.cards.map((c, i) => {
      const o = el('option', '', `Idea ${i + 1}${c.title ? `: ${c.title}` : ''}`);
      o.value = c.id;
      o.selected = state.strongest === c.id;
      return o;
    }));
    (pick.firstChild as HTMLOptionElement).value = '';
  };
  refreshPick();
  pick.addEventListener('focus', refreshPick);
  pick.addEventListener('change', () => { state.strongest = pick.value; bar.changed(); });
  strongest.append(el('h3', '', 'Your strongest idea'), pick, frameField({ label: 'Why is it the strongest?', value: state.strongest_why, max: 300, rows: 2, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.strongest_why = v; bar.changed(); } }));

  paintTabs();
  paintCard();
  root.append(tabs, pane, strongest, bar.el);
  return { el: root, dispose: bar.dispose };
}

/** A tick with a "where" box; unticking clears it. */
function tickRow(label: string, into: Record<string, string>, id: string, placeholder: string, editable: boolean, change: () => void): HTMLElement {
  const row = el('label', 'sprint-row');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = !!into[id];
  box.disabled = !editable;
  const text = el('span', '', label);
  const where = el('input', 'qz-input');
  where.type = 'text';
  where.maxLength = 200;
  where.placeholder = placeholder;
  where.value = into[id] ?? '';
  where.hidden = !box.checked;
  where.disabled = !editable;
  box.addEventListener('change', () => {
    where.hidden = !box.checked;
    if (!box.checked) delete into[id];
    change();
  });
  where.addEventListener('input', () => { into[id] = where.value; change(); });
  text.append(where);
  row.append(box, text);
  return row;
}

export const sketchSignature = (s: SprintStatus) => `${s.question?.text ?? ''}|${s.brief?.audience?.who ?? ''}|${s.brief?.answers.length ?? 0}`;

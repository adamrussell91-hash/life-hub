import { button, el } from '@/quiz/dom';
import { partsProblems, voteProblems } from './checks';
import { frameField, submitBar, type FormContext, type PhaseForm } from './form-kit';
import type { Part, PhasePayload } from './schema';
import type { GalleryIdea, SprintStatus } from './api';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Decide: open every set of ideas (no names, ever), give each criterion to
 * one idea with a reason, then, once the group's idea is chosen, write the
 * parts list and claim a part.
 */
export function mountDecide(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = s.mine?.decide;
  const state: PhasePayload['decide'] = { votes: { ...(mine?.votes ?? {}) }, reasons: { ...(mine?.reasons ?? {}) }, opened: [...(mine?.opened ?? [])], stretch: mine?.stretch ?? '' };
  const sets = s.gallery ?? [];
  const root = el('div', 'sprint-decide');
  if (s.question) root.append(el('p', 'sprint-note', `Our question: ${s.question.text}`));
  const voting = !s.votes_closed;
  const bar = submitBar(ctx, 'decide', () => state, () => [
    ...(voting ? voteProblems(state, ctx.sprint.criteria, sets.map((x) => x.id)) : []),
    ...(s.chosen && !(s.parts ?? []).some((p) => p.mine) ? ['Claim a part of the prototype.'] : [])
  ]);
  let letter = 0;
  const label = new Map<string, string>();
  for (const set of sets) for (const i of set.ideas) label.set(i.id, `Idea ${LETTERS[letter++] ?? letter}`);

  if (voting) {
    root.append(el('h2', '', 'Pick the idea that does each one best'), el('p', '', 'Open every set first. Then give each criterion to one idea and say why. One idea can get more than one.'));
    const gallery = el('div', 'sprint-sets');
    sets.forEach((set, n) => {
      const d = el('details', 'sprint-set');
      d.append(el('summary', '', `Set ${n + 1} · ${set.ideas.length} ${set.ideas.length === 1 ? 'idea' : 'ideas'}`));
      const grid = el('div', 'sprint-gallery');
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        if (!state.opened.includes(set.id)) { state.opened.push(set.id); bar.changed(); }
        if (!grid.childElementCount) for (const i of set.ideas) grid.append(ideaCard(i, label.get(i.id)!, ctx, state, root, bar.changed));
      });
      d.append(grid);
      gallery.append(d);
    });
    root.append(gallery);
    const reasons = el('div', 'sprint-reasons');
    reasons.append(el('h3', '', 'Why each one?'));
    for (const c of ctx.sprint.criteria) {
      reasons.append(frameField({ label: `${c.text}: it does this best because…`, value: state.reasons[c.id] ?? '', max: 300, rows: 2, frames: ctx.frames.slice(-1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.reasons[c.id] = v; bar.changed(); } }));
    }
    root.append(reasons);
  } else {
    root.append(el('h2', '', s.chosen ? 'Your group’s idea' : 'Your teacher is choosing'));
    if (s.chosen) {
      const chosen = el('div', 'sprint-chosen');
      chosen.append(el('strong', '', s.chosen.title), el('p', '', s.chosen.idea));
      root.append(chosen);
    }
    if (s.heat) root.append(heatTable(sets, label, s.heat, ctx));
  }
  if (s.chosen) root.append(partsEditor(ctx));
  root.append(bar.el);
  return { el: root, dispose: bar.dispose };
}

function ideaCard(i: GalleryIdea, name: string, ctx: FormContext, state: PhasePayload['decide'], root: HTMLElement, changed: () => void): HTMLElement {
  const card = el('article', 'sprint-idea');
  card.append(el('span', 'sprint-idea__tag', name), el('strong', '', i.title), el('p', '', i.idea), el('p', 'sprint-note', i.answers), el('p', 'sprint-note', i.evidence));
  if (i.file) {
    const open = button('Open the picture or PDF', 'ghost', async () => window.open(await ctx.client.fileUrl(i.file!), '_blank', 'noopener'));
    card.append(open);
  }
  const chips = el('div', 'sprint-votes');
  for (const c of ctx.sprint.criteria) {
    const chip = el('button', 'sprint-chip sprint-vote', c.text);
    chip.type = 'button';
    chip.dataset.criterion = c.id;
    chip.dataset.idea = i.id;
    chip.disabled = !ctx.editable;
    chip.setAttribute('aria-pressed', String(state.votes[c.id] === i.id));
    chip.addEventListener('click', () => {
      state.votes[c.id] = i.id;
      root.querySelectorAll<HTMLButtonElement>(`.sprint-vote[data-criterion="${c.id}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idea === i.id)));
      changed();
    });
    chips.append(chip);
  }
  card.append(chips);
  return card;
}

/** Which ideas did best on which criterion: shades, never numbers. */
function heatTable(sets: SprintStatus['gallery'] & object, label: Map<string, string>, heat: NonNullable<SprintStatus['heat']>, ctx: FormContext): HTMLElement {
  const box = el('div', 'sprint-heat-table');
  box.append(el('h3', '', 'How the group voted'), el('p', 'sprint-note', `Darker means more of your group picked it for ${ctx.sprint.criteria.map((c) => c.text).join(', ')}.`));
  for (const set of sets) for (const i of set.ideas) {
    const r = el('div', 'sprint-heat-row');
    const cells = el('span', 'sprint-heat');
    for (const c of ctx.sprint.criteria) {
      const cell = el('i');
      cell.dataset.level = String(heat[i.id]?.[c.id] ?? 0);
      cell.title = c.text;
      cells.append(cell);
    }
    r.append(el('span', '', `${label.get(i.id)}: ${i.title}`), cells);
    box.append(r);
  }
  return box;
}

/** The parts list any member can edit, and one claim each. */
function partsEditor(ctx: FormContext): HTMLElement {
  const box = el('div', 'sprint-parts');
  box.append(el('h3', '', 'Parts of the prototype'), el('p', 'sprint-note', 'List what the prototype needs, what each part must show and the criterion it serves. Then claim one part.'));
  const parts: Part[] = (ctx.status.parts ?? []).map(({ claimed: _c, mine: _m, ...p }) => p);
  const list = el('div');
  const err = el('p', 'sprint-submit__err');
  const save = async () => {
    const problems = partsProblems(parts);
    if (problems.length) { err.textContent = problems[0]!; return; }
    try { ctx.onStatus(await ctx.client.parts(parts)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t save.'; }
  };
  const paint = () => {
    list.replaceChildren(...parts.map((p, i) => {
      const r = el('div', 'sprint-part');
      const name = el('input', 'qz-input');
      name.value = p.text; name.maxLength = 80; name.setAttribute('aria-label', 'Part');
      name.addEventListener('input', () => { p.text = name.value; });
      const shows = el('input', 'qz-input');
      shows.value = p.shows; shows.maxLength = 200; shows.placeholder = 'What it must show'; shows.setAttribute('aria-label', 'What it must show');
      shows.addEventListener('input', () => { p.shows = shows.value; });
      const crit = el('select', 'qz-input');
      crit.setAttribute('aria-label', 'Criterion it serves');
      crit.append(el('option', '', 'Criterion it serves'));
      (crit.firstChild as HTMLOptionElement).value = '';
      for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; o.selected = p.criterion === c.id; crit.append(o); }
      crit.addEventListener('change', () => { p.criterion = crit.value; });
      const live = (ctx.status.parts ?? []).find((x) => x.id === p.id);
      const claim = button(live?.mine ? 'Yours' : live?.claimed ? 'Claimed' : 'Claim this part', live?.mine ? 'primary' : 'secondary', async () => {
        try { ctx.onStatus(await ctx.client.claimPart(p.id)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
      });
      claim.disabled = !live || (!!live.claimed && !live.mine);
      r.append(name, shows, crit, claim, button('Remove', 'ghost', () => { parts.splice(i, 1); paint(); }));
      return r;
    }));
  };
  paint();
  box.append(list, button('+ Part', 'ghost', () => { parts.push({ id: `p${Date.now().toString(36)}`, text: 'New part', shows: '', criterion: '' }); paint(); }), button('Save parts', 'secondary', () => void save()), err);
  return box;
}

export const decideSignature = (s: SprintStatus) =>
  [(s.gallery ?? []).map((x) => x.id).join(','), s.votes_closed ? 1 : 0, s.chosen?.id ?? '', (s.parts ?? []).map((p) => `${p.id}:${p.claimed}:${p.mine ? 1 : 0}`).join(',')].join('|');

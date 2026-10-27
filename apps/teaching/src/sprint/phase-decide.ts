import { button, el } from '@/quiz/dom';
import { partsProblems, voteProblems } from './checks';
import { LATER_GUIDE } from './guidance';
import { briefCard, draftOf, frameField, slidify, stepify, submitBar, type FormContext, type PhaseForm } from './form-kit';
import { IDEA_PARTS, type IdeaPart, type Part, type PhasePayload } from './schema';
import type { GalleryIdea, SprintStatus } from './api';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Decide: open every set of ideas (no names, ever), place stand-out dots on
 * the parts that stand out, give each criterion to one idea with a reason,
 * then, once the group's idea is chosen, write the parts list and give each
 * part to someone by their initials.
 */
export function mountDecide(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = draftOf(ctx, 'decide');
  const state: PhasePayload['decide'] = { votes: { ...(mine?.votes ?? {}) }, reasons: { ...(mine?.reasons ?? {}) }, opened: [...(mine?.opened ?? [])], stretch: mine?.stretch ?? '', dots: (mine?.dots ?? []).map((d) => ({ ...d })) };
  const dots = s.dots ?? 0;
  const sets = s.gallery ?? [];
  const root = el('div', 'sprint-decide');
  const brief = briefCard(s, false);
  if (brief) root.append(brief);
  const voting = !s.votes_closed;
  const dottable = sets.flatMap((x) => x.ideas).reduce((n, i) => n + IDEA_PARTS.filter((k) => i[k]?.trim()).length, 0);
  const bar = submitBar(ctx, 'decide', () => state, () => [
    ...(voting && dots && state.dots.length < Math.min(dots, dottable) ? [`Place all ${dots} stand-out dots. You have placed ${state.dots.length}.`] : []),
    ...(voting ? voteProblems(state, ctx.sprint.criteria, sets.map((x) => x.id)) : []),
    ...(!s.chosen ? ['Your votes are saved. Submit once your group’s idea is chosen and every part has someone.'] : []),
    ...(s.chosen && !(s.parts ?? []).some((p) => p.mine) ? ['Your group hasn’t given you a part yet. Pick your initials on a part.'] : []),
    ...(s.chosen && s.assemble && !s.assembler ? ['Pick who puts the prototype together.'] : [])
  ]);
  const dotCounter = el('p', 'sd-counter');
  const paintCounter = () => { dotCounter.textContent = `Stand-out dots: ${state.dots.length} of ${dots} placed.`; };
  paintCounter();
  const dotChanged = () => {
    paintCounter();
    root.querySelectorAll<HTMLButtonElement>('.sd-dot').forEach((b) => {
      const on = b.getAttribute('aria-pressed') === 'true';
      b.disabled = !ctx.editable || (!on && state.dots.length >= dots);
    });
    bar.changed();
  };
  let letter = 0;
  const label = new Map<string, string>();
  for (const set of sets) for (const i of set.ideas) label.set(i.id, `Idea ${LETTERS[letter++] ?? letter}`);

  if (voting) {
    root.append(el('h2', '', 'Pick the idea that does each one best'));
    if (dots) root.append(dotCounter, el('p', 'sprint-note sd-legend', `● marks a part that stands out. You have ${dots}. Under each idea, tap the criteria it does best.`));
    const gallery = el('div', 'sprint-sets');
    sets.forEach((set, n) => {
      const d = el('details', 'sprint-set');
      d.append(el('summary', '', `Set ${n + 1} · ${set.ideas.length} ${set.ideas.length === 1 ? 'idea' : 'ideas'}`));
      const grid = el('div', 'sprint-gallery');
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        if (!state.opened.includes(set.id)) { state.opened.push(set.id); bar.changed(); }
        if (!grid.childElementCount) for (const i of set.ideas) grid.append(ideaCard(i, label.get(i.id)!, ctx, state, root, dotChanged));
      });
      d.append(grid);
      gallery.append(d);
    });
    root.append(gallery);
    const reasons = el('div', 'sprint-reasons');
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
    if (s.dot_counts && Object.keys(s.dot_counts).length) root.append(standOuts(sets, label, s.dot_counts));
  }
  if (s.chosen) root.append(partsEditor(ctx));
  if (!voting) stepify(root, [
    { pick: '.sprint-chosen, .sprint-heat-table', title: 'See what your group picked', guide: LATER_GUIDE.result },
    { pick: '.sprint-parts', title: 'Plan the parts of the prototype', guide: LATER_GUIDE.parts }
  ]);
  if (voting) stepify(root, [
    { pick: '.sd-counter, .sd-legend, .sprint-sets', title: 'Read the ideas and place your dots', guide: LATER_GUIDE.read },
    { pick: '.sprint-reasons', title: 'Say which idea does each criterion best', guide: LATER_GUIDE.reasons }
  ]);
  slidify(root, ctx.sprint.understand?.layout);
  root.append(bar.el);
  return { el: root, dispose: bar.dispose };
}

const PART_LABEL: Record<IdeaPart, string> = { idea: 'The idea', answers: 'How it solves the problem', evidence: 'The evidence' };

function ideaCard(i: GalleryIdea, name: string, ctx: FormContext, state: PhasePayload['decide'], root: HTMLElement, changed: () => void): HTMLElement {
  const card = el('article', 'sprint-idea');
  card.append(el('span', 'sprint-idea__tag', name), el('strong', '', i.title));
  const dots = ctx.status.dots ?? 0;
  for (const part of IDEA_PARTS) {
    const text = i[part];
    if (!text?.trim()) continue;
    const row = el('div', 'sd-part');
    row.append(el('p', part === 'idea' ? '' : 'sprint-note', text));
    if (dots) {
      const at = () => state.dots.findIndex((d) => d.idea === i.id && d.part === part);
      const dot = el('button', 'sd-dot', '●');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Stand-out dot: ${PART_LABEL[part]}, ${name}`);
      dot.setAttribute('aria-pressed', String(at() >= 0));
      dot.disabled = !ctx.editable || (at() < 0 && state.dots.length >= dots);
      const note = el('input', 'qz-input sd-note');
      note.maxLength = 120;
      note.placeholder = 'Borrow this because… (optional)';
      note.setAttribute('aria-label', `Why ${PART_LABEL[part].toLowerCase()} stands out`);
      note.hidden = at() < 0;
      note.value = at() >= 0 ? state.dots[at()]!.note : '';
      note.disabled = !ctx.editable;
      note.addEventListener('input', () => { const n = at(); if (n >= 0) { state.dots[n]!.note = note.value; changed(); } });
      dot.addEventListener('click', () => {
        const n = at();
        if (n >= 0) state.dots.splice(n, 1);
        else if (state.dots.length < dots) state.dots.push({ idea: i.id, part, note: '' });
        dot.setAttribute('aria-pressed', String(at() >= 0));
        note.hidden = at() < 0;
        if (at() < 0) note.value = '';
        changed();
      });
      row.append(dot, note);
    }
    card.append(row);
  }
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
  const short = (t: string) => t.split(/[:.]/)[0]!.trim().slice(0, 14);
  box.append(el('p', 'sprint-note', 'Darker means more of your group picked that idea for that criterion.'));
  for (const set of sets) for (const i of set.ideas) {
    const r = el('div', 'sprint-heat-row');
    const cells = el('span', 'sprint-heat');
    for (const c of ctx.sprint.criteria) {
      const cell = el('i', '', short(c.text));
      cell.dataset.level = String(heat[i.id]?.[c.id] ?? 0);
      cell.title = c.text;
      cells.append(cell);
    }
    r.append(el('span', '', `${label.get(i.id)}: ${i.title}`), cells);
    box.append(r);
  }
  return box;
}

/** After voting: where the group's stand-out dots landed. */
function standOuts(sets: NonNullable<SprintStatus['gallery']>, label: Map<string, string>, counts: NonNullable<SprintStatus['dot_counts']>): HTMLElement {
  const box = el('div', 'sprint-heat-table');
  for (const set of sets) for (const i of set.ideas) {
    const c = counts[i.id];
    if (!c) continue;
    const bits = IDEA_PARTS.filter((p) => c[p]).map((p) => `${PART_LABEL[p]} ${'●'.repeat(c[p])}`);
    box.append(el('p', '', `${label.get(i.id)}: ${i.title} · ${bits.join(' · ')}`));
  }
  return box;
}

/**
 * The parts list any member can edit, and who does each part, picked by
 * initials. Decide is done when every part has someone and everyone has a part.
 */
function partsEditor(ctx: FormContext): HTMLElement {
  const box = el('div', 'sprint-parts');
  box.append(el('h3', '', 'Parts of the prototype'), el('p', 'sprint-note', 'List what the prototype needs, what each part must show and the criterion it serves. Save, then give every part to someone by their initials.'));
  const parts: Part[] = (ctx.status.parts ?? []).map(({ claimed: _c, mine: _m, assigned: _a, ...p }) => p);
  const members = ctx.status.members ?? [];
  const cap = members.length > parts.length ? 2 : 1;
  const list = el('div');
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  const save = async () => {
    const problems = partsProblems(parts);
    if (problems.length) { err.textContent = problems[0]!; return; }
    try { ctx.onStatus(await ctx.client.parts(parts)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t save.'; }
  };
  const assign = async (partId: string, keys: string[]) => {
    try { ctx.onStatus(await ctx.client.assign(partId, keys)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
  };
  const newPart = (text: string, shows = ''): Part => ({ id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, text: text.slice(0, 80) || 'New part', shows: shows.slice(0, 200), criterion: '' });
  const paint = () => {
    list.replaceChildren(...parts.map((p, i) => {
      const r = el('div', 'sprint-part');
      const name = el('input', 'qz-input');
      name.value = p.text; name.maxLength = 80; name.setAttribute('aria-label', 'Part');
      name.disabled = !ctx.editable;
      name.addEventListener('input', () => { p.text = name.value; });
      const shows = el('input', 'qz-input');
      shows.value = p.shows; shows.maxLength = 200; shows.placeholder = 'What it must show'; shows.setAttribute('aria-label', 'What it must show');
      shows.disabled = !ctx.editable;
      shows.addEventListener('input', () => { p.shows = shows.value; });
      const crit = el('select', 'qz-input');
      crit.setAttribute('aria-label', 'Criterion it serves');
      crit.disabled = !ctx.editable;
      crit.append(el('option', '', 'Criterion it serves'));
      (crit.firstChild as HTMLOptionElement).value = '';
      for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; o.selected = p.criterion === c.id; crit.append(o); }
      crit.addEventListener('change', () => { p.criterion = crit.value; });
      const live = (ctx.status.parts ?? []).find((x) => x.id === p.id);
      const who = el('div', 'sd-who');
      who.setAttribute('role', 'group');
      who.setAttribute('aria-label', `Who does "${p.text}"`);
      if (!live) who.append(el('span', 'sprint-note', 'Save parts to give this one to someone.'));
      else for (const m of members) {
        const on = (live.assigned ?? []).includes(m.key);
        const chip = el('button', 'sprint-chip', m.me ? `${m.initials} (you)` : m.initials);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', String(on));
        chip.disabled = !ctx.editable;
        chip.addEventListener('click', () => {
          const now = live.assigned ?? [];
          const next = on ? now.filter((k) => k !== m.key) : cap === 1 ? [m.key] : [...now, m.key].slice(-cap);
          void assign(p.id, next);
        });
        who.append(chip);
      }
      const remove = button('Remove', 'ghost', () => { parts.splice(i, 1); paint(); });
      remove.disabled = !ctx.editable;
      r.append(name, shows, crit, who, remove);
      return r;
    }));
  };
  paint();
  const add = button('+ Part', 'ghost', () => { parts.push(newPart('New part')); paint(); });
  const saveBtn = button('Save parts', 'secondary', () => void save());
  add.disabled = saveBtn.disabled = !ctx.editable;
  box.append(list, add, saveBtn);
  const borrow = ctx.status.borrow ?? [];
  if (borrow.length) {
    const b = el('div', 'sd-borrow');
    b.append(el('h4', '', 'Worth borrowing'), el('p', 'sprint-note', 'The most-dotted parts of ideas your group didn’t choose. Add one as a part.'));
    for (const x of borrow) {
      const row = el('div', 'kit-row');
      row.append(el('span', '', `${x.title}: ${x.text} ${'●'.repeat(x.count)}${x.notes.length ? ` · ${x.notes.join(' · ')}` : ''}`));
      const go = button('Add as a part', 'ghost', () => { parts.push(newPart(`From "${x.title}"`, x.text)); paint(); });
      go.disabled = !ctx.editable;
      row.append(go);
      b.append(row);
    }
    box.append(b);
  }
  if (ctx.status.assemble) {
    const a = el('div', 'sd-assembler');
    a.append(el('h4', '', 'Who puts it together?'), el('p', 'sprint-note', 'The assembler collects everyone’s parts in Prototype, puts them together and uploads the finished prototype for the pitch. They still do their own part.'));
    const who = el('div', 'sd-who');
    who.setAttribute('role', 'group');
    who.setAttribute('aria-label', 'Assembler');
    for (const m of members) {
      const on = ctx.status.assembler?.key === m.key;
      const chip = el('button', 'sprint-chip', m.me ? `${m.initials} (you)` : m.initials);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(on));
      chip.disabled = !ctx.editable;
      chip.addEventListener('click', async () => {
        try { ctx.onStatus(await ctx.client.setAssembler(on ? null : m.key)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
      });
      who.append(chip);
    }
    a.append(who);
    box.append(a);
  }
  const all = (ctx.status.parts ?? []);
  const unplaced = members.filter((m) => !all.some((p) => (p.assigned ?? []).includes(m.key)));
  const empty = all.filter((p) => !(p.assigned ?? []).length);
  const noAssembler = !!ctx.status.assemble && !ctx.status.assembler;
  box.append(el('p', 'sprint-note sd-status', !all.length ? 'No parts saved yet.' : empty.length || unplaced.length || noAssembler
    ? [empty.length ? `${empty.length} ${empty.length === 1 ? 'part has' : 'parts have'} no one yet.` : '', unplaced.length ? `Still without a part: ${unplaced.map((m) => m.initials).join(', ')}.` : '', noAssembler ? 'No assembler yet.' : ''].filter(Boolean).join(' ')
    : `Every part has someone and everyone has a part.${ctx.status.assembler ? ` ${ctx.status.assembler.initials} puts it together.` : ''}`), err);
  return box;
}

export const decideSignature = (s: SprintStatus) =>
  [(s.gallery ?? []).map((x) => x.id).join(','), s.votes_closed ? 1 : 0, s.chosen?.id ?? '', (s.parts ?? []).map((p) => `${p.id}:${(p.assigned ?? []).join('+')}:${p.mine ? 1 : 0}`).join(','), (s.borrow ?? []).length, s.assembler?.key ?? ''].join('|');

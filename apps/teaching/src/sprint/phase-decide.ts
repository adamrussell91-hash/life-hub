import { button, el } from '@/quiz/dom';
import { duelProblems, partsProblems } from './checks';
import { LATER_GUIDE } from './guidance';
import { briefCard, draftOf, slidify, stepify, submitBar, type FormContext, type PhaseForm } from './form-kit';
import { duelsDone, pairKey, pairsOf, rankIdeas } from './rules';
import type { Duel, Part, PhasePayload } from './schema';
import type { GalleryIdea, SprintStatus } from './api';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PLACE = ['1st', '2nd', '3rd'];

/**
 * Decide: the group's strongest ideas (one per member, no names) go head to
 * head, two at a time. For each pair the student picks the one that better
 * solves the problem for the audience and taps what it is stronger in. Their
 * wins give them a 1st, 2nd and 3rd; the group's wins give the group's idea.
 * Then the group writes the parts list and gives each part to someone.
 */
export function mountDecide(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = draftOf(ctx, 'decide');
  const state: PhasePayload['decide'] = { duels: (mine?.duels ?? []).map((d) => ({ ...d, stronger: [...d.stronger] })), votes: { ...(mine?.votes ?? {}) }, reasons: { ...(mine?.reasons ?? {}) }, opened: [...(mine?.opened ?? [])], stretch: mine?.stretch ?? '', dots: [] };
  const pool = s.pool ?? [];
  const ids = pool.map((i) => i.id);
  const label = new Map(pool.map((i, n) => [i.id, `Idea ${LETTERS[n] ?? n + 1}`]));
  const root = el('div', 'sprint-decide');
  const brief = briefCard(s, false);
  if (brief) root.append(brief);
  const voting = !s.votes_closed;
  root.append(purpose(voting, pool.length));
  const bar = submitBar(ctx, 'decide', () => state, () => [
    ...(voting ? duelProblems(state.duels, ids) : []),
    ...(!s.chosen ? ['Your picks are saved. Submit once your group’s idea is chosen and every part has someone.'] : []),
    ...(s.chosen && !(s.parts ?? []).some((p) => p.mine) ? ['Your group hasn’t given you a part yet. Pick your initials on a part.'] : []),
    ...(s.chosen && s.assemble && !s.assembler ? ['Pick who puts the prototype together.'] : [])
  ]);

  if (voting) {
    const ranking = el('div', 'sdd-rank');
    const paintRanking = () => ranking.replaceChildren(...myRanking(state.duels, pool, label, ctx));
    root.append(duelArena(ctx, state, pool, label, () => { paintRanking(); bar.changed(); }));
    paintRanking();
    root.append(ranking);
  } else {
    root.append(groupResult(s, label, ctx));
  }
  if (s.chosen) root.append(partsEditor(ctx));
  if (!voting) stepify(root, [
    { pick: '.sdd-result', title: 'See what your group picked', guide: LATER_GUIDE.result },
    { pick: '.sprint-parts', title: 'Plan the parts of the prototype', guide: LATER_GUIDE.parts }
  ]);
  if (voting) stepify(root, [
    { pick: '.sdd-arena', title: 'Pick the winner, two ideas at a time', guide: LATER_GUIDE.read },
    { pick: '.sdd-rank', title: 'Your 1st, 2nd and 3rd', guide: LATER_GUIDE.reasons }
  ]);
  slidify(root, ctx.sprint.understand?.layout);
  root.append(bar.el);
  return { el: root, dispose: bar.dispose };
}

/** The point of Decide, said once at the top. */
function purpose(voting: boolean, ideas: number): HTMLElement {
  const box = el('section', 'sd-purpose');
  box.append(el('div', 'sd-purpose__kind', 'What this step is for'));
  box.append(el('p', '', voting
    ? `Your group picks one idea to build. In Sketch, each of you starred your strongest idea: those ${ideas} ideas are here, with no names. You see them two at a time and pick the one that better solves your group’s problem for your audience. Your picks give you a 1st, 2nd and 3rd. Once everyone is done, the idea with the most wins across your group is the one you build.`
    : 'Your group’s idea is chosen. Now you plan the prototype: list its parts, borrow the best bits of the other ideas and give every part to someone.'));
  return box;
}

/** A small seeded shuffle, so each student meets the pairs in their own order and keeps it on reload. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function matchups(ids: string[], seed: string): Array<[string, string]> {
  const rnd = seeded(seed);
  const pairs = pairsOf(ids).map(([a, b]) => (rnd() < 0.5 ? [a, b] : [b, a]) as [string, string]);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  return pairs;
}

/** The head-to-heads: one pair on screen, a winner, what it is stronger in, then the next pair. */
function duelArena(ctx: FormContext, state: PhasePayload['decide'], pool: GalleryIdea[], label: Map<string, string>, changed: () => void): HTMLElement {
  const box = el('section', 'sdd-arena');
  const ids = pool.map((i) => i.id);
  const byId = new Map(pool.map((i) => [i.id, i]));
  if (ids.length < 2) {
    box.append(el('p', 'sprint-note', ids.length ? 'Only one idea came in from Sketch, so there is nothing to compare. Your group builds this one.' : 'No ideas have come in from Sketch yet. They show here once your group submits Sketch.'));
    return box;
  }
  const me = (ctx.status.members ?? []).find((m) => m.me)?.key ?? '';
  const pairs = matchups(ids, `${me}:${ids.join(',')}`);
  const find = (a: string, b: string) => state.duels.find((d) => pairKey(d.a, d.b) === pairKey(a, b));
  const decided = (d: Duel | undefined) => !!d && (d.winner === d.a || d.winner === d.b) && d.stronger.length > 0;
  let at = Math.max(0, pairs.findIndex(([a, b]) => !decided(find(a, b))));
  if (pairs.every(([a, b]) => decided(find(a, b)))) at = pairs.length - 1;

  const progress = el('div', 'sdd-progress');
  const stage = el('div', 'sdd-stage');
  box.append(progress, stage);

  const paint = () => {
    const [a, b] = pairs[at]!;
    let d = find(a, b);
    progress.replaceChildren(el('span', 'sdd-progress__text', `Match-up ${at + 1} of ${pairs.length}`));
    const pills = el('div', 'sdd-progress__pills');
    pairs.forEach(([x, y], n) => {
      const pill = el('button', 'sdd-pill');
      pill.type = 'button';
      pill.setAttribute('aria-label', `Match-up ${n + 1}: ${label.get(x)} v ${label.get(y)}${decided(find(x, y)) ? ', done' : ''}`);
      if (n === at) pill.setAttribute('aria-current', 'step');
      pill.classList.toggle('is-done', decided(find(x, y)));
      pill.addEventListener('click', () => { at = n; paint(); });
      pills.append(pill);
    });
    progress.append(pills);

    const pair = el('div', 'sdd-pair');
    const card = (id: string) => {
      const i = byId.get(id)!;
      const c = el('article', 'sdd-idea');
      const won = d?.winner === id;
      c.classList.toggle('is-winner', won);
      c.classList.toggle('is-loser', !!d?.winner && !won);
      c.append(el('span', 'sprint-idea__tag', label.get(id)!), el('strong', 'sdd-idea__title', i.title));
      const part = (name: string, text: string | undefined) => { if (!text?.trim()) return; const p = el('p', 'sdd-idea__part'); p.append(el('b', '', name), ' ', text); c.append(p); };
      part('The idea:', i.idea);
      part('How it solves the problem:', i.answers);
      part('The evidence:', i.evidence);
      if (i.file) c.append(button('Open the picture or PDF', 'ghost', async () => window.open(await ctx.client.fileUrl(i.file!), '_blank', 'noopener')));
      const pick = el('button', 'sdd-win', won ? '✓ This one wins' : 'This one wins');
      pick.type = 'button';
      pick.setAttribute('aria-pressed', String(won));
      pick.disabled = !ctx.editable;
      pick.addEventListener('click', () => {
        if (!d) { d = { a, b, winner: id, stronger: [], why: '' }; state.duels.push(d); }
        else if (d.winner !== id) { d.winner = id; d.stronger = []; }
        changed();
        paint();
      });
      c.append(pick);
      return c;
    };
    pair.append(card(a), el('span', 'sdd-vs', 'v'), card(b));
    stage.replaceChildren(pair);

    const why = el('div', 'sdd-why');
    if (d?.winner) {
      why.append(el('p', 'sdd-why__ask', `${label.get(d.winner)} is stronger in… (tap one or more)`));
      const chips = el('div', 'sprint-votes');
      for (const c of ctx.sprint.criteria) {
        const chip = el('button', 'sprint-chip sprint-vote', c.text);
        chip.type = 'button';
        chip.disabled = !ctx.editable;
        chip.setAttribute('aria-pressed', String(d.stronger.includes(c.id)));
        chip.addEventListener('click', () => {
          d!.stronger = d!.stronger.includes(c.id) ? d!.stronger.filter((x) => x !== c.id) : [...d!.stronger, c.id];
          changed();
          paint();
        });
        chips.append(chip);
      }
      const note = el('input', 'qz-input sdd-why__note');
      note.maxLength = 160;
      note.placeholder = 'Anything else? (optional)';
      note.setAttribute('aria-label', 'Why it wins (optional)');
      note.value = d.why;
      note.disabled = !ctx.editable;
      note.addEventListener('input', () => { d!.why = note.value; changed(); });
      why.append(chips, note);
    } else why.append(el('p', 'sprint-note', 'Which one better solves your group’s problem for your audience? Tap “This one wins” on it.'));
    const nav = el('div', 'sdd-nav');
    const back = button('← Back', 'ghost', () => { at -= 1; paint(); });
    back.disabled = at === 0;
    const last = at === pairs.length - 1;
    const left = pairs.filter(([x, y]) => !decided(find(x, y))).length;
    const next = button(last ? (left ? `${left} match-up${left === 1 ? '' : 's'} still to do` : 'All done: see your ranking') : 'Next match-up →', 'primary', () => {
      if (!last) { at += 1; paint(); return; }
      const open = pairs.findIndex(([x, y]) => !decided(find(x, y)));
      if (open >= 0) { at = open; paint(); }
      else showRanking(box);
    });
    next.disabled = !last && !decided(d);
    nav.append(back, next);
    why.append(nav);
    stage.append(why);
  };
  paint();
  return box;
}

/** Bring the ranking step into view, turning the slide to it when steps show one at a time. */
function showRanking(from: HTMLElement): void {
  const root = from.closest('.sprint-decide');
  const step = root?.querySelector('.sdd-rank')?.closest<HTMLElement>('.su-step');
  if (!root || !step) return;
  if (step.hidden) root.querySelectorAll<HTMLButtonElement>('.su-rail__dot')[[...root.querySelectorAll(':scope > .su-step')].indexOf(step)]?.click();
  step.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** The student's own 1st, 2nd and 3rd from their head-to-heads, with what each idea won on. */
function myRanking(duels: Duel[], pool: GalleryIdea[], label: Map<string, string>, ctx: FormContext): HTMLElement[] {
  const ids = pool.map((i) => i.id);
  if (ids.length < 2) return [el('p', 'sprint-note', 'Nothing to rank: your group has one idea.')];
  if (!duelsDone(duels, ids)) {
    const left = pairsOf(ids).length - new Set(duels.filter((d) => d.winner).map((d) => pairKey(d.a, d.b))).size;
    return [el('p', 'sprint-note', `Your ranking shows here once you have picked a winner in every match-up. ${left} to go.`)];
  }
  const order = rankIdeas(duels, ids);
  const byId = new Map(pool.map((i) => [i.id, i]));
  const crit = new Map(ctx.sprint.criteria.map((c) => [c.id, c.text]));
  const list = el('ol', 'sdd-podium');
  order.forEach((id, n) => {
    const wins = duels.filter((d) => d.winner === id);
    const li = el('li', `sdd-podium__row${n < 3 ? ' is-top' : ''}`);
    li.append(el('span', 'sdd-podium__place', PLACE[n] ?? `${n + 1}th`));
    const body = el('div');
    body.append(el('strong', '', `${label.get(id)} · ${byId.get(id)!.title}`));
    const tally = new Map<string, number>();
    for (const d of wins) for (const c of d.stronger) tally.set(c, (tally.get(c) ?? 0) + 1);
    const strong = [...tally].sort((x, y) => y[1] - x[1]).map(([c, k]) => `${crit.get(c) ?? c}${k > 1 ? ` ×${k}` : ''}`);
    body.append(el('p', 'sprint-note', `Won ${wins.length} of ${ids.length - 1}${strong.length ? ` · stronger in ${strong.join(', ')}` : ''}`));
    li.append(body);
    list.append(li);
  });
  return [list, el('p', 'sprint-note', 'When everyone in your group has finished, the idea with the most wins across the group is the one you build. If you all have the same 1st, that’s your winner. You can go back and change a match-up until then.')];
}

/** After voting: the group's idea, its top three, and which idea was strongest in each criterion. */
function groupResult(s: SprintStatus, label: Map<string, string>, ctx: FormContext): HTMLElement {
  const box = el('section', 'sdd-result');
  const r = s.results;
  box.append(el('h2', '', s.chosen ? 'Your group’s idea' : 'Your teacher is choosing'));
  if (s.chosen) {
    const chosen = el('div', 'sprint-chosen');
    chosen.append(el('strong', '', s.chosen.title), el('p', '', s.chosen.idea));
    if (r?.unanimous) chosen.append(el('p', 'sdd-result__agree', 'Everyone in your group picked this idea 1st.'));
    box.append(chosen);
  } else if (r?.ranking.length) box.append(el('p', 'sprint-note', 'Two ideas finished level on wins, so your teacher picks between them.'));
  if (r?.ranking.length) {
    const top = el('ol', 'sdd-podium');
    r.ranking.forEach((x, n) => {
      const li = el('li', 'sdd-podium__row is-top');
      li.append(el('span', 'sdd-podium__place', PLACE[n] ?? ''), el('strong', '', `${label.get(x.id) ?? 'Idea'} · ${x.title}`));
      top.append(li);
    });
    box.append(el('h3', '', 'Your group’s top three'), top);
  }
  if (r?.best_at.length) {
    const crit = new Map(ctx.sprint.criteria.map((c) => [c.id, c.text]));
    const best = el('div', 'sdd-best');
    best.append(el('h3', '', 'Strongest in each criterion'), el('p', 'sprint-note', 'Your group’s idea can borrow the best bits of the others. Add them as parts below.'));
    for (const b of r.best_at) {
      const p = el('p', 'sdd-best__row');
      p.append(el('b', '', `${crit.get(b.criterion) ?? b.criterion}:`), ` ${b.ideas.map((i) => `${label.get(i.id) ?? 'Idea'} · ${i.title}`).join(' and ')}`);
      best.append(p);
    }
    box.append(best);
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
      for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; crit.append(o); }
      crit.value = p.criterion;
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
  const best = (ctx.status.results?.best_at ?? []).flatMap((b) => b.ideas.filter((i) => i.id !== ctx.status.chosen?.id).map((i) => ({ ...i, criterion: b.criterion })));
  if (best.length) {
    const crit = new Map(ctx.sprint.criteria.map((c) => [c.id, c.text]));
    const b = el('div', 'sd-borrow');
    b.append(el('h4', '', 'Worth borrowing'), el('p', 'sprint-note', 'Other ideas your group found strongest in a criterion. Add the best bit as a part of your idea.'));
    for (const x of best) {
      const row = el('div', 'kit-row');
      row.append(el('span', '', `${crit.get(x.criterion) ?? ''}: “${x.title}”. ${x.idea}`));
      const go = button('Add as a part', 'ghost', () => { parts.push({ ...newPart(`From "${x.title}"`, x.idea), criterion: x.criterion }); paint(); });
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
  [(s.pool ?? []).map((x) => x.id).join(','), s.votes_closed ? 1 : 0, s.chosen?.id ?? '', (s.parts ?? []).map((p) => `${p.id}:${(p.assigned ?? []).join('+')}:${p.mine ? 1 : 0}`).join(','), (s.results?.best_at ?? []).length, s.assembler?.key ?? ''].join('|');

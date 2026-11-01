import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { LEVEL_LABELS } from './schema';
import { mountMarking } from './marking';
import type { GalleryIdea, GroupBoard, SprintTeacherApi } from './api';

/**
 * One group's board for the teacher: its Understand space (problem statements,
 * audience, limits and the questions to answer), the gallery with
 * authors, heat and vote totals, the reasons, parts, pitch file, the work to
 * mark and the pitch feedback with hold-and-release. Spotlight puts one
 * answer up for the class with no name.
 */
export function mountGroupBoard(host: HTMLElement, o: { api: SprintTeacherApi; groupId: string; getLesson: () => Lesson; emitLesson: (next: Lesson) => void; onChanged(): void; practice?: boolean; markNow?: boolean }): { refresh(): Promise<void>; dispose(): void } {
  const root = el('section', 'sboard');
  host.replaceChildren(root);
  let disposed = false;
  const act = async (p: Promise<unknown>) => { try { await p; o.onChanged(); await refresh(); } catch (e) { root.append(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'That didn’t work.')); } };
  const crit = () => o.getLesson().sprint?.criteria ?? [];
  // Opened from a Mark pill: go straight to the reflections, once.
  let markNow = !!o.markNow;

  function paint(b: GroupBoard): void {
    root.replaceChildren();
    root.append(el('h2', '', /^group\b/i.test(b.group.name) ? b.group.name : `Group ${b.group.name}`));

    const q = el('div', 'sboard__part');
    q.append(el('h3', '', 'Understand'), el('p', 'sprint-note', b.question ? `Group problem: ${b.question.text}` : b.awaiting?.kind === 'question' ? 'Waiting for you to choose the problem.' : 'The problem is chosen when Understand closes.'));
    for (const n of b.notes) {
      const r = el('div', 'kit-row');
      r.append(el('span', '', `${n.text} · ${n.name}`), button('Spotlight', 'ghost', () => void act(o.api.spotlight(n.student_id, 'understand', n.field ?? `notes.${n.index}`))));
      if (b.awaiting?.kind === 'question') r.append(button('Choose this one', 'secondary', () => void act(o.api.confirm(b.group.id, 'question', n.id))));
      q.append(r);
    }
    const u = b.understand;
    if (u) {
      if (u.audience) q.append(el('p', '', `Audience: ${u.audience.who}${u.audience.why ? `. ${u.audience.why}` : ''}`));
      const cards = Object.entries(u.limits).flatMap(([box, list]) => list.map((c) => `${c.text}${c.count > 1 ? ` ×${c.count}` : ''} (${box.replace('_', ' ').replace('cant', 'can’t')})`));
      if (cards.length) q.append(el('p', 'sprint-note', `Limits: ${cards.join(' · ')}`));
      for (const sent of u.sent) {
        const f = el('form', 'kit-row sboard__answer');
        const input = el('input', 'qz-input');
        input.maxLength = 600;
        input.value = sent.answer ?? '';
        input.placeholder = 'Your answer';
        input.setAttribute('aria-label', `Answer: ${sent.text}`);
        const go = el('button', 'btn btn--secondary', sent.answer ? 'Update answer' : 'Send answer');
        go.type = 'submit';
        f.addEventListener('submit', (e) => { e.preventDefault(); void act(o.api.answer(b.group.id, sent.id, input.value)); });
        f.append(el('span', '', `Question: ${sent.text}`), input, go);
        q.append(f);
      }
    }
    root.append(q);

    const g = el('div', 'sboard__part');
    g.append(el('h3', '', 'Gallery'), el('p', 'sprint-note', b.chosen ? 'The idea is chosen.' : b.awaiting?.kind === 'idea' ? 'Voting has closed. Choose the idea.' : b.awaiting?.kind === 'question' ? 'Decide waits until you confirm the group’s problem in Understand.' : 'Head-to-heads are open. To move the group on without waiting, pick an idea.'));
    if (!b.chosen && b.voted) g.append(el('p', 'sprint-note', `Finished their match-ups: ${b.voted.done.join(', ') || 'no one yet'}. Still going: ${b.voted.waiting.join(', ') || 'no one'}.`));
    // The head-to-heads use each student's starred idea; their other cards stay folded below.
    const ideaRow = (set: GroupBoard['gallery'][number], i: GalleryIdea, inPool: boolean) => {
      const r = el('div', `kit-row${b.chosen === i.id ? ' sboard__chosen' : ''}`);
      const wins = b.totals[i.id] ?? 0;
      r.append(el('span', '', inPool ? `${i.title} · ${set.name} · ${wins} ${wins === 1 ? 'win' : 'wins'}` : i.title));
      if (inPool) {
        const heat = el('span', 'sprint-heat');
        for (const c of crit()) { const cell = el('i', '', c.text.slice(0, 14)); cell.dataset.level = String(b.heat[i.id]?.[c.id] ?? 0); cell.title = `Stronger in ${c.text}`; heat.append(cell); }
        r.append(heat);
      }
      if (typeof i.index === 'number') r.append(button('Spotlight', 'ghost', () => void act(o.api.spotlight(set.student_id, 'sketch', `cards.${i.index}.idea`))));
      if (b.awaiting?.kind === 'idea' || (!b.chosen && b.awaiting === null)) r.append(button(b.awaiting?.kind === 'idea' ? 'Choose this idea' : 'Pick this idea', 'secondary', () => void act(o.api.confirm(b.group.id, 'idea', i.id))));
      return r;
    };
    const starred = (set: GroupBoard['gallery'][number]) => set.ideas.find((i) => i.strongest) ?? set.ideas[0];
    const pool = b.gallery.filter((set) => starred(set)).sort((x, y) => (b.totals[starred(y)!.id] ?? 0) - (b.totals[starred(x)!.id] ?? 0));
    g.append(el('p', 'kit-label', 'In the head-to-heads: each student’s starred idea, most wins first'), el('p', 'sprint-note', 'Shading shows how often students said the winner was stronger in each criterion.'));
    for (const set of pool) g.append(ideaRow(set, starred(set)!, true));
    const others = b.gallery.flatMap((set) => set.ideas.filter((i) => i !== starred(set)).map((i) => ({ set, i })));
    if (others.length) {
      const more = el('details', 'sboard__more');
      more.append(el('summary', '', `Their other ideas (${others.length}, not in the head-to-heads)`));
      for (const { set, i } of others) { const r = ideaRow(set, i, false); r.prepend(el('span', 'kit-label', set.name)); more.append(r); }
      g.append(more);
    }
    root.append(g);

    const titleOf = new Map(b.gallery.flatMap((set) => set.ideas.map((i) => [i.id, i.title])));
    if (b.reasons.some((r) => r.ranked?.length)) {
      const rk = el('div', 'sboard__part');
      rk.append(el('h3', '', 'Each student’s ranking'), el('p', 'sprint-note', 'From their head-to-heads, 1st first. Wins are the totals above.'));
      for (const r of b.reasons) if (r.ranked?.length) rk.append(el('p', '', `${r.name}: ${r.ranked.slice(0, 3).map((id, n) => `${n + 1}. ${titleOf.get(id) ?? 'an idea'}`).join(' · ')}`));
      for (const r of b.reasons) for (const d of r.duels ?? []) if (d.why?.trim()) rk.append(el('p', 'sprint-note', `${r.name} on “${titleOf.get(d.winner) ?? 'an idea'}” over “${titleOf.get(d.winner === d.a ? d.b : d.a) ?? 'an idea'}”: ${d.why}`));
      root.append(rk);
    }
    if (b.reasons.some((r) => Object.keys(r.reasons).length || r.dots?.length)) {
      const rs = el('div', 'sboard__part');
      rs.append(el('h3', '', 'Vote reasons'));
      for (const r of b.reasons) for (const c of crit()) if (r.reasons[c.id]) rs.append(el('p', '', `${r.name}, ${c.text}: ${r.reasons[c.id]}`));
      const titles = new Map(b.gallery.flatMap((set) => set.ideas.map((i) => [i.id, i.title])));
      for (const r of b.reasons) for (const d of r.dots ?? []) rs.append(el('p', 'sprint-note', `${r.name} dotted ${d.part === 'idea' ? 'the idea' : d.part === 'answers' ? 'how it solves the problem' : 'the evidence'} in "${titles.get(d.idea) ?? 'an idea'}"${d.note ? `: ${d.note}` : ''}`));
      root.append(rs);
    }

    const p = el('div', 'sboard__part');
    p.append(el('h3', '', 'Parts and pitch file'));
    if (b.assembler) p.append(el('p', '', `Assembler: ${b.assembler}`));
    for (const part of b.parts) p.append(el('p', '', `${part.text}: ${part.by.join(', ') || 'unclaimed'}`));
    if (b.pitch) {
      const pitch = b.pitch;
      p.append(button(`Open pitch file (${pitch.kind === 'link' ? pitch.link : pitch.name}) · set by ${pitch.by}`, 'ghost', async () => {
        if (pitch.kind === 'link' && pitch.link) window.open(pitch.link, '_blank', 'noopener');
        else if (pitch.file) window.open(await o.api.fileUrl(pitch.file), '_blank', 'noopener');
      }));
    }
    root.append(p);

    const mark = el('div', 'sboard__part');
    mark.append(el('h3', '', 'Marking'));
    const markHost = el('div');
    const inTest = b.subs.test.filter((x) => x.sub?.submitted_at).length;
    if (o.practice) mark.append(el('p', 'kit-why', 'Marking is off in a practice run, so nothing reaches your markbook.'));
    else {
      const startMarking = () => mountMarking(markHost, { kind: 'reflection', board: b, api: o.api, getLesson: o.getLesson, emitLesson: o.emitLesson });
      mark.append(button(`Mark reflections (${inTest} in)`, 'secondary', startMarking), markHost);
      if (markNow) { markNow = false; startMarking(); requestAnimationFrame(() => mark.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
    }
    root.append(mark);

    if (b.round) {
      const rd = el('div', 'sboard__part');
      rd.append(el('h3', '', `Pitch feedback (${b.round.status})`));
      for (const e of b.round.entries) {
        const r = el('div', 'kit-row');
        const levels = crit().map((c) => `${c.text}: ${LEVEL_LABELS[(e.levels[c.id] ?? 1) - 1]}`).join(' · ');
        r.append(el('span', '', `${e.name} · ${levels} · ${e.worked} ${e.next}${e.flagged ? ' · held' : ''}`));
        if (e.status === 'held') r.append(button('Release', 'secondary', () => void act(o.api.moderate(b.group.id, e.student_id, 'released'))));
        if (e.status !== 'removed') r.append(button('Remove', 'ghost', () => void act(o.api.moderate(b.group.id, e.student_id, 'removed'))));
        rd.append(r);
      }
      root.append(rd);
    }
  }

  async function refresh(): Promise<void> {
    try {
      const b = await o.api.board(o.groupId);
      if (!disposed) paint(b);
    } catch (e) {
      root.replaceChildren(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'The board didn’t load.'));
    }
  }
  void refresh();
  return { refresh, dispose() { disposed = true; host.replaceChildren(); } };
}

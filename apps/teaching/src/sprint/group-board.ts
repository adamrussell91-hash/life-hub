import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { formatDueDay, formatDueTime } from '@/blocks/classroom-tools/logic';
import { LEVEL_LABELS, PHASE_LABELS, SPRINT_PHASES, type SprintPhaseKey } from './schema';
import { mountMarking } from './marking';
import { pairKey, pairsOf, phaseDue } from './rules';
import type { GalleryIdea, GroupBoard, SprintTeacherApi } from './api';

type Tab = 'understand' | 'ideas' | 'build' | 'test';
type Student = NonNullable<GroupBoard['progress']>['students'][number];
type IdeaSet = GroupBoard['gallery'][number];

const TABS: ReadonlyArray<readonly [Tab, string]> = [['understand', 'Understand'], ['ideas', 'Sketch and Decide'], ['build', 'Prototype'], ['test', 'Test and marking']];
const TAB_OF: Record<SprintPhaseKey, Tab> = { understand: 'understand', sketch: 'ideas', decide: 'ideas', prototype: 'build', test: 'test' };
const HEAT_WORDS = ['no one yet', 'sometimes', 'often', 'most often'] as const;

const savedWhen = (iso: string | undefined, now = new Date()): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? time : `${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
};

/**
 * One group's board for the teacher. The top says where the group is, what it
 * needs from you and where each student has got to. Below, one tab per stretch
 * of the sprint, opening on the one the group is in. Spotlight puts one answer
 * up for the class with no name.
 */
export function mountGroupBoard(host: HTMLElement, o: { api: SprintTeacherApi; groupId: string; getLesson: () => Lesson; emitLesson: (next: Lesson) => void; onChanged(): void; practice?: boolean; markNow?: boolean }): { refresh(): Promise<void>; dispose(): void } {
  const root = el('section', 'sboard');
  host.replaceChildren(root);
  let disposed = false;
  const error = el('p', 'sprint-submit__err');
  const act = async (p: Promise<unknown>) => { try { error.textContent = ''; await p; o.onChanged(); await refresh(); } catch (e) { error.textContent = e instanceof Error ? e.message : 'That didn’t work.'; root.append(error); } };
  const crit = () => o.getLesson().sprint?.criteria ?? [];
  // Opened from a Mark pill: go straight to the reflections, once.
  let markNow = !!o.markNow;
  // Kept across repaints, so answering or picking doesn't throw the teacher back to the start.
  let tab: Tab | null = markNow ? 'test' : null;
  const openCards = new Set<string>();
  const askHost = el('div');

  const link = (text: string, onClick: () => void) => { const b = button(text, 'ghost', onClick); b.classList.add('sboard__link'); return b; };
  const heading = (title: string, hint?: string) => {
    const box = el('div', 'sboard__block');
    box.append(el('h3', '', title));
    if (hint) box.append(el('p', 'sprint-note', hint));
    return box;
  };

  const currentPhase = (b: GroupBoard): SprintPhaseKey | null => b.progress?.open.at(-1) ?? null;

  function statusCell(b: GroupBoard, s: Student, key: SprintPhaseKey): HTMLElement {
    const cell = el('span', 'sboard__state');
    const paintState = (kind: 'in' | 'go' | 'not', text: string, small?: string) => {
      cell.classList.add(`sboard__state--${kind}`);
      cell.textContent = text;
      if (small) cell.append(el('small', '', small));
    };
    if (key === 'decide') {
      if (s.voted) { paintState('in', 'Finished'); return cell; }
      const pool = poolOf(b).map(({ idea }) => idea.id);
      const pairs = pairsOf(pool);
      const duels = b.reasons.find((r) => r.student_id === s.id)?.duels ?? [];
      const done = pairs.filter(([x, y]) => duels.some((d) => pairKey(d.a, d.b) === pairKey(x, y) && d.winner)).length;
      if (done) { paintState('go', `${done} of ${pairs.length} match-ups`); return cell; }
    }
    const state = s.phases[key];
    if (state === 'in') paintState('in', 'Handed in');
    else if (state === 'late') paintState('in', 'Handed in late');
    else if (state === 'draft') { const when = savedWhen(s.saved_at[key]); paintState('go', 'Saved, not handed in', when ? `Last saved ${when}` : undefined); }
    else paintState('not', 'Not started');
    return cell;
  }

  const againLink = (text: string, onClick: () => void) => { const b = link(text, onClick); b.classList.add('sboard__again'); return b; };

  /** What setting this work aside touches beyond the student, only as far as it applies to this group now. */
  function anotherGoNotes(b: GroupBoard, s: Student, key: SprintPhaseKey): string[] {
    const name = PHASE_LABELS[key];
    const notes = [`${name} starts blank for ${s.name}. Their earlier work is set aside, and you can bring it back here.`];
    if (s.phases[key] === 'in' || s.phases[key] === 'late') notes.push('They hand it in again when they’re ready.');
    const votesClosed = !!b.chosen || b.awaiting?.kind === 'idea';
    if (key === 'understand' && b.question) notes.push('The group’s problem stays as chosen.');
    if (key === 'sketch') notes.push(votesClosed ? 'Voting has closed, so new ideas stay out of the head-to-heads.' : 'Their idea leaves the head-to-heads until they hand in again, and they redo their match-ups.');
    if (key === 'decide') notes.push(votesClosed ? 'Voting has closed, so the group’s result stays and new match-ups don’t count.' : 'They redo their match-ups, and voting waits for them.');
    if (key === 'prototype') notes.push('Their part stays theirs, and the group’s pitch file stays.');
    if (key === 'test') notes.push('Marks you’ve already given stay in the markbook.');
    const next = SPRINT_PHASES[SPRINT_PHASES.indexOf(key) + 1];
    const dates = b.progress?.phases.find((p) => p.key === key);
    const due = dates ? phaseDue(dates) : null;
    if (due !== null && due <= Date.now()) notes.push(`${name} has closed, so what they hand in counts as late. Extend their deadline to change that.`);
    else if (next && b.progress?.open.includes(next)) notes.push(`If everyone being in is what opened ${PHASE_LABELS[next]}, the group waits on ${s.name} until they hand in again or ${name} closes.`);
    return notes;
  }

  function askBox(title: string, notes: string[], label: string, go: () => void): void {
    const box = el('div', 'smap-confirm');
    const ul = el('ul');
    for (const n of notes) ul.append(el('li', '', n));
    box.append(el('strong', '', title), ul, button(label, 'primary', () => { askHost.replaceChildren(); go(); }), button('Not yet', 'secondary', () => askHost.replaceChildren()));
    askHost.replaceChildren(box);
    box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  const askAnotherGo = (b: GroupBoard, s: Student, key: SprintPhaseKey) => askBox(`Give ${s.name} another go at ${PHASE_LABELS[key]}?`, anotherGoNotes(b, s, key), 'Give another go', () => void act(o.api.anotherGo(s.id, key)));

  const askBringBack = (s: Student, key: SprintPhaseKey) => askBox(`Bring back ${s.name}’s earlier ${PHASE_LABELS[key]} work?`, [s.phases[key] === 'none' ? 'It goes back just as it was.' : 'It goes back just as it was, and what they’ve written since is set aside in its place.'], 'Bring it back', () => void act(o.api.bringBack(s.id, key)));

  function whoTable(b: GroupBoard): HTMLElement | null {
    const p = b.progress;
    if (!p?.students.length) return null;
    const now = currentPhase(b);
    const shown = SPRINT_PHASES.filter((k) => p.open.includes(k));
    const table = el('table', 'sboard__who');
    const head = el('tr');
    head.append(el('th', '', 'Student'));
    for (const k of shown) head.append(el('th', k === now ? 'is-now' : 'is-past', PHASE_LABELS[k]));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const s of p.students) {
      const row = el('tr');
      row.append(el('td', '', s.name));
      for (const k of shown) {
        const td = el('td', k === now ? 'is-now' : 'is-past');
        td.append(statusCell(b, s, k));
        if (s.phases[k] !== 'none') td.append(againLink('Give another go', () => askAnotherGo(b, s, k)));
        if (s.earlier?.[k]) td.append(againLink('Bring back earlier work', () => askBringBack(s, k)));
        row.append(td);
      }
      body.append(row);
    }
    table.append(thead, body);
    return table;
  }

  function summaryLine(b: GroupBoard): string {
    const now = currentPhase(b);
    if (!now || !b.progress) return '';
    const students = b.progress.students;
    const count = now === 'decide'
      ? `${students.filter((s) => s.voted).length} of ${students.length} finished the head-to-heads`
      : `${students.filter((s) => s.phases[now] === 'in' || s.phases[now] === 'late').length} of ${students.length} handed in`;
    const due = b.progress.phases.find((x) => x.key === now);
    const closes = due?.due_date ? `closes ${formatDueDay(due.due_date)}, ${formatDueTime(due.due_time || '23:59')}` : '';
    return [`In ${PHASE_LABELS[now]}`, count, closes].filter(Boolean).join(' · ');
  }

  /** The one thing the group needs from the teacher, if anything, with a way straight to it. */
  function needsYou(b: GroupBoard, go: (t: Tab) => void): HTMLElement | null {
    const a = b.awaiting;
    const unanswered = (b.understand?.sent ?? []).filter((q) => !q.answer).length;
    const band = (text: string, t: Tab, label: string) => { const box = el('div', 'sboard__needs'); box.append(el('span', '', text), button(label, 'secondary', () => go(t))); return box; };
    if (a?.kind === 'question') return band(a.empty ? 'No problem statements are in yet. Decide can’t pick an idea until you choose one.' : `${a.tie ? 'It’s a tie. ' : ''}Choose the group’s problem. Decide can’t pick an idea until you do.`, 'understand', 'Go to the problems');
    if (a?.kind === 'idea') return band(a.empty ? 'Voting has closed with no ideas in.' : `${a.tie ? 'It’s a tie. ' : 'Voting has closed. '}Choose the group’s idea so they can plan the parts.`, 'ideas', 'Go to the ideas');
    if (unanswered) return band(`${unanswered} ${unanswered === 1 ? 'question' : 'questions'} from the group to answer.`, 'understand', 'Go to the questions');
    return null;
  }

  const starredOf = (set: IdeaSet) => set.ideas.find((i) => i.strongest) ?? set.ideas[0];
  const poolOf = (b: GroupBoard) => b.gallery
    .filter((set) => starredOf(set))
    .map((set) => ({ set, idea: starredOf(set)! }))
    .sort((x, y) => (b.totals[y.idea.id] ?? 0) - (b.totals[x.idea.id] ?? 0));

  /** The full card behind an idea, folded; stays open across repaints. */
  function cardFold(i: GalleryIdea): HTMLElement {
    const d = el('details', 'sboard__card');
    d.open = openCards.has(i.id);
    d.addEventListener('toggle', () => { if (d.open) openCards.add(i.id); else openCards.delete(i.id); });
    d.append(el('summary', '', 'Read the card'));
    const dl = el('dl');
    for (const [label, text] of [['The idea', i.idea], ['How it solves the problem', i.answers], ['Evidence', i.evidence]] as const) {
      if (text?.trim()) dl.append(el('dt', '', label), el('dd', '', text));
    }
    d.append(dl);
    if (i.file) { const file = i.file; d.append(link('Open the attached file', () => void o.api.fileUrl(file).then((url) => window.open(url, '_blank', 'noopener')))); }
    return d;
  }

  function ideaActions(b: GroupBoard, set: IdeaSet, i: GalleryIdea): HTMLElement {
    const row = el('div', 'sboard__acts');
    if (b.awaiting?.kind === 'idea' || (!b.chosen && b.awaiting === null)) row.append(button(b.awaiting?.kind === 'idea' ? 'Choose this idea' : 'Pick this idea', 'secondary', () => void act(o.api.confirm(b.group.id, 'idea', i.id))));
    if (typeof i.index === 'number') row.append(link('Spotlight', () => void act(o.api.spotlight(set.student_id, 'sketch', `cards.${i.index}.idea`))));
    return row;
  }

  function ideasTable(b: GroupBoard): HTMLElement {
    const table = el('table', 'sboard__ideas');
    const head = el('tr');
    head.append(el('th', 'is-wins', 'Wins'), el('th', '', 'Idea'));
    for (const c of crit()) head.append(el('th', 'is-crit', c.text));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const { set, idea } of poolOf(b)) {
      const row = el('tr', b.chosen === idea.id ? 'sboard__chosen' : '');
      const wins = b.totals[idea.id] ?? 0;
      const winCell = el('td', 'is-wins', String(wins));
      winCell.setAttribute('aria-label', `${wins} ${wins === 1 ? 'win' : 'wins'}`);
      const main = el('td', 'is-main');
      main.append(el('span', 'sboard__title', idea.title));
      if (b.chosen === idea.id) main.append(el('span', 'sboard__chosen-tag', 'Chosen'));
      main.append(el('span', 'sboard__by', set.name), cardFold(idea), ideaActions(b, set, idea));
      row.append(winCell, main);
      for (const c of crit()) {
        const level = b.heat[idea.id]?.[c.id] ?? 0;
        const cell = el('td', 'is-crit');
        cell.dataset.label = c.text;
        const dot = el('span', 'sboard__heat');
        dot.dataset.level = String(level);
        const says = `Stronger in ${c.text}: ${HEAT_WORDS[level]}`;
        dot.title = says;
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', says);
        cell.append(dot);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(thead, body);
    return table;
  }

  function ideasPane(b: GroupBoard): HTMLElement {
    const pane = el('div', 'sboard__pane');
    const pool = poolOf(b);
    const g = heading('Ideas in the head-to-heads', pool.length ? 'Each student’s starred idea, most wins first.' : undefined);
    if (b.chosen) g.append(el('p', 'sprint-note', 'The idea is chosen.'));
    else if (b.awaiting === null && pool.length) g.append(el('p', 'sprint-note', 'Head-to-heads are open. To move the group on without waiting, pick an idea.'));
    else if (b.awaiting?.kind === 'question') g.append(el('p', 'sprint-note', 'Decide waits until you confirm the group’s problem in Understand.'));
    if (pool.length) {
      g.append(ideasTable(b));
      if (crit().length) g.append(el('p', 'sboard__key', 'Darker means students more often said it was the stronger one on that criterion.'));
    } else g.append(el('p', 'sprint-note', 'No ideas are in yet.'));
    const missing = (b.progress?.students ?? []).filter((s) => s.phases.sketch === 'none' || s.phases.sketch === 'draft').map((s) => s.name);
    const sketchOpen = currentPhase(b) === 'sketch';
    if (missing.length && (sketchOpen || b.progress?.open.includes('decide'))) g.append(el('p', 'sprint-note', sketchOpen ? `Not in yet: ${missing.join(', ')}. Saved cards go in when Sketch closes.` : `Not in the head-to-heads: ${missing.join(', ')}. They didn’t hand in a Sketch.`));
    const others = b.gallery.map((set) => ({ set, ideas: set.ideas.filter((i) => i !== starredOf(set)) })).filter((x) => x.ideas.length);
    const count = others.reduce((n, x) => n + x.ideas.length, 0);
    if (count) {
      const more = el('details', 'sboard__more');
      more.append(el('summary', '', `Other ideas, by student (${count})`));
      for (const { set, ideas } of others) {
        more.append(el('h4', '', set.name));
        for (const i of ideas) {
          const r = el('div', 'sboard__other');
          r.append(el('span', 'sboard__title', i.title), cardFold(i), ideaActions(b, set, i));
          more.append(r);
        }
      }
      g.append(more);
    }
    pane.append(g);

    const titleOf = new Map(b.gallery.flatMap((set) => set.ideas.map((i) => [i.id, i.title])));
    if (b.reasons.some((r) => r.ranked?.length)) {
      const rk = heading('Each student’s ranking', 'From their head-to-heads, 1st first.');
      const dl = el('dl', 'sboard__rank');
      for (const r of b.reasons) {
        const dd = el('dd');
        if (r.ranked?.length) {
          const ol = el('ol');
          for (const id of r.ranked.slice(0, 3)) ol.append(el('li', '', titleOf.get(id) ?? 'an idea'));
          dd.append(ol);
          for (const d of r.duels ?? []) if (d.why?.trim()) dd.append(el('p', 'sprint-note', `“${titleOf.get(d.winner) ?? 'an idea'}” over “${titleOf.get(d.winner === d.a ? d.b : d.a) ?? 'an idea'}”: ${d.why}`));
        } else { dd.classList.add('sboard__waiting'); dd.textContent = 'No match-ups yet'; }
        dl.append(el('dt', '', r.name), dd);
      }
      rk.append(dl);
      pane.append(rk);
    }
    if (b.reasons.some((r) => Object.keys(r.reasons).length || r.dots?.length)) {
      const rs = heading('Vote reasons');
      for (const r of b.reasons) for (const c of crit()) if (r.reasons[c.id]) rs.append(el('p', '', `${r.name}, ${c.text}: ${r.reasons[c.id]}`));
      for (const r of b.reasons) for (const d of r.dots ?? []) rs.append(el('p', 'sprint-note', `${r.name} dotted ${d.part === 'idea' ? 'the idea' : d.part === 'answers' ? 'how it solves the problem' : 'the evidence'} in "${titleOf.get(d.idea) ?? 'an idea'}"${d.note ? `: ${d.note}` : ''}`));
      pane.append(rs);
    }
    return pane;
  }

  function limitsGrid(u: NonNullable<GroupBoard['understand']>): HTMLElement | null {
    if (!Object.values(u.limits).some((l) => l.length)) return null;
    const grid = el('div', 'sboard__limits');
    const cell = (box: keyof typeof u.limits) => {
      const box_ = el('div', 'sboard__limit');
      const ul = el('ul');
      for (const c of u.limits[box]) ul.append(el('li', '', `${c.text}${c.count > 1 ? ` ×${c.count}` : ''}`));
      box_.append(u.limits[box].length ? ul : el('span', 'sboard__waiting', 'Nothing yet'));
      return box_;
    };
    const axis = (text: string) => el('div', 'sboard__axis', text);
    const titled = (text: string, box: keyof typeof u.limits) => { const c = cell(box); c.prepend(el('span', 'sboard__limit-name', text)); return c; };
    grid.append(axis(''), axis('We can control it'), axis('We can’t control it'));
    grid.append(axis('We know it'), titled('We know it, and can control it', 'can_known'), titled('We know it, and can’t control it', 'cant_known'));
    grid.append(axis('We don’t know yet'), titled('We don’t know yet, and can control it', 'can_unknown'), titled('We don’t know yet, and can’t control it', 'cant_unknown'));
    return grid;
  }

  function understandPane(b: GroupBoard): HTMLElement {
    const pane = el('div', 'sboard__pane');
    const problem = heading('The group’s problem');
    if (b.question) problem.append(el('p', 'sboard__problem', b.question.text));
    else problem.append(el('p', 'sprint-note', b.awaiting?.kind === 'question' ? 'Waiting for you to choose the problem.' : 'The problem is chosen when Understand closes.'));
    pane.append(problem);
    if (b.notes.length) {
      const st = heading('Everyone’s problem statements');
      for (const n of b.notes) {
        const r = el('div', 'sboard__statement');
        const who = el('span', 'sboard__statement-who');
        who.append(el('span', 'sboard__by', n.name), link('Spotlight', () => void act(o.api.spotlight(n.student_id, 'understand', n.field ?? `notes.${n.index}`))));
        if (b.awaiting?.kind === 'question') who.append(button('Choose this one', 'secondary', () => void act(o.api.confirm(b.group.id, 'question', n.id))));
        r.append(el('span', '', n.text), who);
        st.append(r);
      }
      pane.append(st);
    }
    const u = b.understand;
    if (!u) return pane;
    if (u.audience) {
      const au = heading('Audience');
      const line = el('p');
      line.append(el('strong', '', u.audience.who), u.audience.why ? ` ${u.audience.why}` : '');
      au.append(line);
      pane.append(au);
    }
    const grid = limitsGrid(u);
    if (grid) { const li = heading('Limits'); li.append(grid); pane.append(li); }
    if (u.sent.length) {
      const qs = heading('Questions they asked you');
      for (const sent of u.sent) {
        const f = el('form', 'sboard__answer');
        const label = el('label', 'sboard__question', sent.text);
        const input = el('textarea', 'qz-input');
        input.maxLength = 600;
        input.rows = 2;
        input.value = sent.answer ?? '';
        input.placeholder = 'Your answer';
        input.setAttribute('aria-label', `Answer: ${sent.text}`);
        const go = el('button', 'btn btn--secondary', sent.answer ? 'Update answer' : 'Send answer');
        go.type = 'submit';
        f.addEventListener('submit', (e) => { e.preventDefault(); void act(o.api.answer(b.group.id, sent.id, input.value)); });
        f.append(label, input, go);
        qs.append(f);
      }
      pane.append(qs);
    }
    return pane;
  }

  function buildPane(b: GroupBoard): HTMLElement {
    const pane = el('div', 'sboard__pane');
    if (!b.parts.length && !b.pitch && !b.assembler) { pane.append(el('p', 'sprint-note', 'Parts and the pitch file show here once the group has planned them.')); return pane; }
    const p = heading('Parts and pitch file');
    if (b.assembler) p.append(el('p', '', `Assembler: ${b.assembler}`));
    const dl = el('dl', 'sboard__rank');
    for (const part of b.parts) dl.append(el('dt', '', part.text), el('dd', part.by.length ? '' : 'sboard__waiting', part.by.join(', ') || 'Unclaimed'));
    if (b.parts.length) p.append(dl);
    if (b.pitch) {
      const pitch = b.pitch;
      p.append(button(`Open pitch file (${pitch.kind === 'link' ? pitch.link : pitch.name}) · set by ${pitch.by}`, 'ghost', async () => {
        if (pitch.kind === 'link' && pitch.link) window.open(pitch.link, '_blank', 'noopener');
        else if (pitch.file) window.open(await o.api.fileUrl(pitch.file), '_blank', 'noopener');
      }));
    }
    pane.append(p);
    return pane;
  }

  function testPane(b: GroupBoard): HTMLElement {
    const pane = el('div', 'sboard__pane');
    const mark = heading('Marking');
    const markHost = el('div');
    const inTest = b.subs.test.filter((x) => x.sub?.submitted_at).length;
    if (o.practice) mark.append(el('p', 'kit-why', 'Marking is off in a practice run, so nothing reaches your markbook.'));
    else {
      const startMarking = () => mountMarking(markHost, { kind: 'reflection', board: b, api: o.api, getLesson: o.getLesson, emitLesson: o.emitLesson });
      mark.append(button(`Mark reflections (${inTest} in)`, 'secondary', startMarking), markHost);
      if (markNow) { markNow = false; startMarking(); requestAnimationFrame(() => mark.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
    }
    pane.append(mark);
    if (b.round) {
      const rd = heading(`Pitch feedback (${b.round.status})`);
      for (const e of b.round.entries) {
        const r = el('div', 'sboard__feedback');
        const text = el('div');
        text.append(el('strong', '', `${e.name}${e.flagged ? ' · held' : ''}`), el('p', 'sprint-note', crit().map((c) => `${c.text}: ${LEVEL_LABELS[(e.levels[c.id] ?? 1) - 1]}`).join(' · ')), el('p', '', `${e.worked} ${e.next}`));
        const acts = el('div', 'sboard__acts');
        if (e.status === 'held') acts.append(button('Release', 'secondary', () => void act(o.api.moderate(b.group.id, e.student_id, 'released'))));
        if (e.status !== 'removed') acts.append(button('Remove', 'ghost', () => void act(o.api.moderate(b.group.id, e.student_id, 'removed'))));
        r.append(text, acts);
        rd.append(r);
      }
      pane.append(rd);
    }
    return pane;
  }

  function paint(b: GroupBoard): void {
    const now = currentPhase(b);
    tab ??= now ? TAB_OF[now] : b.gallery.length ? 'ideas' : 'understand';
    root.replaceChildren();
    root.append(el('h2', '', /^group\b/i.test(b.group.name) ? b.group.name : `Group ${b.group.name}`));
    const line = summaryLine(b);
    if (line) root.append(el('p', 'sboard__sub', line));

    const tabs = el('div', 'sboard__tabs');
    tabs.setAttribute('role', 'tablist');
    const body = el('div');
    const panes: Record<Tab, (x: GroupBoard) => HTMLElement> = { understand: understandPane, ideas: ideasPane, build: buildPane, test: testPane };
    const show = (t: Tab) => {
      tab = t;
      for (const btn of tabs.children) btn.setAttribute('aria-selected', String((btn as HTMLElement).dataset.tab === t));
      body.replaceChildren(panes[t](b));
    };
    for (const [key, label] of TABS) {
      const t = el('button', 'sboard__tab', label);
      t.type = 'button';
      t.dataset.tab = key;
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => show(key));
      tabs.append(t);
    }
    const needs = needsYou(b, show);
    if (needs) root.append(needs);
    const who = whoTable(b);
    if (who) root.append(who, askHost);
    root.append(tabs, body);
    show(tab);
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

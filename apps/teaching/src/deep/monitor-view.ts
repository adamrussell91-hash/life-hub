import type { Evidence } from '@/evidence/types';
import { classEvidence } from '@/evidence/class-evidence';
import { loadInsightContext } from '@/evidence/context';
import { newGroupId } from '@/evidence/groups';
import { httpMarkbookApi } from '@/markbook/api';
import { todayInSydney } from '@/markbook/calc';
import type { Unit } from '@/schemas';
import type { ScheduledLesson } from '@/schemas/scheduled-lesson';
import { visitBlocks } from '@/blocks/walk-blocks';
import { targetPieces } from './block-tags';
import { deepApi, type DeepProgress } from './api';
import { placements } from './derive';
import { button, h, info, lessonCode, type LessonLike } from './editor';
import { piecesFor, STEP_LABEL, STEP_NAME, type DeepUnderstanding, type KnowledgePiece, type PlacedStep, type Step } from './schema';
import { circleFor, step1Passed, studentStep, type Circle } from './track';

export type Lane = '1' | '2a' | '2b' | '3' | '4' | 'done';
const LANES: Lane[] = ['1', '2a', '2b', '3', '4', 'done'];
const NEXT: Record<'none' | Step, Lane> = { none: '1', '1': '2a', '2a': '2b', '2b': '3', '3': '4', '4': 'done' };
const PLACED: PlacedStep[] = ['2a', '2b', '3', '4'];

export type MonitorInput = {
  deep: DeepUnderstanding[];
  students: Array<{ id: string; initials: string }>;
  evidence: Evidence[];
  progress: DeepProgress;
  introduced: ReadonlySet<string>;
  today: string;
};
export type LaneStudent = { id: string; initials: string; notUsed: number; since: string | null };

export function buildMonitor(input: MonitorInput) {
  const byDu = new Map<string, {
    lanes: Record<Lane, LaneStudent[]>;
    circles: Record<string, Record<string, Circle>>;
    knowsNotUsed: Array<{ student: string; piece: string; block: string }>;
    doesntRemember: Array<{ student: string; pieces: string[] }>;
    step1: Record<string, boolean>;
  }>();
  for (const du of input.deep) {
    const pieces = piecesFor(du, input.deep);
    const lanes: Record<Lane, LaneStudent[]> = { '1': [], '2a': [], '2b': [], '3': [], '4': [], done: [] };
    const circles: Record<string, Record<string, Circle>> = {};
    const knowsNotUsed: Array<{ student: string; piece: string; block: string }> = [];
    const doesntRemember: Array<{ student: string; pieces: string[] }> = [];
    const step1: Record<string, boolean> = {};
    for (const s of input.students) {
      const mine: Record<string, Circle> = {};
      for (const p of pieces) mine[p.id] = circleFor(input.evidence, s.id, p.id, input.today, input.progress.writing);
      circles[s.id] = mine;
      const passed = input.progress.steps[s.id]?.[du.id];
      step1[s.id] = step1Passed(pieces, input.introduced, mine);
      const step = studentStep(step1[s.id]!, passed);
      const notUsed = pieces.filter((p) => mine[p.id]!.ring === 'missed').length;
      lanes[NEXT[step ?? 'none']].push({ id: s.id, initials: s.initials, notUsed, since: passed?.at ?? null });
      for (const [block, byStudent] of Object.entries(input.progress.writing)) {
        for (const piece of byStudent[s.id]?.missed ?? []) {
          if (pieces.some((p) => p.id === piece) && mine[piece]?.ring === 'missed') knowsNotUsed.push({ student: s.id, piece, block });
        }
      }
      const amber = pieces.filter((p) => mine[p.id]!.amber).map((p) => p.id);
      if (amber.length) doesntRemember.push({ student: s.id, pieces: amber });
    }
    byDu.set(du.id, { lanes, circles, knowsNotUsed, doesntRemember, step1 });
  }
  return { byDu };
}

/** The paragraph a teacher can paste into a program or report. */
export function summaryParagraph(deep: readonly DeepUnderstanding[]): string {
  const parts = deep.map((d, i) => {
    const links = [...d.dot_points.map((r) => r.split(':').pop()), ...d.concept_bullets].join(', ');
    return `${i + 1}) ${d.claim.trim() || 'No claim yet'}${links ? ` (${links})` : ''}.`.replace(/\.\./g, '.');
  });
  return `This unit builds ${deep.length} deep understanding${deep.length === 1 ? '' : 's'}: ${parts.join(' ')}`;
}

const LANE_ADVICE: Record<Lane, string> = {
  '1': 'Students here can build their hold on each piece. Short quizzes that return to a piece on a second day move it from half to secure.',
  '2a': 'Students here can explain the claim in one text. Show a model explanation, then ask for their own on the same text.',
  '2b': 'Students here can carry the claim to a second text. Ask them to name what stays the same and what the new text changes.',
  '3': 'Students here can compare when prompted. Offer a prompt such as "Where else have you seen this move?" and ask for two texts side by side.',
  '4': 'Students here can spot and use the claim when given an unseen text with no cue. Ask them to choose the move that fits and say why.',
  done: 'Students here can spot and use the claim on their own. Invite them to teach it to a partner or try a harder text.'
};
const LANE_NAME: Record<Lane, string> = {
  '1': `Step 1 · ${STEP_NAME['1']}`,
  '2a': `Step 2A · ${STEP_NAME['2a']}`,
  '2b': `Step 2B · ${STEP_NAME['2b']}`,
  '3': `Step 3 · ${STEP_NAME['3']}`,
  '4': `Step 4 · ${STEP_NAME['4']}`,
  done: 'Through all five steps'
};
const LANE_STEP: Record<Lane, PlacedStep | null> = { '1': null, '2a': '2a', '2b': '2b', '3': '3', '4': '4', done: null };
const PREV: Record<PlacedStep, PlacedStep | null> = { '2a': null, '2b': '2a', '3': '2b', '4': '3' };

export type MonitorOptions = {
  unit: Unit;
  deep: DeepUnderstanding[];
  lessons: LessonLike[];
  classes: Array<{ id: string; label: string }>;
  scheduled: ScheduledLesson[];
};

type Loaded = { students: Array<{ id: string; initials: string }>; evidence: Evidence[]; progress: DeepProgress };

export function mountDeepMonitor(host: HTMLElement, options: MonitorOptions): { destroy: () => void } {
  const root = h('div', 'du-root du-mon');
  host.replaceChildren(root);
  let classId = options.classes[0]?.id ?? null;
  let loaded: Loaded | null = null;
  let message = '';
  let duId = options.deep[0]?.id ?? null;
  let filter: Lane | 'all' = 'all';
  let sort: 'initials' | 'notUsed' = 'initials';
  let selected: string | null = null;
  let disposed = false;
  const today = todayInSydney();

  const placed = placements(options.lessons, 'none');
  const unitPieces = (): KnowledgePiece[] => options.deep.flatMap((d) => d.pieces);

  async function load(): Promise<void> {
    if (!classId) return;
    message = 'Loading this class…';
    paint();
    try {
      const view = await httpMarkbookApi.load(classId);
      const ctx = await loadInsightContext();
      const evidence = classEvidence(view, ctx).evidence.filter((e) => e.tags.some((t) => t.startsWith('kp:')));
      const progress = await deepApi.load(classId, options.unit.id);
      if (disposed) return;
      loaded = { students: view.students.filter((s) => !s.removed).map((s) => ({ id: s.id, initials: s.initials })), evidence, progress };
      message = '';
    } catch {
      loaded = null;
      message = 'Could not load this class. Try again in a moment.';
    }
    paint();
  }

  function introduced(): Set<string> {
    const first = new Map<string, string>();
    for (const r of options.scheduled) {
      if (r.class_id !== classId) continue;
      if (!first.has(r.lesson_id) || r.date < first.get(r.lesson_id)!) first.set(r.lesson_id, r.date);
    }
    const out = new Set<string>();
    for (const [piece, ids] of placed.taught) if (ids.some((id) => (first.get(id) ?? '9999') <= today)) out.add(piece);
    for (const e of loaded?.evidence ?? []) for (const t of e.tags) if (t.startsWith('kp:')) out.add(t.slice(3));
    return out;
  }

  const pieceText = (id: string): string => unitPieces().find((p) => p.id === id)?.text ?? id;

  async function regroup(kind: 'redo' | 'regroup', students: string[], pieces: string[]): Promise<void> {
    if (!classId || !students.length || !pieces.length) return;
    const tags = [...new Set(pieces)].map((p) => `kp:${p}`);
    const name = `${kind === 'redo' ? 'Redo' : 'Regroup'}: ${[...new Set(pieces)].slice(0, 2).map((p) => pieceText(p).slice(0, 36)).join(' · ')}`;
    try {
      await httpMarkbookApi.saveGroup(classId, { id: newGroupId(), name, tags, members: students.map((s) => ({ student: s, why: 'Deep understandings' })) }, today);
      message = `Saved "${name}" in the markbook groups.`;
    } catch { message = 'Could not save that group.'; }
    paint();
  }

  async function setStep(student: string, du: string, step: PlacedStep | null, hint: boolean): Promise<void> {
    if (!classId || !loaded) return;
    try { loaded.progress = await deepApi.setStep(classId, options.unit.id, student, du, step, hint); message = ''; }
    catch { message = 'Could not save that step.'; }
    paint();
  }

  async function setWriting(block: string, student: string, used: string[], missed: string[]): Promise<void> {
    if (!classId || !loaded) return;
    try { loaded.progress = await deepApi.setWriting(classId, options.unit.id, block, student, used, missed); message = ''; }
    catch { message = 'Could not save that tick.'; }
    paint();
  }

  function paint(): void {
    root.replaceChildren();
    // 1 what the unit delivers
    const deliver = h('section', 'du-panel');
    const dh = h('h4', '', 'What this unit is built to deliver ');
    dh.append(info('The claims below are the unit plan in one view. Copy them as a paragraph for a program or report.'));
    deliver.append(dh);
    const ol = h('ol', 'du-deliver');
    options.deep.forEach((d) => ol.append(h('li', '', d.claim || 'No claim written yet')));
    deliver.append(ol);
    if (options.deep.length) {
      const copy = button('Copy as a summary paragraph', 'du-link', () => {
        void navigator.clipboard?.writeText(summaryParagraph(options.deep)).then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy blocked by the browser'; });
      });
      deliver.append(copy);
    }
    root.append(deliver);
    if (!options.deep.length) { root.append(h('p', 'du-empty', 'Plan a deep understanding first; monitoring starts from the plan.')); return; }

    if (!options.classes.length) { root.append(h('p', 'du-empty', 'No class is teaching this unit yet.')); return; }
    const picker = h('div', 'du-filt');
    picker.append(h('span', 'fl', 'Class'));
    for (const c of options.classes) {
      picker.append(button(c.label, c.id === classId ? 'on' : '', () => { classId = c.id; loaded = null; selected = null; void load(); }));
    }
    root.append(picker);
    if (message) { const m = h('p', 'du-sub', message); m.setAttribute('role', 'status'); root.append(m); }
    if (!loaded) return;

    const model = buildMonitor({ deep: options.deep, students: loaded.students, evidence: loaded.evidence, progress: loaded.progress, introduced: introduced(), today });

    // 2 all at once
    const all = h('section', 'du-panel');
    all.append(h('h4', '', 'All at once'));
    for (const [i, d] of options.deep.entries()) all.append(distRow(`Deep understanding ${i + 1}`, model.byDu.get(d.id)!.lanes, loaded.students.length));
    root.append(all);

    // 3 where each student is
    const du = options.deep.find((d) => d.id === duId) ?? options.deep[0]!;
    const m = model.byDu.get(du.id)!;
    const pieces = piecesFor(du, options.deep);
    const where = h('section', 'du-panel');
    const wh = h('h4', '', 'Where each student is');
    where.append(wh);
    const pills = h('div', 'du-dutabs');
    options.deep.forEach((d, i) => pills.append(button(`${i + 1}. ${d.claim || 'New'}`, d.id === du.id ? 'on' : '', () => { duId = d.id; selected = null; paint(); })));
    where.append(pills, distRow('', m.lanes, loaded.students.length));
    const filt = h('div', 'du-filt');
    filt.append(h('span', 'fl', 'Show'));
    for (const f of ['all', ...LANES] as const) {
      filt.append(button(f === 'all' ? 'All' : f === 'done' ? 'Through' : STEP_LABEL[f], filter === f ? 'on' : '', () => { filter = f; paint(); }));
    }
    filt.append(h('span', 'fl', 'Sort'));
    filt.append(button('Initials', sort === 'initials' ? 'on' : '', () => { sort = 'initials'; paint(); }), button('Not used', sort === 'notUsed' ? 'on' : '', () => { sort = 'notUsed'; paint(); }));
    where.append(filt, pipKey());
    const lanes = h('div', 'du-lanes');
    for (const lane of LANES) {
      if (filter !== 'all' && filter !== lane) continue;
      const row = h('div', 'du-lane');
      const ln = h('div', 'du-ln');
      const title = h('b', '', LANE_NAME[lane]);
      title.append(info(LANE_ADVICE[lane]));
      ln.append(title, h('small', '', `${m.lanes[lane].length} student${m.lanes[lane].length === 1 ? '' : 's'}`));
      const sts = h('div', 'du-sts');
      const list = m.lanes[lane].slice().sort((a, b) => (sort === 'notUsed' ? b.notUsed - a.notUsed : 0) || a.initials.localeCompare(b.initials));
      for (const s of list) {
        const chip = h('button', `du-sc${selected === s.id ? ' sel' : ''}`);
        chip.type = 'button';
        chip.append(h('b', '', s.initials));
        const pips = h('span', 'du-pips');
        const passedIdx = PLACED.indexOf(loaded.progress.steps[s.id]?.[du.id]?.step ?? ('' as PlacedStep));
        PLACED.forEach((step, k) => pips.append(h('i', k <= passedIdx ? 'on' : '', STEP_LABEL[step])));
        chip.title = passedIdx < 0 ? `${s.initials}: no step passed yet` : `${s.initials}: passed step ${STEP_LABEL[PLACED[passedIdx]!]}`;
        chip.append(pips);
        if (s.since) chip.append(h('span', 'du-tag old', ageText(s.since, today)));
        if (s.notUsed) chip.append(h('span', 'du-tag nu', `${s.notUsed} not used`));
        chip.addEventListener('click', () => { selected = selected === s.id ? null : s.id; paint(); });
        sts.append(chip);
      }
      if (!list.length) sts.append(h('span', 'du-cnt', 'No one here'));
      row.append(ln, sts);
      lanes.append(row);
    }
    where.append(lanes);
    if (selected) where.append(detail(du, m, selected, pieces));
    root.append(where);

    // groups
    const groups = h('div', 'du-groups');
    groups.append(
      groupBox('mem', "Doesn't remember yet", m.doesntRemember.map((r) => ({ student: r.student, pieces: r.pieces })), 'Add to a regroup', 'regroup'),
      groupBox('use', 'Knows it, not using it', collapse(m.knowsNotUsed), 'Set a redo', 'redo')
    );
    root.append(groups);

    root.append(markUse(du), piecesTable(du, pieces, m));
  }

  const initialsOf = (id: string): string => loaded?.students.find((s) => s.id === id)?.initials ?? id;
  const collapse = (rows: Array<{ student: string; piece: string }>): Array<{ student: string; pieces: string[] }> => {
    const by = new Map<string, string[]>();
    for (const r of rows) by.set(r.student, [...(by.get(r.student) ?? []), r.piece]);
    return [...by].map(([student, pieces]) => ({ student, pieces }));
  };

  function groupBox(cls: string, title: string, rows: Array<{ student: string; pieces: string[] }>, doLabel: string, kind: 'redo' | 'regroup'): HTMLElement {
    const box = h('div', `du-grp g-${cls}`);
    box.append(h('b', '', title));
    if (!rows.length) box.append(h('span', 'du-cnt', 'No one right now.'));
    for (const r of rows) box.append(h('div', '', `${initialsOf(r.student)}: ${[...new Set(r.pieces)].map((p) => pieceText(p)).join('; ')}`));
    if (rows.length) box.append(button(doLabel, 'do', () => void regroup(kind, rows.map((r) => r.student), rows.flatMap((r) => r.pieces))));
    return box;
  }

  function distRow(label: string, lanes: Record<Lane, LaneStudent[]>, total: number): HTMLElement {
    const wrap = h('div', 'du-distrow');
    if (label) wrap.append(h('span', 'du-distlabel', label));
    const dist = h('div', 'du-dist');
    LANES.forEach((l, i) => {
      const n = lanes[l].length;
      if (!n || !total) return;
      const seg = h('span', `l${i}`, `${l === 'done' ? 'Through' : STEP_LABEL[l]} · ${n}`);
      seg.style.flex = String(n);
      seg.title = LANE_NAME[l];
      dist.append(seg);
    });
    if (!dist.childElementCount) dist.append(h('span', 'l0', 'No students yet'));
    wrap.append(dist);
    return wrap;
  }

  function detail(du: DeepUnderstanding, m: ReturnType<typeof buildMonitor>['byDu'] extends Map<string, infer V> ? V : never, student: string, pieces: KnowledgePiece[]): HTMLElement {
    const box = h('div', 'du-det');
    const hd = h('div', 'du-det-hd');
    hd.append(h('b', '', initialsOf(student)), button('Close', 'x', () => { selected = null; paint(); }));
    box.append(hd);
    const grid = h('div', 'du-det-grid');
    const lane = (Object.keys(m.lanes) as Lane[]).find((l) => m.lanes[l].some((s) => s.id === student)) ?? '1';
    const stepTask = placements(options.lessons, du.id).steps;

    const ev = h('div');
    ev.append(h('h6', '', 'Evidence for this step'));
    const t = LANE_STEP[lane] ? stepTask.get(LANE_STEP[lane]!) : null;
    ev.append(h('p', '', t ? `${t.title} (${lessonCode(options.lessons, t.lesson_id)})` : lane === '1' ? 'Quiz items on each piece.' : 'No evidence task placed for this step.'));
    const circ = m.circles[student] ?? {};
    ev.append(h('small', '', `${pieces.filter((p) => circ[p.id]?.fill === 'full').length} of ${pieces.length} pieces secure`));

    const kn = h('div');
    kn.append(h('h6', '', 'Known, not used with the task'));
    const missed = m.knowsNotUsed.filter((r) => r.student === student);
    if (!missed.length) kn.append(h('p', 'muted', 'Nothing flagged.'));
    for (const r of missed) kn.append(h('p', '', pieceText(r.piece)));

    const next = h('div', 'du-next');
    next.append(h('h6', '', 'Next move'));
    const acts = h('div', 'acts');
    const hint = h('label', 'du-hint');
    const hintBox = h('input');
    hintBox.type = 'checkbox';
    hint.append(hintBox, document.createTextNode(' Needed a hint'));
    const step = LANE_STEP[lane];
    if (step) acts.append(button(`Pass on Step ${STEP_LABEL[step]}`, '', () => void setStep(student, du.id, step, hintBox.checked)));
    else if (lane === 'done') acts.append(h('span', 'du-cnt', 'Passed on every step.'));
    else acts.append(h('span', 'du-cnt', "Step 1 moves on by itself when the circles fill."));
    const passed = loaded?.progress.steps[student]?.[du.id]?.step;
    if (passed) acts.append(button('Move back', '', () => void setStep(student, du.id, PREV[passed], false)));
    const send = button('Send as a next step', '');
    send.disabled = true;
    send.title = 'Coming with next steps';
    acts.append(send, h('span', 'du-cnt', 'Coming with next steps'));
    if (missed.length) acts.append(button('Set a redo', '', () => void regroup('redo', [student], missed.map((r) => r.piece))));
    const amber = pieces.filter((p) => circ[p.id]?.amber).map((p) => p.id);
    if (amber.length) acts.append(button('Add to a regroup', '', () => void regroup('regroup', [student], amber)));
    if (step) acts.append(hint);
    next.append(acts);
    grid.append(ev, kn, next);
    box.append(grid);
    return box;
  }

  /** The step boxes on each name: one per evidence step, filled once passed. */
  function pipKey(): HTMLElement {
    const key = h('p', 'du-legend du-key');
    const sample = h('span', 'du-pips');
    PLACED.forEach((step, k) => sample.append(h('i', k < 2 ? 'on' : '', STEP_LABEL[step])));
    const item = h('span');
    item.append(sample, document.createTextNode(' Boxes on each name are steps 2A, 2B, 3 and 4. Filled = passed (here, 2A and 2B).'));
    key.append(item);
    return key;
  }

  function markKey(): HTMLElement {
    const key = h('p', 'du-legend du-key');
    const one = (state: 'used' | 'missed' | 'blank', mark: string, text: string): HTMLElement => {
      const item = h('span');
      item.append(h('span', `du-three ${state} du-three--key`, mark), document.createTextNode(` ${text}`));
      return item;
    };
    key.append(
      h('span', '', 'Tap a box to change it:'),
      one('used', '✓', 'used the piece in their writing'),
      one('missed', '–', 'missed it'),
      one('blank', '', 'not marked yet')
    );
    return key;
  }

  function circleKey(): HTMLElement {
    const key = h('p', 'du-legend du-key');
    const one = (cls: string, text: string): HTMLElement => {
      const item = h('span');
      item.append(h('span', `du-c ${cls}`), document.createTextNode(` ${text}`));
      return item;
    };
    key.append(
      one('none', 'Not checked yet'),
      one('half', 'Right once'),
      one('full', 'Right on two separate days'),
      one('amb', 'Latest check wrong'),
      one('full fade', 'No check in four weeks'),
      one('none used', 'Used in writing'),
      one('none notused', 'Expected in writing, not used'),
      one('na', 'Not taught yet')
    );
    return key;
  }

  /** Mark which target pieces each student used in a writing task. */
  function markUse(du: DeepUnderstanding): HTMLElement {
    const sec = h('section', 'du-panel');
    const hd = h('h4', '', 'Mark piece use ');
    hd.append(info('Tap a square to mark a student used (tick), missed (open dash) or blank. Missed shows once the memory check is right.'));
    sec.append(hd);
    const mine = new Set(piecesFor(du, options.deep).map((p) => p.id));
    let any = false;
    for (const lesson of options.lessons) {
      visitBlocks(lesson.blocks ?? [], (b) => {
        const targets = targetPieces(b).filter((id) => mine.has(id));
        if (!targets.length || !loaded) return;
        any = true;
        const c = b.content as Record<string, unknown> | undefined;
        sec.append(h('h5', '', `${lessonCode(options.lessons, lesson.id)}: ${String(c?.title ?? c?.heading ?? 'Writing task')}`));
        const scroll = h('div', 'du-scroll');
        const table = h('table', 'du-kg');
        const head = h('tr');
        head.append(h('th', 'rowh', ''));
        for (const id of targets) { head.append(h('th', '', pieceText(id))); }
        table.append(head);
        for (const s of loaded.students) {
          const tr = h('tr');
          tr.append(h('td', 'rowh', s.initials));
          const tick = loaded.progress.writing[b.id]?.[s.id] ?? { used: [], missed: [], at: '' };
          for (const id of targets) {
            const state = tick.used.includes(id) ? 'used' : tick.missed.includes(id) ? 'missed' : 'blank';
            const cell = h('td');
            const btn = button(state === 'used' ? '✓' : state === 'missed' ? '–' : '', `du-three ${state}`, () => {
              const nextState = state === 'blank' ? 'used' : state === 'used' ? 'missed' : 'blank';
              const used = tick.used.filter((x) => x !== id).concat(nextState === 'used' ? [id] : []);
              const missed = tick.missed.filter((x) => x !== id).concat(nextState === 'missed' ? [id] : []);
              void setWriting(b.id, s.id, used, missed);
            });
            btn.setAttribute('aria-label', `${s.initials}, ${state}`);
            cell.append(btn);
            tr.append(cell);
          }
          table.append(tr);
        }
        scroll.append(table);
        sec.append(scroll);
      });
    }
    if (any) hd.after(markKey());
    if (!any) sec.append(h('p', 'du-empty', 'No writing task has target pieces yet. Pick two or three pieces on a task in the lesson editor.'));
    return sec;
  }

  function piecesTable(du: DeepUnderstanding, pieces: KnowledgePiece[], m: ReturnType<typeof buildMonitor>['byDu'] extends Map<string, infer V> ? V : never): HTMLElement {
    const sec = h('section', 'du-panel');
    const hd = h('h4', '', 'Knowledge pieces ');
    sec.append(hd, circleKey());
    const scroll = h('div', 'du-scroll');
    const table = h('table', 'du-kg');
    const head = h('tr');
    head.append(h('th', 'rowh', ''), h('th', '', 'Step 1'));
    for (const p of pieces) { head.append(h('th', `t${p.tier[0]}`, p.text)); }
    table.append(head);
    const intro = introduced();
    const counted = pieces.filter((p) => p.tier !== 'sophisticated' && intro.has(p.id));
    for (const s of loaded?.students ?? []) {
      const tr = h('tr', selected === s.id ? 'sel' : '');
      tr.append(h('td', 'rowh', s.initials));
      const circ = m.circles[s.id] ?? {};
      const full = counted.filter((p) => circ[p.id]?.fill === 'full').length;
      const barCell = h('td');
      const bar = h('div', 'du-barx');
      const fill = h('i');
      fill.style.width = `${counted.length ? Math.round((full / counted.length) * 100) : 0}%`;
      const line = h('u');
      line.title = '80% line';
      bar.append(fill, line);
      barCell.append(bar);
      tr.append(barCell);
      for (const p of pieces) {
        const c = circ[p.id];
        const td = h('td');
        if (!intro.has(p.id)) td.append(h('span', 'du-c na'));
        else {
          const cls = ['du-c', c?.amber ? 'amb' : c?.fill ?? 'none', c?.faded ? 'fade' : '', c?.ring === 'used' ? 'used' : c?.ring === 'missed' ? 'notused' : ''];
          const dot = h('span', cls.filter(Boolean).join(' '));
          dot.title = `${s.initials}: ${c?.amber ? 'memory check needed' : c?.fill ?? 'none'}`;
          td.append(dot);
        }
        tr.append(td);
      }
      table.append(tr);
    }
    scroll.append(table);
    sec.append(scroll);
    return sec;
  }

  paint();
  void load();
  return { destroy() { disposed = true; root.remove(); } };
}

function ageText(since: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? 'today' : days < 14 ? `${days}d` : `${Math.round(days / 7)}w`;
}

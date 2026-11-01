import { apiGet, apiPut } from '@/api/client';
import { createBlock } from '@/blocks/create-block';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block, Lesson, Unit } from '@/schemas';
import type { ScheduledLesson } from '@/schemas/scheduled-lesson';
import './deep.css';
import { evidenceStepOf, piecesTaught, withEvidenceStep, withPiecesTaught } from './block-tags';
import { placements, planGaps } from './derive';
import {
  button,
  h,
  info,
  lessonCode,
  mountDeepEditor,
  pickEvidenceTask,
  weekLabel,
  type LessonLike,
  type Scope
} from './editor';
import { mountDeepMonitor } from './monitor-view';
import {
  DEEP_LIMITS,
  newDuId,
  piecesFor,
  STEP_LABEL,
  STEP_NAME,
  TIERS,
  type DeepUnderstanding,
  type PlacedStep,
  type Tier
} from './schema';

const TIER_TITLE: Record<Tier, string> = { essential: 'Essential', strong: 'Strong', sophisticated: 'Sophisticated' };
const codeOf = (ref: string): string => ref.split(':').pop() ?? ref;

export type DeepPlanOptions = {
  deep: DeepUnderstanding[];
  lessons: LessonLike[];
  weeks: Map<string, number | null>;
  scope: Scope;
  onOpen: (duId: string) => void;
  onNew: () => void;
};

export function mountDeepPlan(host: HTMLElement, options: DeepPlanOptions): { update: (next: Partial<DeepPlanOptions>) => void; destroy: () => void } {
  let opts = options;
  let current: string | null = null;
  const root = h('div', 'du-root du-plan');
  host.replaceChildren(root);

  const pointText = (ref: string): string => opts.scope.points.find((p) => p.ref === ref)?.short ?? ref;
  const bulletText = (ref: string): string => opts.scope.bullets.find((b) => b.ref === ref)?.text ?? ref;

  function render(): void {
    root.replaceChildren();
    const head = h('h3', 'du-title', 'Deep understandings ');
    head.append(info('The three or four claims this unit is built to make flexible. Each rests on knowledge pieces and climbs five steps.'));
    root.append(head);

    const cards = h('div', 'du-dus');
    opts.deep.forEach((du, i) => {
      const p = placements(opts.lessons, du.id);
      const card = h('article', `du-card${du.id === (current ?? opts.deep[0]?.id) ? ' on' : ''}`);
      card.tabIndex = 0;
      card.append(h('span', 'du-n', `Deep understanding ${i + 1}`));
      card.append(h('q', '', du.claim || 'No claim written yet'));
      if (du.why) card.append(h('p', 'du-meta', `Why this one: ${du.why}`));
      const pills = h('div', 'du-pills');
      for (const ref of du.dot_points) { const s = h('span', 'du-pill dp', codeOf(ref)); s.title = pointText(ref); pills.append(s); }
      for (const ref of du.concept_bullets) { const s = h('span', 'du-pill con', ref); s.title = bulletText(ref); pills.append(s); }
      card.append(pills);
      for (const gap of planGaps(du, opts.deep, p)) card.append(h('div', 'du-warn', gap));
      const choose = (): void => { current = du.id; render(); };
      card.addEventListener('click', choose);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') choose(); });
      const open = button('Edit in Make one', 'du-link', () => opts.onOpen(du.id));
      open.addEventListener('click', (e) => e.stopPropagation());
      card.append(open);
      cards.append(card);
    });
    if (opts.deep.length < DEEP_LIMITS.perUnit) {
      const add = button('+ Deep understanding', 'du-add', () => opts.onNew());
      add.dataset.duAction = 'new';
      cards.append(add);
    }
    root.append(cards);
    if (!opts.deep.length) root.append(h('p', 'du-empty', 'Start with the claim you most want students to carry out of this unit.'));
    if (!opts.deep.length) return;

    root.append(h('h3', 'du-sec', 'Across the lessons'), grid(), expanded());
  }

  function grid(): HTMLElement {
    const weekSet = new Set<number>();
    let undated = false;
    for (const l of opts.lessons) { const w = opts.weeks.get(l.id) ?? null; if (w == null) undated = true; else weekSet.add(w); }
    const cols: Array<number | null> = [...[...weekSet].sort((a, b) => a - b), ...(undated ? [null] : [])];
    const scroll = h('div', 'du-scroll');
    const table = h('table', 'du-map');
    const hr = h('tr');
    hr.append(h('th', 'rowh', 'Deep understanding'));
    for (const c of cols) hr.append(h('th', '', c == null ? 'Not dated' : `Wk ${c}`));
    const thead = h('thead');
    thead.append(hr);
    table.append(thead);
    const body = h('tbody');
    const last = cols.length - 1;
    opts.deep.forEach((du, i) => {
      const p = placements(opts.lessons, du.id);
      const cell = new Map<number | null, Array<{ text: string; cls: string }>>();
      const put = (w: number | null, text: string, cls: string): void => {
        const list = cell.get(w) ?? [];
        if (!list.some((x) => x.text === text)) list.push({ text, cls });
        cell.set(w, list);
      };
      const order = new Map(opts.lessons.map((l, idx) => [l.id, idx]));
      for (const piece of piecesFor(du, opts.deep)) {
        const ids = (p.taught.get(piece.id) ?? []).slice().sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
        if (ids[0]) put(opts.weeks.get(ids[0]) ?? null, 'K', 'k');
      }
      for (const step of ['2a', '2b', '3', '4'] as const) {
        const t = p.steps.get(step);
        if (t) put(opts.weeks.get(t.lesson_id) ?? null, STEP_LABEL[step], 's');
        else if (cols.length) put(cols[last] ?? null, `${STEP_LABEL[step]}?`, 'gap');
      }
      const tr = h('tr');
      tr.append(h('td', 'rowh', `${i + 1}. ${(du.claim || 'No claim yet').split(/[.,;:]/)[0]!.slice(0, 42)}`));
      for (const c of cols) {
        const td = h('td');
        for (const x of cell.get(c) ?? []) td.append(h('span', `du-st ${x.cls}`, x.text), document.createTextNode(' '));
        tr.append(td);
      }
      body.append(tr);
    });
    table.append(body);
    scroll.append(table);
    const legend = h('p', 'du-legend');
    legend.append(h('span', '', 'K = a piece is first taught'), h('span', '', '2A, 2B, 3, 4 = the evidence task'), h('span', '', 'A peach code = no task placed yet'));
    const wrap = h('div');
    wrap.append(scroll, legend);
    return wrap;
  }

  function expanded(): HTMLElement {
    const du = opts.deep.find((d) => d.id === current) ?? opts.deep[0]!;
    const idx = opts.deep.indexOf(du) + 1;
    const p = placements(opts.lessons, du.id);
    const wrap = h('div', 'du-split');
    const pieces = h('div', 'du-panel');
    pieces.append(h('h4', '', `Knowledge pieces for deep understanding ${idx}`));
    const all = piecesFor(du, opts.deep);
    if (!all.length) pieces.append(h('p', 'du-empty', 'No pieces yet. Add them in Make one.'));
    for (const tier of TIERS) {
      const rows = all.filter((x) => x.tier === tier);
      if (!rows.length) continue;
      pieces.append(h('div', `du-tier t-${tier}`, TIER_TITLE[tier]));
      for (const piece of rows) {
        const row = h('div', 'du-piece');
        row.append(h('span', '', piece.text || 'Empty piece'));
        const small = h('small');
        const taught = p.taught.get(piece.id) ?? [];
        const tested = p.tested.get(piece.id);
        small.textContent = `Taught ${taught.length ? taught.map((id) => lessonCode(opts.lessons, id)).join(' ') : 'not yet'} · Tested ${tested ? tested.lessons.map((id) => lessonCode(opts.lessons, id)).join(' ') : 'not yet'}`;
        row.append(small);
        pieces.append(row);
      }
    }
    pieces.append(h('p', 'du-rule', 'Step 1 is done when every Essential piece is secure and 80% of Essential and Strong pieces taught so far are secure.'));

    const ladder = h('div', 'du-panel');
    ladder.append(h('h4', '', 'The five steps'));
    const steps = h('div', 'du-ladder');
    const s1 = h('div', 'du-step marker');
    const hd1 = h('div', 'du-hd');
    hd1.append(h('b', '', `Step 1 · ${STEP_NAME['1']}`));
    s1.append(hd1, h('div', 'du-gen', "Tracked through each piece's quiz items."));
    steps.append(s1);
    for (const step of ['2a', '2b', '3', '4'] as const) {
      const box = h('div', 'du-step');
      const hd = h('div', 'du-hd');
      hd.append(h('b', '', `Step ${STEP_LABEL[step]} · ${STEP_NAME[step]}`));
      const t = p.steps.get(step);
      hd.append(h('span', t ? 'du-where' : 'du-where gap', t ? `${lessonCode(opts.lessons, t.lesson_id)} · ${weekLabel(opts.weeks.get(t.lesson_id) ?? null)}` : 'No task yet'));
      box.append(hd);
      const fill = du.steps.find((x) => x.step === step)?.fill;
      if (fill) box.append(h('div', 'du-fill', fill));
      if (t) box.append(h('div', 'du-tc', t.title));
      steps.append(box);
    }
    ladder.append(steps);
    wrap.append(pieces, ladder);
    return wrap;
  }
  render();

  return {
    update(next) { opts = { ...opts, ...next }; render(); },
    destroy() { root.remove(); }
  };
}

// ------------------------------------------------------------------ lesson writes

type Tab = 'plan' | 'make' | 'monitor';

export type DeepSectionOptions = {
  unit: Unit;
  lessons: Lesson[];
  weeks: Map<string, number | null>;
  scope: Scope;
  save: (deep: DeepUnderstanding[]) => Promise<unknown>;
  classes?: Array<{ id: string; label: string }>;
  scheduled?: ScheduledLesson[];
  onOpenLesson?: (lessonId: string) => void;
};

function mapTree(blocks: Block[], fn: (b: Block) => Block): Block[] {
  return blocks.map((b) => {
    let nb = fn(b);
    const c = nb.content as Record<string, unknown>;
    if (nb.block_type === 'section') nb = { ...nb, content: { ...c, blocks: mapTree(c.blocks as Block[], fn) } } as Block;
    else if (nb.block_type === 'columns') nb = { ...nb, content: { ...c, columns: (c.columns as Array<{ blocks: Block[] }>).map((col) => ({ ...col, blocks: mapTree(col.blocks, fn) })) } } as Block;
    else if (nb.block_type === 'tabs') nb = { ...nb, content: { ...c, tabs: (c.tabs as Array<{ blocks: Block[] }>).map((tab) => ({ ...tab, blocks: mapTree(tab.blocks, fn) })) } } as Block;
    return nb;
  });
}

const hasPiece = (blocks: Block[], pieceId: string): boolean => {
  let found = false;
  visitBlocks(blocks, (b) => { if (piecesTaught(b).includes(pieceId)) found = true; });
  return found;
};

/** Plan / Make one / Monitoring on the unit page. */
export function mountDeepSection(host: HTMLElement, options: DeepSectionOptions): { destroy: () => void } {
  const state = {
    deep: (options.unit.deep_understandings ?? []).map((d) => ({ ...d })) as DeepUnderstanding[],
    lessons: options.lessons.slice(),
    weeks: options.weeks,
    tab: 'plan' as Tab,
    openId: null as string | null
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const status = h('p', 'du-sub');
  status.setAttribute('role', 'status');

  const flush = async (): Promise<void> => {
    try {
      // Empty piece rows stay in the editor but are not sent: a piece needs text to be valid.
      await options.save(state.deep.map((d) => ({ ...d, pieces: d.pieces.filter((p) => p.text.trim()) })));
      status.textContent = 'Saved.';
    } catch {
      status.textContent = 'Could not save. Your changes are still on this page; try again.';
    }
  };
  const schedule = (): void => {
    status.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 400);
  };

  const root = h('div', 'du-root du-section');
  const tabs = h('div', 'du-tabs');
  const body = h('div', 'du-body');
  root.append(tabs, body, status);
  host.replaceChildren(root);
  let editorHandle: ReturnType<typeof mountDeepEditor> | null = null;

  const like = (): LessonLike[] => state.lessons;
  const recompute = (): void => editorHandle?.update({ lessons: like(), weeks: state.weeks });

  async function rewrite(lessonId: string, edit: (blocks: Block[]) => Block[] | null): Promise<void> {
    const fresh = await apiGet<Lesson>(`/api/lessons/${lessonId}`);
    const next = edit(fresh.blocks ?? []);
    if (!next) return;
    const saved = { ...fresh, blocks: next } as Lesson;
    await apiPut(`/api/lessons/${lessonId}`, saved);
    state.lessons = state.lessons.map((l) => (l.id === lessonId ? saved : l));
  }

  async function tagLessons(pieceId: string, lessonIds: string[]): Promise<void> {
    const want = new Set(lessonIds);
    for (const lesson of state.lessons.slice()) {
      const has = hasPiece(lesson.blocks ?? [], pieceId);
      const wanted = want.has(lesson.id);
      if (has === wanted) continue;
      await rewrite(lesson.id, (blocks) => {
        if (!wanted) return mapTree(blocks, (b) => (piecesTaught(b).includes(pieceId) ? withPiecesTaught(b, piecesTaught(b).filter((x) => x !== pieceId)) : b));
        if (blocks.length) return [withPiecesTaught(blocks[0]!, [...piecesTaught(blocks[0]!), pieceId]), ...blocks.slice(1)];
        const note = createBlock('teacher_note', `block_${Math.random().toString(36).slice(2, 10)}`) as Block;
        return [withPiecesTaught({ ...note, content: { ...(note.content as object), title: 'Deep understandings', html: '' } } as Block, [pieceId])];
      });
    }
    recompute();
  }

  async function pickTask(duId: string, step: PlacedStep): Promise<void> {
    const picked = await pickEvidenceTask(like(), state.weeks);
    if (!picked) return;
    for (const lesson of state.lessons.slice()) {
      let changed = false;
      await rewrite(lesson.id, (blocks) => {
        const next = mapTree(blocks, (b) => {
          const here = evidenceStepOf(b);
          if (lesson.id === picked.lesson_id && b.id === picked.block_id) { changed = true; return withEvidenceStep(b, { du: duId, step }); }
          if (here && here.du === duId && here.step === step) { changed = true; return withEvidenceStep(b, null); }
          return b;
        });
        return changed ? next : null;
      });
    }
    recompute();
  }

  function openMake(duId: string): void {
    state.openId = duId;
    show('make');
  }
  function newOne(): void {
    if (state.deep.length >= DEEP_LIMITS.perUnit) return;
    const du: DeepUnderstanding = { id: newDuId(), claim: '', why: '', dot_points: [], concept_bullets: [], pieces: [], shared_piece_ids: [], steps: [] };
    state.deep = [...state.deep, du];
    schedule();
    openMake(du.id);
  }

  function show(tab: Tab): void {
    state.tab = tab;
    editorHandle?.destroy();
    editorHandle = null;
    tabs.replaceChildren();
    for (const [id, label] of [['plan', 'Plan'], ['make', 'Make one'], ['monitor', 'Monitoring']] as const) {
      const b = button(label, `du-tab${tab === id ? ' on' : ''}`, () => show(id));
      b.setAttribute('aria-pressed', String(tab === id));
      tabs.append(b);
    }
    body.replaceChildren();
    if (tab === 'plan') {
      mountDeepPlan(body, { deep: state.deep, lessons: like(), weeks: state.weeks, scope: options.scope, onOpen: openMake, onNew: newOne });
    } else if (tab === 'make') {
      const du = state.deep.find((d) => d.id === state.openId) ?? state.deep[0];
      if (!du) { newOne(); return; }
      state.openId = du.id;
      const picks = h('div', 'du-dutabs');
      state.deep.forEach((d, i) => picks.append(button(`${i + 1}. ${(d.claim || 'New').slice(0, 30)}`, d.id === du.id ? 'on' : '', () => openMake(d.id))));
      if (state.deep.length < DEEP_LIMITS.perUnit) picks.append(button('+ New', '', newOne));
      const mount = h('div');
      body.append(picks, mount);
      editorHandle = mountDeepEditor(mount, {
        du, all: state.deep, lessons: like(), weeks: state.weeks, scope: options.scope,
        onChange: (next) => { state.deep = state.deep.map((d) => (d.id === next.id ? next : d)); schedule(); },
        onTagLessons: tagLessons,
        onPickTask: (step) => pickTask(du.id, step),
        onOpenLesson: options.onOpenLesson,
        onClose: () => show('plan')
      });
    } else {
      mountDeepMonitor(body, { unit: options.unit, deep: state.deep, lessons: like(), classes: options.classes ?? [], scheduled: options.scheduled ?? [] });
    }
  }
  show('plan');

  return { destroy() { clearTimeout(timer); root.remove(); } };
}

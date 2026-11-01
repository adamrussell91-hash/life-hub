import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block } from '@/schemas/block';
import { placements, planGaps } from './derive';
import type { ScopeBullet, ScopePoint } from './scope';
import {
  DEEP_LIMITS,
  DeepUnderstandingSchema,
  newPieceId,
  piecesFor,
  STEP_LABEL,
  STEP_NAME,
  type DeepUnderstanding,
  type KnowledgePiece,
  type PlacedStep,
  type Tier
} from './schema';

/** Plain DOM helpers and small shared pieces for the three deep views. */
export type LessonLike = { id: string; title?: string; dot_points?: string[]; blocks?: Block[] };
export type Scope = { points: ScopePoint[]; bullets: ScopeBullet[] };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

export function button(label: string, cls = '', onClick?: () => void): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** A one-line text box that wraps and grows so the whole text shows. Enter does not add a new line. */
export function lineBox(cls = ''): HTMLTextAreaElement {
  const ta = h('textarea', `du-grow${cls ? ` ${cls}` : ''}`);
  ta.rows = 1;
  const fit = (): void => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  let width = 0;
  new ResizeObserver(([entry]) => { const w = entry?.contentRect.width ?? 0; if (w && w !== width) { width = w; fit(); } }).observe(ta);
  return ta;
}

/** An "i" info icon that opens a short note (not an eye). */
export function info(text: string): HTMLElement {
  const d = h('details', 'du-info');
  const s = h('summary', '', 'ⓘ');
  s.setAttribute('aria-label', 'Details');
  d.append(s, h('div', 'du-info__pop', text));
  return d;
}

export const lessonCode = (lessons: readonly LessonLike[], id: string): string => {
  const i = lessons.findIndex((l) => l.id === id);
  return i < 0 ? 'L?' : `L${i + 1}`;
};
export const weekLabel = (w: number | null | undefined): string => (w == null ? 'Not dated yet' : `Week ${w}`);
const shortTitle = (t?: string): string => (t ?? '').trim() || 'Untitled lesson';

export type WeekGroup = { week: number | null; rows: Array<{ lesson: LessonLike; code: string }> };
export function groupByWeek(lessons: readonly LessonLike[], weeks: Map<string, number | null>): WeekGroup[] {
  const groups = new Map<number | null, WeekGroup>();
  lessons.forEach((lesson, i) => {
    const w = weeks.get(lesson.id) ?? null;
    const g = groups.get(w) ?? { week: w, rows: [] };
    g.rows.push({ lesson, code: `L${i + 1}` });
    groups.set(w, g);
  });
  return [...groups.values()].sort((a, b) => (a.week ?? 1e9) - (b.week ?? 1e9));
}

/** Does the finder's search text match this lesson (number, title or "Week N")? */
export function matchesLesson(query: string, code: string, title: string, week: number | null): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${code} ${code.slice(1)} ${title} ${weekLabel(week)}`.toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}

const TIER_LABEL: Record<Tier, string> = { essential: 'Essential', strong: 'Strong', sophisticated: 'Sophisticated' };
const TIER_SHORT: Record<Tier, string> = { essential: 'E', strong: 'S', sophisticated: 'X' };

export type DeepEditorOptions = {
  du: DeepUnderstanding;
  all: DeepUnderstanding[];
  lessons: LessonLike[];
  weeks: Map<string, number | null>;
  scope: Scope;
  onChange: (next: DeepUnderstanding) => void;
  onTagLessons?: (pieceId: string, lessonIds: string[]) => Promise<void>;
  onPickTask?: (step: PlacedStep) => Promise<void>;
  onOpenLesson?: (lessonId: string) => void;
  onClose: () => void;
};

export function mountDeepEditor(host: HTMLElement, options: DeepEditorOptions): { update: (next: Partial<DeepEditorOptions>) => void; destroy: () => void } {
  let opts = options;
  let du = options.du;
  let finderFor: string | null = null;
  let reuseFrom: string | null = null;
  const root = h('div', 'du-root du-ed');
  host.replaceChildren(root);

  const commit = (next: DeepUnderstanding): void => {
    du = next;
    opts.onChange(next);
  };
  const allWith = (): DeepUnderstanding[] => opts.all.map((d) => (d.id === du.id ? du : d));

  // ---------- live parts that refresh without losing focus ----------
  const checks = h('div', 'du-cks');
  const ready = h('ul', 'du-ready');
  const countLine = h('p', 'du-sub');

  function refreshLive(): void {
    const words = du.claim.trim().split(/\s+/).filter(Boolean).length;
    checks.replaceChildren(
      h('span', words >= 6 ? 'du-ck-ok' : 'du-ck-no', `${words >= 6 ? '✓' : '○'} Written as a claim, not a theme`),
      h('span', du.claim.length <= DEEP_LIMITS.claim ? 'du-ck-ok' : 'du-ck-no', `${du.claim.length}/${DEEP_LIMITS.claim} characters`)
    );
    const all = allWith();
    const pieces = piecesFor(du, all);
    const core = pieces.filter((p) => p.tier !== 'sophisticated').length;
    countLine.textContent = `${core} Essential and Strong piece${core === 1 ? '' : 's'} (aim for 8 to 12).`;
    const p = placements(opts.lessons, du.id);
    const untaught = pieces.filter((x) => !p.taught.has(x.id));
    const untested = pieces.filter((x) => !p.tested.has(x.id));
    const missing = (['2a', '2b', '3', '4'] as const).filter((s) => !p.steps.has(s));
    const rows: Array<[boolean, string, string?]> = [
      [words >= 6, 'A claim students can argue'],
      [du.dot_points.length > 0, 'Linked to a dot point'],
      [du.concept_bullets.length > 0, 'Linked to a concept bullet'],
      [core >= 8 && core <= 12, '8 to 12 Essential and Strong pieces', `Now ${core}`],
      [pieces.length > 0 && untaught.length === 0, 'Every piece is taught in a lesson', untaught.length ? `${untaught.length} to tag` : undefined],
      [pieces.length > 0 && untested.length === 0, 'Every piece has quiz items', untested.length ? `${untested.length} to write` : undefined],
      [missing.length === 0, 'An evidence task for each of Steps 2A to 4', missing.length ? `Place ${missing.map((s) => STEP_LABEL[s]).join(', ')}` : undefined]
    ];
    ready.replaceChildren(
      ...rows.map(([ok, label, note]) => {
        const li = h('li', ok ? 'y' : 'n', label);
        if (note && !ok) li.append(h('small', '', note));
        return li;
      })
    );
    const parsed = DeepUnderstandingSchema.safeParse(du);
    const gaps = planGaps(du, all, p);
    readyNote.textContent = parsed.success && !gaps.length ? 'Ready to teach.' : 'Fill the open circles to finish the plan. It saves as you go.';
  }
  const readyNote = h('p', 'du-sub');

  // ---------- 1 the claim ----------
  const sectionClaim = (): HTMLElement => {
    const s = section(1, 'The claim');
    const ta = h('textarea');
    ta.rows = 3;
    ta.value = du.claim;
    ta.maxLength = DEEP_LIMITS.claim;
    ta.setAttribute('aria-label', 'The claim');
    ta.addEventListener('input', () => { commit({ ...du, claim: ta.value }); refreshLive(); });
    const guide = h('p', 'du-sub', 'A good claim names a move that carries beyond this text, so students can use it on texts they have not seen.');
    const whyLabel = h('label', 'du-lbl', 'Why this one');
    const why = lineBox();
    why.value = du.why;
    why.maxLength = DEEP_LIMITS.why;
    why.addEventListener('input', () => commit({ ...du, why: why.value }));
    whyLabel.append(info('One line on why this claim earns a place in the unit, for you and for the next teacher.'));
    s.append(ta, checks, guide, whyLabel, why);
    return s;
  };

  // ---------- 2 syllabus links ----------
  const sectionLinks = (): HTMLElement => {
    const s = section(2, 'Link it to the syllabus');
    const { points, bullets } = opts.scope;
    if (!points.length && !bullets.length) {
      s.append(h('p', 'du-empty', "Tick dot points on this unit's lessons first; they appear here."));
      return s;
    }
    const cols = h('div', 'du-lk2');
    const mk = (title: string, items: Array<{ ref: string; code: string; text: string; via?: string }>, key: 'dot_points' | 'concept_bullets') => {
      const col = h('div');
      col.append(h('h6', '', title));
      const list = h('div', 'du-pk');
      for (const it of items) {
        const label = h('label', 'du-opt');
        const box = h('input');
        box.type = 'checkbox';
        box.value = it.ref;
        box.dataset.duLink = key;
        box.checked = du[key].includes(it.ref);
        label.classList.toggle('on', box.checked);
        box.addEventListener('click', () => {
          const cur = du[key];
          const next = box.checked ? [...cur.filter((x) => x !== it.ref), it.ref] : cur.filter((x) => x !== it.ref);
          label.classList.toggle('on', box.checked);
          commit({ ...du, [key]: next });
          refreshLive();
        });
        const text = h('span');
        text.append(h('b', '', it.code), document.createTextNode(` ${it.text}`));
        if (it.via) text.append(h('small', '', ` via ${it.via}`));
        label.title = it.text;
        label.append(box, text);
        list.append(label);
      }
      if (!items.length) list.append(h('p', 'du-empty', 'None yet.'));
      col.append(list);
      return col;
    };
    cols.append(
      mk('Dot points', points.map((p) => ({ ref: p.ref, code: p.id, text: p.short })), 'dot_points'),
      mk('Concept bullets', bullets.map((b) => ({ ref: b.ref, code: b.ref, text: b.text, via: b.via.join(', ') })), 'concept_bullets')
    );
    s.append(cols);
    return s;
  };

  // ---------- 3 knowledge pieces ----------
  const piecesHost = h('div', 'du-pieces');
  const sectionPieces = (): HTMLElement => {
    const s = section(3, 'Knowledge pieces');
    s.append(h('p', 'du-sub', 'The facts and ideas students need in hand before they can use the claim. Aim for 8 to 12 Essential and Strong, plus a few Sophisticated.'), countLine, piecesHost);
    renderPieces();
    return s;
  };

  function renderPieces(): void {
    piecesHost.replaceChildren();
    const p = placements(opts.lessons, du.id);
    for (const piece of du.pieces) piecesHost.append(pieceRow(piece, p, true));
    const byId = new Map(opts.all.flatMap((d) => d.pieces).map((x) => [x.id, x]));
    for (const id of du.shared_piece_ids) {
      const piece = byId.get(id);
      if (!piece) continue;
      const owner = opts.all.findIndex((d) => d.pieces.some((x) => x.id === id)) + 1;
      piecesHost.append(pieceRow(piece, p, false, owner));
    }
    piecesHost.append(button('+ Add a piece', 'du-reuse', () => {
      if (du.pieces.length >= DEEP_LIMITS.pieces) return;
      commit({ ...du, pieces: [...du.pieces, { id: newPieceId(), text: '', tier: 'essential' }] });
      renderPieces(); refreshLive();
    }));
    opts.all.forEach((other, i) => {
      if (other.id === du.id || !other.pieces.some((x) => x.text.trim())) return;
      piecesHost.append(button(`+ Use a piece from deep understanding ${i + 1}`, 'du-reuse', () => {
        reuseFrom = reuseFrom === other.id ? null : other.id;
        renderPieces();
      }));
      if (reuseFrom === other.id) {
        const list = h('div', 'du-pk');
        for (const x of other.pieces.filter((x) => x.text.trim() && !du.shared_piece_ids.includes(x.id))) {
          list.append(button(`${TIER_LABEL[x.tier]}: ${x.text}`, 'du-opt', () => {
            commit({ ...du, shared_piece_ids: [...du.shared_piece_ids, x.id] });
            reuseFrom = null; renderPieces(); refreshLive();
          }));
        }
        if (!list.childElementCount) list.append(h('p', 'du-empty', 'Every piece there is already used here.'));
        piecesHost.append(list);
      }
    });
  }

  function pieceRow(piece: KnowledgePiece, p: ReturnType<typeof placements>, own: boolean, owner = 0): HTMLElement {
    const row = h('div', 'du-prow');
    const seg = h('span', 'du-seg');
    for (const tier of ['essential', 'strong', 'sophisticated'] as const) {
      const b = button(TIER_SHORT[tier], `${piece.tier === tier ? 'on' : ''} t${TIER_SHORT[tier]}`, () => {
        if (!own) return;
        commit({ ...du, pieces: du.pieces.map((x) => (x.id === piece.id ? { ...x, tier } : x)) });
        renderPieces(); refreshLive();
      });
      b.title = TIER_LABEL[tier];
      b.disabled = !own;
      seg.append(b);
    }
    const text = lineBox('serif');
    text.value = piece.text;
    text.maxLength = DEEP_LIMITS.piece;
    text.placeholder = 'One fact or idea, in a sentence';
    text.setAttribute('aria-label', 'Knowledge piece');
    text.readOnly = !own;
    text.addEventListener('input', () => {
      commit({ ...du, pieces: du.pieces.map((x) => (x.id === piece.id ? { ...x, text: text.value } : x)) });
      refreshLive();
    });
    const where = h('div', 'du-where');
    const taught = p.taught.get(piece.id) ?? [];
    where.append(h('span', 'du-wl', 'Taught'));
    for (const id of taught) where.append(h('span', 'du-lchip', lessonCode(opts.lessons, id)));
    if (opts.onTagLessons) {
      const f = button(taught.length ? 'Change' : "Tag where it's taught", `du-lfind${finderFor === piece.id ? ' on' : ''}`, () => {
        finderFor = finderFor === piece.id ? null : piece.id;
        renderPieces();
      });
      where.append(f);
    }
    const tested = p.tested.get(piece.id);
    const evd = h('div', 'du-where');
    evd.append(h('span', 'du-wl', 'Tested'));
    if (tested) {
      for (const id of tested.lessons) evd.append(h('span', 'du-lchip t', lessonCode(opts.lessons, id)));
      evd.append(h('span', 'du-cnt', `${tested.items} item${tested.items === 1 ? '' : 's'}`));
    } else if (opts.onOpenLesson && opts.lessons.length) {
      evd.append(button('Write items', 'du-wr', () => opts.onOpenLesson?.(taught[0] ?? opts.lessons[0]!.id)));
    } else evd.append(h('span', 'du-cnt', 'No items yet'));
    row.append(seg, text, where, evd);
    if (own) {
      const rm = button('Remove', 'du-link', () => {
        commit({ ...du, pieces: du.pieces.filter((x) => x.id !== piece.id) });
        if (finderFor === piece.id) finderFor = null;
        renderPieces(); refreshLive();
      });
      rm.setAttribute('aria-label', 'Remove this piece');
      row.append(rm);
    } else {
      row.append(h('span', 'du-from', `from deep understanding ${owner}`));
      row.append(button('Stop using', 'du-link', () => {
        commit({ ...du, shared_piece_ids: du.shared_piece_ids.filter((x) => x !== piece.id) });
        renderPieces(); refreshLive();
      }));
    }
    const wrap = h('div', 'du-pwrap');
    wrap.append(row);
    if (finderFor === piece.id && opts.onTagLessons) wrap.append(finder(piece, taught));
    return wrap;
  }

  /** The searchable, week-grouped lesson finder (units run to 40 or 50 lessons, so no dropdown). */
  function finder(piece: KnowledgePiece, taught: string[]): HTMLElement {
    const picked = new Set(taught);
    const box = h('div', 'du-finder');
    const head = h('div', 'du-fi-hd');
    const search = h('input');
    search.type = 'search';
    search.placeholder = 'Find by number, title or week';
    search.setAttribute('aria-label', 'Find a lesson');
    head.append(search);
    const chips = h('div', 'du-fi-chips');
    const list = h('div', 'du-fi-list');
    const foot = h('div', 'du-fi-ft');
    const count = h('span');
    const done = button('Done', 'du-done', async () => {
      done.disabled = true;
      try { await opts.onTagLessons?.(piece.id, [...picked]); } finally { finderFor = null; renderPieces(); refreshLive(); }
    });
    foot.append(count, done);
    const groups = groupByWeek(opts.lessons, opts.weeks);
    const draw = (): void => {
      list.replaceChildren();
      for (const g of groups) {
        const rows = g.rows.filter((r) => matchesLesson(search.value, r.code, shortTitle(r.lesson.title), g.week));
        if (!rows.length) continue;
        list.append(h('div', 'du-fi-wk', weekLabel(g.week)));
        for (const r of rows) {
          const label = h('label', `du-fi-row${picked.has(r.lesson.id) ? ' on' : ''}`);
          const cb = h('input');
          cb.type = 'checkbox';
          cb.dataset.duFinder = r.lesson.id;
          cb.checked = picked.has(r.lesson.id);
          cb.addEventListener('click', () => { cb.checked ? picked.add(r.lesson.id) : picked.delete(r.lesson.id); label.classList.toggle('on', cb.checked); drawChips(); });
          label.append(cb, h('b', '', r.code), document.createTextNode(shortTitle(r.lesson.title)));
          list.append(label);
        }
      }
      if (!list.childElementCount) list.append(h('p', 'du-empty', 'No lesson matches.'));
    };
    const drawChips = (): void => {
      chips.replaceChildren(...[...picked].map((id) => h('span', 'du-lchip on', lessonCode(opts.lessons, id))));
      count.textContent = `${picked.size} picked`;
    };
    search.addEventListener('input', draw);
    draw(); drawChips();
    box.append(head, chips, list, foot);
    return box;
  }

  // ---------- 4 steps ----------
  const sectionSteps = (): HTMLElement => {
    const s = section(4, 'Place the steps');
    s.append(h('p', 'du-sub', 'Each step sits on a task students write. Say what students do at that step for this claim, then pick the task that counts.'));
    const one = h('div', 'du-srow');
    one.append(h('span', 'du-sn', '1'), (() => {
      const b = h('div', 'du-sb');
      const hd = h('div', 'du-sh');
      hd.append(h('b', '', STEP_NAME['1']));
      b.append(hd, h('div', 'du-gen', "Tracked through each piece's quiz items."));
      return b;
    })());
    s.append(one);
    const p = placements(opts.lessons, du.id);
    for (const step of ['2a', '2b', '3', '4'] as const) {
      const row = h('div', 'du-srow');
      const body = h('div', 'du-sb');
      const hd = h('div', 'du-sh');
      hd.append(h('b', '', STEP_NAME[step]));
      const fill = lineBox('serif');
      fill.value = du.steps.find((x) => x.step === step)?.fill ?? '';
      fill.maxLength = DEEP_LIMITS.fill;
      fill.placeholder = 'What students do here for this claim';
      fill.setAttribute('aria-label', `${STEP_NAME[step]}: what students do`);
      fill.addEventListener('input', () => {
        const rest = du.steps.filter((x) => x.step !== step);
        commit({ ...du, steps: fill.value.trim() ? [...rest, { step, fill: fill.value }] : rest });
      });
      const task = p.steps.get(step);
      const evd = h('div', 'du-where');
      if (task) {
        const t = h('span', 'du-task', task.title);
        t.append(h('small', '', `${lessonCode(opts.lessons, task.lesson_id)} · ${weekLabel(opts.weeks.get(task.lesson_id) ?? null)}`));
        evd.append(t);
        if (opts.onPickTask) evd.append(button('Change', 'du-link', () => void opts.onPickTask?.(step)));
      } else if (opts.onPickTask) evd.append(button('Find the task that counts…', 'du-wr', () => void opts.onPickTask?.(step)));
      else evd.append(h('span', 'du-cnt', 'No evidence task yet'));
      body.append(hd, fill, evd);
      row.append(h('span', 'du-sn', STEP_LABEL[step]), body);
      s.append(row);
    }
    return s;
  };

  function section(n: number, title: string): HTMLElement {
    const s = h('section', 'du-eds');
    const head = h('h4');
    head.append(h('span', 'du-edn', String(n)), document.createTextNode(title));
    s.append(head);
    return s;
  }

  function render(): void {
    const main = h('div', 'du-ed__main');
    const top = h('div', 'du-bar');
    top.append(button('← Back to the plan', 'du-link', opts.onClose), h('h3', 'du-title', 'Make one'));
    main.append(top, sectionClaim(), sectionLinks(), sectionPieces(), sectionSteps());
    const side = h('aside', 'du-ed__side');
    const panel = h('div', 'du-panel');
    const hd = h('h4', '', 'Ready to teach?');
    hd.append(info('Open circles are the gaps still in this plan. Close them in any order.'));
    panel.append(hd, ready, readyNote);
    side.append(panel);
    root.replaceChildren(main, side);
    refreshLive();
  }
  render();

  return {
    update(next) {
      opts = { ...opts, ...next };
      if (next.du) du = next.du;
      render();
    },
    destroy() { root.remove(); }
  };
}

// ---------------------------------------------------------------- task picker

const WRITTEN_KINDS = new Set(['extended_response', 'explain_effect', 'short_answer']);
type Candidate = { lesson_id: string; block_id: string; title: string };

function blockTitle(b: Block): string {
  const c = b.content as Record<string, unknown> | undefined;
  const q = c?.question as Record<string, unknown> | undefined;
  return String(c?.title ?? c?.heading ?? q?.prompt ?? c?.prompt ?? '').trim().slice(0, 90) || 'Untitled task';
}

export function evidenceCandidates(lessons: readonly LessonLike[]): Candidate[] {
  const out: Candidate[] = [];
  for (const lesson of lessons) {
    visitBlocks(lesson.blocks ?? [], (b: Block) => {
      const c = b.content as Record<string, unknown> | undefined;
      const q = c?.question as { kind?: string; next_steps?: unknown } | undefined;
      const writing =
        b.block_type === 'question_set' ||
        (b.block_type === 'quiz_question' && !!q?.kind && WRITTEN_KINDS.has(q.kind)) ||
        (b.block_type === 'rich_text' && !!c?.response_space) ||
        !!c?.next_steps || !!q?.next_steps;
      if (writing) out.push({ lesson_id: lesson.id, block_id: b.id, title: blockTitle(b) });
    });
  }
  return out;
}

/** Lists the unit's writing tasks, grouped by week then lesson, with a search box. */
export function pickEvidenceTask(lessons: readonly LessonLike[], weeks: Map<string, number | null>): Promise<{ lesson_id: string; block_id: string } | null> {
  return new Promise((resolve) => {
    const dlg = h('dialog', 'du-picker du-root');
    const all = evidenceCandidates(lessons);
    const search = h('input');
    search.type = 'search';
    search.placeholder = 'Find a task by lesson, title or week';
    search.setAttribute('aria-label', 'Find a task');
    const list = h('div', 'du-fi-list');
    const close = (value: { lesson_id: string; block_id: string } | null): void => {
      dlg.close?.();
      dlg.remove();
      resolve(value);
    };
    const draw = (): void => {
      list.replaceChildren();
      for (const g of groupByWeek(lessons, weeks)) {
        const rows = g.rows.flatMap((r) => all.filter((c) => c.lesson_id === r.lesson.id).map((c) => ({ ...c, code: r.code, ltitle: shortTitle(r.lesson.title) })))
          .filter((c) => matchesLesson(search.value, c.code, `${c.ltitle} ${c.title}`, g.week));
        if (!rows.length) continue;
        list.append(h('div', 'du-fi-wk', weekLabel(g.week)));
        for (const r of rows) {
          const b = button('', 'du-fi-row');
          b.append(h('b', '', r.code), document.createTextNode(`${r.ltitle}: ${r.title}`));
          b.addEventListener('click', () => close({ lesson_id: r.lesson_id, block_id: r.block_id }));
          list.append(b);
        }
      }
      if (!list.childElementCount) list.append(h('p', 'du-empty', all.length ? 'No task matches.' : 'No writing tasks in this unit yet. Add a written question to a lesson first.'));
    };
    search.addEventListener('input', draw);
    const head = h('div', 'du-fi-hd');
    head.append(h('h4', '', 'Pick the task that counts'), button('Cancel', 'du-link', () => close(null)));
    dlg.append(head, search, list);
    dlg.addEventListener('cancel', () => resolve(null));
    document.body.append(dlg);
    draw();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  });
}

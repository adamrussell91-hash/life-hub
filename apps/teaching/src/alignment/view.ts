import { ApiClientError } from '@/api/client';
import { fetchAlignment, saveAlignmentPoint } from './api';
import {
  alignmentDots,
  bulletNumberOf,
  bulletText,
  conceptByKey,
  conceptKeyOf,
  conceptsUsed,
  heatHits,
  heatScore,
  heatStep,
  pointsFor,
  sharedRuns,
  skillHits,
  wordStems,
  type AreaPoint
} from './model';
import type { Alignment, AlignmentPatch, LinkStrength } from './schema';
import { skillGlyph } from '../../../../packages/problem-solver/glyphs';
import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';
import { loadSkills } from '@/skills/api';
import { skillEntries, skillsForArea, skillsForOutcome, type SkillEntry } from '@/skills/model';
import type { SkillsContinuum } from '@/skills/schema';
import { showSkillInLibrary } from '@/teacher/sections/resources';
import './alignment.css';

type Mode = 'dots' | 'heat';
type Selection =
  | { kind: 'point'; area: string; id: string }
  | { kind: 'outcome'; n: number }
  | { kind: 'concept'; key: string }
  | { kind: 'bullet'; ref: string }
  | { kind: 'process'; code: string }
  | { kind: 'cell'; n: number; key: string }
  | { kind: 'skill'; id: string }
  | { kind: 'skillcell'; n: number; skill: string }
  | { kind: 'hsc'; ref: string };
type HeatRows = 'concepts' | 'skills' | 'hsc';

/** The HSC skills continuum, loaded alongside the alignment when available. */
let skillsData: SkillsContinuum | null = null;

/** Kept across tab switches and re-renders of the scope page. */
const state: { doc: Alignment | null; area: string; mode: Mode; heatRows: HeatRows; sel: Selection | null; editing: boolean } = {
  doc: null,
  area: '',
  mode: 'dots',
  heatRows: 'concepts',
  sel: null,
  editing: false
};

const SHORT_NAME: Record<string, string> = { CIS: 'Imagery and symbol', CODE: 'Code and convention', POV: 'Point of view', LV: 'Literary value' };
const LINK_LABEL: Record<LinkStrength, string> = { shared: 'Shared wording', related: 'Related idea' };
const skillName = (id: string): string => SKILLS.find((k) => k.id === id)?.name ?? id;
const skillText = (id: string): string => SKILLS.find((k) => k.id === id)?.description ?? '';

/** A Problem Solver thinking-skill glyph, named for hover. */
function glyph(id: string, cls = 'align__glyph'): HTMLElement {
  const g = skillGlyph(id);
  g.classList.add(cls);
  g.title = skillName(id);
  return g;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Array<Node | string | null | false>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children) if (child) node.append(child);
  return node;
}

function button(cls: string, label: Node | string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function highlighted(text: string, stems: Set<string>): HTMLElement {
  const span = h('span');
  for (const run of sharedRuns(text, stems)) span.append(run.shared ? h('mark', '', run.text) : run.text);
  return span;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function option(label: string, value: string): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

export function mountAlignmentView(host: HTMLElement): void {
  const root = h('div', 'align');
  host.replaceChildren(root);
  // The skills layer arrives when it can; the chart works without it.
  if (!skillsData) {
    loadSkills().then((c) => {
      skillsData = c;
      if (root.isConnected && state.doc) render(root);
    }, () => {});
  }
  if (state.doc) {
    render(root);
    return;
  }
  root.append(h('p', 'align__status', 'Loading the syllabus alignment…'));
  fetchAlignment()
    .then(({ alignment }) => {
      state.doc = alignment;
      if (root.isConnected) render(root);
    }, (error: unknown) => {
      if (!root.isConnected) return;
      const message = error instanceof ApiClientError ? error.message : 'The syllabus alignment didn’t load. Try again in a moment.';
      root.replaceChildren(
        h('p', 'align__status', message),
        button('btn btn--secondary', 'Try again', () => mountAlignmentView(host))
      );
    });
}

function render(root: HTMLElement): void {
  const doc = state.doc!;
  if (!doc.focus_areas.some((f) => f.id === state.area) && !(state.area === 'all' && state.mode === 'heat')) state.area = doc.focus_areas[0]!.id;
  const points = pointsFor(doc, state.area);
  const outcomeCode = (n: number): string => doc.outcomes.find((o) => o.n === n)?.code ?? `Outcome ${n}`;
  const outcomeText = (n: number): string => doc.outcomes.find((o) => o.n === n)?.text ?? '';
  const concepts = conceptByKey(doc);
  const conceptName = (key: string): string => SHORT_NAME[key] ?? concepts.get(key)?.name ?? key;
  const areaName = state.area === 'all' ? 'All of Year 12' : doc.focus_areas.find((f) => f.id === state.area)!.name;
  const rerender = (): void => render(root);
  const select = (sel: Selection | null): void => {
    const same = sel && state.sel && JSON.stringify(sel) === JSON.stringify(state.sel);
    state.sel = same ? null : sel;
    state.editing = false;
    rerender();
    // When the panel sits below the chart, bring the trace into view.
    if (state.sel && root.clientWidth <= 1100) {
      root.querySelector('.align__panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  // Controls: focus areas, then the view switch.
  const areas = h('div', 'hub-pills hub-pills--loose align__areas');
  areas.setAttribute('role', 'group');
  areas.setAttribute('aria-label', 'Focus area');
  const areaRows = [...doc.focus_areas.map((f) => ({ id: f.id, name: f.name, points: f.points })), ...(state.mode === 'heat' ? [{ id: 'all', name: 'All of Year 12', points: doc.focus_areas.flatMap((f) => f.points) }] : [])];
  for (const row of areaRows) {
    const u = row.points.filter((p) => p.kind === 'U').length;
    const b = button('hub-pills__btn', row.name, () => {
      if (state.area === row.id) return;
      state.area = row.id;
      state.sel = null;
      state.editing = false;
      rerender();
    });
    b.append(h('span', 'align__count', `${u}U · ${row.points.length - u}R`));
    b.dataset.alignArea = row.id;
    b.setAttribute('aria-pressed', row.id === state.area ? 'true' : 'false');
    areas.append(b);
  }
  const modes = h('div', 'align__modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'View');
  for (const [mode, label] of [['dots', 'Dots'], ['heat', 'Heatmap']] as const) {
    const b = button('align__mode', label, () => {
      if (state.mode === mode) return;
      state.mode = mode;
      state.sel = null;
      state.editing = false;
      if (mode === 'dots' && state.area === 'all') state.area = doc.focus_areas[0]!.id;
      rerender();
    });
    b.dataset.alignMode = mode;
    b.setAttribute('aria-pressed', mode === state.mode ? 'true' : 'false');
    modes.append(b);
  }
  const rows = h('div', 'align__modes');
  rows.setAttribute('role', 'group');
  rows.setAttribute('aria-label', 'Heatmap rows');
  rows.hidden = state.mode !== 'heat';
  for (const [value, label] of [['concepts', 'Concepts'], ['skills', 'Thinking skills'], ['hsc', 'HSC skills']] as const) {
    const b = button('align__mode', label, () => {
      if (state.heatRows === value) return;
      state.heatRows = value;
      state.sel = null;
      rerender();
    });
    b.dataset.alignRows = value;
    b.setAttribute('aria-pressed', value === state.heatRows ? 'true' : 'false');
    rows.append(b);
  }

  const chart = h('div', 'align__chart');
  const legend = h('div', 'align__legend');
  const panel = h('aside', 'align__panel');
  panel.setAttribute('aria-live', 'polite');

  // ---------- dots ----------
  function paintDots(): void {
    const used = conceptsUsed(doc, points);
    const dots = alignmentDots(points);
    const sel = state.sel;
    const pointLit = (p: AreaPoint): boolean => {
      if (!sel) return false;
      if (sel.kind === 'point') return p.id === sel.id && p.area === sel.area;
      if (sel.kind === 'process') return p.processes.includes(sel.code);
      if (sel.kind === 'outcome') return p.outcomes.some((o) => o.n === sel.n);
      if (sel.kind === 'concept') return p.concepts.some((c) => conceptKeyOf(c.ref) === sel.key);
      if (sel.kind === 'bullet') return p.concepts.some((c) => c.ref === sel.ref);
      if (sel.kind === 'skill') return (p.skills ?? []).includes(sel.id);
      return false;
    };
    const plot = h('div', 'align__plot');
    plot.style.setProperty('--nx', String(used.length));
    plot.classList.toggle('is-dimmed', !!sel);
    let first = true;
    for (const kind of ['U', 'R'] as const) {
      plot.append(h('div', 'align__ysect', kind === 'U' ? 'Understanding' : 'Responding'), ...used.map(() => h('div', 'align__ysect-fill')));
      for (const p of points.filter((x) => x.kind === kind)) {
        const label = button('align__ylab-btn', '', () => select({ kind: 'point', area: p.area, id: p.id }), p.text);
        const badges = h('span', 'align__badges', ...p.processes.map((code) => h('span', 'align__badge', code)));
        const glyphs = h('span', 'align__glyphs', ...(p.skills ?? []).map((id) => glyph(id)));
        label.append(h('span', 'align__ylab-text', p.short), glyphs, badges, h('span', `align__code align__code--${kind}`, p.id));
        const ylab = h('div', 'align__ylab', label);
        ylab.classList.toggle('is-lit', pointLit(p));
        plot.append(ylab);
        for (const c of used) {
          const cell = h('div', `align__cell${first ? ' align__cell--top' : ''}`);
          for (const d of dots.filter((x) => x.point === p && x.concept === c.key)) {
            const name = `${p.id}, ${outcomeCode(d.n)}, ${c.name} ${d.refs.map(bulletNumberOf).join(' and ')}`;
            const dot = button(`align__dot align__dot--${d.link} ${d.n <= 3 ? 'is-analysing' : 'is-composing'}`, String(d.n), () => select({ kind: 'point', area: p.area, id: p.id }), name);
            dot.setAttribute('aria-label', name);
            let lit = false;
            if (sel?.kind === 'point' || sel?.kind === 'process' || sel?.kind === 'skill') lit = pointLit(p);
            else if (sel?.kind === 'outcome') lit = d.n === sel.n;
            else if (sel?.kind === 'concept') lit = d.concept === sel.key;
            else if (sel?.kind === 'bullet') lit = d.refs.includes(sel.ref);
            dot.classList.toggle('is-lit', lit);
            cell.append(dot);
          }
          plot.append(cell);
        }
        first = false;
      }
    }
    plot.append(h('div'), ...used.map((c) => h('div', 'align__xlab', button('align__xlab-btn', conceptName(c.key), () => select({ kind: 'concept', key: c.key }), c.head))));
    plot.append(h('div'), h('div', 'align__xtitle', 'Stage 6 textual concepts'));
    chart.replaceChildren(plot);

    const item = (n: number): HTMLButtonElement => {
      const b = button('align__legend-item', '', () => select({ kind: 'outcome', n }), outcomeText(n));
      b.append(h('span', `align__swatch ${n <= 3 ? 'is-analysing' : 'is-composing'}`, String(n)), outcomeCode(n), h('span', 'align__legend-n', String(dots.filter((d) => d.n === n).length)));
      b.setAttribute('aria-pressed', sel?.kind === 'outcome' && sel.n === n ? 'true' : 'false');
      return b;
    };
    const ns = doc.outcomes.map((o) => o.n);
    legend.replaceChildren(
      h('span', 'align__label', 'Outcome'),
      h('span', 'align__fam', 'Analysing and evaluating'),
      ...ns.filter((n) => n <= 3).map(item),
      h('span', 'align__fam', 'Composing and reflecting'),
      ...ns.filter((n) => n > 3).map(item),
      h('span', 'align__key', h('span', '', h('i', 'align__key-dot align__key-dot--shared'), 'Shared wording'), h('span', '', h('i', 'align__key-dot'), 'Related idea'))
    );
  }

  // ---------- heatmap ----------
  function paintHeat(): void {
    if (state.heatRows === 'hsc') {
      paintHscHeat();
      return;
    }
    if (state.heatRows === 'skills') {
      paintSkillHeat();
      return;
    }
    const used = conceptsUsed(doc, points);
    const ns = doc.outcomes.map((o) => o.n);
    const cells = new Map<string, ReturnType<typeof heatHits>>();
    let max = 0;
    for (const c of used) for (const n of ns) {
      const hits = heatHits(points, n, c.key);
      cells.set(`${n}|${c.key}`, hits);
      max = Math.max(max, heatScore(hits));
    }
    const sel = state.sel;
    const grid = h('div', 'align__heat');
    grid.style.setProperty('--nx', String(ns.length));
    grid.classList.toggle('is-dimmed', !!sel && ['outcome', 'concept', 'cell'].includes(sel.kind));
    grid.append(h('div'), ...ns.map((n) => h('div', 'align__hh', button('align__hh-btn', h('span', '', outcomeCode(n).replace(/-\d+$/, ''), h('small', '', pad2(n))), () => select({ kind: 'outcome', n }), outcomeText(n)))), h('div', 'align__hh', h('small', '', 'Total')));
    for (const c of used) {
      grid.append(h('div', 'align__rl', button('align__rl-btn', conceptName(c.key), () => select({ kind: 'concept', key: c.key }), c.head)));
      let total = 0;
      for (const n of ns) {
        const hits = cells.get(`${n}|${c.key}`)!;
        total += hits.length;
        const step = heatStep(heatScore(hits), max);
        const cell = button(`align__hc align__hc--${step}`, hits.length ? String(hits.length) : '', () => select({ kind: 'cell', n, key: c.key }), `${outcomeCode(n)} and ${c.name}: ${hits.length} dot point${hits.length === 1 ? '' : 's'}`);
        cell.setAttribute('aria-label', cell.title);
        cell.classList.toggle('is-lit', !!sel && ((sel.kind === 'outcome' && sel.n === n) || (sel.kind === 'concept' && sel.key === c.key) || (sel.kind === 'cell' && sel.n === n && sel.key === c.key)));
        grid.append(cell);
      }
      grid.append(h('div', 'align__tot', String(total)));
    }
    grid.append(h('div', 'align__rl align__label', 'Total'));
    for (const n of ns) {
      const t = used.reduce((sum, c) => sum + cells.get(`${n}|${c.key}`)!.length, 0);
      grid.append(h('div', `align__tot${t ? '' : ' is-zero'}`, String(t)));
    }
    grid.append(h('div'));
    chart.replaceChildren(grid);
    legend.replaceChildren(
      h('span', 'align__label', 'Dot points linking the two'),
      h('span', 'align__ramp-wrap', h('span', '', 'None'), h('span', 'align__ramp'), h('span', '', 'Most')),
      h('span', 'align__hint', 'The number is how many dot points link that outcome and concept. Related-idea links count half towards the shade.')
    );
  }

  /** Thinking skills against outcomes: dot points that call on the skill and reach the outcome. */
  function paintSkillHeat(): void {
    const ns = doc.outcomes.map((o) => o.n);
    const cells = new Map<string, ReturnType<typeof skillHits>>();
    let max = 0;
    for (const k of SKILLS) for (const n of ns) {
      const hits = skillHits(points, n, k.id);
      cells.set(`${n}|${k.id}`, hits);
      max = Math.max(max, heatScore(hits));
    }
    const sel = state.sel;
    const grid = h('div', 'align__heat');
    grid.style.setProperty('--nx', String(ns.length));
    grid.classList.toggle('is-dimmed', !!sel && ['outcome', 'skill', 'skillcell'].includes(sel.kind));
    grid.append(h('div'), ...ns.map((n) => h('div', 'align__hh', button('align__hh-btn', h('span', '', outcomeCode(n).replace(/-\d+$/, ''), h('small', '', pad2(n))), () => select({ kind: 'outcome', n }), outcomeText(n)))), h('div', 'align__hh', h('small', '', 'Total')));
    for (const k of SKILLS) {
      const rowLabel = button('align__rl-btn align__rl-btn--skill', '', () => select({ kind: 'skill', id: k.id }), k.description);
      rowLabel.append(k.name, glyph(k.id));
      grid.append(h('div', 'align__rl', rowLabel));
      const total = points.filter((p) => (p.skills ?? []).includes(k.id)).length;
      for (const n of ns) {
        const hits = cells.get(`${n}|${k.id}`)!;
        const step = heatStep(heatScore(hits), max);
        const cell = button(`align__hc align__hc--${step}`, hits.length ? String(hits.length) : '', () => select({ kind: 'skillcell', n, skill: k.id }), `${outcomeCode(n)} and ${k.name}: ${hits.length} dot point${hits.length === 1 ? '' : 's'}`);
        cell.setAttribute('aria-label', cell.title);
        cell.classList.toggle('is-lit', !!sel && ((sel.kind === 'outcome' && sel.n === n) || (sel.kind === 'skill' && sel.id === k.id) || (sel.kind === 'skillcell' && sel.n === n && sel.skill === k.id)));
        grid.append(cell);
      }
      grid.append(h('div', `align__tot${total ? '' : ' is-zero'}`, String(total)));
    }
    grid.append(h('div'), ...ns.map(() => h('div')), h('div'));
    chart.replaceChildren(grid);
    legend.replaceChildren(
      h('span', 'align__label', 'Dot points calling on the skill'),
      h('span', 'align__ramp-wrap', h('span', '', 'None'), h('span', 'align__ramp'), h('span', '', 'Most')),
      h('span', 'align__hint', 'The number is how many dot points call on that thinking skill and reach that outcome. The total counts each dot point once; a red 0 is a skill this focus area never asks for.')
    );
  }

  /** HSC skills against outcomes: dot points here that reach each outcome a skill builds. */
  function paintHscHeat(): void {
    if (!skillsData) {
      chart.replaceChildren(h('p', 'align__hint', 'The skills continuum is loading, or isn’t available here yet.'));
      legend.replaceChildren();
      return;
    }
    const ns = doc.outcomes.map((o) => o.n);
    const entries = skillsForArea(skillsData, state.area);
    const reach = new Map(ns.map((n) => [n, points.filter((p) => p.outcomes.some((o) => o.n === n)).length]));
    const max = Math.max(1, ...reach.values());
    const sel = state.sel;
    const grid = h('div', 'align__heat');
    grid.style.setProperty('--nx', String(ns.length));
    grid.classList.toggle('is-dimmed', !!sel && ['outcome', 'hsc'].includes(sel.kind));
    grid.append(h('div'), ...ns.map((n) => h('div', 'align__hh', button('align__hh-btn', h('span', '', outcomeCode(n).replace(/-\d+$/, ''), h('small', '', pad2(n))), () => select({ kind: 'outcome', n }), outcomeText(n)))), h('div', 'align__hh', h('small', '', 'Points')));
    let strandName = '';
    for (const e of entries) {
      if (e.strand.name !== strandName) {
        strandName = e.strand.name;
        grid.append(h('div', 'align__rl align__label align__strand-row', strandName), ...ns.map(() => h('div')), h('div'));
      }
      grid.append(h('div', 'align__rl', button('align__rl-btn', e.sub.name, () => select({ kind: 'hsc', ref: e.ref }), e.sub.rungs.excellent.i_can)));
      let total = 0;
      for (const n of ns) {
        const builds = e.sub.outcomes.includes(n);
        const count = builds ? reach.get(n)! : 0;
        total = Math.max(total, count);
        const step = count ? Math.max(1, Math.min(7, Math.round((count / max) * 7))) : 0;
        const cell = button(`align__hc align__hc--${step}`, count ? String(count) : '', () => select({ kind: 'hsc', ref: e.ref }), builds ? `${e.sub.name} builds ${outcomeCode(n)}: ${count} dot point${count === 1 ? '' : 's'} here reach it` : `${e.sub.name} doesn’t build ${outcomeCode(n)}`);
        cell.setAttribute('aria-label', cell.title);
        cell.classList.toggle('is-lit', !!sel && ((sel.kind === 'outcome' && sel.n === n && builds) || (sel.kind === 'hsc' && sel.ref === e.ref)));
        grid.append(cell);
      }
      grid.append(h('div', `align__tot${total ? '' : ' is-zero'}`, String(points.filter((p) => p.outcomes.some((o) => e.sub.outcomes.includes(o.n))).length)));
    }
    chart.replaceChildren(grid);
    legend.replaceChildren(
      h('span', 'align__label', 'Dot points a skill serves'),
      h('span', 'align__ramp-wrap', h('span', '', 'None'), h('span', 'align__ramp'), h('span', '', 'Most')),
      h('span', 'align__hint', 'A skill is linked to a dot point when both build the same outcome in this focus area. The number is how many dot points here reach that outcome.')
    );
  }

  function hscTags(entries: SkillEntry[]): HTMLElement {
    let strandName = '';
    const wrap = h('div', 'align__tags');
    for (const e of entries) {
      if (e.strand.name !== strandName) {
        strandName = e.strand.name;
        wrap.append(h('span', 'align__why align__tag-group', strandName));
      }
      wrap.append(button('align__tag', e.sub.name, () => select({ kind: 'hsc', ref: e.ref })));
    }
    return wrap;
  }

  function hscView(ref: string): HTMLElement[] {
    const e = skillsData ? skillEntries(skillsData).find((x) => x.ref === ref) : undefined;
    if (!e) return [h('p', 'align__hint', 'That skill isn’t in the continuum.')];
    const served = points.filter((p) => p.outcomes.some((o) => e.sub.outcomes.includes(o.n)));
    const rungs = skillsData!.strands[0]!.rungs;
    return [
      h('h3', 'align__title', `${e.strand.name} · ${e.sub.name}`),
      h('p', 'align__quote', e.sub.in_hsc),
      section('Builds', h('div', 'align__tags', ...e.sub.outcomes.map((n) => button('align__tag', outcomeCode(n), () => select({ kind: 'outcome', n }))))),
      section('The climb', ...rungs.map((r) => item([r.name, why(`${r.marks} marks`)], e.sub.rungs[r.id].i_can))),
      section(`${served.length} dot point${served.length === 1 ? '' : 's'} it serves in ${areaName}`, ...(served.length ? [h('div', 'align__tags', ...served.map(pointTag))] : [h('p', 'align__hint', 'None here. This skill belongs to another focus area.')])),
      button('btn btn--secondary', 'Open in the Skills continuum', () => showSkillInLibrary(ref))
    ];
  }

  // ---------- panel ----------
  function pointTag(p: AreaPoint): HTMLElement {
    const label = state.area === 'all' ? `${p.areaName} ${p.id}` : p.id;
    if (state.area === 'all') return h('span', 'align__tag', label);
    return button('align__tag', label, () => select({ kind: 'point', area: p.area, id: p.id }));
  }
  const item = (head: Array<Node | string>, body: Node | string): HTMLElement => h('div', 'align__item', h('span', 'align__item-head', ...head), body);
  const section = (title: string, ...children: Array<Node | null>): HTMLElement => h('div', 'align__sec', h('h4', 'align__label', title), ...children);
  const why = (text: string): HTMLElement => h('span', 'align__why', text);
  const processChips = (codes: string[]): HTMLElement => h('span', 'align__badges', ...codes.map((c) => h('span', 'align__badge', c)));

  function paintPanel(): void {
    const sel = state.sel;
    const back = sel ? button('align__back', 'Back to overview', () => select(null)) : null;
    let body: HTMLElement[];
    if (!sel) body = overview();
    else if (sel.kind === 'point') body = state.editing ? editor(sel) : pointView(sel);
    else if (sel.kind === 'outcome') body = outcomeView(sel.n);
    else if (sel.kind === 'concept') body = conceptView(sel.key);
    else if (sel.kind === 'bullet') body = bulletView(sel.ref);
    else if (sel.kind === 'process') body = processView(sel.code);
    else if (sel.kind === 'skill') body = skillView(sel.id);
    else if (sel.kind === 'skillcell') body = skillCellView(sel.n, sel.skill);
    else if (sel.kind === 'hsc') body = hscView(sel.ref);
    else body = cellView(sel.n, sel.key);
    panel.replaceChildren(...(back ? [back] : []), ...body);
  }

  function overview(): HTMLElement[] {
    const counts = doc.outcomes.map((o) => {
      const links = points.flatMap((p) => p.outcomes.filter((x) => x.n === o.n));
      return { n: o.n, shared: links.filter((l) => l.link === 'shared').length, related: links.filter((l) => l.link === 'related').length };
    });
    const max = Math.max(1, ...counts.map((c) => c.shared + c.related));
    const bars = h('div', 'align__bars', ...counts.map((c) => {
      const track = h('span', 'align__track', h('span', 'align__track-shared'), h('span', 'align__track-related'));
      (track.children[0] as HTMLElement).style.width = `${(c.shared / max) * 100}%`;
      (track.children[1] as HTMLElement).style.width = `${(c.related / max) * 100}%`;
      const total = c.shared + c.related;
      return h('div', 'align__bar', button('align__bar-code', outcomeCode(c.n), () => select({ kind: 'outcome', n: c.n })), track, h('span', `align__bar-n${total ? '' : ' is-zero'}`, String(total)));
    }));
    const used = conceptsUsed(doc, points)
      .map((c) => ({ c, uses: points.filter((p) => p.concepts.some((x) => conceptKeyOf(x.ref) === c.key)).length }))
      .sort((a, b) => b.uses - a.uses);
    const missing = doc.concepts.filter((c) => !used.some((u) => u.c.key === c.key)).map((c) => c.name);
    const tags = h('div', 'align__tags', ...used.map(({ c, uses }) => button('align__tag', `${c.name} ${uses}`, () => select({ kind: 'concept', key: c.key }))));
    const procs = h('div', 'align__tags', ...doc.processes.map((p) => {
      const n = points.filter((x) => x.processes.includes(p.code)).length;
      const b = button('align__tag', '', () => select({ kind: 'process', code: p.code }));
      b.append(h('span', 'align__badge', p.code), ` ${p.name} ${n}`);
      return b;
    }));
    return [
      h('h3', 'align__title', areaName),
      section('Outcomes reached by dot points', bars, h('p', 'align__hint', 'Dark is shared wording, light is a related idea. Tap a code to trace it.')),
      section('Concepts this focus area touches', tags, missing.length ? h('p', 'align__hint', `Not touched: ${missing.join(', ')}.`) : null),
      section('Learning processes', procs),
      section('Thinking skills', h('div', 'align__tags', ...SKILLS.map((k) => {
        const n = points.filter((p) => (p.skills ?? []).includes(k.id)).length;
        const b = button(`align__tag${n ? '' : ' is-zero'}`, '', () => select({ kind: 'skill', id: k.id }), k.description);
        b.append(glyph(k.id), ` ${k.name} ${n}`);
        return b;
      }))),
      skillsData ? section('HSC skills for this focus area', hscTags(skillsForArea(skillsData, state.area))) : h('span')
    ];
  }

  function pointView(sel: { area: string; id: string }): HTMLElement[] {
    const p = points.find((x) => x.id === sel.id && x.area === sel.area);
    if (!p) return [h('p', 'align__hint', 'That dot point isn’t in this focus area.')];
    const own = wordStems(p.text);
    const others = new Set([...p.outcomes.map((o) => outcomeText(o.n)), ...p.concepts.map((c) => bulletText(doc, c.ref)?.text ?? '')].flatMap((t) => [...wordStems(t)]));
    const outs = p.outcomes.map((o) => item([button('align__tag', outcomeCode(o.n), () => select({ kind: 'outcome', n: o.n })), why(LINK_LABEL[o.link])], highlighted(outcomeText(o.n), own)));
    const cons = p.concepts.map((c) => {
      const b = bulletText(doc, c.ref);
      const name = concepts.get(conceptKeyOf(c.ref))?.name ?? c.ref;
      return item([button('align__tag', `${name} ${bulletNumberOf(c.ref)}`, () => select({ kind: 'bullet', ref: c.ref })), why(LINK_LABEL[c.link] + (b?.adv ? ' · Advanced and Extension' : ''))], highlighted(b?.text ?? '', own));
    });
    const procs = p.processes.map((code) => {
      const pr = doc.processes.find((x) => x.code === code);
      return item([h('span', 'align__badge', code), pr?.name ?? code], pr?.text ?? '');
    });
    return [
      h('h3', 'align__title', `${p.id} · ${p.kind === 'U' ? 'Understanding' : 'Responding'}`, p.edited ? h('span', 'align__edited', 'Edited') : null),
      h('p', 'align__quote', highlighted(p.text, others)),
      button('btn btn--secondary align__edit', 'Edit links', () => { state.editing = true; rerender(); }),
      section('Outcomes', ...outs),
      section('Stage 6 concept bullets', ...cons),
      section('Learning processes', ...procs),
      section('Thinking skills', ...(p.skills ?? []).map((id) => item([glyph(id), button('align__tag', skillName(id), () => select({ kind: 'skill', id }))], skillText(id)))),
      skillsData ? section('HSC skills that build it', hscTags(skillEntries(skillsData).filter((e) => e.sub.focus_areas.includes(p.area) && p.outcomes.some((o) => e.sub.outcomes.includes(o.n))))) : h('span'),
      h('p', 'align__hint', 'Highlighted words appear on both sides of a link.')
    ];
  }

  function outcomeView(n: number): HTMLElement[] {
    const own = wordStems(outcomeText(n));
    const hits = points.filter((p) => p.outcomes.some((o) => o.n === n));
    const list = hits.map((p) => item([pointTag(p), why(LINK_LABEL[p.outcomes.find((o) => o.n === n)!.link]), processChips(p.processes)], highlighted(p.text, own)));
    const refs = [...new Set(hits.flatMap((p) => p.concepts.map((c) => c.ref)))];
    return [
      h('h3', 'align__title', outcomeCode(n)),
      h('p', 'align__quote', outcomeText(n)),
      section(`Reached by ${hits.length} dot point${hits.length === 1 ? '' : 's'} in ${areaName}`, ...(list.length ? list : [h('p', 'align__hint', 'No dot point here reaches it. Cover it through another unit, or tag lessons with it by hand.')])),
      refs.length ? section('Concept bullets behind those points', h('div', 'align__tags', ...refs.map((r) => button('align__tag', `${concepts.get(conceptKeyOf(r))?.name ?? r} ${bulletNumberOf(r)}`, () => select({ kind: 'bullet', ref: r }))))) : h('span'),
      skillsData ? section('HSC skills that build it', hscTags(skillsForOutcome(skillsData, n, state.area))) : h('span')
    ];
  }

  function conceptView(key: string): HTMLElement[] {
    const c = concepts.get(key);
    if (!c) return [];
    const rows = c.bullets.map((b) => {
      const ref = key + b.n;
      const linked = points.filter((p) => p.concepts.some((x) => x.ref === ref));
      const row = item([String(b.n), b.adv ? why('Advanced and Extension') : '', ...(linked.length ? linked.map(pointTag) : [why('not linked here')])], b.text);
      row.classList.toggle('is-quiet', !linked.length);
      return row;
    });
    return [h('h3', 'align__title', c.name), h('p', 'align__quote', c.head), section('They learn that', ...rows)];
  }

  function bulletView(ref: string): HTMLElement[] {
    const b = bulletText(doc, ref);
    const c = concepts.get(conceptKeyOf(ref));
    if (!b || !c) return [];
    const own = wordStems(b.text);
    const linked = points.filter((p) => p.concepts.some((x) => x.ref === ref));
    const outs = [...new Set(linked.flatMap((p) => p.outcomes.map((o) => o.n)))].sort((x, y) => x - y);
    return [
      h('h3', 'align__title', `${c.name} ${bulletNumberOf(ref)}`),
      h('p', 'align__quote', b.text, b.adv ? h('span', 'align__hint', ' (Advanced and Extension)') : null),
      h('p', 'align__hint', c.head),
      section('Dot points it matches', ...linked.map((p) => item([pointTag(p), why(LINK_LABEL[p.concepts.find((x) => x.ref === ref)!.link]), processChips(p.processes)], highlighted(p.text, own)))),
      section('Outcomes it reaches through them', h('div', 'align__tags', ...outs.map((n) => button('align__tag', outcomeCode(n), () => select({ kind: 'outcome', n })))))
    ];
  }

  function processView(code: string): HTMLElement[] {
    const pr = doc.processes.find((x) => x.code === code);
    const linked = points.filter((p) => p.processes.includes(code));
    return [
      h('h3', 'align__title', h('span', 'align__badge', code), ` ${pr?.name ?? code}`),
      h('p', 'align__quote', pr?.text ?? ''),
      section(`${linked.length} dot point${linked.length === 1 ? '' : 's'} call on it`, ...linked.map((p) => item([pointTag(p)], p.text)))
    ];
  }

  function cellView(n: number, key: string): HTMLElement[] {
    const c = concepts.get(key);
    const hits = heatHits(points, n, key);
    const own = wordStems(`${outcomeText(n)} ${c?.head ?? ''}`);
    return [
      h('h3', 'align__title', `${outcomeCode(n)} × ${c?.name ?? key}`),
      item([outcomeCode(n)], outcomeText(n)),
      item([`${c?.name ?? key} · Stage 6`], c?.head ?? ''),
      section(`${hits.length} dot point${hits.length === 1 ? '' : 's'} link the two in ${areaName}`,
        ...(hits.length ? hits.map((x) => item([pointTag(x.point), why(`${LINK_LABEL[x.link]} · ${c?.name ?? key} ${x.refs.map(bulletNumberOf).join(', ')}`), processChips(x.point.processes)], highlighted(x.point.text, own))) : [h('p', 'align__hint', 'No dot point links this outcome and this concept here.')]))
    ];
  }

  function skillView(id: string): HTMLElement[] {
    const linked = points.filter((p) => (p.skills ?? []).includes(id));
    const outs = [...new Set(linked.flatMap((p) => p.outcomes.map((o) => o.n)))].sort((x, y) => x - y);
    return [
      h('h3', 'align__title', glyph(id, 'align__glyph align__glyph--title'), skillName(id)),
      h('p', 'align__quote', skillText(id)),
      section(`${linked.length} dot point${linked.length === 1 ? '' : 's'} call on it in ${areaName}`,
        ...(linked.length ? linked.map((p) => item([pointTag(p), processChips(p.processes)], p.text)) : [h('p', 'align__hint', 'No dot point here asks for it.')])),
      outs.length ? section('Outcomes it reaches through them', h('div', 'align__tags', ...outs.map((n) => button('align__tag', outcomeCode(n), () => select({ kind: 'outcome', n }))))) : h('span')
    ];
  }

  function skillCellView(n: number, id: string): HTMLElement[] {
    const hits = skillHits(points, n, id);
    return [
      h('h3', 'align__title', glyph(id, 'align__glyph align__glyph--title'), `${skillName(id)} × ${outcomeCode(n)}`),
      item([outcomeCode(n)], outcomeText(n)),
      item([skillName(id)], skillText(id)),
      section(`${hits.length} dot point${hits.length === 1 ? '' : 's'} in ${areaName}`,
        ...(hits.length ? hits.map((x) => item([pointTag(x.point), why(LINK_LABEL[x.link]), processChips(x.point.processes)], x.point.text)) : [h('p', 'align__hint', 'No dot point here links this skill and this outcome.')]))
    ];
  }

  // ---------- editing one point's links ----------
  function editor(sel: { area: string; id: string }): HTMLElement[] {
    const p = points.find((x) => x.id === sel.id && x.area === sel.area)!;
    const draft: AlignmentPatch = {
      focus_area: p.area,
      point: p.id,
      outcomes: p.outcomes.map((o) => ({ ...o })),
      concepts: p.concepts.map((c) => ({ ...c })),
      processes: [...p.processes],
      skills: [...(p.skills ?? [])]
    };
    const error = h('p', 'align__error');
    error.hidden = true;

    const strengthPicker = (current: LinkStrength | null, onPick: (next: LinkStrength | null) => void, label: string): HTMLElement => {
      const group = h('div', 'align__seg');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', label);
      const options: Array<[LinkStrength | null, string]> = [[null, 'None'], ['related', 'Related'], ['shared', 'Shared']];
      for (const [value, text] of options) {
        const b = button('align__seg-btn', text, () => {
          onPick(value);
          for (const x of group.querySelectorAll('button')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        b.setAttribute('aria-pressed', value === current ? 'true' : 'false');
        group.append(b);
      }
      return group;
    };

    const outcomeRows = doc.outcomes.map((o) => h('div', 'align__edit-row',
      h('span', 'align__edit-name', o.code),
      strengthPicker(draft.outcomes.find((x) => x.n === o.n)?.link ?? null, (next) => {
        draft.outcomes = draft.outcomes.filter((x) => x.n !== o.n);
        if (next) draft.outcomes.push({ n: o.n, link: next });
      }, o.code)
    ));

    const conceptList = h('div', 'align__sec');
    const paintConcepts = (): void => {
      conceptList.replaceChildren(...draft.concepts.map((c) => {
        const name = `${concepts.get(conceptKeyOf(c.ref))?.name ?? c.ref} ${bulletNumberOf(c.ref)}`;
        return h('div', 'align__edit-row align__edit-row--wrap',
          h('span', 'align__edit-name', name, h('small', '', bulletText(doc, c.ref)?.text ?? '')),
          strengthPicker(c.link, (next) => {
            if (next) c.link = next;
            else {
              draft.concepts = draft.concepts.filter((x) => x.ref !== c.ref);
              paintConcepts();
            }
          }, name));
      }));
    };
    paintConcepts();
    const add = h('select', 'align__add');
    add.setAttribute('aria-label', 'Add a concept bullet');
    add.append(option('Add a concept bullet…', ''));
    for (const c of doc.concepts) {
      const group = document.createElement('optgroup');
      group.label = c.name;
      for (const b of c.bullets) group.append(option(`${b.n}. ${b.text}`, c.key + b.n));
      add.append(group);
    }
    add.addEventListener('change', () => {
      const ref = add.value;
      add.value = '';
      if (!ref || draft.concepts.some((c) => c.ref === ref)) return;
      draft.concepts.push({ ref, link: 'related' });
      paintConcepts();
    });

    const procs = h('div', 'align__tags', ...doc.processes.map((pr) => {
      const b = button('align__tag', '', () => {
        draft.processes = draft.processes.includes(pr.code) ? draft.processes.filter((x) => x !== pr.code) : [...draft.processes, pr.code];
        b.setAttribute('aria-pressed', draft.processes.includes(pr.code) ? 'true' : 'false');
      }, pr.text);
      b.append(h('span', 'align__badge', pr.code), ` ${pr.name}`);
      b.setAttribute('aria-pressed', draft.processes.includes(pr.code) ? 'true' : 'false');
      return b;
    }));

    const skillToggles = h('div', 'align__tags', ...SKILLS.map((k) => {
      const b = button('align__tag', '', () => {
        draft.skills = draft.skills.includes(k.id) ? draft.skills.filter((x) => x !== k.id) : [...draft.skills, k.id];
        b.setAttribute('aria-pressed', draft.skills.includes(k.id) ? 'true' : 'false');
      }, k.description);
      b.append(glyph(k.id), ` ${k.name}`);
      b.setAttribute('aria-pressed', draft.skills.includes(k.id) ? 'true' : 'false');
      return b;
    }));

    const save = button('btn btn--primary', 'Save links', () => {
      save.disabled = true;
      error.hidden = true;
      saveAlignmentPoint(draft)
        .then(({ alignment }) => {
          state.doc = alignment;
          state.editing = false;
          if (root.isConnected) rerender();
        })
        .catch((e: unknown) => {
          save.disabled = false;
          error.textContent = e instanceof ApiClientError ? e.message : 'The links didn’t save. Try again.';
          error.hidden = false;
        });
    });
    const cancel = button('btn btn--secondary', 'Cancel', () => { state.editing = false; rerender(); });

    return [
      h('h3', 'align__title', `Edit ${p.id}`),
      h('p', 'align__quote', p.text),
      section('Outcomes', ...outcomeRows),
      section('Stage 6 concept bullets', conceptList, add),
      section('Learning processes', procs),
      section('Thinking skills', skillToggles),
      error,
      h('div', 'align__actions', save, cancel)
    ];
  }

  if (state.mode === 'dots') paintDots();
  else paintHeat();
  paintPanel();

  root.replaceChildren(
    h('div', 'align__controls', areas, modes, rows),
    h('div', 'align__stage', h('div', 'align__card', h('div', 'align__scroll', chart), legend), panel)
  );
}

/** For tests: forget the loaded alignment and view state. */
export function resetAlignmentViewForTests(): void {
  state.doc = null;
  state.area = '';
  state.mode = 'dots';
  state.heatRows = 'concepts';
  state.sel = null;
  skillsData = null;
  state.editing = false;
}

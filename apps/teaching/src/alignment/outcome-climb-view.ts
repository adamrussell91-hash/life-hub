import { withAppBase } from '@/app/base-path';
import type { OutcomeClimbEntry, ScopeSequence } from '@/schemas';
import { RUNG_IDS } from '@/skills/schema';
import type { CurriculumResponse } from '@/teacher/nav';
import { lessonClassDates } from '@/teacher/network-context';
import { loadAlignment } from './coverage-panel';
import { buildOutcomeClimb, climbSummary, drawnLevels, nextClimbEntries, type ClimbOutcome, type ClimbUnit, type ClimbVisit, type OutcomeClimb } from './outcome-climb';
import type { Alignment } from './schema';
import { yearUnits } from './year-coverage-view';
import './outcome-climb.css';

export type OutcomeClimbOptions = {
  curriculum: CurriculumResponse;
  subjectId: string;
  getScope: () => ScopeSequence;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onSave: (entries: OutcomeClimbEntry[]) => Promise<void>;
  /** The syllabus couldn't load: the page shows its term cards instead. */
  onUnavailable: () => void;
};

const NS = 'http://www.w3.org/2000/svg';
const LEVELS = ['Capable', 'Skilled', 'Accomplished', 'Excellent'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const WIDTH = 1140, LEFT = 112, RIGHT = 1092, TOP = 92, ROW = 108;
const BASE = TOP + 22 + ROW * 3 + 66;
const HEIGHT = BASE + 62;
const PLAY_MS = 9000;
/** The year plays once per page load, not on each return to the tab. */
const played = new Set<string>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element, text?: string): SVGElement {
  const node = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

const gapText = (gap: number) => (gap <= 0 ? 'Straight after' : `${gap} teaching week${gap === 1 ? '' : 's'} later`);
const shortCode = (code: string) => code.split('-').pop() ?? code;

/** Up to two lines that fit a band of this width. */
function bandLines(title: string, width: number): string[] {
  const perLine = Math.max(4, Math.floor((width - 12) / 6));
  const lines: string[] = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    if (!line || `${line} ${word}`.length <= perLine) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const out = lines.slice(0, 2).map((l) => (l.length > perLine ? `${l.slice(0, perLine - 1)}…` : l));
  if (lines.length > 2) out[1] = `${out[1]!.slice(0, Math.max(1, perLine - 1))}…`;
  return out;
}

function climbUnits(curriculum: CurriculumResponse, subjectId: string): ClimbUnit[] {
  const units = new Map(curriculum.units.map((u) => [u.id, u]));
  return yearUnits(curriculum, subjectId).map((u) => {
    const unit = units.get(u.id)!;
    return {
      ...u,
      lessons: u.lessons.map((lesson) => {
        const date = lessonClassDates(curriculum, unit, lesson.id).map((c) => c.date).filter((d): d is string => Boolean(d)).sort()[0];
        return { ...lesson, ...(date ? { date } : {}) };
      })
    };
  });
}

/**
 * Scope & Sequence → Curriculum Map for syllabus subjects: the units along the
 * top, each outcome running through the year underneath. Height is the level
 * a visit aims for, so a climbing line is getting harder. Pick an outcome to
 * set its levels and say what students now do on each visit.
 */
export function mountOutcomeClimb(host: HTMLElement, options: OutcomeClimbOptions): void {
  const root = el('section', 'climb');
  root.append(el('p', 'climb__hint', 'Loading the syllabus…'));
  host.replaceChildren(root);
  let doc: Alignment | null = null;
  let model: OutcomeClimb | null = null;
  let picked: number | null = null;
  let raf = 0;
  let saving: Promise<void> = Promise.resolve();

  const bar = el('div', 'climb__bar');
  const readout = el('span', 'climb__readout');
  const playBtn = el('button', 'btn btn--ghost climb__play', 'Play the year');
  playBtn.type = 'button';
  const picker = el('div', 'climb__picker');
  const scroll = el('div', 'climb__scroll');
  const detail = el('div', 'climb__detail');
  const svg = svgEl('svg', { class: 'climb__svg', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'img', 'aria-label': 'Each outcome across the terms, with height showing how demanding each visit is' });
  scroll.append(svg);
  let clip: SVGElement | null = null;
  let head: { group: SVGElement; line: SVGElement; box: SVGElement; text: SVGElement } | null = null;

  const x = (week: number) => LEFT + ((week - 1) / model!.week_count) * (RIGHT - LEFT);
  const y = (level: number, index: number) => {
    const n = model!.outcomes.length;
    return BASE - level * ROW + (index - (n - 1) / 2) * Math.min(13, 84 / n);
  };

  function drawChart(): void {
    const data = model!;
    svg.replaceChildren();
    const defs = svgEl('defs', {}, svg);
    const hatch = svgEl('pattern', { id: 'climb-hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svgEl('rect', { width: 7, height: 7, class: 'climb__hatch-bg' }, hatch);
    svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 7, class: 'climb__hatch-line' }, hatch);
    clip = svgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT }, svgEl('clipPath', { id: 'climb-reveal' }, defs));

    for (const term of data.terms) svgEl('text', { class: 'climb__term', x: x(term.start_week) + 2, y: 24 }, svg, `TERM ${term.number}`);
    for (const item of data.band) {
      const a = x(item.start_week), b = x(item.end_week + 1);
      const g = svgEl('g', { class: 'climb__unit', 'data-item-id': item.id, role: 'button', tabindex: 0, 'aria-label': item.title }, svg);
      if (item.id === options.selectedItemId) g.classList.add('scope-timeline__item--selected');
      svgEl('title', {}, g, item.untagged ? `${item.title}: no lessons tagged yet` : item.title);
      svgEl('rect', { class: `climb__band${item.kind === 'note' ? ' climb__band--note' : ''}${item.untagged ? ' climb__band--untagged' : ''}`, x: a, y: 34, width: b - a, height: 44 }, g);
      bandLines(item.title, b - a).forEach((line, i) => svgEl('text', { class: `climb__band-t${item.kind === 'note' ? ' climb__band-t--note' : ''}`, x: a + 7, y: 52 + i * 14 }, g, line));
      g.addEventListener('click', () => options.onSelectItem(item.id));
      g.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') { e.preventDefault(); options.onSelectItem(item.id); }
      });
    }
    LEVELS.forEach((name, level) => {
      const yy = BASE - level * ROW;
      svgEl('line', { class: 'climb__grid', x1: LEFT, x2: RIGHT, y1: yy + 48, y2: yy + 48 }, svg);
      svgEl('text', { class: 'climb__level', x: LEFT - 12, y: yy + 4 }, svg, name);
    });
    const edges = [...data.terms.map((t) => t.start_week), data.week_count + 1];
    for (const w of edges) svgEl('line', { class: 'climb__term-line', x1: x(w), x2: x(w), y1: 34, y2: BASE + 48 }, svg);

    const stage = svgEl('g', { 'clip-path': 'url(#climb-reveal)' }, svg);
    data.outcomes.forEach((outcome, index) => {
      if (!outcome.visits.length) return;
      const g = svgEl('g', { class: 'climb__outcome', 'data-outcome': outcome.n }, stage);
      if (outcome.n === picked) g.classList.add('is-on');
      const levels = drawnLevels(outcome.visits);
      let hit = '';
      outcome.visits.forEach((visit, i) => {
        const a = x(visit.first_week), b = x(visit.last_week + 1), yy = y(levels[i]!, index);
        if (i > 0) {
          const prev = outcome.visits[i - 1]!;
          const pb = x(prev.last_week + 1), py = y(levels[i - 1]!, index), mid = (pb + a) / 2;
          svgEl('path', { class: 'climb__link', d: `M${pb} ${py}C${mid} ${py} ${mid} ${yy} ${a} ${yy}` }, g);
        }
        svgEl('line', { class: `climb__run${visit.level === null ? ' climb__run--unset' : ''}`, x1: a, x2: b, y1: yy, y2: yy }, g);
        hit += `M${a} ${yy}L${b} ${yy}`;
      });
      const last = outcome.visits[outcome.visits.length - 1]!, ly = y(levels[levels.length - 1]!, index);
      svgEl('line', { class: 'climb__tail', x1: x(last.last_week + 1), x2: RIGHT, y1: ly, y2: ly }, g);
      svgEl('text', { class: 'climb__end', x: RIGHT + 7, y: ly }, g, shortCode(outcome.code));
      svgEl('path', { class: 'climb__hit', d: hit }, g);
      g.addEventListener('click', () => pick(outcome.n));
    });

    if (picked !== null) {
      const index = data.outcomes.findIndex((o) => o.n === picked);
      const outcome = data.outcomes[index];
      if (outcome) {
        const levels = drawnLevels(outcome.visits);
        outcome.visits.forEach((visit, i) => {
          const words = visit.gap === null ? ORD[i]! : `${ORD[i]} · ${gapText(visit.gap).replace('teaching ', '').toLowerCase()}`;
          svgEl('text', { class: 'climb__note', x: x(visit.first_week), y: y(levels[i]!, index) - 12 }, svg, words);
        });
      }
    }

    const group = svgEl('g', { visibility: 'hidden' }, svg);
    head = {
      group,
      line: svgEl('line', { class: 'climb__head', y1: 34, y2: BASE + 48 }, group),
      box: svgEl('rect', { class: 'climb__head-box', y: BASE + 48, width: 58, height: 18, rx: 2 }, group),
      text: svgEl('text', { class: 'climb__head-t', y: BASE + 57 }, group)
    };
  }

  function drawPicker(): void {
    picker.replaceChildren();
    picker.style.setProperty('--climb-cols', String(model!.outcomes.length));
    for (const outcome of model!.outcomes) {
      const b = el('button', `climb__pick${outcome.n === picked ? ' is-on' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(outcome.n === picked));
      b.setAttribute('aria-label', outcome.code);
      b.append(el('span', 'climb__pick-full', outcome.code), el('span', 'climb__pick-short', shortCode(outcome.code)));
      b.addEventListener('click', () => pick(outcome.n));
      picker.append(b);
    }
  }

  function visitRow(outcome: ClimbOutcome, visit: ClimbVisit, i: number): HTMLElement {
    const row = el('div', 'climb__visit');
    row.append(el('span', 'climb__visit-n', ORD[i]));
    const body = el('div', 'climb__visit-body');
    const head = el('div', 'climb__visit-head');
    head.append(el('strong', undefined, visit.unit_title));
    if (visit.gap !== null) head.append(el('span', 'climb__gap', gapText(visit.gap)));
    const previous = i > 0 ? outcome.visits[i - 1]!.level : null;
    const levels = el('div', 'hub-pills climb__levels');
    levels.setAttribute('role', 'group');
    levels.setAttribute('aria-label', `Level for ${visit.unit_title}`);
    RUNG_IDS.forEach((rung, r) => {
      const b = el('button', 'hub-pills__btn', LEVELS[r]);
      b.type = 'button';
      b.dataset.focusKey = `${visit.unit_id}:${rung}`;
      b.setAttribute('aria-pressed', String(visit.level === r));
      b.addEventListener('click', () => {
        save(nextClimbEntries(options.getScope().outcome_climb ?? [], outcome.n, visit.unit_id, { level: visit.level === r ? null : rung }));
        rebuild();
        drawChart();
        drawDetail();
        detail.querySelector<HTMLElement>(`[data-focus-key="${visit.unit_id}:${rung}"]`)?.focus({ preventScroll: true });
      });
      levels.append(b);
    });
    const same = visit.level !== null && visit.level === previous;
    const demand = el('input', 'climb__demand');
    demand.type = 'text';
    demand.maxLength = 200;
    demand.value = visit.demand;
    demand.placeholder = 'What students now do on this visit';
    demand.setAttribute('aria-label', `What students now do in ${visit.unit_title}`);
    demand.addEventListener('change', () => {
      save(nextClimbEntries(options.getScope().outcome_climb ?? [], outcome.n, visit.unit_id, { demand: demand.value }));
      rebuild();
    });
    const brings = [...visit.points, ...visit.concepts].join(' · ');
    const lessons = el('details', 'climb__lessons');
    const count = visit.lessons.length;
    lessons.append(el('summary', undefined, `${count} ${count === 1 ? 'lesson' : 'lessons'}`));
    const list = el('ul');
    for (const lesson of visit.lessons) {
      const li = el('li');
      const a = el('a', undefined, lesson.title);
      a.href = lesson.href ?? withAppBase(`/lessons/${lesson.id}`);
      li.append(a);
      list.append(li);
    }
    lessons.append(list);
    body.append(head, levels);
    if (same) body.append(el('span', 'climb__same', 'Same level again'));
    body.append(demand);
    if (brings) body.append(el('p', 'climb__brings', `Brings in: ${brings}`));
    body.append(lessons);
    row.append(body);
    return row;
  }

  function drawDetail(): void {
    detail.replaceChildren();
    const outcome = model!.outcomes.find((o) => o.n === picked);
    if (!outcome) {
      detail.append(
        el('h3', 'climb__detail-title', `${model!.outcomes.length} outcomes, ${model!.terms.length} terms`),
        el('p', 'climb__detail-text', 'Thick lines are the weeks an outcome is taught. Height is how demanding that visit is, so a line that climbs is getting harder and a flat return is the same level again. Dashed lines have no level set yet: pick an outcome to set them. Hatched units have no lessons tagged yet.')
      );
      return;
    }
    detail.append(
      el('h3', 'climb__detail-title', `${outcome.code}: ${climbSummary(outcome, (i) => LEVELS[i]!)}`),
      el('p', 'climb__detail-text', outcome.text)
    );
    outcome.visits.forEach((visit, i) => detail.append(visitRow(outcome, visit, i)));
    if (outcome.next_chance) detail.append(el('p', 'climb__next', `Next chance to return: ${outcome.next_chance}.`));
  }

  function rebuild(): void {
    model = buildOutcomeClimb(doc!, options.getScope(), climbUnits(options.curriculum, options.subjectId));
  }

  function save(entries: OutcomeClimbEntry[]): void {
    const scope = options.getScope();
    scope.outcome_climb = entries;
    saving = saving.then(() => options.onSave(entries)).catch(() => {
      readout.textContent = 'That didn’t save. Change it again to retry.';
    });
  }

  function applyPick(): void {
    root.classList.toggle('has-pick', picked !== null);
    drawPicker();
    drawChart();
    drawDetail();
  }
  function pick(n: number): void {
    stop();
    picked = picked === n ? null : n;
    readout.textContent = '';
    applyPick();
  }

  function reveal(week: number): void {
    const data = model!;
    if (!clip || !head) return;
    const done = week >= data.week_count + 1;
    clip.setAttribute('width', String(done ? WIDTH : x(week)));
    head.group.setAttribute('visibility', done ? 'hidden' : 'visible');
    if (done) return;
    const px = x(week);
    head.line.setAttribute('x1', String(px));
    head.line.setAttribute('x2', String(px));
    head.box.setAttribute('x', String(px - 29));
    head.text.setAttribute('x', String(px));
    const whole = Math.min(data.week_count, Math.floor(week));
    const term = data.terms.find((t) => whole >= t.start_week && whole <= t.end_week);
    const started = (v: ClimbVisit | undefined) => Boolean(v && v.first_week <= week);
    const live = data.outcomes.filter((o) => o.visits.length);
    const met = live.filter((o) => started(o.visits[0])).length;
    const back = live.filter((o) => started(o.visits[1])).length;
    const label = term ? `Term ${term.number}, week ${whole - term.start_week + 1}` : '';
    head.text.textContent = term ? `T${term.number} W${whole - term.start_week + 1}` : '';
    readout.textContent = `${label} · ${met} of ${live.length} met · ${back} back`;
  }
  function stop(): void {
    cancelAnimationFrame(raf);
    if (model) reveal(model.week_count + 1);
  }
  function play(): void {
    stop();
    picked = null;
    applyPick();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const total = model!.week_count;
    const tick = (now: number) => {
      if (!host.contains(root)) return;
      const t = Math.max(0, Math.min(1, (now - start) / PLAY_MS));
      reveal(1 + t * total);
      if (t < 1) raf = requestAnimationFrame(tick);
      else readout.textContent = '';
    };
    raf = requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', play);

  void loadAlignment()
    .then((alignment) => {
      if (!host.contains(root)) return;
      doc = alignment;
      rebuild();
      const title = el('h2', 'climb__title', 'How each outcome builds across the year');
      const right = el('div', 'climb__right');
      right.append(readout, playBtn);
      bar.append(title, right);
      root.replaceChildren(bar, picker, scroll, detail);
      applyPick();
      const id = options.getScope().id;
      if (!played.has(id)) {
        played.add(id);
        play();
      }
    })
    .catch(() => {
      if (host.contains(root)) options.onUnavailable();
    });
}

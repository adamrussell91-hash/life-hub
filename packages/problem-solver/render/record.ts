// packages/problem-solver/render/record.ts
// The saved session's process record, in black and white: the chosen model's steps
// as in the toolkit (seven step p.37, Polya p.21, TRIZ p.23) with their arrows and
// loop labels, any optional extra steps in a row beneath, then a filmstrip per step
// that has runs. Done steps are solid ink, the current step is outlined, skipped steps
// are dashed and struck through, future steps are faint. Clicking a step box with a
// run (or a filmstrip card) asks the canvas to open that run's coloured chart.
//
// Step boxes are HTML laid over an SVG of arrows, both placed on one fixed grid
// (W x H units) and scaled with the container, so a box is a real button and a
// real element the morph can start from or land on.
import type { PsCaseFileTarget, PsSession, PsToolRun } from '../types';
import { MODELS } from '../models.mjs';
import { TOOLS } from '../tools/index.mjs';
import { lightningGlyph, toolEmblem } from '../glyphs';
import { nextId } from './details';
import { planStepForBook, stepName, stepPlan } from '../steps.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const W = 360;

type Box = { step: string; x: number; y: number; w: number; h: number };
type Label = { text: string; x: number; y: number; w: number; vertical?: boolean };
type Layout = { h: number; boxes: Box[]; extra?: Box & { name: string }; arrows: string[]; both?: string[]; lines?: string[]; labels: Label[] };

const column = (steps: string[], x: number, w: number, h = 56, pitch = 80): Box[] => steps.map((step, i) => ({ step, x, y: 10 + i * pitch, w, h }));
const downs = (boxes: Box[], cx: number): string[] => boxes.slice(1).map((box, i) => `M${cx} ${boxes[i]!.y + boxes[i]!.h} V${box.y - 2}`);

const sevenLeft = column(['define', 'analyse', 'devise', 'decide', 'implement'], 10, 180);
const polyaColumn = column(['identify', 'devise', 'implement', 'evaluate'], 60, 220);
const trizColumn = column(['specific_problem', 'general_problem', 'general_solution', 'specific_solution'], 10, 190);

/** Geometry per model, in grid units, following the book diagrams. */
const LAYOUTS: Record<string, Layout> = {
  seven_step: {
    h: 476,
    boxes: [...sevenLeft, { step: 'improve', x: 220, y: 330, w: 130, h: 56 }, { step: 'document', x: 10, y: 420, w: 340, h: 46 }],
    arrows: [...downs(sevenLeft, 100), 'M190 358 H217', 'M250 198 H193', 'M330 330 V292'],
    lines: ['M250 330 V38 H193'],
    both: ['M285 389 V417'],
    labels: [
      { text: 'If not successful, feedback', x: 258, y: 96, w: 96 },
      { text: 'If successful, continue', x: 268, y: 250, w: 88 }
    ]
  },
  polya: {
    h: 316,
    boxes: polyaColumn,
    arrows: [...downs(polyaColumn, 170), 'M320 118 H283'],
    lines: ['M280 278 H320 V118'],
    labels: [{ text: 'Solution fails', x: 326, y: 130, w: 24, vertical: true }]
  },
  triz: {
    h: 316,
    boxes: trizColumn,
    extra: { step: 'matrix', name: 'Contradiction matrix', x: 240, y: 130, w: 110, h: 56 },
    arrows: [...downs(trizColumn, 105), 'M222 118 H203', 'M222 198 H203'],
    lines: ['M240 158 H222 M222 118 V198'],
    labels: []
  }
};

export type RecordOptions = {
  /** The page a case file was written on; without it the version chips are plain text. */
  pageHref?(target: PsCaseFileTarget): string;
};

/** A review's start day, as the review panel shows dates (a bare date is local midnight). */
function reviewDay(at: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T00:00:00` : at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Where the latest review pass begins in Improve's runs, or null when there is no earlier pass to divide from. */
function passStart(session: PsSession, step: string): number | null {
  const review = session.reviewState;
  const before = review?.runsBefore ?? 0;
  if (!session.model || step !== planStepForBook(session.model.id, 'improve') || before <= 0) return null;
  return (session.steps?.[step]?.runs.length ?? 0) > before ? before : null;
}

export type StepState = 'done' | 'skipped' | 'current' | 'future' | 'waiting';
export type RecordView = {
  el: HTMLDivElement;
  update(session: PsSession): void;
  onOpenStep(cb: (runId: string, from: HTMLElement) => void): void;
  /** Where a chart for this run morphs back to: its filmstrip card, or its step box. */
  anchor(runId: string, via: 'step' | 'film'): HTMLElement | null;
};

/** A step's state from the session's steps and phase. */
export function stepState(session: PsSession, step: string): StepState {
  const st = session.steps?.[step];
  if (step === session.phase) return 'current';
  if (isPaused(session, step) || st?.status === 'waiting') return 'waiting';
  if (!st) return 'future';
  if (st.status === 'skipped') return 'skipped';
  if (st.status === 'done' || session.phase === 'finished') return 'done';
  return 'future';
}

/** A step is paused when an open detour, or a review under way, will return to it. */
export function isPaused(session: PsSession, step: string): boolean {
  if (session.detour?.from === step) return true;
  return session.reviewState?.status === 'reviewing' && session.reviewState.returnTo === step;
}

/** The run a step's box opens: the last run of that step that was not switched. */
export function stepRun(session: PsSession, step: string): PsToolRun | null {
  const runs = session.steps?.[step]?.runs ?? [];
  return [...runs].reverse().find((run) => run.status !== 'switched') ?? runs.at(-1) ?? null;
}

/** v1 name, kept for callers: the Define step's run. */
export function defineRun(session: PsSession): PsToolRun | null {
  return session.model ? stepRun(session, MODELS[session.model.id].define) : null;
}

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;

function place(el: HTMLElement, box: { x: number; y: number; w: number; h: number }, h: number): void {
  el.style.left = pct(box.x, W);
  el.style.top = pct(box.y, h);
  el.style.width = pct(box.w, W);
  el.style.height = pct(box.h, h);
}

export function createRecordView(doc: Document = document, options: RecordOptions = {}): RecordView {
  const root = doc.createElement('div');
  root.className = 'ps-record';
  let open: (runId: string, from: HTMLElement) => void = () => undefined;
  let painted = '';
  const stepEls = new Map<string, HTMLElement>();
  const runStep = new Map<string, string>();
  const cards = new Map<string, HTMLElement>();

  function span(className: string, text: string): HTMLSpanElement {
    const el = doc.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }

  function arrowsSvg(layout: Layout): SVGSVGElement {
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'ps-record__arrows');
    svg.setAttribute('viewBox', `0 0 ${W} ${layout.h}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const head = nextId('ps-record-head');
    svg.innerHTML = `<defs><marker id="${head}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z"/></marker></defs>`;
    const add = (d: string, start: boolean, end: boolean) => {
      const path = doc.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      if (start) path.setAttribute('marker-start', `url(#${head})`);
      if (end) path.setAttribute('marker-end', `url(#${head})`);
      svg.append(path);
    };
    for (const d of layout.lines ?? []) add(d, false, false);
    for (const d of layout.arrows) add(d, false, true);
    for (const d of layout.both ?? []) add(d, true, true);
    return svg;
  }

  function paintStep(session: PsSession, step: { id: string; name: string; detail: string }, position?: (item: HTMLElement) => void): HTMLElement {
    const state = stepState(session, step.id);
    const item = doc.createElement('div');
    item.className = `ps-record__step is-${state}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-step', step.id);
    item.setAttribute('data-state', state);
    position?.(item);
    const words = { done: 'Done', skipped: 'Skipped', current: 'In progress', future: 'Not started', waiting: 'Waiting' }[state];
    const objection = session.steps?.[step.id]?.objection;
    const objected = objection ? `Coach objected: ${objection}` : '';
    const label = `${step.name}: ${step.detail}. ${words}${objected ? `. ${objected}` : ''}`;
    const target = stepRun(session, step.id);
    const box = doc.createElement(target ? 'button' : 'div') as HTMLElement;
    box.className = 'ps-record__box';
    if (target) {
      // A button names itself; the list item stays unlabelled so the step is not read twice.
      (box as HTMLButtonElement).type = 'button';
      box.setAttribute('aria-label', `${label}. Show the chart`);
      box.addEventListener('click', () => open(target.id, item));
    } else {
      // A plain div's aria-label is ignored by screen readers, so the list item carries it.
      item.setAttribute('aria-label', label);
    }
    box.append(span('ps-record__name', step.name), span('ps-record__detail', step.detail));
    if (objected) {
      box.setAttribute('title', objected);
      box.append(span('ps-record__objection', objected));
    }
    item.append(box);
    return item;
  }

  function paintMap(session: PsSession): HTMLElement | null {
    if (!session.model) return null;
    const model = MODELS[session.model.id];
    const layout = LAYOUTS[model.id];
    if (!model || !layout) return null;
    const map = doc.createElement('div');
    map.className = 'ps-record__map';
    map.setAttribute('role', 'list');
    map.setAttribute('aria-label', model.name);
    map.style.aspectRatio = `${W} / ${layout.h}`;
    map.append(arrowsSvg(layout));
    for (const box of layout.boxes) {
      const step = model.steps.find((s: { id: string }) => s.id === box.step);
      if (!step) continue;
      stepEls.set(step.id, paintStep(session, step, (item) => place(item, box, layout.h)));
      map.append(stepEls.get(step.id)!);
    }
    if (layout.extra) {
      const extra = doc.createElement('div');
      extra.className = 'ps-record__step ps-record__step--aside';
      extra.setAttribute('aria-hidden', 'true');
      place(extra, layout.extra, layout.h);
      const box = doc.createElement('div');
      box.className = 'ps-record__box';
      box.append(span('ps-record__name', layout.extra.name));
      extra.append(box);
      map.append(extra);
    }
    for (const note of layout.labels) {
      const el = span(`ps-record__label${note.vertical ? ' ps-record__label--vertical' : ''}`, note.text);
      el.setAttribute('aria-hidden', 'true');
      el.style.left = pct(note.x, W);
      el.style.top = pct(note.y, layout.h);
      el.style.width = pct(note.w, W);
      map.append(el);
    }
    return map;
  }

  function paintExtras(session: PsSession): HTMLElement | null {
    if (!session.model) return null;
    const modelId = session.model.id;
    const extras = stepPlan(modelId).filter((s: { extra: boolean }) => s.extra);
    if (!extras.length) return null;
    const row = doc.createElement('div');
    row.className = 'ps-record__extras';
    row.setAttribute('role', 'list');
    row.setAttribute('aria-label', 'Optional steps');
    for (const extra of extras) {
      const el = paintStep(session, { id: extra.step, name: stepName(modelId, extra.step), detail: 'Optional' });
      stepEls.set(extra.step, el);
      row.append(el);
    }
    return row;
  }

  function strip(id: string, title: string): { section: HTMLElement; film: HTMLOListElement } {
    const section = doc.createElement('section');
    section.className = 'ps-record__strip';
    section.setAttribute('data-strip', id);
    const heading = doc.createElement('h3');
    heading.className = 'ps-record__strip-title';
    heading.textContent = title;
    const film = doc.createElement('ol');
    film.className = 'ps-record__film';
    film.setAttribute('aria-label', `${title} tools`);
    section.append(heading, film);
    return { section, film };
  }

  /** A full session escalated from Lightning starts with the quick route it came from. */
  function lightningStrip(from: string): HTMLElement {
    const { section, film } = strip('lightning', 'Lightning');
    film.setAttribute('aria-label', 'Lightning route');
    const item = doc.createElement('li');
    item.className = 'ps-record__card ps-record__card--lightning';
    const link = doc.createElement('a');
    link.className = 'ps-record__card-button ps-record__lightning';
    link.href = `#/problem-solver?id=${encodeURIComponent(from)}`;
    link.setAttribute('aria-label', 'Quick route. Where this began. Open the Lightning run');
    link.append(lightningGlyph(doc), span('ps-record__card-name', 'Quick route'), span('ps-record__card-note', 'Where this began'));
    item.append(link);
    film.append(item);
    return section;
  }

  function caseFileChips(session: PsSession): HTMLLIElement[] {
    return (session.caseFile?.history ?? []).map((entry) => {
      const item = doc.createElement('li');
      item.className = 'ps-record__version';
      const text = `Case file v${entry.version}`;
      const href = options.pageHref?.(entry.target);
      if (href) {
        const link = doc.createElement('a');
        link.className = 'ps-record__casefile';
        link.href = href;
        link.textContent = text;
        link.setAttribute('aria-label', `${text}, on its ${entry.target.kind === 'task' ? 'task' : 'project'} page`);
        item.append(link);
      } else {
        item.append(span('ps-record__casefile', text));
      }
      return item;
    });
  }

  function paintFilm(session: PsSession): HTMLElement | null {
    cards.clear();
    if (!session.model) return null;
    const modelId = session.model.id;
    const wrap = doc.createElement('div');
    wrap.className = 'ps-record__films';
    if (session.escalatedFrom) wrap.append(lightningStrip(session.escalatedFrom));
    const documentStep = planStepForBook(modelId, 'document');
    for (const { step } of stepPlan(modelId)) {
      const runs = session.steps?.[step]?.runs ?? [];
      const chips = step === documentStep ? caseFileChips(session) : [];
      if (!runs.length && !chips.length) continue;
      const { section, film } = strip(step, stepName(modelId, step));
      const pass = passStart(session, step);
      runs.forEach((run, index) => {
        if (index === pass && session.reviewState?.startedAt) {
          // The item stays out of the list's count; the separator inside it carries the name.
          const divider = doc.createElement('li');
          divider.className = 'ps-record__pass';
          divider.setAttribute('role', 'presentation');
          const day = reviewDay(session.reviewState.startedAt);
          const rule = span('ps-record__pass-label', day ? `Review on ${day}` : 'Review');
          rule.setAttribute('role', 'separator');
          rule.setAttribute('aria-label', rule.textContent ?? 'Review');
          divider.append(rule);
          film.append(divider);
        }
        runStep.set(run.id, step);
        const item = doc.createElement('li');
        item.className = `ps-record__card is-${run.status}`;
        item.setAttribute('data-run', run.id);
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'ps-record__card-button';
        const name = TOOLS[run.tool]?.name ?? run.tool;
        const note = run.status === 'switched' ? `Switched: ${run.switchReason ?? 'no reason given'}` : run.status === 'active' ? 'In progress' : `${run.nodes.length} ${run.nodes.length === 1 ? 'answer' : 'answers'}`;
        btn.setAttribute('aria-label', `${name}. ${note}. Show the chart`);
        btn.append(toolEmblem(run.tool, doc), span('ps-record__card-name', name), span('ps-record__card-note', note));
        btn.addEventListener('click', () => open(run.id, item));
        item.append(btn);
        film.append(item);
        cards.set(run.id, item);
      });
      film.append(...chips);
      wrap.append(section);
    }
    return wrap.childElementCount ? wrap : null;
  }

  function update(session: PsSession): void {
    const signature = JSON.stringify([session.model?.id, session.phase, Object.entries(session.steps ?? {}).map(([id, st]) => [id, st.status, st.objection, st.runs.map((run) => [run.id, run.tool, run.status, run.switchReason, run.nodes.length])]), session.reviewState?.runsBefore, session.reviewState?.startedAt, session.caseFile?.history?.map((entry) => [entry.version, entry.target.kind, entry.target.id]), session.escalatedFrom]);
    if (signature === painted) return;
    painted = signature;
    stepEls.clear();
    runStep.clear();
    const layout = session.model ? LAYOUTS[session.model.id] : undefined;
    const inset = layout ? Math.min(...layout.boxes.map((box) => box.x)) : 0;
    // A fraction of the grid width; the CSS multiplies it by the diagram's rendered width.
    root.style.setProperty('--ps-record-inset', (inset / W).toFixed(4));
    const parts = [paintMap(session), paintExtras(session), paintFilm(session)].filter((part): part is HTMLElement => !!part);
    root.replaceChildren(...parts);
  }

  return {
    el: root,
    update,
    onOpenStep(cb) {
      open = cb;
    },
    anchor(runId, via) {
      return (via === 'film' ? cards.get(runId) : null) ?? stepEls.get(runStep.get(runId) ?? '') ?? null;
    }
  };
}

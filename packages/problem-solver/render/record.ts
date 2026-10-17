// packages/problem-solver/render/record.ts
// The saved session's process record, in black and white: the chosen model's steps
// as in the toolkit (seven step p.37, Polya p.21, TRIZ p.23) with their arrows and
// loop labels, then a filmstrip of the Define chain. Done steps are solid ink,
// the current step is outlined, future steps are faint. Clicking the define step
// (or a filmstrip card) asks the canvas to open that run's coloured chart.
//
// Step boxes are HTML laid over an SVG of arrows, both placed on one fixed grid
// (W x H units) and scaled with the container, so a box is a real button and a
// real element the morph can start from or land on.
import type { PsSession, PsToolRun } from '../types';
import { MODELS } from '../models.mjs';
import { TOOLS } from '../tools/index.mjs';
import { toolEmblem } from '../glyphs';
import { nextId } from './details';

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

export type StepState = 'done' | 'current' | 'future';
export type RecordView = {
  el: HTMLDivElement;
  update(session: PsSession): void;
  onOpenStep(cb: (runId: string, from: HTMLElement) => void): void;
  /** Where a chart for this run morphs back to: its filmstrip card, or the define step box. */
  anchor(runId: string, via: 'step' | 'film'): HTMLElement | null;
};

/** The define step's state from the session phase; every later step is still ahead. */
export function stepState(session: PsSession, step: string): StepState {
  if (!session.model || step !== MODELS[session.model.id].define) return 'future';
  if (session.phase === 'defined') return 'done';
  return session.phase === 'define' ? 'current' : 'future';
}

/** The run the define step opens: the last run of the chain that was not switched away. */
export function defineRun(session: PsSession): PsToolRun | null {
  const runs = session.define.runs;
  return [...runs].reverse().find((run) => run.status !== 'switched') ?? runs.at(-1) ?? null;
}

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;

function place(el: HTMLElement, box: { x: number; y: number; w: number; h: number }, h: number): void {
  el.style.left = pct(box.x, W);
  el.style.top = pct(box.y, h);
  el.style.width = pct(box.w, W);
  el.style.height = pct(box.h, h);
}

export function createRecordView(doc: Document = document): RecordView {
  const root = doc.createElement('div');
  root.className = 'ps-record';
  let open: (runId: string, from: HTMLElement) => void = () => undefined;
  let painted = '';
  let stepEl: HTMLElement | null = null;
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
    const target = defineRun(session);
    stepEl = null;
    for (const box of layout.boxes) {
      const step = model.steps.find((s: { id: string }) => s.id === box.step);
      if (!step) continue;
      const state = stepState(session, step.id);
      const item = doc.createElement('div');
      item.className = `ps-record__step is-${state}`;
      item.setAttribute('role', 'listitem');
      item.setAttribute('data-step', step.id);
      item.setAttribute('data-state', state);
      place(item, box, layout.h);
      const isDefine = step.id === model.define;
      const label = `${step.name}: ${step.detail}. ${state === 'done' ? 'Done' : state === 'current' ? 'In progress' : 'Not started'}`;
      if (isDefine && target) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'ps-record__box';
        btn.setAttribute('aria-label', `${label}. Show the chart`);
        btn.append(span('ps-record__name', step.name), span('ps-record__detail', step.detail));
        btn.addEventListener('click', () => open(target.id, item));
        item.append(btn);
      } else {
        const box = doc.createElement('div');
        box.className = 'ps-record__box';
        box.setAttribute('aria-label', label);
        box.append(span('ps-record__name', step.name), span('ps-record__detail', step.detail));
        item.append(box);
      }
      if (isDefine) stepEl = item;
      map.append(item);
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

  function paintFilm(session: PsSession): HTMLElement | null {
    cards.clear();
    const runs = session.define.runs;
    if (!runs.length) return null;
    const film = doc.createElement('ol');
    film.className = 'ps-record__film';
    film.setAttribute('aria-label', 'Define chain');
    for (const run of runs) {
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
    }
    return film;
  }

  function update(session: PsSession): void {
    const signature = JSON.stringify([session.model?.id, session.phase, session.define.runs.map((run) => [run.id, run.status, run.switchReason, run.nodes.length])]);
    if (signature === painted) return;
    painted = signature;
    const parts = [paintMap(session), paintFilm(session)].filter((part): part is HTMLElement => !!part);
    root.replaceChildren(...parts);
  }

  return {
    el: root,
    update,
    onOpenStep(cb) {
      open = cb;
    },
    anchor(runId, via) {
      return (via === 'film' ? cards.get(runId) : null) ?? stepEl;
    }
  };
}

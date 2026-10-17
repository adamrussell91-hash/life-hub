// apps/tasks/src/views/problem-solver/canvas.ts
import { el } from '@/views/hub-kit';
import { createConceptMapView } from '../../../../../packages/problem-solver/render/concept-map';
import { createFiveWhysView } from '../../../../../packages/problem-solver/render/five-whys';
import { createGapBasicView } from '../../../../../packages/problem-solver/render/gap-basic';
import { createGapRadarView } from '../../../../../packages/problem-solver/render/gap-radar';
import { createSmartView } from '../../../../../packages/problem-solver/render/smart';
import { createProblemTreeView } from '../../../../../packages/problem-solver/render/problem-tree';
import { createProblemStatementView } from '../../../../../packages/problem-solver/render/problem-statement';
import { toolEmblem } from '../../../../../packages/problem-solver/glyphs';
import { createRecordView, defineRun } from '../../../../../packages/problem-solver/render/record';
import { renderOutline } from '../../../../../packages/problem-solver/render/outline';
import { MODELS } from '../../../../../packages/problem-solver/models.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { morphFromRect } from '../../../design-kit/js/morphing-dialog.js';
import type { PsSession, PsToolId, PsToolRun } from '../../../../../packages/problem-solver/types';

type Scores = { current: number[]; objective: number[] };
type View = { el: HTMLElement; update(run: PsToolRun): void; onScore?(cb: (scores: Scores) => void): void };
export type CanvasHandlers = { onScore?: (scores: Scores) => void };

/** Tools that draw their own chart. Anything else falls back to the outline. */
const RENDERERS: Partial<Record<PsToolId, () => View>> = {
  five_whys: () => createFiveWhysView(),
  problem_tree: () => createProblemTreeView(),
  concept_map: () => createConceptMapView(),
  problem_statement: () => createProblemStatementView(),
  gap_basic: () => createGapBasicView(),
  gap_radar: () => createGapRadarView(),
  smart: () => createSmartView()
};

const FRAME_QUESTIONS: Array<[keyof PsSession['frame'], string]> = [
  ['goal', 'What is the goal?'],
  ['whatIsTrue', 'What is true?'],
  ['whatCanBeDone', 'What can be done?']
];

function frameCard(session: PsSession): HTMLElement {
  const card = el('div', 'ps-frame');
  for (const [key, question] of FRAME_QUESTIONS) {
    const row = el('div', `ps-frame__row${session.frame[key] ? ' is-answered' : ''}`);
    row.append(el('p', 'ps-frame__q', question), el('p', 'ps-frame__a', session.frame[key] ?? ''));
    card.append(row);
  }
  return card;
}

function shownRun(session: PsSession): PsToolRun | null {
  const runs = session.define.runs;
  return runs.find((run) => run.status === 'active') ?? runs.at(-1) ?? null;
}

function toggle(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'btn btn--ghost ps-canvas__toggle', label) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function rectOf(node: Element | null): DOMRect | null {
  const rect = node?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

/**
 * Frame card before any tool runs. During Define the active chart shows, with a
 * Record toggle; once defined the canvas opens on the black-and-white record, and a
 * step or filmstrip card morphs into that run's coloured chart (read-only).
 */
export function mountCanvas(host: HTMLElement, handlers: CanvasHandlers = {}): { update(session: PsSession): void } {
  const views = new Map<string, View>();
  const record = createRecordView();
  let last: PsSession | null = null;
  let mode: 'chart' | 'record' | null = null;
  let pinned: { runId: string; via: 'step' | 'film' } | null = null;
  let phase: PsSession['phase'] | null = null;

  function viewFor(run: PsToolRun): View | null {
    const make = RENDERERS[run.tool];
    if (!make) return null;
    let view = views.get(run.id);
    if (!view) {
      view = make();
      const runId = run.id;
      view.onScore?.((scores) => {
        if (last && shownRun(last)?.id === runId) handlers.onScore?.(scores);
      });
      views.set(run.id, view);
    }
    return view;
  }

  function showRecord(session: PsSession): void {
    const heading = el('h2', 'ps-canvas__title', session.model ? MODELS[session.model.id].name : 'Process record');
    if (session.phase === 'define') heading.append(toggle('Back to chart', () => openChart(null)));
    record.update(session);
    host.replaceChildren(heading, record.el);
  }

  function showChart(session: PsSession): HTMLElement | null {
    const run = (pinned && session.define.runs.find((item) => item.id === pinned!.runId)) || shownRun(session);
    if (!run) return null;
    const heading = el('h2', 'ps-canvas__title', TOOLS[run.tool].name);
    heading.prepend(toolEmblem(run.tool));
    if (session.model) heading.append(toggle(pinned ? 'Back to record' : 'Record', closeChart));
    const chart = el('div', 'ps-canvas__chart');
    const view = viewFor(run);
    if (view) {
      view.update(run);
      const outline = renderOutline(run);
      outline.classList.add('sr-only');
      chart.append(view.el, outline);
    } else {
      chart.append(renderOutline(run));
    }
    host.replaceChildren(heading, chart);
    return chart;
  }

  function render(): HTMLElement | null {
    const session = last!;
    if (!session.define.runs.length) {
      host.replaceChildren(frameCard(session));
      return null;
    }
    if (mode === 'record' && session.model) {
      showRecord(session);
      return null;
    }
    return showChart(session);
  }

  function openChart(target: { runId: string; via: 'step' | 'film'; from: HTMLElement } | null): void {
    const from = rectOf(target?.from ?? host.querySelector('.ps-record__step[data-state]:not([data-state="future"])'));
    mode = 'chart';
    pinned = target ? { runId: target.runId, via: target.via } : null;
    const chart = render();
    if (!chart || !from) return;
    chart.classList.add('ps-chart-reveal');
    morphFromRect(from, chart);
  }

  function closeChart(): void {
    const from = rectOf(host.querySelector('.ps-canvas__chart'));
    const back = pinned;
    mode = 'record';
    pinned = null;
    render();
    const to = record.anchor(back?.runId ?? (last ? defineRun(last)?.id ?? '' : ''), back?.via ?? 'step');
    if (from && to) morphFromRect(from, to);
  }

  record.onOpenStep((runId, from) => openChart({ runId, via: from.hasAttribute('data-run') ? 'film' : 'step', from }));

  return {
    update(session) {
      last = session;
      if (mode === null || (session.phase !== phase && session.phase === 'defined')) {
        mode = session.phase === 'defined' ? 'record' : 'chart';
        pinned = null;
      }
      phase = session.phase;
      render();
    }
  };
}

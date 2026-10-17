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
import { renderOutline } from '../../../../../packages/problem-solver/render/outline';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
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

export function mountCanvas(host: HTMLElement, handlers: CanvasHandlers = {}): { update(session: PsSession): void } {
  let current: { runId: string; view: View } | null = null;

  return {
    update(session) {
      const run = shownRun(session);
      if (!run) {
        current = null;
        host.replaceChildren(frameCard(session));
        return;
      }
      const heading = el('h2', 'ps-canvas__title', TOOLS[run.tool].name);
      heading.prepend(toolEmblem(run.tool));
      const make = RENDERERS[run.tool];
      if (!make) {
        current = null;
        host.replaceChildren(heading, renderOutline(run));
        return;
      }
      if (!current || current.runId !== run.id) {
        const view = make();
        view.onScore?.((scores) => handlers.onScore?.(scores));
        current = { runId: run.id, view };
      }
      current.view.update(run);
      const outline = renderOutline(run);
      outline.classList.add('sr-only');
      host.replaceChildren(heading, current.view.el, outline);
    }
  };
}

// apps/tasks/src/views/problem-solver/canvas.ts
import { el } from '@/views/hub-kit';
import { createCausalMapView } from '../../../../../packages/problem-solver/render/causal-map';
import { createConceptMapView } from '../../../../../packages/problem-solver/render/concept-map';
import { createFiveWhysView } from '../../../../../packages/problem-solver/render/five-whys';
import { createGapBasicView } from '../../../../../packages/problem-solver/render/gap-basic';
import { createGapRadarView } from '../../../../../packages/problem-solver/render/gap-radar';
import { createSmartView } from '../../../../../packages/problem-solver/render/smart';
import { createProblemTreeView } from '../../../../../packages/problem-solver/render/problem-tree';
import { createProblemStatementView } from '../../../../../packages/problem-solver/render/problem-statement';
import { createPerspectiveShiftView } from '../../../../../packages/problem-solver/render/perspective-shift';
import { createRadialTreeView } from '../../../../../packages/problem-solver/render/radial-tree';
import { createForceFieldView } from '../../../../../packages/problem-solver/render/force-field';
import { createFromToView } from '../../../../../packages/problem-solver/render/from-to';
import { createIntentStatementView } from '../../../../../packages/problem-solver/render/intent-statement';
import { createProblemReductionView } from '../../../../../packages/problem-solver/render/problem-reduction';
import { createAnalogicalReasoningView } from '../../../../../packages/problem-solver/render/analogical-reasoning';
import { createSolutionTreeView } from '../../../../../packages/problem-solver/render/solution-tree';
import { createLotusBlossomView } from '../../../../../packages/problem-solver/render/lotus-blossom';
import { createDunckerView } from '../../../../../packages/problem-solver/render/duncker';
import { createContradictionView } from '../../../../../packages/problem-solver/render/contradiction';
import { EMBLEM_SVG, toolEmblem } from '../../../../../packages/problem-solver/glyphs';
import { FRAME_PIECES } from './decor';
import { createRecordView } from '../../../../../packages/problem-solver/render/record';
import { renderOutline } from '../../../../../packages/problem-solver/render/outline';
import { MODELS } from '../../../../../packages/problem-solver/models.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { morphFromRect } from '../../../design-kit/js/morphing-dialog.js';
import type { PsSession, PsToolId, PsToolRun } from '../../../../../packages/problem-solver/types';

/** A scored tool's payload: the radar sends {current, objective}, the force field {for, against}. */
type Scores = Record<string, number[]>;
/** Scores for the run on screen, which may not be the step's active run (opened from the record). */
export type RunScores = { runId: string; [series: string]: string | number[] };
/** A tool's chart. `destroy` (views with a size watch, a frame loop or long motion) is called when the canvas drops it. */
type View = { el: HTMLElement; update(run: PsToolRun): void; onScore?(cb: (scores: Scores) => void): void; destroy?(): void };
export type CanvasHandlers = { onScore?: (scores: RunScores) => void };

/** Tools that draw their own chart. Anything else falls back to the outline. */
const RENDERERS: Partial<Record<PsToolId, () => View>> = {
  five_whys: () => createFiveWhysView(),
  problem_tree: () => createProblemTreeView(),
  concept_map: () => createConceptMapView(),
  problem_statement: () => createProblemStatementView(),
  gap_basic: () => createGapBasicView(),
  gap_radar: () => createGapRadarView(),
  smart: () => createSmartView(),
  causal_map: () => createCausalMapView(),
  perspective_shift: () => createPerspectiveShiftView(),
  radial_tree: () => createRadialTreeView(),
  force_field: () => createForceFieldView(),
  from_to: () => createFromToView(),
  intent_statement: () => createIntentStatementView(),
  problem_reduction: () => createProblemReductionView(),
  analogical_reasoning: () => createAnalogicalReasoningView(),
  solution_tree: () => createSolutionTreeView(),
  lotus_blossom: () => createLotusBlossomView(),
  duncker: () => createDunckerView(),
  contradiction: () => createContradictionView()
};

const FRAME_QUESTIONS: Array<[keyof PsSession['frame'], string, keyof typeof FRAME_PIECES, string]> = [
  ['goal', 'What is the goal?', 'top', 'var(--ps-blue)'],
  ['whatIsTrue', 'What is true?', 'mid', 'var(--ps-yellow)'],
  ['whatCanBeDone', 'What can be done?', 'bot', 'var(--ps-red)']
];

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The three framing questions as the Gap analysis emblem: each answer fills its piece,
 * the piece being asked has a marching outline, and once all three are in the suggested
 * tool spins into the centre. The element persists between updates so the fills animate.
 */
function createFrameView(): { el: HTMLElement; update(session: PsSession): void } {
  const card = el('div', 'ps-frame');
  const heading = el('h2', 'ps-canvas__title', 'Frame the problem');
  const count = el('span', 'ps-frame__count');
  heading.append(count);
  const medal = el('div', 'ps-frame__medal');
  const drawing = document.createElementNS(SVG_NS, 'svg');
  drawing.setAttribute('viewBox', '-4 -10 108 120');
  drawing.setAttribute('aria-hidden', 'true');
  drawing.innerHTML =
    FRAME_QUESTIONS.map(([, , piece, colour]) => `<g class="ps-frame__piece ps-frame__piece--${piece}" style="--c:${colour}"><path class="ps-frame__ghost" d="${FRAME_PIECES[piece]}"/><path class="ps-frame__fill" fill="${colour}" d="${FRAME_PIECES[piece]}"/></g>`).join('') +
    '<g class="ps-frame__core"><circle cx="50" cy="50" r="22" class="ps-frame__core-bg"/><g transform="translate(32 32) scale(.36)"></g></g>';
  medal.append(drawing);
  const answers = el('ol', 'ps-frame__answers');
  const rows = FRAME_QUESTIONS.map(([, question, piece, colour]) => {
    const row = el('li', 'ps-frame__row');
    row.style.setProperty('--c', colour);
    const mark = document.createElementNS(SVG_NS, 'svg');
    mark.setAttribute('viewBox', '0 0 100 100');
    mark.setAttribute('class', 'ps-frame__mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = piece === 'mid'
      ? `<rect x="2" y="38" width="96" height="24" rx="12" fill="${colour}"/>`
      : `<path fill="${colour}" d="${FRAME_PIECES[piece]}" transform="translate(0 ${piece === 'top' ? 14 : -14})"/>`;
    const text = el('div', 'ps-frame__text');
    const q = el('p', 'ps-frame__q', question);
    const tag = el('span', 'ps-frame__now', 'Now');
    q.append(tag);
    text.append(q, el('p', 'ps-frame__a'));
    row.append(mark, text);
    answers.append(row);
    return row;
  });
  const body = el('div', 'ps-frame__body');
  body.append(medal, answers);
  card.append(heading, body);

  return {
    el: card,
    update(session) {
      const current = FRAME_QUESTIONS.findIndex(([key]) => !session.frame[key]);
      FRAME_QUESTIONS.forEach(([key, , piece], i) => {
        const answer = session.frame[key] ?? '';
        const state = answer ? 'done' : i === current ? 'now' : 'future';
        rows[i].dataset.state = state;
        rows[i].classList.toggle('is-answered', Boolean(answer));
        const a = rows[i].querySelector('.ps-frame__a')!;
        if (a.textContent !== answer) a.textContent = answer;
        const group = drawing.querySelector(`.ps-frame__piece--${piece}`) as SVGGElement;
        group.dataset.state = state;
      });
      count.textContent = `${FRAME_QUESTIONS.filter(([key]) => session.frame[key]).length} of 3 answered`;
      const tool = session.suggestion && session.suggestion.kind !== 'next_step' ? session.suggestion.tool : null;
      const coreArt = drawing.querySelector('.ps-frame__core > g')!;
      if (coreArt.getAttribute('data-tool') !== String(tool)) {
        coreArt.setAttribute('data-tool', String(tool));
        coreArt.innerHTML = tool ? EMBLEM_SVG[tool] : '';
      }
      medal.classList.toggle('is-done', current === -1 && Boolean(tool));
    }
  };
}

/** The run the chart shows: the current step's active run, else its last run, else the last run anywhere. */
function shownRun(session: PsSession): PsToolRun | null {
  const runs = session.steps?.[session.phase]?.runs ?? [];
  return runs.find((run) => run.status === 'active') ?? runs.at(-1) ?? allRunsOf(session).at(-1) ?? null;
}

function allRunsOf(session: PsSession): PsToolRun[] {
  return Object.values(session.steps ?? {}).flatMap((step) => step.runs);
}

/** A step with no runs yet (just entered) shows the record; otherwise the chart. */
function defaultMode(session: PsSession): 'chart' | 'record' {
  if (session.phase === 'finished') return 'record';
  return (session.steps?.[session.phase]?.runs.length ?? 0) > 0 ? 'chart' : 'record';
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
export function mountCanvas(host: HTMLElement, handlers: CanvasHandlers = {}): { update(session: PsSession): void; destroy(): void } {
  const views = new Map<string, View>();
  const frame = createFrameView();
  const record = createRecordView();
  let last: PsSession | null = null;
  let mode: 'chart' | 'record' | null = null;
  let pinned: { runId: string; via: 'step' | 'film' } | null = null;
  let phase: string | null = null;
  let hadActive = false;
  /** The run whose chart is on screen, or null when the frame card or record shows. */
  let displayed: string | null = null;

  function viewFor(run: PsToolRun): View | null {
    const make = RENDERERS[run.tool];
    if (!make) return null;
    let view = views.get(run.id);
    if (!view) {
      view = make();
      const runId = run.id;
      view.onScore?.((scores) => {
        if (displayed === runId) handlers.onScore?.({ ...scores, runId });
      });
      views.set(run.id, view);
    }
    return view;
  }

  function showRecord(session: PsSession): void {
    const heading = el('h2', 'ps-canvas__title', session.model ? MODELS[session.model.id].name : 'Process record');
    if ((session.steps?.[session.phase]?.runs.length ?? 0) > 0) heading.append(toggle('Back to chart', () => openChart(null)));
    record.update(session);
    displayed = null;
    host.replaceChildren(heading, record.el);
  }

  function showChart(session: PsSession): HTMLElement | null {
    const run = (pinned && allRunsOf(session).find((item) => item.id === pinned!.runId)) || shownRun(session);
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
    displayed = run.id;
    return chart;
  }

  function render(): HTMLElement | null {
    const session = last!;
    if (!allRunsOf(session).length && session.phase !== 'finished' && !(session.model && session.steps?.[session.phase])) {
      displayed = null;
      frame.update(session);
      if (frame.el.parentNode !== host || host.childElementCount !== 1) host.replaceChildren(frame.el);
      return null;
    }
    if (mode === 'record' && session.model) {
      showRecord(session);
      return null;
    }
    return showChart(session) ?? (showRecord(session), null);
  }

  function openChart(target: { runId: string; via: 'step' | 'film'; from: HTMLElement } | null): void {
    const back = last ? shownRun(last)?.id ?? '' : '';
    const from = rectOf(target?.from ?? record.anchor(back, 'step') ?? host.querySelector('.ps-record__step[data-state="current"]'));
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
    const to = record.anchor(back?.runId ?? (last ? shownRun(last)?.id ?? '' : ''), back?.via ?? 'step');
    if (from && to) morphFromRect(from, to);
  }

  record.onOpenStep((runId, from) => openChart({ runId, via: from.hasAttribute('data-run') ? 'film' : 'step', from }));

  function drop(runId: string): void {
    views.get(runId)?.destroy?.();
    views.delete(runId);
  }

  /** Views for runs the session no longer has (an undo, another session) are dropped. */
  function prune(session: PsSession): void {
    const live = new Set(allRunsOf(session).map((run) => run.id));
    for (const runId of [...views.keys()]) if (!live.has(runId)) drop(runId);
    if (pinned && !live.has(pinned.runId)) pinned = null;
  }

  return {
    update(session) {
      last = session;
      const hasActive = session.steps?.[session.phase]?.runs.some((run) => run.status === 'active') ?? false;
      if (mode === null || session.phase !== phase) {
        mode = defaultMode(session);
        pinned = null;
      } else if (mode === 'record' && hasActive && !hadActive && !pinned) {
        // A tool just started in this step: follow it to the chart. A Record the person chose stays.
        mode = 'chart';
      }
      phase = session.phase;
      hadActive = hasActive;
      prune(session);
      render();
    },
    /** The page is going away: drop every view. */
    destroy() {
      for (const runId of [...views.keys()]) drop(runId);
    }
  };
}

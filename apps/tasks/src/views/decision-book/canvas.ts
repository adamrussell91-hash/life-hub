// apps/tasks/src/views/decision-book/canvas.ts
/**
 * Decision Maker's canvas: the chart for the run in hand, drawn by the family renderer the
 * canvas map picks (createChartForRun), with a strip of every model run kept on the record.
 * Pressing a run in the strip shows its chart until Back to now. The decision record gets the
 * Explore nodes each reason rests on (setBasis); charts that make tasks get their live statuses.
 */
import { el } from '@/views/hub-kit';
import { createChartForRun, type RunChart } from '../../../../../packages/decision-book/render/charts';
import type { RecordView } from '../../../../../packages/decision-book/render/record';
import { RECORD_ID } from '../../../../../packages/decision-book/record-slots.mjs';
import { basisOf } from '../../../../../packages/decision-book/record.mjs';
import { bookEmblem } from '../../../../../packages/decision-book/glyphs';
import type { PsSession, PsTaskLink, PsToolRun } from '../../../../../packages/problem-solver/types';
import { DM_LOOK, plainName, toolNamed } from './decor';

export type DmRunScores = Record<string, unknown> & { runId: string };
type Chart = RunChart & { onScore?(cb: (scores: Record<string, unknown>) => void): void; setTasks?(links: PsTaskLink[]): void; setProposed?(nodeIds: string[]): void };

const STEP_ORDER = ['explore', 'decide', 'review'];

/** Every run in step order, switched ones included (they stay on the record). */
export function runsInOrder(session: PsSession): PsToolRun[] {
  return STEP_ORDER.flatMap((step) => session.steps?.[step]?.runs ?? []);
}

/** The run in hand: the current step's active run, else its latest kept one, else the latest kept run. */
export function shownRun(session: PsSession): PsToolRun | null {
  const here = session.steps?.[session.phase]?.runs ?? [];
  const kept = (runs: PsToolRun[]) => runs.filter((run) => run.status !== 'switched');
  return here.find((run) => run.status === 'active') ?? kept(here).at(-1) ?? kept(runsInOrder(session)).at(-1) ?? null;
}


function countLine(run: PsToolRun): string {
  const placed = run.nodes.length;
  const contested = run.nodes.filter((node) => node.state === 'contested').length;
  const state = run.status === 'switched' ? ' · switched away' : '';
  return `${placed} placed${contested ? ` · ${contested} contested` : ''}${state}`;
}

export function mountDecisionCanvas(host: HTMLElement, handlers: { onScore?: (scores: DmRunScores) => void } = {}) {
  const charts = new Map<string, Chart>();
  let last: PsSession | null = null;
  let pinned: string | null = null;
  let displayed: string | null = null;
  let statuses: Record<string, string> = {};

  const empty = el('div', 'dm-canvas__empty');
  empty.append(bookEmblem(), el('p', '', 'Answer the three questions. The coach then suggests a model from the book, and its chart builds here as you answer.'));

  function chartFor(run: PsToolRun): Chart | null {
    let chart = charts.get(run.id);
    if (!chart) {
      const made = createChartForRun(run) as Chart | null;
      if (!made) return null;
      chart = made;
      const runId = run.id;
      chart.onScore?.((scores) => {
        if (displayed === runId) handlers.onScore?.({ ...scores, runId });
      });
      charts.set(run.id, chart);
    }
    return chart;
  }

  /** The chart on screen gets its confirmed tasks (live status) and the proposals still waiting. */
  function pushTasks(): void {
    if (!last || !displayed) return;
    const chart = charts.get(displayed);
    if (!chart?.setTasks) return;
    const runId = displayed;
    const links = (last.proposedTasks ?? [])
      .filter((p) => p.taskId && p.source.runId === runId && (p.status === 'confirmed' || (p.status === 'dismissed' && p.removed)))
      .map((p) => ({ nodeId: p.source.nodeId, taskId: p.taskId!, status: p.status === 'dismissed' ? 'removed' : statuses[p.taskId!] ?? 'unknown' }));
    chart.setTasks(links);
    chart.setProposed?.((last.proposedTasks ?? []).filter((p) => p.status === 'proposed' && p.source.runId === runId).map((p) => p.source.nodeId));
  }

  function strip(session: PsSession, current: PsToolRun): HTMLElement | null {
    const runs = runsInOrder(session).filter((run) => run.nodes.length || run.id === current.id);
    if (runs.length < 2) return null;
    const list = el('ul', 'dm-canvas__strip');
    list.setAttribute('aria-label', 'Models on the record');
    for (const run of runs) {
      const item = el('li', '');
      const button = el('button', 'dm-canvas__run') as HTMLButtonElement;
      button.type = 'button';
      button.setAttribute('aria-pressed', String(run.id === current.id));
      if (run.status === 'switched') button.classList.add('is-switched');
      button.append(DM_LOOK.emblem(run.tool), el('span', '', plainName(run.tool)));
      button.addEventListener('click', () => {
        pinned = run.id === shownRun(session)?.id ? null : run.id;
        render();
      });
      item.append(button);
      list.append(item);
    }
    return list;
  }

  function render(): void {
    const session = last!;
    const live = pinned ? runsInOrder(session).find((run) => run.id === pinned) ?? null : null;
    if (pinned && !live) pinned = null;
    const run = live ?? shownRun(session);
    if (!run) {
      displayed = null;
      if (empty.parentNode !== host || host.childElementCount !== 1) host.replaceChildren(empty);
      return;
    }
    const heading = el('h2', 'ps-canvas__title dm-canvas__title');
    heading.append(DM_LOOK.emblem(run.tool), el('span', 'dm-canvas__name', toolNamed(run.tool)?.name ?? run.tool), el('span', 'dm-canvas__count', countLine(run)));
    if (pinned) {
      const back = el('button', 'btn btn--ghost dm-canvas__back', 'Back to now') as HTMLButtonElement;
      back.type = 'button';
      back.addEventListener('click', () => {
        pinned = null;
        render();
      });
      heading.append(back);
    }
    const holder = el('div', 'ps-canvas__chart dm-canvas__chart');
    const chart = chartFor(run);
    if (chart) {
      chart.update(run as never);
      if ((run.tool as string) === RECORD_ID) (chart as unknown as RecordView).setBasis(basisOf(session));
      holder.append(chart.el);
    } else holder.append(el('p', 'dm-canvas__none', 'This model has no chart yet.'));
    const parts: HTMLElement[] = [heading, holder];
    const runs = strip(session, run);
    if (runs) parts.push(runs);
    host.replaceChildren(...parts);
    displayed = run.id;
    pushTasks();
  }

  return {
    update(session: PsSession) {
      last = session;
      const live = new Set(runsInOrder(session).map((run) => run.id));
      for (const [runId, chart] of charts) {
        if (live.has(runId)) continue;
        chart.destroy?.();
        charts.delete(runId);
      }
      render();
    },
    /** The page fetched live statuses for the session's confirmed tasks. */
    setTaskStatuses(next: Record<string, string>) {
      statuses = next;
      pushTasks();
    },
    destroy() {
      for (const chart of charts.values()) chart.destroy?.();
      charts.clear();
    }
  };
}

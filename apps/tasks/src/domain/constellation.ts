import type { Task } from '@/schemas/task';
import { parseDue, startOfDay } from '@/domain/queries';

export type Star = {
  id: string;
  label: string;
  x: number;
  y: number;
  lit: boolean;
  size: number;
};

export type ConstellationModel = {
  stars: Star[];
  /** 0–1 fill of the constellation. */
  fill_ratio: number;
  completed_count: number;
  open_count: number;
  overdue_count: number;
  headline: string;
};

function stablePoint(id: string, i: number, n: number): { x: number; y: number } {
  // Pseudo-random but stable positions in a soft ellipse
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const angle = (i / Math.max(n, 1)) * Math.PI * 2 + (hash % 10) * 0.07;
  const rx = 0.38 + (hash % 5) * 0.04;
  const ry = 0.32 + (hash % 7) * 0.03;
  return {
    x: 0.5 + Math.cos(angle) * rx,
    y: 0.5 + Math.sin(angle) * ry
  };
}

/**
 * ADHD-friendly payoff metaphor — stars light as tasks complete;
 * overdue open work dims the sky (spec §6.5 Capacity constellation).
 */
export function buildConstellation(tasks: Task[], from: Date = new Date()): ConstellationModel {
  const relevant = tasks.filter((t) => t.status !== 'dead');
  const completed = relevant.filter((t) => t.status === 'done');
  const open = relevant.filter((t) => t.status !== 'done');
  const start = startOfDay(from).getTime();
  const overdue = open.filter((t) => {
    const due = parseDue(t.due_date);
    return due ? startOfDay(due).getTime() < start : false;
  });

  const pool = [...completed, ...open].slice(0, 24);
  const stars: Star[] = pool.map((task, i) => {
    const pt = stablePoint(task.id, i, pool.length);
    return {
      id: task.id,
      label: task.title,
      x: pt.x,
      y: pt.y,
      lit: task.status === 'done',
      size: task.status === 'done' ? 3.2 : 2.2
    };
  });

  const total = Math.max(relevant.length, 1);
  const raw = completed.length / total;
  const penalty = Math.min(0.35, overdue.length * 0.08);
  const fill_ratio = Math.max(0, Math.min(1, raw - penalty));

  let headline = 'The sky is quiet — a few stars waiting.';
  if (fill_ratio >= 0.75) headline = 'Constellation nearly full — capacity respected.';
  else if (fill_ratio >= 0.45) headline = 'Stars are filling in. Keep the pace kind.';
  else if (overdue.length >= 3) headline = 'Overdue haze — clear a few before lighting more.';
  else if (completed.length === 0) headline = 'First completions will light the first stars.';

  return {
    stars,
    fill_ratio,
    completed_count: completed.length,
    open_count: open.length,
    overdue_count: overdue.length,
    headline
  };
}

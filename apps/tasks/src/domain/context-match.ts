import type { Task } from '@/schemas/task';

export type ContextConstraints = {
  available_minutes?: number | null;
  energy_level?: 'low' | 'medium' | 'high' | null;
  cognitive_load?: 'low' | 'medium' | 'high' | null;
  device?: string | null;
  place?: string | null;
  person?: string | null;
  deep_work_ok?: boolean | null;
  now_key?: string | null;
};

export type ContextMatch = {
  task_id: string;
  title: string;
  reason: string;
  score: number;
  depth: string | null;
  estimated_duration: number | null;
};

function isOpen(task: Task): boolean {
  return task.status === 'open' || task.status === 'in_progress';
}

function blocked(task: Task): boolean {
  return Boolean(task.blocked_since || task.waiting_on || task.waiting_status === 'waiting');
}

/**
 * Match open work to current constraints. Does not invent energy.
 * Returns at most five options with one-line reasons.
 */
export function matchActionsNow(
  tasks: Task[],
  constraints: ContextConstraints = {}
): { matches: ContextMatch[]; energy_applied: boolean; note: string } {
  const energy = constraints.energy_level ?? null;
  const load = constraints.cognitive_load ?? null;
  const minutes = constraints.available_minutes ?? null;
  const open = tasks.filter((t) => isOpen(t) && t.bucket !== 'someday' && !blocked(t));

  const scored: ContextMatch[] = [];
  for (const task of open) {
    let score = 50;
    const reasons: string[] = [];
    const est = task.estimated_duration;
    const depth = task.depth;

    if (minutes != null && Number.isFinite(minutes)) {
      if (est != null && est > minutes) {
        score += 40;
        continue;
      }
      if (est != null && est <= minutes) {
        score -= 12;
        reasons.push(`fits ${est}m`);
      } else if (est == null && minutes <= 30) {
        score -= 4;
        reasons.push('short window');
      }
    }

    if (energy === 'low') {
      if (depth === 'deep') {
        score += 30;
        continue;
      }
      if ((est ?? 99) <= 25 || depth === 'admin' || depth === 'shallow') {
        score -= 14;
        reasons.push('low energy');
      }
      if (task.cognitive_load === 'high') score += 20;
    } else if (energy === 'high') {
      if (depth === 'deep') {
        score -= 10;
        reasons.push('deep work');
      }
    }

    if (load === 'low' && task.cognitive_load === 'high') score += 18;
    if (load === 'high' && (task.cognitive_load === 'low' || depth === 'admin')) {
      score -= 8;
      reasons.push('light load');
    }

    if (constraints.deep_work_ok === false && depth === 'deep') continue;
    if (constraints.deep_work_ok === true && depth === 'deep') {
      score -= 8;
      reasons.push('deep suitable');
    }

    const contexts = task.contexts ?? [];
    if (constraints.device) {
      const hit = contexts.some(
        (c) => c.kind === 'device' && c.value.toLowerCase() === constraints.device!.toLowerCase()
      );
      if (contexts.some((c) => c.kind === 'device') && !hit) continue;
      if (hit) {
        score -= 10;
        reasons.push(`on ${constraints.device}`);
      }
    }
    if (constraints.place) {
      const hit = contexts.some(
        (c) => c.kind === 'place' && c.value.toLowerCase() === constraints.place!.toLowerCase()
      );
      if (contexts.some((c) => c.kind === 'place') && !hit) continue;
      if (hit) {
        score -= 10;
        reasons.push(`at ${constraints.place}`);
      }
    }
    if (constraints.person) {
      const hit = contexts.some(
        (c) => c.kind === 'person' && c.value.toLowerCase() === constraints.person!.toLowerCase()
      );
      if (contexts.some((c) => c.kind === 'person') && !hit) continue;
      if (hit) {
        score -= 8;
        reasons.push(`with ${constraints.person}`);
      }
    }

    if (constraints.now_key && task.due_date && task.due_date <= constraints.now_key) {
      score -= 16;
      reasons.push('deadline pressure');
    }

    if (!reasons.length) reasons.push('open and actionable');
    scored.push({
      task_id: task.id,
      title: task.title,
      reason: reasons[0]!,
      score,
      depth: depth ?? null,
      estimated_duration: est ?? null
    });
  }

  scored.sort((a, b) => a.score - b.score);
  return {
    matches: scored.slice(0, 5),
    energy_applied: Boolean(energy),
    note: energy
      ? `Matched with ${energy} energy.`
      : 'No energy supplied — matched on time, context, and deadline only.'
  };
}

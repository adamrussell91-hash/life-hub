import type { Task } from '@/schemas/task';
import { listWaitingItems } from '@/domain/waiting';

export type ShutdownDecision = 'carry' | 'defer' | 'close' | 'leave';

export type ShutdownItem = {
  id: string;
  kind: 'loose' | 'unresolved_today' | 'waiting' | 'tomorrow' | 'unconfirmed';
  title: string;
  task_id?: string | null;
  suggested: ShutdownDecision;
};

export type ShutdownState = {
  status: 'open' | 'closed';
  items: ShutdownItem[];
  tomorrow_first_block: { title: string; start_time: string } | null;
  note: string;
};

export function buildShutdown(input: {
  today_key: string;
  tomorrow_key: string;
  tasks: Task[];
  loose_texts?: string[];
  unconfirmed_titles?: string[];
  tomorrow_events?: Array<{ title: string; start_time?: string | null }>;
  protected_tomorrow?: { title: string; start_time: string } | null;
}): ShutdownState {
  const items: ShutdownItem[] = [];
  for (const text of input.loose_texts ?? []) {
    items.push({
      id: `loose_${items.length}`,
      kind: 'loose',
      title: text,
      suggested: 'carry'
    });
  }

  for (const task of input.tasks) {
    if (task.status === 'done' || task.status === 'dead') continue;
    if (task.due_date === input.today_key && task.status !== 'done') {
      items.push({
        id: `today_${task.id}`,
        kind: 'unresolved_today',
        title: task.title,
        task_id: task.id,
        suggested: 'carry'
      });
    }
  }

  for (const waiting of listWaitingItems(input.tasks, input.today_key)) {
    if (!waiting.needs_action) continue;
    items.push({
      id: `wait_${waiting.task_id}`,
      kind: 'waiting',
      title: `Follow up: ${waiting.title}`,
      task_id: waiting.task_id,
      suggested: 'leave'
    });
  }

  for (const event of input.tomorrow_events ?? []) {
    items.push({
      id: `tom_${items.length}`,
      kind: 'tomorrow',
      title: event.title,
      suggested: 'leave'
    });
  }

  for (const title of input.unconfirmed_titles ?? []) {
    items.push({
      id: `unc_${items.length}`,
      kind: 'unconfirmed',
      title,
      suggested: 'leave'
    });
  }

  const note =
    items.length === 0
      ? 'Workday closed. Nothing needs a decision.'
      : `${items.length} item(s) need a decision before shutdown.`;

  return {
    status: items.length === 0 ? 'closed' : 'open',
    items,
    tomorrow_first_block: input.protected_tomorrow ?? null,
    note
  };
}

export function applyShutdownDecision(
  state: ShutdownState,
  itemId: string,
  decision: ShutdownDecision
): ShutdownState {
  const items = state.items.map((item) =>
    item.id === itemId ? { ...item, suggested: decision } : item
  );
  return { ...state, items };
}

export function closeShutdown(state: ShutdownState): ShutdownState {
  return { ...state, status: 'closed', note: 'Workday closed.' };
}

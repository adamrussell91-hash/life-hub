// packages/problem-solver/render/task-status.ts
// The words a chart shows for a linked task's live status, matching the Tasks board's column
// names, plus "Task removed" for a task deleted in Tasks. Shared by every chart whose items can
// become tasks (15% solutions, Kanban), so the two never disagree.

/** Tasks hub status ids, and the two the canvas adds, as the board names them. */
const STATUS: Record<string, string> = { open: 'To do', todo: 'To do', in_progress: 'Doing', done: 'Done', deferred: 'Deferred', dead: 'Dead', removed: 'Task removed' };

/** The label a task link shows: its board status, "Task removed", or nothing when unknown. */
export function taskStatusLabel(status: string): string {
  return STATUS[status] ?? '';
}

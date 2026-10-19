// apps/tasks/src/views/problem-solver/task-bridge.ts
// The only place Problem Solver writes to Tasks. The server never does: the page creates
// the task through tasksApi, then tells the session its id (confirm_task / set_review_task).
import type { PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';

export type TaskEdits = { title: string; due: string | null };
type Deps = {
  createTask(body: Record<string, unknown>): Promise<{ id: string }>;
  getTask(id: string): Promise<{ id: string; status: string }>;
  domainFor(session: PsSession): Promise<string>;
  confirm(proposalId: string, taskId: string): Promise<void>;
  dismiss(proposalId: string, reason?: 'removed'): Promise<void>;
  setReview(taskId: string, due: string): Promise<void>;
};

const projectOf = (session: PsSession) => session.links.find((link) => link.kind === 'project')?.id ?? null;

export function taskBody(session: PsSession, edits: TaskEdits, domain: string): Record<string, unknown> {
  return {
    title: edits.title.trim().slice(0, 120),
    domain,
    due_date: edits.due,
    description: `From Problem Solver: ${session.title}`,
    source: 'problem_solver',
    tags: ['problem-solver'],
    parent_project_id: projectOf(session)
  };
}

export function reviewBody(session: PsSession, edits: { title: string; due: string }, domain: string): Record<string, unknown> {
  return { ...taskBody(session, edits, domain), review_at: edits.due, description: `Review how the plan for "${session.title}" is going, then open the problem to work through Improve.`, tags: ['problem-solver', 'review'] };
}

/**
 * The task exists in Tasks but the session refused to link it (the proposal was set aside
 * elsewhere, or a review task is already linked). Decision 10 creates the task at once, so it
 * is kept, never deleted; the card says so and links to it.
 */
export class TaskNotLinkedError extends Error {
  readonly taskId: string;
  constructor(taskId: string, review = false) {
    super(review
      ? 'The review task was created in Tasks but is not linked to this problem.'
      : 'The task was created in Tasks but is not linked to this problem.');
    this.name = 'TaskNotLinkedError';
    this.taskId = taskId;
  }
}

/** The server said no for good (a 4xx other than a stale revision), so retrying will not help. */
function refused(err: unknown): boolean {
  // ApiClientError carries the HTTP status as `status`.
  const { code, status } = err as { code?: string; status?: number };
  return code !== 'conflict' && typeof status === 'number' && status >= 400 && status < 500;
}

export function createTaskBridge(deps: Deps) {
  /** Proposal id → created task id, kept until the confirm lands so a retry never creates twice. */
  const created = new Map<string, string>();
  let reviewCreated: string | null = null;
  /** Proposals whose removal is already queued, so a second refresh does not send it again. */
  const dismissing = new Set<string>();

  /** Dismiss removed proposals one after another, in the background. */
  function dismissRemoved(ids: string[]): void {
    const fresh = ids.filter((id) => !dismissing.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => dismissing.add(id));
    void (async () => {
      for (const id of fresh) {
        await deps.dismiss(id, 'removed').catch(() => undefined);
        dismissing.delete(id);
      }
    })();
  }

  return {
    async create(session: PsSession, proposal: PsProposedTask, edits: TaskEdits): Promise<void> {
      let taskId = created.get(proposal.id);
      if (!taskId) {
        taskId = (await deps.createTask(taskBody(session, edits, await deps.domainFor(session)))).id;
        created.set(proposal.id, taskId);
      }
      try {
        await deps.confirm(proposal.id, taskId);
      } catch (err) {
        if (!refused(err)) throw err;
        created.delete(proposal.id);
        throw new TaskNotLinkedError(taskId);
      }
      created.delete(proposal.id);
    },
    async createReview(session: PsSession, edits: { title: string; due: string }): Promise<void> {
      if (!reviewCreated) reviewCreated = (await deps.createTask(reviewBody(session, edits, await deps.domainFor(session)))).id;
      const taskId = reviewCreated;
      try {
        await deps.setReview(taskId, edits.due);
      } catch (err) {
        if (!refused(err)) throw err;
        reviewCreated = null;
        throw new TaskNotLinkedError(taskId, true);
      }
      reviewCreated = null;
    },
    /**
     * Live status per confirmed task id: its status, 'removed' (404) or 'unknown'. Returns as
     * soon as the map is built; removed proposals are dismissed afterwards, in the background.
     */
    async statuses(proposals: PsProposedTask[]): Promise<Record<string, string>> {
      const confirmed = proposals.filter((p) => p.status === 'confirmed' && p.taskId);
      const out: Record<string, string> = {};
      const removed: string[] = [];
      await Promise.all(confirmed.map(async (p) => {
        try {
          out[p.taskId!] = (await deps.getTask(p.taskId!)).status;
        } catch (err) {
          const status = (err as { status?: number }).status;
          out[p.taskId!] = status === 404 ? 'removed' : 'unknown';
          if (status === 404) removed.push(p.id);
        }
      }));
      // Keep the proposals' order, not the order the fetches came back in.
      dismissRemoved(confirmed.map((p) => p.id).filter((id) => removed.includes(id)));
      return out;
    }
  };
}

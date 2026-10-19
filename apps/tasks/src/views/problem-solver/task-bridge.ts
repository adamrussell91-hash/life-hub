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

export function createTaskBridge(deps: Deps) {
  /** Proposal id → created task id, kept until the confirm lands so a retry never creates twice. */
  const created = new Map<string, string>();
  let reviewCreated: string | null = null;
  return {
    async create(session: PsSession, proposal: PsProposedTask, edits: TaskEdits): Promise<void> {
      let taskId = created.get(proposal.id);
      if (!taskId) {
        taskId = (await deps.createTask(taskBody(session, edits, await deps.domainFor(session)))).id;
        created.set(proposal.id, taskId);
      }
      await deps.confirm(proposal.id, taskId);
      created.delete(proposal.id);
    },
    async createReview(session: PsSession, edits: { title: string; due: string }): Promise<void> {
      if (!reviewCreated) reviewCreated = (await deps.createTask(reviewBody(session, edits, await deps.domainFor(session)))).id;
      await deps.setReview(reviewCreated, edits.due);
      reviewCreated = null;
    },
    /** Live status per confirmed task id: its status, 'removed' (404; the proposal is dismissed) or 'unknown'. */
    async statuses(proposals: PsProposedTask[]): Promise<Record<string, string>> {
      const confirmed = proposals.filter((p) => p.status === 'confirmed' && p.taskId);
      const out: Record<string, string> = {};
      await Promise.all(confirmed.map(async (p) => {
        try {
          out[p.taskId!] = (await deps.getTask(p.taskId!)).status;
        } catch (err) {
          // ApiClientError carries the HTTP status as `status`.
          const status = (err as { status?: number }).status;
          out[p.taskId!] = status === 404 ? 'removed' : 'unknown';
          if (status === 404) await deps.dismiss(p.id, 'removed').catch(() => undefined);
        }
      }));
      return out;
    }
  };
}

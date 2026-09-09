/**
 * Deterministic Weekly Review Confirm-proposal generation.
 * Used by the Tasks UI checkbox path so selected_changes never pass through the model.
 */
import {
  PENDING_ACTIONS_PATH,
  addPendingAction,
  createPendingActionId,
  parsePendingActions,
  serializePendingActions,
  snapshotGithubBases,
  snapshotBlobBases,
  classifyWriteTarget,
  validateProposeActionInput
} from './capabilities/propose-action.mjs';
import {
  executeClareWork,
  markWeeklyReviewAwaitingConfirm
} from './clare-work.mjs';
import { listJSON as listTasksJSON, TASK_PREFIX } from './tasks-blobs.mjs';
import { decodeBlob } from './decode-blob.mjs';

const ALLOWED_TOOLS = new Set(['weekly_review']);

/**
 * @param {object} args
 * @param {string} args.tool
 * @param {object} args.input
 * @param {string} [args.slug]
 * @param {object} args.githubClient
 * @param {object|null} args.tasksStore
 * @param {Date|number|string} [args.now]
 */
export async function invokeWeeklyReviewProposal({
  tool,
  input,
  slug = 'clare',
  githubClient,
  tasksStore,
  now = Date.now()
}) {
  const toolName = typeof tool === 'string' ? tool.trim() : '';
  if (!ALLOWED_TOOLS.has(toolName)) {
    return { ok: false, error: 'tool_not_allowed', detail: toolName };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_input' };
  }
  if (!githubClient) {
    return { ok: false, error: 'github_unavailable' };
  }

  const selected = Array.isArray(input.selected_changes)
    ? input.selected_changes.map((id) => String(id)).filter(Boolean)
    : [];
  const reviewId =
    typeof input.review_id === 'string' && input.review_id.trim()
      ? input.review_id.trim()
      : 'weekly_review';

  const workInput = {
    ...input,
    review_id: reviewId,
    advance: false,
    confirm: true,
    selected_changes: selected
  };

  let tasks = [];
  let projects = [];
  let workBlocks = [];
  if (tasksStore) {
    [tasks, projects, workBlocks] = await Promise.all([
      listTasksJSON(tasksStore, TASK_PREFIX).catch(() => []),
      listTasksJSON(tasksStore, 'projects/').catch(() => []),
      listTasksJSON(tasksStore, 'work_blocks/').catch(() => [])
    ]);
  }

  const result = await executeClareWork(toolName, workInput, {
    tasks,
    projects,
    workBlocks,
    work_blocks: workBlocks,
    tasksStore,
    now: now instanceof Date ? now : new Date(now)
  });

  if (!result || result.kind !== 'propose' || !result.proposal) {
    return {
      ok: false,
      error: result?.error || 'proposal_not_generated',
      result
    };
  }

  const validated = validateProposeActionInput(result.proposal, { agentSlug: slug });
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.error || 'invalid_proposal',
      detail: validated.detail,
      result
    };
  }

  const current = await githubClient.resolveTree();
  const tree = current.tree || [];
  const queueEntry = tree.find((item) => item.path === PENDING_ACTIONS_PATH && item.type === 'blob');
  let queue = [];
  let queueSha;
  if (queueEntry) {
    queue = parsePendingActions(decodeBlob(await githubClient.readBlob(queueEntry.sha)));
    queueSha = queueEntry.sha;
  }

  let bases = snapshotGithubBases(validated.proposal.writes, tree);
  try {
    const needsTasks = validated.proposal.writes.some(
      (write) => classifyWriteTarget(write.path).store === 'tasks'
    );
    if (needsTasks && tasksStore) {
      bases = {
        ...bases,
        ...(await snapshotBlobBases(validated.proposal.writes, { tasks: tasksStore }))
      };
    }
  } catch {
    // Confirm can still proceed; stale checks skip missing blob bases.
  }

  const pendingId = createPendingActionId();
  const stamp = new Date(now instanceof Date ? now : now).toISOString();
  const entry = {
    id: pendingId,
    createdAt: stamp,
    slug,
    proposal: validated.proposal,
    bases,
    workflowKind: result.workflow_kind || 'weekly_review',
    workflowId: result.workflow_id || reviewId,
    status: 'pending'
  };
  const nextQueue = addPendingAction(queue, entry);
  await githubClient.writeFile({
    path: PENDING_ACTIONS_PATH,
    content: serializePendingActions(nextQueue),
    ...(queueSha ? { sha: queueSha } : {}),
    message: `chore(propose-action): weekly review ${reviewId}`.slice(0, 200)
  });

  let workflowState = result.state || null;
  if (tasksStore && entry.workflowId) {
    workflowState = await markWeeklyReviewAwaitingConfirm(tasksStore, entry.workflowId, {
      pendingActionId: pendingId,
      stamp
    });
  }

  return {
    ok: true,
    pendingId,
    proposal: validated.proposal,
    selected_changes: selected,
    review_id: reviewId,
    state: workflowState,
    workflow_kind: entry.workflowKind,
    workflow_id: entry.workflowId
  };
}

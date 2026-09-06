import { getKnowledgePage, saveKnowledgePage } from './knowledge-data.mjs';
import { loadKnowledgePrompt } from './knowledge-prompts.mjs';
import { applyTidyProposal, proposeTidy } from './knowledge-tidy.mjs';

export function createKnowledgeIntakeRuntime(deps = {}) {
  const env = deps.env ?? {};
  return {
    nowIso: deps.nowIso ?? (() => new Date().toISOString()),
    getPage: deps.getPage ?? (id => getKnowledgePage(id, { env, fetchImpl: deps.fetchImpl })),
    proposeTidy: deps.proposeTidy ?? (async ({ page }) => proposeTidy({
      page,
      prompt: deps.prompt ?? loadKnowledgePrompt('tidy.md', deps.cwd),
      apiKey: deps.apiKey ?? env.ANTHROPIC_API_KEY,
      fetchImpl: deps.fetchImpl ?? fetch
    })),
    savePage: deps.savePage ?? (page => saveKnowledgePage({
      ...page,
      id: page.id,
      created_at: page.created_at
    }, { env, fetchImpl: deps.fetchImpl, nowIso: deps.nowIso }))
  };
}

export const KNOWLEDGE_INTAKE_KIND = 'knowledge_intake';

export function createKnowledgeIntakeJob({
  id,
  page_id,
  agent = 'clementine',
  now
}) {
  return {
    id,
    kind: KNOWLEDGE_INTAKE_KIND,
    page_id,
    agent,
    status: 'working',
    phase: 'queued',
    created_at: now,
    updated_at: now
  };
}

export function isKnowledgeIntakeJob(job) {
  return job?.kind === KNOWLEDGE_INTAKE_KIND;
}

export function isUnresolvedIntakeJob(job) {
  if (!isKnowledgeIntakeJob(job)) return false;
  if (job.status === 'working') return true;
  return job.status === 'done' && job.phase === 'awaiting_review' && !job.resolution;
}

export function unresolvedJobForPage(inbox, pageId) {
  return (inbox?.jobs ?? []).find(job => job.page_id === pageId && isUnresolvedIntakeJob(job));
}

export async function advanceKnowledgeIntakeJob(job, deps) {
  const now = deps.nowIso();
  if (job.phase === 'queued') {
    return { ...job, phase: 'extracting', status: 'working', updated_at: now };
  }
  if (job.phase === 'extracting') {
    const page = await deps.getPage(job.page_id);
    if (!page) {
      return { ...job, status: 'error', error: 'Page was not found', updated_at: now };
    }
    return {
      ...job,
      phase: 'classifying',
      status: 'working',
      extracted_text: page.body,
      extracted_title: page.title,
      extracted_tags: page.tags ?? [],
      updated_at: now
    };
  }
  if (job.phase === 'classifying') {
    const page = await deps.getPage(job.page_id);
    if (!page) {
      return { ...job, status: 'error', error: 'Page was not found', updated_at: now };
    }
    const proposal = await deps.proposeTidy({ page });
    if (!proposal) {
      return {
        ...job,
        status: 'error',
        error: 'Claude didn’t return a usable tidy',
        updated_at: now
      };
    }
    return {
      ...job,
      phase: 'awaiting_review',
      status: 'done',
      proposal,
      updated_at: now
    };
  }
  return job;
}

export async function runKnowledgeIntakeUntilReview(job, deps) {
  let current = job;
  for (let step = 0; step < 8; step += 1) {
    if (current.status === 'error') return current;
    if (current.phase === 'awaiting_review' || current.phase === 'done' || current.phase === 'rejected') {
      return current;
    }
    const next = await advanceKnowledgeIntakeJob(current, deps);
    if (next.phase === current.phase && next.status === current.status && next.error === current.error) {
      return next;
    }
    current = next;
  }
  return current;
}

export async function resolveKnowledgeIntakeJob(job, resolution, deps) {
  const now = deps.nowIso();
  if (!isKnowledgeIntakeJob(job)) {
    throw Object.assign(new Error('Not a knowledge intake job'), { status: 400, code: 'validation_error' });
  }
  if (resolution === 'accepted') {
    if (job.phase !== 'awaiting_review' || !job.proposal) {
      throw Object.assign(new Error('Nothing to confirm'), { status: 400, code: 'validation_error' });
    }
    const page = await deps.getPage(job.page_id);
    if (!page) {
      throw Object.assign(new Error('Page was not found'), { status: 404, code: 'not_found' });
    }
    const saved = await deps.savePage(applyTidyProposal(page, job.proposal));
    return {
      ...job,
      phase: 'done',
      status: 'done',
      resolution: 'accepted',
      applied_page: saved,
      updated_at: now
    };
  }
  if (resolution === 'rejected') {
    return {
      ...job,
      phase: 'rejected',
      status: 'done',
      resolution: 'rejected',
      updated_at: now
    };
  }
  if (resolution === 'dismissed') {
    return {
      ...job,
      resolution: 'dismissed',
      status: job.status === 'working' ? 'done' : job.status,
      updated_at: now
    };
  }
  throw Object.assign(new Error('resolution is required'), { status: 400, code: 'validation_error' });
}

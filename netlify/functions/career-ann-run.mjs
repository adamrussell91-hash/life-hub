import { methodNotAllowed, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { runCareerAnnJob } from './_shared/career-ann-job.mjs';
import { checkFutureWithAnn } from './_shared/career-future-check.mjs';
import { draftFutureFromAnn } from './_shared/career-future-draft.mjs';
import { pickOwnWriting, checkApplicationWithAnn, draftApplicationWithAnn } from './_shared/career-application-ann.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { assembleCareerOverview } from './_shared/career-overview.mjs';
import { createCareerRepository } from './_shared/career-repository.mjs';
import { createApplicationRepository } from './_shared/application-repository.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';

// Background work for Ann's career jobs (15 minute cap). Started by the check_start
// and draft_start actions on /api/career-futures; see _shared/career-ann-job.mjs.
export const config = { path: '/api/career-ann-run', background: true };

/** Work history and skill cards, trimmed to what Ann needs to read. */
async function readCareerRecord(store, env) {
  const overview = await assembleCareerOverview({
    professionalStore: store,
    universalStore: await defaultGetUniversalLinkStore(),
    env,
    resolveEntity: defaultResolveEntity,
    createUniversalLinkRepository,
    createApplicationRepository,
    createEventRepository,
    now: () => new Date().toISOString()
  });
  return {
    roles: (overview.employment_items ?? []).map((item) => ({
      role: item.role ?? null,
      where: item.display_label ?? item.label ?? null,
      from: item.valid_from ?? null,
      to: item.valid_to ?? null
    })),
    cards: (overview.achievements ?? [])
      .filter((card) => card.lifecycle_status !== 'deleted')
      .map((card) => ({ id: card.id, title: card.title, when: card.occurred_on, skills: card.skills, star: card.star }))
  };
}

/** The school or organisation the application is for, from its applies_to link. */
async function readApplicationWhere(applicationId) {
  try {
    const links = createUniversalLinkRepository({
      store: await defaultGetUniversalLinkStore(),
      resolveEntity: defaultResolveEntity
    });
    const ref = formatEntityRef({ namespace: 'professional', kind: 'application', id: applicationId });
    const outgoing = await links.listOutgoing(ref, createAccessContext({ workflow: 'life' }));
    const hit = outgoing.find((entry) => entry.link.relationship_type === 'applies_to');
    return hit?.endpoint?.display_label ?? null;
  } catch {
    return null;
  }
}

async function runApplicationJob(job, store, env, apiKey, deps) {
  const repo = (deps.createApplicationRepository ?? createApplicationRepository)({ store });
  const application = await repo.getApplication(job.application_id);
  const record = await (deps.readCareerRecord ?? readCareerRecord)(store, env);
  const where = await (deps.readApplicationWhere ?? readApplicationWhere)(job.application_id);
  if (job.kind === 'app_check') {
    return (deps.checkApplicationWithAnn ?? checkApplicationWithAnn)({
      application, where, ...record, env, apiKey, fetchImpl: deps.fetchImpl, sleep: deps.sleep
    });
  }
  const result = await (deps.draftApplicationWithAnn ?? draftApplicationWithAnn)({
    application,
    target: job.target,
    criterion_id: job.criterion_id ?? null,
    where,
    ...record,
    ownWriting: pickOwnWriting(await repo.listApplications().catch(() => []), job.application_id),
    env,
    apiKey,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
    now: deps.draftNow
  });
  // Re-read before saving so an edit made while Ann wrote is kept: the overwrite
  // rule runs again against the latest record.
  let saved = application;
  if (result.patch) {
    const latest = await repo.getApplication(job.application_id);
    saved = await repo.updateApplication(job.application_id, result.apply ? result.apply(latest) : result.patch);
  }
  return { application: saved, drafted: result.drafted, skipped: result.skipped, brackets: result.brackets };
}

export function careerAnnRunner(store, env, deps = {}) {
  const apiKey = typeof env?.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
  return async (job) => {
    if (job.kind === 'draft') {
      const draft = await (deps.draftFutureFromAnn ?? draftFutureFromAnn)({
        title: job.title,
        description: job.description,
        apiKey,
        fetchImpl: deps.fetchImpl
      });
      return { draft };
    }
    if (job.kind === 'app_check' || job.kind === 'app_draft') {
      return runApplicationJob(job, store, env, apiKey, deps);
    }
    const repo = createCareerRepository({ store });
    const future = await repo.getFuture(job.future_id);
    const record = await (deps.readCareerRecord ?? readCareerRecord)(store, env);
    return (deps.checkFutureWithAnn ?? checkFutureWithAnn)({ future, ...record, env, apiKey, fetchImpl: deps.fetchImpl });
  };
}

export function createCareerAnnRunHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const env = deps.env ?? context.env;
      if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      await runCareerAnnJob(context.store, parsed.value.job_id, { run: careerAnnRunner(context.store, env, deps) });
      return withCors(new Response(null, { status: 202 }), request, env);
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createCareerAnnRunHandler();

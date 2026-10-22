// netlify/functions/notion-import.mjs
//
//   GET  /api/notion-import/search?q=       search the Teaching database
//   POST /api/notion-import/jobs            { kind: 'plan'|'apply', page_id, choices? } queue a job -> 202 { job_id }
//   GET  /api/notion-import/jobs/:id        poll it
//
// The background runs are notion-import-plan.mjs and notion-import-apply.mjs.
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { getJSON, setJSON } from './_shared/teaching-blobs.mjs';
import { JOB_ID, notionJobKey, writeJob } from './_shared/notion-import-store.mjs';
import { createNotionClient } from './_shared/notion-client.mjs';
import {
  EMPTY_CHOICES,
  friendlyError,
  kickNotionImportRun as defaultKick,
  normalizePageId,
  NotionSetupError,
  notionToken
} from './_shared/notion-import-run.mjs';

export const config = { path: ['/api/notion-import/search', '/api/notion-import/jobs', '/api/notion-import/jobs/:id'] };

const RUN_PATHS = { plan: '/api/notion-import/plan', apply: '/api/notion-import/apply' };
const DASHED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_LIST = 500;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stringList = (v) => Array.isArray(v) && v.length <= MAX_LIST && v.every((x) => typeof x === 'string' && x.length <= 200);

/** Returns the choices with defaults filled in, or null when they are not understood. */
function readChoices(raw) {
  if (raw === undefined || raw === null) return { ...EMPTY_CHOICES };
  if (!isPlainObject(raw)) return null;
  const choices = { ...EMPTY_CHOICES, ...raw };
  if (!stringList(choices.excluded_page_ids) || !stringList(choices.html_as_code)) return null;
  if (!isPlainObject(choices.overrides) || Object.keys(choices.overrides).length > MAX_LIST) return null;
  if (!Object.values(choices.overrides).every(isPlainObject)) return null;
  return {
    excluded_page_ids: choices.excluded_page_ids,
    overrides: choices.overrides,
    html_as_code: choices.html_as_code
  };
}

const notConfigured = (error) => errorResponse(503, 'not_configured', error.message, false);

export function createNotionImportHandler(deps = {}) {
  const kick = deps.kickNotionImportRun ?? defaultKick;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const url = new URL(request.url);
    const reply = (response) => withCors(response, request, env);
    const jobMatch = url.pathname.match(/\/jobs(?:\/([^/]+))?\/?$/);
    const jobId = context.params?.id ?? jobMatch?.[1];

    if (request.method === 'POST' && jobMatch && !jobMatch[1]) {
      const body = await request.json().catch(() => null);
      const kind = body?.kind;
      if (kind !== 'plan' && kind !== 'apply') {
        return reply(errorResponse(400, 'validation_error', 'kind must be plan or apply.', false));
      }
      const pageId = normalizePageId(body?.page_id);
      if (!DASHED_ID.test(pageId)) {
        return reply(errorResponse(400, 'validation_error', 'Choose a Notion page to import.', false));
      }
      const choices = readChoices(body?.choices);
      if (!choices) {
        return reply(errorResponse(400, 'validation_error', 'Those import choices were not understood.', false));
      }
      try {
        notionToken(env);
      } catch (error) {
        if (error instanceof NotionSetupError) return reply(notConfigured(error));
        throw error;
      }
      const clock = deps.now ?? Date.now;
      const at = new Date(clock()).toISOString();
      const id = `nij_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      await setJSON(store, notionJobKey(id), {
        id, kind, status: 'queued', page_id: pageId, choices, created_at: at, updated_at: at
      });
      if (!(await kick(request, RUN_PATHS[kind], id, deps.fetchImpl))) {
        // Only if nothing has picked the job up: a slow kick response may hide a started run.
        const current = await getJSON(store, notionJobKey(id), { consistency: 'strong' });
        if (current?.status === 'queued') {
          await writeJob(store, id, { status: 'failed', error: 'Could not start the import. Try again.' });
        }
        return reply(errorResponse(502, 'start_failed', 'Could not start the import. Try again.', true));
      }
      return reply(okResponse(202, { job_id: id }));
    }

    if (request.method !== 'GET') {
      return reply(methodNotAllowed(jobMatch && !jobMatch[1] ? 'GET, POST, OPTIONS' : 'GET, OPTIONS'));
    }
    if (jobMatch && !jobMatch[1]) return reply(methodNotAllowed('GET, POST, OPTIONS'));

    if (jobId) {
      if (!JOB_ID.test(jobId)) return reply(errorResponse(400, 'validation_error', 'Bad job id', false));
      const job = await getJSON(store, notionJobKey(jobId), { consistency: 'strong' });
      return reply(job ? okResponse(200, job) : errorResponse(404, 'not_found', 'Job not found', false));
    }

    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const dataSource = typeof env.NOTION_TEACHING_DATA_SOURCE_ID === 'string' ? env.NOTION_TEACHING_DATA_SOURCE_ID.trim() : '';
    try {
      if (!dataSource) throw new NotionSetupError('Add NOTION_TEACHING_DATA_SOURCE_ID to search the Teaching database.');
      const client = createNotionClient({ token: notionToken(env), fetchImpl: deps.fetchImpl, sleep: deps.sleep });
      const result = await client.queryDataSource(dataSource, {
        page_size: 20,
        ...(q ? { filter: { property: 'title', title: { contains: q } } } : {}),
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
      });
      const items = (result.results ?? []).map((page) => ({
        page_id: page.id,
        title: (Object.values(page.properties ?? {}).find((p) => p?.type === 'title')?.title ?? []).map((t) => t.plain_text).join('') || 'Untitled',
        category: page.properties?.Category?.select?.name ?? null,
        last_edited_time: page.last_edited_time
      }));
      return reply(okResponse(200, { items }));
    } catch (error) {
      if (error instanceof NotionSetupError) return reply(notConfigured(error));
      return reply(errorResponse(502, 'notion_error', friendlyError(error), true));
    }
  }, deps);
}

export default createNotionImportHandler();

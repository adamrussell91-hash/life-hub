import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { getJSON } from './_shared/teaching-blobs.mjs';
import { JOB_ID, notionJobKey } from './_shared/notion-import-store.mjs';
import { createNotionClient } from './_shared/notion-client.mjs';
import { friendlyError, notionToken } from './_shared/notion-import-run.mjs';

export const config = { path: ['/api/notion-import/search', '/api/notion-import/jobs/:id'] };

export function createNotionImportHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const url = new URL(request.url);

    const jobId = context.params?.id ?? url.pathname.match(/\/jobs\/([^/]+)$/)?.[1];
    if (jobId) {
      if (!JOB_ID.test(jobId)) return withCors(errorResponse(400, 'validation_error', 'Bad job id', false), request, env);
      const job = await getJSON(store, notionJobKey(jobId));
      return withCors(job ? okResponse(200, job) : errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }

    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const dataSource = typeof env.NOTION_TEACHING_DATA_SOURCE_ID === 'string' ? env.NOTION_TEACHING_DATA_SOURCE_ID.trim() : '';
    try {
      if (!dataSource) throw new Error('Add NOTION_TEACHING_DATA_SOURCE_ID to search the Teaching database.');
      const client = createNotionClient({ token: notionToken(env), fetchImpl: deps.fetchImpl });
      const result = await client.queryDataSource(dataSource, {
        page_size: 20,
        ...(q ? { filter: { property: 'Name', title: { contains: q } } } : {}),
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
      });
      const items = (result.results ?? []).map((page) => ({
        page_id: page.id,
        title: (Object.values(page.properties ?? {}).find((p) => p?.type === 'title')?.title ?? []).map((t) => t.plain_text).join('') || 'Untitled',
        category: page.properties?.Category?.select?.name ?? null,
        last_edited_time: page.last_edited_time
      }));
      return withCors(okResponse(200, { items }), request, env);
    } catch (error) {
      return withCors(errorResponse(502, 'notion_error', friendlyError(error), true), request, env);
    }
  }, deps);
}

export default createNotionImportHandler();

// Background run for one queued Notion import job (see _shared/notion-import-run-handler.mjs).
import { createNotionImportRunHandler } from './_shared/notion-import-run-handler.mjs';

export const config = { path: '/api/notion-import/plan', background: true };

export const createNotionImportPlanHandler = (deps) => createNotionImportRunHandler('plan', deps);

export default createNotionImportPlanHandler();

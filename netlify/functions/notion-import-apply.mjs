// Background run for one queued Notion import job (see _shared/notion-import-run-handler.mjs).
import { createNotionImportRunHandler } from './_shared/notion-import-run-handler.mjs';

export const config = { path: '/api/notion-import/apply', background: true };

export const createNotionImportApplyHandler = (deps) => createNotionImportRunHandler('apply', deps);

export default createNotionImportApplyHandler();

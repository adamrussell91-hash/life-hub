// netlify/functions/_shared/notion-import-store.mjs
import { getJSON, setJSON } from './teaching-blobs.mjs';

export const JOB_ID = /^nij_[a-z0-9]{8,32}$/;

export const notionJobKey = (id) => `notion-import/jobs/${id}`;
export const notionReportKey = (id) => `notion-import/reports/${id}`;
export const NOTION_SOURCE_MAP_KEY = 'notion-import/source-map';
export const DOCUMENT_PREFIX = 'documents/';
export const documentKey = (id) => `${DOCUMENT_PREFIX}${id}`;

export async function readSourceMap(store) {
  const map = await getJSON(store, NOTION_SOURCE_MAP_KEY);
  return map && typeof map === 'object' ? map : {};
}

export async function writeJob(store, id, patch) {
  const current = (await getJSON(store, notionJobKey(id), { consistency: 'strong' })) ?? { id };
  const next = { ...current, ...patch, id, updated_at: new Date().toISOString() };
  await setJSON(store, notionJobKey(id), next);
  return next;
}

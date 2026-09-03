#!/usr/bin/env node
/**
 * Copy Teaching and Tasks Blobs onto life-hub2.
 * Dry-run by default. Pass --apply to write. Never prints the token.
 */
import { getStore } from '@netlify/blobs';
import {
  TEACHING_BLOBS_SITE_ID,
  TEACHING_CONTENT_STORE,
  UMBRELLA_BLOBS_SITE_ID
} from '../netlify/functions/_shared/teaching-blobs.mjs';
import { TASKS_BLOBS_SITE_ID, TASKS_CONTENT_STORE } from '../netlify/functions/_shared/tasks-blobs.mjs';

const apply = process.argv.includes('--apply');

async function listKeys(store) {
  const keys = [];
  let page = await store.list();
  while (page) {
    for (const blob of page.blobs ?? []) {
      if (blob?.key) keys.push(blob.key);
    }
    if (!page.continuationToken) break;
    page = await store.list({ continuationToken: page.continuationToken });
  }
  return keys;
}

async function copyStore({ name, fromSite, toSite, token }) {
  const source = getStore({ name, siteID: fromSite, token });
  const dest = getStore({ name, siteID: toSite, token });
  const keys = await listKeys(source);
  let copied = 0;
  if (apply) {
    for (const key of keys) {
      const value = await source.get(key, { type: 'arrayBuffer' });
      if (value == null) continue;
      const meta = typeof source.getMetadata === 'function' ? await source.getMetadata(key) : null;
      await dest.set(key, value, meta?.metadata ? { metadata: meta.metadata } : undefined);
      copied += 1;
    }
  }
  return { name, fromSite, toSite, keys: keys.length, copied: apply ? copied : 0 };
}

async function main() {
  const token = process.env.NETLIFY_BLOBS_TOKEN ?? '';
  if (!token) {
    console.error('NETLIFY_BLOBS_TOKEN is required.');
    process.exit(1);
  }
  const reports = [];
  reports.push(await copyStore({
    name: TEACHING_CONTENT_STORE,
    fromSite: TEACHING_BLOBS_SITE_ID,
    toSite: UMBRELLA_BLOBS_SITE_ID,
    token
  }));
  reports.push(await copyStore({
    name: TASKS_CONTENT_STORE,
    fromSite: TASKS_BLOBS_SITE_ID,
    toSite: UMBRELLA_BLOBS_SITE_ID,
    token
  }));
  console.log(JSON.stringify({ apply, reports }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

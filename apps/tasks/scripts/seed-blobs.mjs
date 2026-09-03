#!/usr/bin/env node
/**
 * Seed Netlify Blobs from fixtures/seed.json (plain JS — no TS loader needed).
 * Requires NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (or NETLIFY_API_TOKEN).
 *
 *   node scripts/seed-blobs.mjs
 *   FORCE_SEED=1 node scripts/seed-blobs.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(root, 'fixtures/seed.json'), 'utf8'));

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;
if (!siteID || !token) {
  console.error(
    'seed-blobs: set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN (site artasks-hub).'
  );
  process.exit(1);
}

const store = getStore({ name: 'tasks-hub-content', siteID, token });

async function getJSON(key) {
  return (await store.get(key, { type: 'json' })) ?? null;
}

async function setJSON(key, value) {
  await store.setJSON(key, value);
}

async function del(key) {
  await store.delete(key);
}

async function writeIndex(key, ids) {
  await setJSON(key, { ids });
}

if (process.env.FORCE_SEED === '1') {
  await del('meta/seeded');
  console.log('seed-blobs: cleared meta/seeded (FORCE_SEED=1)');
}

const marker = await getJSON('meta/seeded');
if (marker) {
  console.log('seed-blobs: already seeded at', marker.at, '(set FORCE_SEED=1 to redo)');
  process.exit(0);
}

for (const item of seed.frameworks ?? []) {
  await setJSON(`frameworks/${item.id}`, item);
}
await writeIndex(
  'frameworks/_index',
  (seed.frameworks ?? []).map((f) => f.id)
);

for (const item of seed.excursion_templates ?? []) {
  await setJSON(`excursion_templates/${item.id}`, item);
}
await writeIndex(
  'excursion_templates/_index',
  (seed.excursion_templates ?? []).map((t) => t.id)
);

for (const item of seed.task_templates ?? []) {
  await setJSON(`task_templates/${item.id}`, item);
}
await writeIndex(
  'task_templates/_index',
  (seed.task_templates ?? []).map((t) => t.id)
);

for (const item of seed.project_templates ?? []) {
  await setJSON(`project_templates/${item.id}`, item);
}
await writeIndex(
  'project_templates/_index',
  (seed.project_templates ?? []).map((t) => t.id)
);

for (const item of seed.projects ?? []) {
  await setJSON(`projects/${item.id}`, item);
}
await writeIndex(
  'projects/_index',
  (seed.projects ?? []).map((p) => p.id)
);

for (const item of seed.tasks ?? []) {
  await setJSON(`tasks/${item.id}`, item);
}
await writeIndex(
  'tasks/_index',
  (seed.tasks ?? []).map((t) => t.id)
);

await setJSON('meta/seeded', { at: new Date().toISOString() });
console.log(
  `seed-blobs: wrote ${(seed.tasks ?? []).length} tasks, ${(seed.projects ?? []).length} projects`
);

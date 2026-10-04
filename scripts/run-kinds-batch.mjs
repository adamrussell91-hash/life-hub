/**
 * Production kinds run from a Cloud Agent / local machine:
 * startKindsJob + poll checkKindsJob against the live knowledge-shelf blob store,
 * loading note bodies from a local knowledge-hub-data checkout (no GitHub round-trips).
 *
 *   node scripts/run-kinds-batch.mjs --data-dir ../knowledge-hub-data
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import { KNOWLEDGE_SHELF_STORE, PLACEMENTS_KEY } from '../netlify/functions/_shared/knowledge-shelf.mjs';
import { checkKindsJob, readKindsJob, startKindsJob } from '../netlify/functions/_shared/knowledge-shelf-kinds.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const dataDir = arg('--data-dir');
  if (!dataDir) throw new Error('--data-dir needs a path');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!siteID || !token) throw new Error('NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are required');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const onlyKind = arg('--only-kind');
  const regrade = process.argv.includes('--regrade') || Boolean(onlyKind);
  const store = getStore({ name: KNOWLEDGE_SHELF_STORE, siteID, token, consistency: 'strong' });
  const manifest = JSON.parse(await readFile(path.join(dataDir, 'manifest.json'), 'utf8'));
  const bookEntries = manifest.filter(entry =>
    Array.isArray(entry?.origins) && entry.origins.some(o => o?.kind === 'book' && o.label?.trim())
  );

  const listPages = async () => bookEntries;
  const getPage = async id => {
    try {
      return JSON.parse(await readFile(path.join(dataDir, 'pages', `${id}.json`), 'utf8'));
    } catch {
      return null;
    }
  };

  const current = await readKindsJob(store);
  console.log('kinds job before start:', JSON.stringify(current));
  if (current.status === 'running') {
    console.log('A job is already running; checking it instead of starting another.');
  } else {
    console.log('started:', JSON.stringify(await startKindsJob(store, { regrade, onlyKind }, { apiKey, listPages, getPage })));
  }

  for (;;) {
    const job = await checkKindsJob(store, { apiKey, getPage });
    console.log('check:', JSON.stringify(job));
    if (job.status === 'running') {
      await sleep(15000);
      continue;
    }

    const placements = (await store.get(PLACEMENTS_KEY, { type: 'json', consistency: 'strong' })) ?? {};
    const withKind = bookEntries.filter(entry => placements[entry.id]?.kind).length;
    const missing = bookEntries.length - withKind;
    console.log(JSON.stringify({ bookNotes: bookEntries.length, withKind, missing, job }, null, 2));
    if (missing) process.exitCode = 2;
    return;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
/** Import a Notion Communications export. Preview is the default; private data never enters Git. */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { getStore } from '@netlify/blobs';
import { readExport } from './lib/notion-comms/read-export.mjs';
import { readLiveBatch } from './lib/notion-comms/read-live-batch.mjs';
import { parseRow } from './lib/notion-comms/parse-row.mjs';
import { buildImportPlan } from './lib/notion-comms/plan.mjs';
import { applyImportPlan } from './lib/notion-comms/apply.mjs';
import { UMBRELLA_BLOBS_SITE_ID } from '../netlify/functions/_shared/teaching-blobs.mjs';
import { PROFESSIONAL_CONTENT_STORE } from '../netlify/functions/_shared/professional-blobs.mjs';
import { UNIVERSAL_LINK_CONTENT_STORE, listAuthoritativePersonKeys, getJSON as getIdentityJSON } from '../netlify/functions/_shared/universal-link-blobs.mjs';
import { parsePersonRecord } from '../netlify/functions/_shared/identity-schema.mjs';
import { createIdentityRepository } from '../netlify/functions/_shared/identity-repository.mjs';
import { createCommunicationRepository } from '../netlify/functions/_shared/communication-repository.mjs';
import { createMeetingRepository } from '../netlify/functions/_shared/meeting-repository.mjs';
import { createEventRepository } from '../netlify/functions/_shared/event-repository.mjs';
import { createThreadRepository } from '../netlify/functions/_shared/thread-repository.mjs';
import { createLedgerItemRepository } from '../netlify/functions/_shared/ledger-repository.mjs';
import { createUniversalLinkRepository } from '../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../netlify/functions/_shared/entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from '../netlify/functions/_shared/entity-resolvers.mjs';
import { createNetlifyCliStore } from './lib/notion-comms/netlify-cli-store.mjs';

const args = process.argv.slice(2); const value = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; }; const exportDir = value('--export'); const liveInput = value('--live-input'); const apply = args.includes('--apply');
if (Boolean(exportDir) === Boolean(liveInput)) throw new Error('Usage: node scripts/import-notion-comms.mjs (--export <directory> | --live-input <private-json>) [--report <path>] [--apply [--yes]]');
if (liveInput && path.resolve(liveInput).startsWith(`${path.resolve(process.cwd())}${path.sep}`)) throw new Error('--live-input must be outside this public repository.');
if (apply && !args.includes('--yes')) { const input = createInterface({ input: process.stdin, output: process.stdout }); const confirmation = await input.question('Type IMPORT to write the planned records: '); input.close(); if (confirmation.trim() !== 'IMPORT') throw new Error('Refusing to write without typing IMPORT.'); }
const token = process.env.NETLIFY_BLOBS_TOKEN ?? '';
const options = (name) => ({ name, siteID: UMBRELLA_BLOBS_SITE_ID, token });
const cliTransport = value('--transport') === 'netlify-cli';
if (!token && !cliTransport) throw new Error('NETLIFY_BLOBS_TOKEN is required, or use --transport netlify-cli with an authenticated CLI session.');
const professionalStore = cliTransport ? createNetlifyCliStore({ name: PROFESSIONAL_CONTENT_STORE, siteID: UMBRELLA_BLOBS_SITE_ID }) : getStore(options(PROFESSIONAL_CONTENT_STORE));
const universalStore = cliTransport ? createNetlifyCliStore({ name: UNIVERSAL_LINK_CONTENT_STORE, siteID: UMBRELLA_BLOBS_SITE_ID }) : getStore(options(UNIVERSAL_LINK_CONTENT_STORE));

async function listKeys(store, prefix) {
  const keys = []; let page = await store.list({ prefix });
  while (page) { for (const blob of page.blobs ?? []) if (blob?.key) keys.push(blob.key); if (!page.continuationToken) break; page = await store.list({ prefix, continuationToken: page.continuationToken }); }
  return keys;
}
async function loadImportMap() {
  const map = { pages: {}, people: {}, threads: {} };
  for (const key of await listKeys(professionalStore, 'imports/notion-comms/')) {
    const value = await professionalStore.get(key, { type: 'json' });
    if (key.startsWith('imports/notion-comms/pages/')) map.pages[key.slice('imports/notion-comms/pages/'.length)] = value;
    if (key.startsWith('imports/notion-comms/people/')) map.people[key.slice('imports/notion-comms/people/'.length)] = value;
    if (key.startsWith('imports/notion-comms/threads/')) map.threads[key.slice('imports/notion-comms/threads/'.length)] = value;
  }
  return map;
}
async function loadPeople() {
  const records = await Promise.all((await listAuthoritativePersonKeys(universalStore)).map((key) => getIdentityJSON(universalStore, key)));
  return records.map(parsePersonRecord).filter(Boolean).map((person) => ({ display_name: person.display_name, aliases: person.aliases, ref: `shared:person:${person.id}` }));
}

const source = liveInput ? await readLiveBatch(liveInput) : await readExport(exportDir);
const rows = liveInput ? source.rows : source.rows.flatMap((row, index) => source.matches[index] ? [parseRow(row, source.matches[index].body, source.matches[index].id)] : []);
const plan = buildImportPlan({ rows, people: await loadPeople(), importMap: await loadImportMap(), todayKey: new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) });
const countsBy = (items, key) => items.reduce((counts, item) => ({ ...counts, [item[key]]: (counts[item[key]] ?? 0) + 1 }), {});
const byKind = countsBy(plan.records, 'kind'); const byStatus = countsBy(plan.promises, 'status');
const report = `# Notion communications import preview\n\n- Rows read: ${source.rows.length}\n- Rows matched to pages: ${rows.length}\n- Rows skipped (unmatched page): ${source.unmatchedRows.length}\n- Records skipped (missing date): ${plan.report.ambiguous.filter((item) => item.type === 'missing_date').length}\n- Records to create: comms ${byKind.comm ?? 0}, meetings ${byKind.meeting ?? 0}, events ${byKind.event ?? 0}\n- Records already imported: ${plan.report.alreadyImported}\n- People to create: ${plan.report.peopleToCreate}\n- Threads to create: ${plan.threads.filter((thread) => !thread.reuse).length}\n- Promises: open ${byStatus.open ?? 0}, done ${byStatus.done ?? 0}, dismissed ${byStatus.dismissed ?? 0}\n- Rows requiring review: ${plan.report.ambiguous.length}\n${plan.report.ambiguous.filter((item) => item.type === 'person_match').map((item) => `- Ambiguous person: ${item.name} (${item.candidates.join(', ')})`).join('\n')}\n`;
const reportPath = path.resolve(value('--report') ?? path.join(os.tmpdir(), 'notion-comms-import-report.md'));
if (reportPath.startsWith(`${path.resolve(process.cwd())}${path.sep}`)) throw new Error('--report must be outside this public repository.');
await fs.writeFile(reportPath, report);
if (!apply) { console.log(`Preview complete. Report: ${reportPath}`); process.exit(0); }
const resolveEntity = (ref, context) => defaultResolveEntity(ref, context, { getStore: async () => (typeof ref === 'string' ? ref.startsWith('shared:') : ref?.namespace === 'shared') ? universalStore : professionalStore });
const repoDeps = { store: professionalStore, resolveEntity, getUniversalLinkStore: async () => universalStore };
const progress = { person: 0, record: 0, thread: 0, promise: 0 };
try {
  const result = await applyImportPlan(plan, {
    identityRepo: createIdentityRepository({ store: universalStore }), communicationRepo: createCommunicationRepository(repoDeps), meetingRepo: createMeetingRepository(repoDeps), eventRepo: createEventRepository(repoDeps), threadRepo: createThreadRepository({ store: professionalStore }), ledgerRepo: createLedgerItemRepository({ store: professionalStore }), linkRepo: createUniversalLinkRepository({ store: universalStore, resolveEntity }), accessContext: createAccessContext({ workflow: 'professional' }),
    setMap: (key, map) => professionalStore.setJSON(key, map), log: (stage) => { progress[stage] += 1; console.log(`${stage}: ${progress[stage]}`); }
  });
  console.log(JSON.stringify({ applied: true, records: result.createdRecords, people: result.createdPeople, reportPath }));
} catch (error) {
  // Keep terminal output to progress and source IDs: source text and private
  // record fields must never be emitted during a failed live import.
  console.error(JSON.stringify({ applied: false, progress, error: { code: error?.code ?? null, stage: error?.importStage ?? null, notionId: error?.notionId ?? null } }));
  process.exitCode = 1;
}

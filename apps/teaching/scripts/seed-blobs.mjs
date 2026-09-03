/**
 * One-shot seed script for Netlify Blobs.
 *
 * Loads `fixtures/seed.json` and writes years/subjects/units/lesson drafts
 * into the `teaching-hub-content` Blob store, using the same key builders
 * (`src/storage/keys.ts`) and JSON shapes as `scripts/mock-store.ts`, so a
 * freshly deployed site has curriculum content to browse.
 *
 * We deliberately do NOT auto-seed on the first `GET /api/curriculum` —
 * production should never silently materialise fixture data. Run this
 * script explicitly, once, against the real site's Blob store:
 *
 *   NETLIFY_SITE_ID=xxxx NETLIFY_API_TOKEN=xxxx npm run seed:blobs
 *
 * - NETLIFY_SITE_ID: the site's ID (Site settings -> General -> Site details).
 * - NETLIFY_API_TOKEN: a personal access token (User settings -> Applications).
 *
 * Safe to re-run: it overwrites each key with the fixture's current value.
 * It never writes `published/lessons/*` keys, so re-seeding never
 * un-publishes anything a teacher has already published from the app.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import {
  yearKey,
  subjectKey,
  scopeSequenceKey,
  unitKey,
  draftLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  mediaKey,
  outcomeKey
} from '../src/storage/keys.ts';

const CONTENT_STORE_NAME = 'teaching-hub-content';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

async function main() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;

  if (!siteID || !token) {
    console.error('Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN before running this script.');
    process.exitCode = 1;
    return;
  }

  const seedPath = path.resolve(__dirname, '../fixtures/seed.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
  const store = getStore({ name: CONTENT_STORE_NAME, siteID, token });

  const written = await seedStore(store, seed);
  console.log(`Seeded ${written} blob(s) into the "${CONTENT_STORE_NAME}" store.`);
}

export async function seedStore(store, seed) {
  let written = 0;

  for (const year of seed.years) {
    await store.setJSON(yearKey(year.id), year);
    written += 1;
  }
  for (const subject of seed.subjects) {
    await store.setJSON(subjectKey(subject.id), subject);
    written += 1;
  }
  for (const scope of seed.scope_sequences ?? []) {
    await store.setJSON(scopeSequenceKey(scope.id), scope);
    written += 1;
  }
  for (const unit of seed.units) {
    await store.setJSON(unitKey(unit.id), unit);
    written += 1;
  }
  for (const lesson of seed.lessons) {
    await store.setJSON(draftLessonKey(lesson.id), lesson);
    written += 1;
  }
  for (const cls of seed.classes ?? []) {
    await store.setJSON(classKey(cls.id), cls);
    written += 1;
  }
  for (const scheduled of seed.scheduled_lessons ?? []) {
    await store.setJSON(scheduledLessonKey(scheduled.id), scheduled);
    written += 1;
  }
  for (const item of seed.media ?? []) {
    await store.setJSON(mediaKey(item.id), item);
    written += 1;
  }
  for (const item of seed.outcomes ?? []) {
    await store.setJSON(outcomeKey(item.id), item);
    written += 1;
  }
  if (seed.schedule_anchor_date) {
    await store.setJSON(scheduleAnchorKey(), { date: seed.schedule_anchor_date });
    written += 1;
  }

  return written;
}

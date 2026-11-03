#!/usr/bin/env node
/**
 * Folds runs of old faded examples in stored lessons into one block.
 * Dry run is the default. Writes require --execute --confirm-execute.
 * Prints lesson ids and counts only, never lesson content.
 *
 * Usage:
 *   node scripts/migrate-faded-runs.mjs
 *   node scripts/migrate-faded-runs.mjs --execute --confirm-execute
 */
import { pathToFileURL } from 'node:url';
import { foldFadedRuns } from '../netlify/functions/_shared/faded-fold.mjs';
import { defaultGetContentStore, DRAFT_LESSON_PREFIX, PUBLISHED_LESSON_PREFIX } from '../netlify/functions/_shared/teaching-blobs.mjs';

export async function migrateFadedRuns(store, { write = false, log = console.log } = {}) {
  const totals = { lessons: 0, oldBlocks: 0, folded: 0, skipped: 0, written: 0 };
  for (const prefix of [DRAFT_LESSON_PREFIX, PUBLISHED_LESSON_PREFIX]) {
    const { blobs } = await store.list({ prefix });
    for (const { key } of blobs) {
      const lesson = await store.get(key, { type: 'json' });
      if (!Array.isArray(lesson?.blocks)) continue;
      const { blocks, folded, skipped, oldBlocks } = foldFadedRuns(lesson.blocks);
      if (!oldBlocks) continue;
      totals.lessons += 1;
      totals.oldBlocks += oldBlocks;
      totals.folded += folded;
      totals.skipped += skipped.length;
      log(`${key}: ${oldBlocks} old, ${folded} fold, ${skipped.length} skipped`);
      if (write && folded) {
        await store.setJSON(key, { ...lesson, blocks });
        totals.written += 1;
      }
    }
  }
  log(`Total: ${JSON.stringify(totals)}${write ? '' : ' (dry run, nothing written)'}`);
  return totals;
}

async function main(argv = process.argv.slice(2)) {
  const execute = argv.includes('--execute');
  if (execute && !argv.includes('--confirm-execute')) throw new Error('--execute also needs --confirm-execute');
  await migrateFadedRuns(await defaultGetContentStore(), { write: execute });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

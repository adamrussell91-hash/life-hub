/**
 * Delete a same-day planned workout file (Confirm). Completed/skipped stay.
 */
import {
  annotateWorkoutEntries,
  pickPlannedWorkoutToReplace,
  sameDayWorkoutEntries,
  workoutStatusFromMarkdown
} from './workout-confirm-path.mjs';
import { decodeBlob } from './decode-blob.mjs';

const TITLE_RE = /^title:\s*["']?(.+?)["']?\s*$/m;

async function annotateFromTree(client, tree, date) {
  if (client && typeof client.readBlob === 'function') {
    return annotateWorkoutEntries(client, sameDayWorkoutEntries(tree, date));
  }
  // Test / offline-tree path: status+title already on entries, or absent.
  return sameDayWorkoutEntries(tree, date).map(entry => ({
    ...entry,
    status: entry.status ?? null,
    title: entry.title ?? null
  }));
}

export async function findPlannedWorkoutDeleteTargets(client, date, { title, tree } = {}) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'invalid_date', message: 'date must be YYYY-MM-DD.' };
  }
  let currentTree = Array.isArray(tree) ? tree : null;
  if (!currentTree) {
    try {
      currentTree = (await client.resolveTree()).tree;
    } catch {
      return { ok: false, error: 'github_unavailable', message: 'Could not read today\'s workouts.' };
    }
  }
  let sameDay = await annotateFromTree(client, currentTree, date);
  // When the tree snapshot already carries status/title (tests), keep them.
  if (sameDay.every(entry => entry.status == null) && Array.isArray(tree)) {
    sameDay = sameDayWorkoutEntries(tree, date).map(entry => ({
      ...entry,
      status: entry.status ?? 'planned',
      title: entry.title ?? null
    }));
  }
  // If annotate left status null but blobs are readable via a fake client, fill from body.
  if (client?.readBlob && sameDay.some(entry => entry.status == null && entry.sha)) {
    const filled = [];
    for (const entry of sameDay) {
      if (entry.status) {
        filled.push(entry);
        continue;
      }
      try {
        const text = decodeBlob(await client.readBlob(entry.sha));
        const status = workoutStatusFromMarkdown(text);
        const rawTitle = TITLE_RE.exec(text ?? '')?.[1];
        filled.push({
          ...entry,
          status,
          title: rawTitle ? rawTitle.replace(/^["']|["']$/g, '').trim() : entry.title
        });
      } catch {
        filled.push(entry);
      }
    }
    sameDay = filled;
  }
  const picked = pickPlannedWorkoutToReplace(sameDay, { replaceTitle: title });
  if (picked.error) {
    return {
      ok: false,
      error: picked.error,
      message: picked.message,
      titles: picked.titles ?? []
    };
  }
  if (!picked.entry) {
    return { ok: false, error: 'not_found', message: 'No planned workout for that date.', titles: [] };
  }
  return {
    ok: true,
    entry: picked.entry,
    paths: [picked.entry.path]
  };
}

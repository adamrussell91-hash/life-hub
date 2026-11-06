// Quick check storage. Checks are read from private batch files; answers wait
// in Netlify Blobs, one small record each so a tap never rewrites the journal.
// runApply folds waiting answers into the journal in one commit.
import { applyAnswers, CHECK_ID } from "../../../apps/life/js/food-journal/quick-checks.js";
import { createGitHubClient } from "./github-client.mjs";
import { decodeBlob } from "./decode-blob.mjs";

export const CHECKS_DIR = "data/food-journal/quick-checks";
const STORE = "life-hub-food-checks";
const STRONG = { type: "json", consistency: "strong" };
const DONE_KEY = "done.json";
const pendingKey = (id) => `pending/${id}`;

export async function defaultCheckStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore(STORE);
}

export function createCheckReader({ env, fetchImpl, github } = {}) {
  const client = github ?? createGitHubClient({ env, fetchImpl });
  return async function readChecks() {
    const { tree } = await client.resolveTree();
    const files = tree
      .filter(
        (b) =>
          b.type === "blob" &&
          b.path.startsWith(`${CHECKS_DIR}/batch-`) &&
          b.path.endsWith(".json"),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
    const checks = [];
    for (const file of files) {
      const batch = JSON.parse(decodeBlob(await client.readBlob(file.sha)));
      for (const check of batch.checks || [])
        if (CHECK_ID.test(check?.id || "")) checks.push(check);
    }
    return checks;
  };
}

export async function readPending(store) {
  const { blobs } = await store.list({ prefix: "pending/" });
  const rows = await Promise.all(blobs.map((b) => store.get(b.key, STRONG)));
  return rows.filter(Boolean);
}
export async function readDone(store) {
  return (await store.get(DONE_KEY, STRONG)) || { checks: {} };
}
export const saveAnswer = (store, answer) =>
  store.setJSON(pendingKey(answer.check_id), answer);
// False once the answer has reached the journal.
export async function undoAnswer(store, id) {
  const row = await store.get(pendingKey(id), STRONG);
  if (!row) return false;
  await store.delete(pendingKey(id));
  return true;
}

// A journal that moved on mid-run makes the save fail: the answers stay
// waiting and the next run picks them up.
export async function runApply({ repo, store, readChecks, now = Date.now }) {
  const pending = await readPending(store);
  if (!pending.length) return { applied: 0, held: 0, rejected: 0, version: null };
  const [checks, current, done] = await Promise.all([
    readChecks(),
    repo.getJournal(),
    readDone(store),
  ]);
  const { journal, results, changed } = applyAnswers(current.journal, checks, pending);
  const saved = changed ? await repo.saveJournal(journal, current.version) : current;
  const at = new Date(now()).toISOString();
  for (const r of results)
    done.checks[r.check_id] = { pick: r.pick, outcome: r.outcome, applied: r.applied, held: r.held, at };
  await store.setJSON(DONE_KEY, done);
  await Promise.all(pending.map((a) => store.delete(pendingKey(a.check_id))));
  const count = (outcome) => results.filter((r) => r.outcome === outcome).length;
  return {
    applied: count("applied"),
    held: count("held"),
    rejected: count("rejected"),
    version: saved.version,
  };
}

// How often each kind of answer was given, for judging Codex's suggestions.
export function answerStats(done, pending) {
  const stats = { answered: 0, suggestion: 0, alternative: 0, typed: 0, keep: 0, apply: 0, reject: 0, rate: 0, unknown: 0, held: 0 };
  const count = (pick) => {
    stats.answered++;
    const key = pick?.startsWith("alt:") ? "alternative" : pick;
    if (key in stats) stats[key]++;
  };
  for (const row of Object.values(done.checks)) {
    count(row.pick);
    if (row.outcome === "held") stats.held++;
  }
  for (const row of pending) count(row.pick);
  return stats;
}

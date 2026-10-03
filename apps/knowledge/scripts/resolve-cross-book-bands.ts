import { appendFileSync, existsSync, readFileSync, writeSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { confidenceBand, parseRescanDecisions, rescanLinks, type RescanDecision } from "../src/curator/bandResolve";
import { mergeManifestConnected } from "../src/curator/crossBook";
import { linkBoth } from "../src/curator/proposals";
import { DEFAULT_JUDGE_MODEL } from "../src/curator/propose";
import { pairKey, type AutoApproved, type DismissedPair, type PendingProposal } from "../src/curator/schema";
import type { PageManifestEntry } from "../src/domain/page";
import { loadDotEnv } from "./loadLocalPages";

const BATCH = 6;
const CONCURRENCY = 12;
const CACHE_PATH = "/tmp/cross-book-rescan.jsonl";

function say(line: string) {
  writeSync(1, `${line}\n`);
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function scored(row: PendingProposal) {
  return typeof row.confidence === "number" && Number.isFinite(row.confidence);
}

async function writeLink(dataDir: string, noteA: string, noteB: string) {
  const fileA = path.join(dataDir, "pages", `${noteA}.json`);
  const fileB = path.join(dataDir, "pages", `${noteB}.json`);
  const pageA = JSON.parse(await readFile(fileA, "utf8")) as { connected?: string[] };
  const pageB = JSON.parse(await readFile(fileB, "utf8")) as { connected?: string[] };
  const linked = linkBoth(pageA.connected, pageB.connected, noteA, noteB);
  pageA.connected = linked.a;
  pageB.connected = linked.b;
  await writeFile(fileA, JSON.stringify(pageA, null, 2) + "\n");
  await writeFile(fileB, JSON.stringify(pageB, null, 2) + "\n");
  return [
    { id: noteA, connected: linked.a },
    { id: noteB, connected: linked.b },
  ];
}

async function writeManifest(manifestPath: string, updates: { id: string; connected: string[] }[]) {
  if (!updates.length) return;
  const byId = new Map<string, string[]>();
  for (const update of updates) byId.set(update.id, update.connected);
  const rows = await readJson<PageManifestEntry[]>(manifestPath, []);
  const merged = [...byId.entries()].map(([id, connected]) => ({ id, connected }));
  await writeFile(manifestPath, JSON.stringify(mergeManifestConnected(rows, merged)) + "\n");
}

async function settle(dataDir: string, now: string) {
  const curatorDir = path.join(dataDir, "_curator");
  const pendingPath = path.join(curatorDir, "pending-proposals.json");
  const dismissedPath = path.join(curatorDir, "dismissed.json");
  const autoPath = path.join(curatorDir, "auto-approved.json");
  const manifestPath = path.join(dataDir, "manifest.json");
  const pending = await readJson<PendingProposal[]>(pendingPath, []);
  const reject: PendingProposal[] = [];
  const approve: PendingProposal[] = [];
  const keep: PendingProposal[] = [];
  for (const row of pending) {
    if (!scored(row)) {
      keep.push(row);
      continue;
    }
    const band = confidenceBand(row.confidence!);
    if (band === "reject") reject.push(row);
    else if (band === "approve") approve.push(row);
    else keep.push(row);
  }

  const manifestUpdates: { id: string; connected: string[] }[] = [];
  const approved: AutoApproved[] = [];
  const approveIds = new Set<string>();
  let approveSkipped = 0;
  for (const row of approve) {
    try {
      manifestUpdates.push(...(await writeLink(dataDir, row.noteA, row.noteB)));
      approveIds.add(row.id);
      approved.push({
        noteA: row.noteA,
        noteB: row.noteB,
        titleA: row.titleA,
        titleB: row.titleB,
        bookA: row.bookA ?? "",
        bookB: row.bookB ?? "",
        relation: row.relation,
        rationale: row.rationale,
        confidence: row.confidence!,
        approvedAt: now,
      });
    } catch (error) {
      approveSkipped += 1;
      say(`skip approve ${row.id}: ${error instanceof Error ? error.message : "missing page"}`);
    }
  }
  await writeManifest(manifestPath, manifestUpdates);

  const rejectIds = new Set(reject.map(row => row.id));
  const nextPending = pending.filter(row => !rejectIds.has(row.id) && !approveIds.has(row.id));
  await writeFile(pendingPath, JSON.stringify(nextPending, null, 2) + "\n");

  const dismissed = await readJson<DismissedPair[]>(dismissedPath, []);
  const seen = new Set(dismissed.map(row => pairKey(row.noteA, row.noteB)));
  for (const row of reject) {
    const key = pairKey(row.noteA, row.noteB);
    if (seen.has(key)) continue;
    seen.add(key);
    dismissed.push({ noteA: row.noteA, noteB: row.noteB, dismissedAt: now });
  }
  await writeFile(dismissedPath, JSON.stringify(dismissed, null, 2) + "\n");

  const existingAuto = await readJson<AutoApproved[]>(autoPath, []);
  const autoSeen = new Set(existingAuto.map(row => pairKey(row.noteA, row.noteB)));
  const nextAuto = [...existingAuto];
  for (const row of approved) {
    const key = pairKey(row.noteA, row.noteB);
    if (autoSeen.has(key)) continue;
    autoSeen.add(key);
    nextAuto.push(row);
  }
  await writeFile(autoPath, JSON.stringify(nextAuto, null, 2) + "\n");
  say(`rejected ${reject.length}`);
  say(`approved ${approved.length}`);
  say(`approve skipped ${approveSkipped}`);
  say(`pending left ${nextPending.length}`);
}

type CacheRow = { id: string; decision: RescanDecision; model: string };

function loadCache() {
  const cache = new Map<string, CacheRow>();
  if (!existsSync(CACHE_PATH)) return cache;
  for (const line of readFileSync(CACHE_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as CacheRow;
    if (row.id) cache.set(row.id, row);
  }
  return cache;
}

function promptFor(pairs: { id: string; bookA?: string; titleA: string; bodyA: string; bookB?: string; titleB: string; bodyB: string }[]) {
  const blocks = pairs.map((pair, index) => `[${index + 1}] id:${pair.id}
A book:${pair.bookA ?? ""} title:${pair.titleA}
${pair.bodyA}

B book:${pair.bookB ?? ""} title:${pair.titleB}
${pair.bodyB}`).join("\n\n");
  return `You are deciding links in a personal knowledge archive. These pairs scored 60–70% and must now be settled. Return JSON only.

Link a pair only when a reader of one note would clearly want the other: the same specific claim, mechanism, study, or person, or one note directly builds on, applies, or contradicts a specific point in the other.
Do not link a pair that only shares a topic or some vocabulary.
A link needs confidence of at least 0.70. Anything weaker is not a link.

${blocks}

Return only JSON:
{
  "decisions": [
    { "id": "the pair id", "link": true, "relation": "related" | "builds-on" | "contrasts-with", "rationale": "one short sentence", "confidence": 0.0 }
  ]
}`;
}

async function judgeBatch(apiKey: string, pairs: { id: string; bookA?: string; titleA: string; bodyA: string; bookB?: string; titleB: string; bodyB: string }[]) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_JUDGE_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: promptFor(pairs) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: { type: string; text?: string }[]; model?: string };
  const text = payload.content?.find(block => block.type === "text")?.text ?? "";
  return {
    decisions: parseRescanDecisions(text, new Set(pairs.map(pair => pair.id))),
    model: payload.model ?? DEFAULT_JUDGE_MODEL,
  };
}

async function rescan(dataDir: string, apiKey: string, now: string) {
  const curatorDir = path.join(dataDir, "_curator");
  const pendingPath = path.join(curatorDir, "pending-proposals.json");
  const dismissedPath = path.join(curatorDir, "dismissed.json");
  const autoPath = path.join(curatorDir, "auto-approved.json");
  const manifestPath = path.join(dataDir, "manifest.json");
  const pending = await readJson<PendingProposal[]>(pendingPath, []);
  const queue = pending.filter(row => scored(row) && confidenceBand(row.confidence!) === "rescan");
  say(`rescan ${queue.length}`);
  const bodies = new Map<string, string>();
  async function bodyOf(id: string) {
    const cached = bodies.get(id);
    if (cached !== undefined) return cached;
    try {
      const page = JSON.parse(await readFile(path.join(dataDir, "pages", `${id}.json`), "utf8")) as { body?: string };
      const body = (page.body ?? "").slice(0, 1500);
      bodies.set(id, body);
      return body;
    } catch {
      bodies.set(id, "");
      return "";
    }
  }

  const cache = loadCache();
  const batches: PendingProposal[][] = [];
  for (let index = 0; index < queue.length; index += BATCH) batches.push(queue.slice(index, index + BATCH));
  let done = 0;
  let cursor = 0;
  const width = Math.min(CONCURRENCY, batches.length);
  if (width) {
    await Promise.all(Array.from({ length: width }, async () => {
      while (cursor < batches.length) {
        const index = cursor;
        cursor += 1;
        const batch = batches[index];
        if (!batch) continue;
        const missing = batch.filter(row => !cache.has(row.id));
        if (missing.length) {
          const pairs = [];
          for (const row of missing) {
            pairs.push({
              id: row.id,
              bookA: row.bookA,
              titleA: row.titleA,
              bodyA: await bodyOf(row.noteA),
              bookB: row.bookB,
              titleB: row.titleB,
              bodyB: await bodyOf(row.noteB),
            });
          }
          let judged: { decisions: RescanDecision[]; model: string } | undefined;
          for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
              judged = await judgeBatch(apiKey, pairs);
              break;
            } catch (error) {
              say(`retry ${attempt} batch ${index}: ${error instanceof Error ? error.message : "judge failed"}`);
              if (attempt === 4) break;
              await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
            }
          }
          if (judged) {
            for (const decision of judged.decisions) {
              const row: CacheRow = { id: decision.id, decision, model: judged.model };
              appendFileSync(CACHE_PATH, `${JSON.stringify(row)}\n`);
              cache.set(decision.id, row);
            }
          }
        }
        done += 1;
        say(`batch ${done}/${batches.length}`);
      }
    }));
  }

  const manifestUpdates: { id: string; connected: string[] }[] = [];
  const approved: AutoApproved[] = [];
  const dismissedIds = new Set<string>();
  const unresolved: string[] = [];
  let linked = 0;
  let rejected = 0;
  for (const row of queue) {
    const cached = cache.get(row.id);
    if (!cached) {
      unresolved.push(row.id);
      continue;
    }
    const decision = cached.decision;
    if (rescanLinks(decision)) {
      try {
        manifestUpdates.push(...(await writeLink(dataDir, row.noteA, row.noteB)));
        linked += 1;
        approved.push({
          noteA: row.noteA,
          noteB: row.noteB,
          titleA: row.titleA,
          titleB: row.titleB,
          bookA: row.bookA ?? "",
          bookB: row.bookB ?? "",
          relation: decision.relation,
          rationale: decision.rationale,
          confidence: decision.confidence!,
          approvedAt: now,
        });
        dismissedIds.add(row.id);
      } catch (error) {
        unresolved.push(row.id);
        say(`skip link ${row.id}: ${error instanceof Error ? error.message : "missing page"}`);
      }
    } else {
      rejected += 1;
      dismissedIds.add(row.id);
    }
  }

  await writeManifest(manifestPath, manifestUpdates);
  const nextPending = (await readJson<PendingProposal[]>(pendingPath, [])).filter(row => !dismissedIds.has(row.id));
  await writeFile(pendingPath, JSON.stringify(nextPending, null, 2) + "\n");
  const dismissed = await readJson<DismissedPair[]>(dismissedPath, []);
  const seen = new Set(dismissed.map(row => pairKey(row.noteA, row.noteB)));
  for (const row of queue) {
    if (!dismissedIds.has(row.id) || rescanLinks(cache.get(row.id)?.decision ?? { link: false })) continue;
    const key = pairKey(row.noteA, row.noteB);
    if (seen.has(key)) continue;
    seen.add(key);
    dismissed.push({ noteA: row.noteA, noteB: row.noteB, dismissedAt: now });
  }
  await writeFile(dismissedPath, JSON.stringify(dismissed, null, 2) + "\n");
  const existingAuto = await readJson<AutoApproved[]>(autoPath, []);
  const autoSeen = new Set(existingAuto.map(row => pairKey(row.noteA, row.noteB)));
  const nextAuto = [...existingAuto];
  for (const row of approved) {
    const key = pairKey(row.noteA, row.noteB);
    if (autoSeen.has(key)) continue;
    autoSeen.add(key);
    nextAuto.push(row);
  }
  await writeFile(autoPath, JSON.stringify(nextAuto, null, 2) + "\n");
  say(`rescan linked ${linked}`);
  say(`rescan rejected ${rejected}`);
  say(`rescan unresolved ${unresolved.length}`);
}

async function main() {
  await loadDotEnv();
  const dataDir = arg("--data-dir");
  if (!dataDir) throw new Error("--data-dir needs a path");
  const now = new Date().toISOString();
  const settleOnly = process.argv.includes("--settle-only");
  const rescanOnly = process.argv.includes("--rescan-only");
  if (!rescanOnly) await settle(dataDir, now);
  if (!settleOnly) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
    await rescan(dataDir, apiKey, now);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

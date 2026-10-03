import { writeSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PageSchema, type Page, type PageManifestEntry } from "../src/domain/page";
import { bookLabelFromOrigins, mergeManifestConnected, runCrossBook, type CrossBookNote } from "../src/curator/crossBook";
import { DEFAULT_JUDGE_MODEL, judgeLinksDetailed } from "../src/curator/propose";
import { appendProposals } from "../src/curator/proposals";
import { excerptLine } from "../src/curator/run";
import type { AutoApproved, DismissedPair, PendingProposal } from "../src/curator/schema";
import { loadDotEnv } from "./loadLocalPages";

/** Published Claude Sonnet 4.6 rates. Update these if DEFAULT_JUDGE_MODEL changes. */
const SONNET_INPUT_PER_MTOK = 3;
const SONNET_OUTPUT_PER_MTOK = 15;
const JUDGE_CONCURRENCY = 6;

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

async function main() {
  await loadDotEnv();
  const dataDir = arg("--data-dir");
  if (!dataDir) throw new Error("--data-dir needs a path");
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is required");
  const dryRun = process.argv.includes("--dry-run");
  const book = arg("--book");
  const limitArg = arg("--limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  if (limitArg && (!Number.isInteger(limit) || limit! <= 0)) throw new Error("--limit needs a positive integer");

  const curatorDir = path.join(dataDir, "_curator");
  const manifestPath = path.join(dataDir, "manifest.json");
  const pendingPath = path.join(curatorDir, "pending-proposals.json");
  const dismissedPath = path.join(curatorDir, "dismissed.json");
  const autoPath = path.join(curatorDir, "auto-approved.json");
  const manifest = await readJson<PageManifestEntry[]>(manifestPath, []);
  const pending = await readJson<PendingProposal[]>(pendingPath, []);
  const dismissed = await readJson<DismissedPair[]>(dismissedPath, []);
  const notes: CrossBookNote[] = [];
  const pages = new Map<string, Page>();
  let unreadable = 0;
  for (const row of manifest) {
    const label = bookLabelFromOrigins(row.origins);
    if (!label || typeof row.id !== "string") continue;
    try {
      const page = PageSchema.parse(JSON.parse(await readFile(path.join(dataDir, "pages", `${row.id}.json`), "utf8")));
      pages.set(page.id, page);
      notes.push({
        id: page.id,
        title: page.title,
        body: page.body,
        excerpt: row.excerpt || excerptLine(page.body),
        connected: page.connected ?? [],
        book: label,
      });
    } catch {
      unreadable += 1;
    }
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let model = DEFAULT_JUDGE_MODEL;
  let judgeCalls = 0;
  say(`loaded ${notes.length} book notes (${unreadable} unreadable)`);
  const result = await runCrossBook({
    notes,
    pending,
    dismissed,
    book,
    limit,
    concurrency: JUDGE_CONCURRENCY,
    now: () => new Date().toISOString(),
    onJudged: info => {
      judgeCalls = info.total;
      say(`judged ${info.done}/${info.total} ${info.noteId}`);
    },
    judge: async (note, candidates) => {
      const page = pages.get(note.id);
      if (!page) return [];
      const ask = () => judgeLinksDetailed({ note: page, candidates, apiKey: anthropic });
      let judged;
      try {
        judged = await ask();
      } catch (error) {
        say(`retry ${note.id}: ${error instanceof Error ? error.message : "judge failed"}`);
        judged = await ask();
      }
      inputTokens += judged.usage.input_tokens;
      outputTokens += judged.usage.output_tokens;
      model = judged.model;
      return judged.links;
    },
  });

  if (!dryRun && (result.connected.length || result.queued.length || result.autoApproved.length)) {
    await mkdir(curatorDir, { recursive: true });
    for (const update of result.connected) {
      const file = path.join(dataDir, "pages", `${update.id}.json`);
      const raw = JSON.parse(await readFile(file, "utf8")) as { connected?: string[] };
      raw.connected = update.connected;
      await writeFile(file, JSON.stringify(raw, null, 2) + "\n");
    }
    if (result.connected.length) {
      const rows = await readJson<PageManifestEntry[]>(manifestPath, []);
      await writeFile(manifestPath, JSON.stringify(mergeManifestConnected(rows, result.connected), null, 2) + "\n");
    }
    const nextPending = appendProposals(await readJson<PendingProposal[]>(pendingPath, []), result.queued);
    await writeFile(pendingPath, JSON.stringify(nextPending, null, 2) + "\n");
    const nextAuto = [...(await readJson<AutoApproved[]>(autoPath, [])), ...result.autoApproved];
    await writeFile(autoPath, JSON.stringify(nextAuto, null, 2) + "\n");
  }

  const usd = (inputTokens / 1_000_000) * SONNET_INPUT_PER_MTOK + (outputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK;
  const summary = {
    dryRun,
    book: book ?? null,
    notes: notes.length,
    unreadable,
    notesProcessed: result.notesProcessed,
    judgeCalls,
    pairsJudged: result.pairsJudged,
    autoApproved: result.autoApproved.length,
    queued: result.queued.length,
    model,
    inputTokens,
    outputTokens,
    estimatedUsd: Number(usd.toFixed(4)),
  };
  console.log(JSON.stringify(summary));
  const top = [...result.autoApproved].sort((a, b) => b.confidence - a.confidence).slice(0, 20);
  console.log(`\nTop ${top.length} auto-approvals`);
  for (const row of top) {
    console.log(
      `${Math.round(row.confidence * 100)}%  ${row.bookA} · ${row.titleA}  →  ${row.bookB} · ${row.titleB}`,
    );
    console.log(`  ${row.relation}: ${row.rationale}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

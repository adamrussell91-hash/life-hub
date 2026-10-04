/**
 * Dry-run grader for book-note kinds. Calls Claude through kindGrade / the shared
 * parse path and writes nothing. Real apply is kinds-start against production.
 *
 *   npm run grade-kinds -- --data-dir <knowledge-hub-data> --gold ../../docs/bookshelf/kind-gold.json
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeSync } from "node:fs";
import { KIND_SYSTEM, kindPrompt, parseKindGrade } from "../src/shelf/kindGrade";
import { FACTS_MODEL } from "../../../netlify/functions/_shared/knowledge-shelf-facts.mjs";
import { SHELF_KINDS } from "../../../netlify/functions/_shared/knowledge-shelf.mjs";
import { loadDotEnv } from "./loadLocalPages";

const ANTHROPIC_ORIGIN = "https://api.anthropic.com";
const CONCURRENCY = 6;

type GoldFile = {
  confirmed?: boolean;
  notes: Array<{ id: string; book: string; title: string; kind: string }>;
};

type Graded = {
  id: string;
  title: string;
  book: string;
  kind: string;
  kindGuessed: boolean;
  downgraded: boolean;
  reason?: string;
  evidence?: string;
};

type Origin = { kind?: string; label?: string; locus?: string };

function say(line: string) {
  writeSync(1, `${line}\n`);
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(SHELF_KINDS.map((kind: string) => [kind, 0]));
}

function bookOrigin(origins: Origin[] | undefined): Origin | undefined {
  return (origins ?? []).find(origin => origin.kind === "book" && origin.label?.trim());
}

function normaliseLabel(label: string) {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function pick<T>(list: T[], n: number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

async function gradeNote(
  note: { id: string; title: string; bookLabel: string; locus: string; body: string },
  apiKey: string,
): Promise<Graded> {
  const base = { id: note.id, title: note.title, book: note.bookLabel };

  const call = async () => {
    const response = await fetch(`${ANTHROPIC_ORIGIN}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: FACTS_MODEL,
        max_tokens: 1024,
        system: KIND_SYSTEM,
        messages: [{ role: "user", content: kindPrompt(note) }],
      }),
    });
    if (!response.ok) throw new Error(`Claude HTTP ${response.status}`);
    const message = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    return (message.content ?? []).filter(part => part?.type === "text").map(part => part.text ?? "").join("");
  };

  let parsed = parseKindGrade(await call(), note.body);
  if (parsed.unreadable) parsed = parseKindGrade(await call(), note.body);
  if (parsed.unreadable) {
    return { ...base, kind: "idea", kindGuessed: true, downgraded: false, reason: "Grader reply unreadable." };
  }

  return {
    ...base,
    kind: parsed.kind,
    kindGuessed: Boolean(parsed.kindGuessed),
    downgraded: Boolean(parsed.downgraded),
    reason: parsed.kindReason,
    evidence: parsed.evidence,
  };
}

async function main() {
  await loadDotEnv();
  const dataDir = arg("--data-dir");
  if (!dataDir) throw new Error("--data-dir needs a path");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const goldPath = arg("--gold");
  const bookFilter = arg("--book");
  const limitArg = arg("--limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  if (limitArg && (!Number.isInteger(limit) || limit! <= 0)) throw new Error("--limit needs a positive integer");

  const manifest = JSON.parse(await readFile(path.join(dataDir, "manifest.json"), "utf8")) as Array<{
    id: string;
    title?: string;
    origins?: Origin[];
  }>;

  let rows = manifest.filter(entry => bookOrigin(entry.origins));
  if (bookFilter) {
    const want = normaliseLabel(bookFilter);
    rows = rows.filter(entry =>
      (entry.origins ?? []).some(origin => origin.kind === "book" && normaliseLabel(origin.label ?? "") === want),
    );
  }
  if (goldPath && process.argv.includes("--gold-only")) {
    const gold = JSON.parse(await readFile(path.resolve(goldPath), "utf8")) as GoldFile;
    const want = new Set(gold.notes.map(note => note.id));
    rows = rows.filter(entry => want.has(entry.id));
  }
  if (limit) rows = rows.slice(0, limit);

  say(`Grading ${rows.length} book notes (dry run; writes nothing)…`);
  const graded = await mapPool(rows, CONCURRENCY, async entry => {
    const page = JSON.parse(await readFile(path.join(dataDir, "pages", `${entry.id}.json`), "utf8")) as {
      title?: string;
      body?: string;
      origins?: Origin[];
    };
    const book = bookOrigin(page.origins ?? entry.origins);
    return gradeNote(
      {
        id: entry.id,
        title: page.title ?? entry.title ?? entry.id,
        bookLabel: book?.label?.trim() ?? "",
        locus: book?.locus ?? "",
        body: page.body ?? "",
      },
      apiKey,
    );
  });

  const totals = emptyCounts();
  let guessed = 0;
  let downgraded = 0;
  let unreadable = 0;
  for (const row of graded) {
    totals[row.kind] = (totals[row.kind] ?? 0) + 1;
    if (row.kindGuessed) guessed += 1;
    if (row.downgraded) downgraded += 1;
    if (row.reason === "Grader reply unreadable.") unreadable += 1;
  }

  say("");
  say("## Totals");
  for (const kind of SHELF_KINDS) say(`${kind}: ${totals[kind] ?? 0}`);
  say(`guessed: ${guessed}`);
  say(`downgraded: ${downgraded}`);
  say(`unreadable: ${unreadable}`);

  say("");
  say("## Per book");
  const byBook = new Map<string, Record<string, number>>();
  for (const row of graded) {
    const bucket = byBook.get(row.book) ?? emptyCounts();
    bucket[row.kind] = (bucket[row.kind] ?? 0) + 1;
    byBook.set(row.book, bucket);
  }
  for (const [book, counts] of [...byBook.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    say(`${book}: ${SHELF_KINDS.map((kind: string) => `${kind}=${counts[kind] ?? 0}`).join(" ")}`);
  }

  if (goldPath) {
    const gold = JSON.parse(await readFile(path.resolve(goldPath), "utf8")) as GoldFile;
    if (!gold.confirmed) throw new Error("kind-gold.json is not confirmed yet (set confirmed: true).");
    const byId = new Map(graded.map(row => [row.id, row]));
    let hits = 0;
    const confusion = new Map<string, number>();
    const misses: string[] = [];
    let fluidAsIdea = 0;
    for (const note of gold.notes) {
      const got = byId.get(note.id);
      const key = `${note.kind}→${got?.kind ?? "missing"}`;
      confusion.set(key, (confusion.get(key) ?? 0) + 1);
      if (got?.kind === note.kind) {
        hits += 1;
        continue;
      }
      misses.push(`${note.title} | gold=${note.kind} graded=${got?.kind ?? "missing"} | ${got?.reason ?? ""}`);
      if ((note.kind === "debate" || note.kind === "bridge") && got?.kind === "idea") fluidAsIdea += 1;
    }
    say("");
    say(`## Gold agreement: ${hits}/${gold.notes.length}`);
    say("Confusion:");
    for (const [key, n] of [...confusion.entries()].sort()) say(`  ${key}: ${n}`);
    if (misses.length) {
      say("Misses:");
      for (const line of misses) say(`  - ${line}`);
    }
    if (hits < 24) say(`GATE FAIL: agreement ${hits}/30 < 24`);
    if (fluidAsIdea) say(`GATE FAIL: ${fluidAsIdea} fluid gold note(s) graded idea`);
    if (hits >= 24 && !fluidAsIdea) say("GATE PASS");
  }

  say("");
  say("## Sample debate evidence");
  for (const row of pick(graded.filter(row => row.kind === "debate"), 10)) {
    say(`- ${row.title}: ${row.evidence ?? "(no evidence)"}`);
  }
  say("## Sample bridge evidence");
  for (const row of pick(graded.filter(row => row.kind === "bridge"), 10)) {
    say(`- ${row.title}: ${row.evidence ?? "(no evidence)"}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

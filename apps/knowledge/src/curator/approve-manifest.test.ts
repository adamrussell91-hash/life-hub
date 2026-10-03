import { describe, expect, it } from "vitest";
import { applyCuratorAction } from "../../../../netlify/functions/_shared/knowledge-curator.mjs";
import { buildShelf } from "../shelf/model";
import type { PageManifestEntry } from "../domain/page";

const env = { GITHUB_TOKEN: "token" };

function page(id: string, connected: string[] = []) {
  return {
    id,
    title: id,
    area: "notes",
    tags: [],
    body: "Body",
    connected,
    attachments: [],
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-15T00:00:00.000Z",
    schema_version: 1,
  };
}

function manifest(connectedA: string[] = [], connectedB: string[] = []) {
  return [
    {
      id: "note-a",
      title: "Basal ganglia",
      area: "notes",
      tags: [],
      excerpt: "Direct pathway",
      origins: [{ kind: "book", label: "The Neural Mind" }],
      ...(connectedA.length ? { connected: connectedA } : {}),
    },
    {
      id: "note-b",
      title: "Habits",
      area: "notes",
      tags: [],
      excerpt: "Striatum",
      origins: [{ kind: "book", label: "Atomic Habits" }],
      ...(connectedB.length ? { connected: connectedB } : {}),
    },
  ];
}

function proposal() {
  return {
    id: "note-a||note-b",
    noteA: "note-a",
    noteB: "note-b",
    titleA: "Basal ganglia",
    titleB: "Habits",
    excerptA: "Direct pathway",
    excerptB: "Striatum",
    relation: "builds-on",
    rationale: "both describe the striatum",
    proposedAt: "2026-10-03T00:00:00.000Z",
    confidence: 0.72,
  };
}

function memoryGithub(
  initial: Record<string, { sha: string; text: string }>,
  options: { bumpOnPageWrite?: boolean; conflictManifest?: boolean } = {},
) {
  const files = new Map(Object.entries(initial));
  let generation = 0;
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const file = decodeURIComponent(String(url).split("/contents/")[1] ?? "");
    const method = init.method ?? "GET";
    const current = files.get(file);
    if (method === "GET") {
      if (!current) return new Response("missing", { status: 404 });
      return Response.json({
        sha: current.sha,
        encoding: "base64",
        content: Buffer.from(current.text).toString("base64"),
      });
    }
    const body = JSON.parse(init.body ?? "{}") as { sha?: string; content?: string };
    if (options.conflictManifest && file === "manifest.json") {
      return new Response("conflict", { status: 409 });
    }
    if (current && body.sha && body.sha !== current.sha) {
      return new Response("conflict", { status: 409 });
    }
    if (options.bumpOnPageWrite && file.startsWith("pages/")) {
      for (const [name, entry] of files) {
        if (!name.startsWith("pages/")) files.set(name, { ...entry, sha: `${entry.sha}-moved` });
      }
    }
    files.set(file, {
      sha: `next-${++generation}`,
      text: Buffer.from(body.content ?? "", "base64").toString("utf8"),
    });
    return Response.json({ content: { sha: `next-${generation}` } });
  };
  return { fetchImpl, files };
}

describe("applyCuratorAction manifest", () => {
  it("approves a link into the manifest the bookshelf reads", async () => {
    const store = memoryGithub({
      "_curator/pending-proposals.json": { sha: "p1", text: JSON.stringify([proposal()]) },
      "_curator/dismissed.json": { sha: "d1", text: "[]" },
      "pages/note-a.json": { sha: "a1", text: JSON.stringify(page("note-a")) },
      "pages/note-b.json": { sha: "b1", text: JSON.stringify(page("note-b")) },
      "manifest.json": { sha: "m1", text: JSON.stringify(manifest()) },
    });
    const result = await applyCuratorAction({
      action: "approve",
      id: "note-a||note-b",
      env,
      fetchImpl: store.fetchImpl,
    });
    expect(result.pending).toEqual([]);
    const written = JSON.parse(store.files.get("manifest.json")?.text ?? "[]") as PageManifestEntry[];
    const books = buildShelf(written, { books: [], placements: [] });
    const neural = books.find(book => book.key === "the neural mind");
    expect(neural?.links).toHaveLength(1);
    expect(neural?.links[0]).toMatchObject({ toId: "note-b", toLabel: "Atomic Habits", toTitle: "Habits" });
  });

  it("rejects a manifest write that still carries the sha from before the page write", async () => {
    const store = memoryGithub(
      {
        "_curator/pending-proposals.json": { sha: "p1", text: JSON.stringify([proposal()]) },
        "_curator/dismissed.json": { sha: "d1", text: "[]" },
        "pages/note-a.json": { sha: "a1", text: JSON.stringify(page("note-a")) },
        "pages/note-b.json": { sha: "b1", text: JSON.stringify(page("note-b")) },
        "manifest.json": { sha: "m1", text: JSON.stringify(manifest()) },
      },
      { bumpOnPageWrite: true },
    );
    await applyCuratorAction({
      action: "approve",
      id: "note-a||note-b",
      env,
      fetchImpl: store.fetchImpl,
    });
    expect(store.files.get("manifest.json")?.sha.startsWith("next-")).toBe(true);
    const pending = JSON.parse(store.files.get("_curator/pending-proposals.json")?.text ?? "[]");
    expect(pending).toEqual([]);
  });

  it("surfaces a stale manifest sha as a 409", async () => {
    const store = memoryGithub(
      {
        "_curator/pending-proposals.json": { sha: "p1", text: JSON.stringify([proposal()]) },
        "_curator/dismissed.json": { sha: "d1", text: "[]" },
        "pages/note-a.json": { sha: "a1", text: JSON.stringify(page("note-a")) },
        "pages/note-b.json": { sha: "b1", text: JSON.stringify(page("note-b")) },
        "manifest.json": { sha: "m1", text: JSON.stringify(manifest()) },
      },
      { conflictManifest: true },
    );
    await expect(
      applyCuratorAction({
        action: "approve",
        id: "note-a||note-b",
        env,
        fetchImpl: store.fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 409, message: "save collided, try again" });
  });

  it("unlinks an auto-approved pair and remembers the dismissal", async () => {
    const store = memoryGithub({
      "_curator/pending-proposals.json": { sha: "p1", text: "[]" },
      "_curator/dismissed.json": { sha: "d1", text: "[]" },
      "_curator/auto-approved.json": {
        sha: "u1",
        text: JSON.stringify([
          {
            noteA: "note-a",
            noteB: "note-b",
            titleA: "Basal ganglia",
            titleB: "Habits",
            bookA: "The Neural Mind",
            bookB: "Atomic Habits",
            relation: "builds-on",
            rationale: "striatum",
            confidence: 0.91,
            approvedAt: "2026-10-03T00:00:00.000Z",
          },
        ]),
      },
      "pages/note-a.json": { sha: "a1", text: JSON.stringify(page("note-a", ["note-b"])) },
      "pages/note-b.json": { sha: "b1", text: JSON.stringify(page("note-b", ["note-a"])) },
      "manifest.json": { sha: "m1", text: JSON.stringify(manifest(["note-b"], ["note-a"])) },
    });
    const result = await applyCuratorAction({
      action: "unlink",
      id: "note-a||note-b",
      env,
      fetchImpl: store.fetchImpl,
      nowIso: () => "2026-10-03T01:00:00.000Z",
    });
    expect(result.autoApproved).toEqual([]);
    const dismissed = JSON.parse(store.files.get("_curator/dismissed.json")?.text ?? "[]");
    expect(dismissed).toEqual([{ noteA: "note-a", noteB: "note-b", dismissedAt: "2026-10-03T01:00:00.000Z" }]);
    const written = JSON.parse(store.files.get("manifest.json")?.text ?? "[]") as PageManifestEntry[];
    const books = buildShelf(written, { books: [], placements: [] });
    expect(books.find(book => book.key === "the neural mind")?.links).toEqual([]);
    const again = await runCrossBookSafe(dismissed);
    expect(again).toBe(true);
  });
});

async function runCrossBookSafe(dismissed: { noteA: string; noteB: string; dismissedAt: string }[]) {
  const { runCrossBook } = await import("./crossBook");
  const result = await runCrossBook({
    notes: [
      {
        id: "note-a",
        title: "Basal ganglia",
        body: "striatum",
        excerpt: "striatum",
        connected: [],
        book: "The Neural Mind",
      },
      {
        id: "note-b",
        title: "Habits",
        body: "striatum",
        excerpt: "striatum",
        connected: [],
        book: "Atomic Habits",
      },
    ],
    pending: [],
    dismissed,
    now: () => "2026-10-03T02:00:00.000Z",
    judge: async () => {
      throw new Error("dismissed pairs must not be judged");
    },
  });
  expect(result.pairsJudged).toBe(0);
  return true;
}

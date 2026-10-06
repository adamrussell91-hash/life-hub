import { describe, expect, it } from "vitest";
import { catalogueHealth, CATALOGUE_STALE_MS, parseDelta, parseState } from "./catalogue";
import { loadCorpusCached, resetCorpusCache } from "./corpusCache";
import { CATALOGUE_BATCH, CATALOGUE_FOLD_AT, runCatalogueSync, type CatalogueStore } from "./catalogueSync";
import { packVectorIndex } from "./vectorPack";
import { unpackVectorIndex } from "./vectorPack";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function memoryStore(seed: Record<string, string> = {}) {
  const data = new Map<string, string | Uint8Array>(Object.entries(seed));
  const store: CatalogueStore = {
    get: async key => {
      const value = data.get(key);
      if (value === undefined) return null;
      return {
        text: async () => (typeof value === "string" ? value : new TextDecoder().decode(value)),
        arrayBuffer: async () => {
          const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        },
      };
    },
    put: async (key, value) => {
      data.set(key, typeof value === "string" ? value : new Uint8Array(value as ArrayBuffer));
    },
    delete: async key => data.delete(key),
  };
  return { store, data, json: (key: string) => JSON.parse(String(data.get(key))) };
}

function page(id: string, title = id, tags: string[] = []) {
  return {
    id,
    title,
    area: "notes",
    tags,
    connected: [],
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    body: `# ${title}\n\nBody of ${id}.`,
    attachments: [],
  };
}

function contents(value: unknown) {
  const text = JSON.stringify(value);
  return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: btoa(text), size: text.length }));
}

/** A fake GitHub data repo: a head sha, a compare result, a manifest and page files. */
function github(repo: { head: string; compare?: Record<string, string[]>; manifest?: unknown[]; pages: Record<string, unknown> }) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string) => {
    const url = String(input);
    calls.push(url.replace("https://api.github.com/repos/o/r", ""));
    if (url.endsWith("/commits/HEAD")) return new Response(repo.head);
    const compare = url.match(/\/compare\/(\w+)\.\.\.(\w+)$/);
    if (compare) {
      const files = repo.compare?.[compare[1]!];
      if (!files) return new Response("", { status: 404 });
      return Response.json({ files: files.map(filename => ({ filename })) });
    }
    const file = decodeURIComponent(url.split("/contents/")[1] ?? "");
    if (file === "manifest.json") return repo.manifest ? contents(repo.manifest) : new Response("", { status: 404 });
    if (file in repo.pages) return contents(repo.pages[file]);
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const embed = async (texts: string[]) => texts.map((_, i) => [i + 1, 0]);
const at = (iso: string) => () => new Date(iso);

describe("runCatalogueSync", () => {
  it("bootstraps from the live manifest: queues missing and retagged notes, drops deleted ones", async () => {
    const { store, json, data } = memoryStore({
      "research/manifest.json": JSON.stringify([
        { id: "same", title: "Same", tags: ["a"], excerpt: "" },
        { id: "retagged", title: "Retagged", tags: ["old"], excerpt: "" },
        { id: "deleted", title: "Deleted", tags: [], excerpt: "" },
      ]),
    });
    const gh = github({
      head: SHA_A,
      manifest: [
        { id: "same", title: "Same", tags: ["a"] },
        { id: "retagged", title: "Retagged", tags: ["new"] },
        { id: "fresh", title: "Fresh", tags: [] },
      ],
      pages: {
        "pages/retagged.json": page("retagged", "Retagged", ["new"]),
        "pages/fresh.json": page("fresh", "Fresh"),
      },
    });

    const result = await runCatalogueSync({ store, repo: "o/r", token: "t", embed, fetchImpl: gh.fetchImpl, now: at("2026-10-03T10:00:00Z") });

    expect(result).toMatchObject({ catalogued: 2, removed: 1 });
    expect(result.state).toMatchObject({ headSha: SHA_A, pending: [], caughtUpAt: "2026-10-03T10:00:00.000Z" });
    const delta = parseDelta(String(data.get("research/delta/manifest.json")));
    expect(delta.rows.map(row => [row.id, row.tags])).toEqual([["retagged", ["new"]], ["fresh", []]]);
    expect(delta.removed).toEqual(["deleted"]);
    const vectors = unpackVectorIndex(json("research/delta/index-meta.json"), (await (await store.get("research/delta/vectors.bin"))!.arrayBuffer()));
    expect(vectors.map(entry => entry.pageId)).toEqual(["retagged", "fresh"]);
    expect(json("research/pages/fresh.json").title).toBe("Fresh");
  });

  it("does nothing but one head check when the archive hasn't changed", async () => {
    const { store } = memoryStore({
      "research/catalogue-state.json": JSON.stringify({ headSha: SHA_A, pending: [], caughtUpAt: "2026-10-03T09:00:00.000Z" }),
    });
    const gh = github({ head: SHA_A, pages: {} });
    const result = await runCatalogueSync({ store, repo: "o/r", token: "t", embed, fetchImpl: gh.fetchImpl, now: at("2026-10-03T10:00:00Z") });
    expect(gh.calls).toEqual(["/commits/HEAD"]);
    expect(result.state.caughtUpAt).toBe("2026-10-03T10:00:00.000Z");
  });

  it("catalogues only the page files changed since the last commit it saw", async () => {
    const { store, data } = memoryStore({
      "research/catalogue-state.json": JSON.stringify({ headSha: SHA_A, pending: [] }),
    });
    const gh = github({
      head: SHA_B,
      compare: { [SHA_A]: ["pages/new.json", "manifest.json", "README.md"] },
      pages: { "pages/new.json": page("new", "New note") },
    });
    const result = await runCatalogueSync({ store, repo: "o/r", token: "t", embed, fetchImpl: gh.fetchImpl });
    expect(result.catalogued).toBe(1);
    expect(gh.calls).not.toContain("/contents/manifest.json");
    expect(parseDelta(String(data.get("research/delta/manifest.json"))).rows.map(row => row.id)).toEqual(["new"]);
    expect(parseState(String(data.get("research/catalogue-state.json"))).headSha).toBe(SHA_B);
  });

  it("works through a backlog a batch at a time, staying under the free plan's request cap", async () => {
    const ids = Array.from({ length: CATALOGUE_BATCH + 5 }, (_, i) => `p${i}`);
    const { store } = memoryStore({ "research/manifest.json": "[]" });
    const gh = github({
      head: SHA_A,
      manifest: ids.map(id => ({ id, title: id, tags: [] })),
      pages: Object.fromEntries(ids.map(id => [`pages/${id}.json`, page(id)])),
    });
    let embedCalls = 0;
    const counting = async (texts: string[]) => {
      embedCalls++;
      return embed(texts);
    };

    const first = await runCatalogueSync({ store, repo: "o/r", token: "t", embed: counting, fetchImpl: gh.fetchImpl });
    expect(first.catalogued).toBe(CATALOGUE_BATCH);
    expect(first.state.pending).toHaveLength(5);
    expect(first.state.caughtUpAt).toBeUndefined();
    expect(gh.calls.length + embedCalls).toBeLessThan(50);

    const second = await runCatalogueSync({ store, repo: "o/r", token: "t", embed: counting, fetchImpl: gh.fetchImpl });
    expect(second.catalogued).toBe(5);
    expect(second.state.pending).toEqual([]);
    expect(second.state.caughtUpAt).toBeDefined();
  });

  it("keeps the last good commit and queue, and records the error, when a run fails", async () => {
    const before = { headSha: SHA_A, pending: ["p1"], caughtUpAt: "2026-10-01T00:00:00.000Z" };
    const { store, json } = memoryStore({ "research/catalogue-state.json": JSON.stringify(before) });
    const gh = github({ head: SHA_B, compare: { [SHA_A]: ["pages/p2.json"] }, pages: { "pages/p1.json": page("p1") } });
    const failing = async () => {
      throw new Error("Embeddings API error 500");
    };
    await expect(runCatalogueSync({ store, repo: "o/r", token: "t", embed: failing, fetchImpl: gh.fetchImpl })).rejects.toThrow("500");
    expect(json("research/catalogue-state.json")).toMatchObject({ ...before, lastError: "Embeddings API error 500" });
  });

  it("still catalogues rows for lexical search when no embeddings key is bound", async () => {
    const { store, data } = memoryStore({ "research/catalogue-state.json": JSON.stringify({ headSha: SHA_A, pending: [] }) });
    const gh = github({ head: SHA_B, compare: { [SHA_A]: ["pages/n.json"] }, pages: { "pages/n.json": page("n") } });
    await runCatalogueSync({ store, repo: "o/r", token: "t", embed: null, fetchImpl: gh.fetchImpl });
    expect(parseDelta(String(data.get("research/delta/manifest.json"))).rows.map(row => row.id)).toEqual(["n"]);
    expect(data.has("research/delta/vectors.bin")).toBe(false);
  });
});

describe("folding the delta into a new base", () => {
  it("folds once the delta is big enough, and readers follow the new base", async () => {
    const legacy = packVectorIndex([
      { pageId: "keep", title: "Keep", vector: [9, 9] },
      { pageId: "gone", title: "Gone", vector: [8, 8] },
    ]);
    const ids = Array.from({ length: CATALOGUE_FOLD_AT }, (_, i) => `n${i}`);
    const { store, data } = memoryStore({
      "research/manifest.json": JSON.stringify([
        { id: "keep", title: "Keep", tags: [], excerpt: "" },
        { id: "gone", title: "Gone", tags: [], excerpt: "" },
      ]),
      "research/index-meta.json": JSON.stringify(legacy.meta),
    });
    data.set("research/vectors.bin", legacy.bytes);
    const gh = github({
      head: SHA_A,
      manifest: [{ id: "keep", title: "Keep", tags: [] }, ...ids.map(id => ({ id, title: id, tags: [] }))],
      pages: Object.fromEntries(ids.map(id => [`pages/${id}.json`, page(id)])),
    });

    let runs = 0;
    let state;
    do {
      ({ state } = await runCatalogueSync({ store, repo: "o/r", token: "t", embed, fetchImpl: gh.fetchImpl, now: at(`2026-10-03T10:${String(runs).padStart(2, "0")}:00Z`) }));
      runs++;
    } while (state.pending.length && runs < 50);

    const delta = parseDelta(String(data.get("research/delta/manifest.json")));
    expect(delta.base).toMatch(/^\d{14}$/);
    expect(delta.rows.length + delta.removed.length).toBeLessThan(CATALOGUE_FOLD_AT);
    // The script-built base is left alone.
    expect(data.has("research/vectors.bin")).toBe(true);

    resetCorpusCache();
    const loader = {
      text: async (key: string) => (await store.get(key))?.text() ?? null,
      bytes: async (key: string) => (await store.get(key))?.arrayBuffer() ?? null,
    };
    const corpus = await loadCorpusCached(loader);
    const manifestIds = corpus.manifest.map(doc => doc.id);
    expect(manifestIds).toContain("keep");
    expect(manifestIds).not.toContain("gone");
    expect(manifestIds.filter(id => id.startsWith("n"))).toHaveLength(CATALOGUE_FOLD_AT);
    expect(corpus.index.map(entry => entry.pageId).sort()).toEqual(["keep", ...ids].sort());
  });
});

describe("catalogueHealth", () => {
  it("is stale when never synced or not caught up for a day", () => {
    const now = Date.parse("2026-10-03T10:00:00Z");
    expect(catalogueHealth(null, now).stale).toBe(true);
    expect(catalogueHealth({ pending: [], caughtUpAt: "2026-10-03T09:00:00Z" }, now).stale).toBe(false);
    expect(catalogueHealth({ pending: ["x"], caughtUpAt: new Date(now - CATALOGUE_STALE_MS - 1).toISOString() }, now)).toMatchObject({
      stale: true,
      pending: 1,
    });
  });
});

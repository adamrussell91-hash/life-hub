import { describe, expect, it } from "vitest";
import { packVectorIndex } from "./vectorPack";
import { DELTA_TTL_MS, loadCorpusCached, resetCorpusCache } from "./corpusCache";

describe("loadCorpusCached", () => {
  it("reads the base and delta from R2 once, then reuses memory", async () => {
    resetCorpusCache();
    const packed = packVectorIndex([{ pageId: "p1", title: "T", vector: [1, 0] }]);
    const reads: string[] = [];
    const loader = {
      text: async (key: string) => {
        reads.push(key);
        if (key === "research/index-meta.json") return JSON.stringify(packed.meta);
        if (key === "research/manifest.json")
          return JSON.stringify([{ id: "p1", title: "T", excerpt: "e", tags: [], area: "notes", path: "pages/p1.json" }]);
        return null;
      },
      bytes: async (key: string) => {
        reads.push(key);
        if (key === "research/vectors.bin") return packed.bytes.buffer.slice(packed.bytes.byteOffset, packed.bytes.byteOffset + packed.bytes.byteLength);
        return null;
      },
    };
    const first = await loadCorpusCached(loader);
    const second = await loadCorpusCached(loader);
    expect(reads.sort()).toEqual([
      "research/delta/index-meta.json",
      "research/delta/manifest.json",
      "research/delta/vectors.bin",
      "research/index-meta.json",
      "research/manifest.json",
      "research/vectors.bin",
    ]);
    expect(first.index).toHaveLength(1);
    expect(Array.from(first.index[0]?.vector ?? [])).toEqual([1, 0]);
    expect(second.manifest[0]?.id).toBe("p1");
  });

  it("lays the hourly delta over the base and re-reads only the delta after its TTL", async () => {
    resetCorpusCache();
    const base = packVectorIndex([
      { pageId: "old", title: "Old", vector: [1, 0] },
      { pageId: "gone", title: "Gone", vector: [0, 1] },
    ]);
    const fresh = packVectorIndex([{ pageId: "old", title: "Old (tidied)", vector: [0.5, 0.5] }]);
    let deltaRows: unknown = { rows: [], removed: [] };
    const reads: string[] = [];
    const buf = (pack: { bytes: Uint8Array }) =>
      pack.bytes.buffer.slice(pack.bytes.byteOffset, pack.bytes.byteOffset + pack.bytes.byteLength) as ArrayBuffer;
    const loader = {
      text: async (key: string) => {
        reads.push(key);
        if (key === "research/index-meta.json") return JSON.stringify(base.meta);
        if (key === "research/manifest.json")
          return JSON.stringify([
            { id: "old", title: "Old", excerpt: "e" },
            { id: "gone", title: "Gone", excerpt: "e" },
          ]);
        if (key === "research/delta/manifest.json") return JSON.stringify(deltaRows);
        if (key === "research/delta/index-meta.json") return JSON.stringify(fresh.meta);
        return null;
      },
      bytes: async (key: string) => {
        reads.push(key);
        if (key === "research/vectors.bin") return buf(base);
        if (key === "research/delta/vectors.bin") return buf(fresh);
        return null;
      },
    };

    const first = await loadCorpusCached(loader, 0);
    expect(first.manifest.map(doc => doc.title)).toEqual(["Old", "Gone"]);
    expect(Array.from(first.index.find(entry => entry.pageId === "old")?.vector ?? [])).toEqual([0.5, 0.5]);

    deltaRows = {
      rows: [
        { id: "old", title: "Old (tidied)", excerpt: "e", path: "pages/old.json" },
        { id: "new", title: "New", excerpt: "e", path: "pages/new.json" },
      ],
      removed: ["gone"],
    };
    const cached = await loadCorpusCached(loader, DELTA_TTL_MS - 1);
    expect(cached.manifest.map(doc => doc.id)).toEqual(["old", "gone"]);

    reads.length = 0;
    const later = await loadCorpusCached(loader, DELTA_TTL_MS + 1);
    expect(reads.every(key => key.startsWith("research/delta/"))).toBe(true);
    expect(later.manifest.map(doc => doc.title)).toEqual(["Old (tidied)", "New"]);
    expect(later.index.map(entry => entry.pageId)).toEqual(["old"]);
  });
});

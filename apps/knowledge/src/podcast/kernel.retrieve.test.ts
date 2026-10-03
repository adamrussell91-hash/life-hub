import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCorpusCache } from "../research/corpusCache";
import { packVectorIndex } from "../research/vectorPack";
import { retrievePodcastNotes, type PodcastKernelEnv } from "./kernel";

function archive(files: Record<string, string | Uint8Array>): PodcastKernelEnv["ARCHIVE"] {
  return {
    get: async key => {
      const value = files[key];
      if (value === undefined) return null;
      return {
        text: async () => String(value),
        arrayBuffer: async () => {
          const bytes = value as Uint8Array;
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        },
      };
    },
    put: async () => undefined,
  };
}

function env(): PodcastKernelEnv {
  const packed = packVectorIndex([{ pageId: "old", title: "Neural old", vector: [1, 0] }]);
  return {
    ANTHROPIC_API_KEY: "k",
    GITHUB_DATA_REPO: "o/r",
    GITHUB_DATA_REPO_TOKEN: "t",
    ARCHIVE: archive({
      "research/manifest.json": JSON.stringify([{ id: "old", title: "Neural old", excerpt: "neural mind notes" }]),
      "research/index-meta.json": JSON.stringify(packed.meta),
      "research/vectors.bin": packed.bytes,
    }),
  };
}

describe("retrievePodcastNotes with asked-for pages", () => {
  const githubReads: string[] = [];

  beforeEach(() => {
    resetCorpusCache();
    githubReads.length = 0;
    vi.stubGlobal("fetch", async (input: string) => {
      const id = String(input).match(/pages\/(.+)\.json$/)?.[1] ?? "";
      githubReads.push(id);
      if (id === "deleted") return new Response("", { status: 404 });
      return Response.json({ id, title: `Note ${id}`, body: `# Note\n\nBody of ${id}.`, source_notion_url: "" });
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads notes the catalogue hasn't caught yet straight from the archive", async () => {
    const notes = await retrievePodcastNotes(env(), "The Neural Mind", undefined, ["fresh1", "fresh2"], 12);
    expect(notes.map(note => note.pageId)).toEqual(["fresh1", "fresh2"]);
    expect(notes[0]?.title).toBe("Note fresh1");
    expect(githubReads).toEqual(["fresh1", "fresh2"]);
  });

  it("keeps catalogued notes first, then the rest, skipping pages that no longer exist", async () => {
    const notes = await retrievePodcastNotes(env(), "neural mind", undefined, ["deleted", "fresh", "old"], 12);
    expect(notes.map(note => note.pageId)).toEqual(["old", "fresh"]);
  });

  it("respects the note limit", async () => {
    const notes = await retrievePodcastNotes(env(), "neural", undefined, ["old", "a", "b", "c"], 2);
    expect(notes.map(note => note.pageId)).toEqual(["old", "a"]);
  });
});

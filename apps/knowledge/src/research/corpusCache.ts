import type { LexicalDoc } from "../lib/lexicalRetrieve";
import {
  CATALOGUE_DELTA_KEY,
  CATALOGUE_DELTA_META_KEY,
  CATALOGUE_DELTA_VECTORS_KEY,
  baseKeys,
  mergeCatalogue,
  parseDelta,
} from "./catalogue";
import type { VectorDoc } from "./hybridRetrieve";
import { unpackVectorIndex } from "./vectorPack";

export const RESEARCH_VECTORS_KEY = "research/vectors.bin";
export const RESEARCH_INDEX_META_KEY = "research/index-meta.json";
export const RESEARCH_MANIFEST_KEY = "research/manifest.json";

/** How long an isolate trusts its copy of the hourly delta before re-reading it. */
export const DELTA_TTL_MS = 5 * 60 * 1000;

export type ResearchCorpus = {
  index: VectorDoc[];
  manifest: LexicalDoc[];
};

export type CorpusLoader = {
  text: (key: string) => Promise<string | null>;
  bytes: (key: string) => Promise<ArrayBuffer | null>;
};

type ManifestRow = LexicalDoc & { path?: string; pageId?: string };

type Delta = { rows: LexicalDoc[]; removed: string[]; index: VectorDoc[]; base?: string };

let base: { version?: string; corpus: ResearchCorpus } | null = null;
let delta: { value: Delta; loadedAt: number } | null = null;

export function resetCorpusCache() {
  base = null;
  delta = null;
}

function toLexical(rows: ManifestRow[]): LexicalDoc[] {
  return rows.map(row => ({
    id: row.id ?? row.pageId ?? "",
    title: row.title,
    excerpt: row.excerpt,
    tags: row.tags,
    area: row.area,
  }));
}

/** Read once per isolate, and again only when the sync folds the delta into a new base. */
async function loadBase(loader: CorpusLoader, version?: string): Promise<ResearchCorpus> {
  if (base && base.version === version) return base.corpus;
  const keys = baseKeys(version);
  const [metaRaw, manifestRaw, vectorBytes] = await Promise.all([
    loader.text(keys.meta),
    loader.text(keys.manifest),
    loader.bytes(keys.vectors),
  ]);
  if (!metaRaw || !manifestRaw || !vectorBytes) {
    throw new Error(`Research corpus missing from R2 (${keys.vectors}, ${keys.meta}, ${keys.manifest})`);
  }
  const meta = JSON.parse(metaRaw) as { pageId: string; title: string }[];
  const corpus = {
    index: unpackVectorIndex(meta, vectorBytes),
    manifest: toLexical(JSON.parse(manifestRaw) as ManifestRow[]),
  };
  base = { version, corpus };
  return corpus;
}

async function loadDelta(loader: CorpusLoader, now: number): Promise<Delta> {
  if (delta && now - delta.loadedAt < DELTA_TTL_MS) return delta.value;
  const [rowsRaw, metaRaw, vectorBytes] = await Promise.all([
    loader.text(CATALOGUE_DELTA_KEY),
    loader.text(CATALOGUE_DELTA_META_KEY),
    loader.bytes(CATALOGUE_DELTA_VECTORS_KEY),
  ]);
  const parsed = parseDelta(rowsRaw);
  let index: VectorDoc[] = [];
  if (metaRaw && vectorBytes) {
    try {
      index = unpackVectorIndex(JSON.parse(metaRaw) as { pageId: string; title: string }[], vectorBytes);
    } catch {
      // A half-written delta pack: keep the rows, search them lexically.
    }
  }
  const value = { rows: toLexical(parsed.rows), removed: parsed.removed, index, base: parsed.base };
  delta = { value, loadedAt: now };
  return value;
}

/** The base corpus (read once per isolate) with the latest hourly delta laid over it. */
export async function loadCorpusCached(loader: CorpusLoader, now = Date.now()): Promise<ResearchCorpus> {
  const latest = await loadDelta(loader, now);
  return mergeCatalogue(await loadBase(loader, latest.base), latest);
}

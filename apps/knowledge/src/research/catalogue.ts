import type { Page } from "../domain/page";
import type { LexicalDoc } from "../lib/lexicalRetrieve";
import type { VectorDoc } from "./hybridRetrieve";

/**
 * The research catalogue is the Worker's searchable copy of the knowledge
 * archive in R2. The base (research/manifest.json + vectors.bin) is a full
 * build from scripts/sync-research-r2.ts. The hourly sync never rewrites that
 * 20+ MB base: it writes only new and changed notes into a small delta, and
 * readers lay the delta over the base.
 */

export const CATALOGUE_DELTA_KEY = "research/delta/manifest.json";
export const CATALOGUE_DELTA_META_KEY = "research/delta/index-meta.json";
export const CATALOGUE_DELTA_VECTORS_KEY = "research/delta/vectors.bin";
export const CATALOGUE_STATE_KEY = "research/catalogue-state.json";

/** The warning on the Podcast page fires once the catalogue is this far behind. */
export const CATALOGUE_STALE_MS = 24 * 60 * 60 * 1000;

export type CatalogueRow = LexicalDoc & {
  path: string;
  origins?: Page["origins"];
};

/** New and changed notes since the base build, and notes deleted since then. */
export type CatalogueDelta = {
  rows: CatalogueRow[];
  removed: string[];
  /** Which base this delta sits over: a folded base under research/base/<v>/, or the script-built one. */
  base?: string;
  /** The base before that, kept one fold longer for readers still holding the old pointer. */
  retired?: string;
};

export type BaseKeys = { manifest: string; meta: string; vectors: string };

/** The script-built base lives at the legacy keys; a folded base under its own version prefix. */
export function baseKeys(version?: string): BaseKeys {
  if (!version) {
    return { manifest: "research/manifest.json", meta: "research/index-meta.json", vectors: "research/vectors.bin" };
  }
  const prefix = `research/base/${version}`;
  return { manifest: `${prefix}/manifest.json`, meta: `${prefix}/index-meta.json`, vectors: `${prefix}/vectors.bin` };
}

export type CatalogueState = {
  /** Data-repo commit the queue was last brought up to. */
  headSha?: string;
  /** Page ids still to catalogue, oldest first. */
  pending: string[];
  /** Last time a run finished with nothing left to catalogue. */
  caughtUpAt?: string;
  lastRunAt?: string;
  lastError?: string;
};

export type CatalogueHealth = {
  stale: boolean;
  pending: number;
  caughtUpAt?: string;
  lastError?: string;
};

export const emptyDelta = (): CatalogueDelta => ({ rows: [], removed: [] });
export const emptyState = (): CatalogueState => ({ pending: [] });

/** The excerpt the vector index embeds and the lexical search reads. */
export function indexExcerpt(body: string) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

export function embeddingText(page: Pick<Page, "title" | "body">) {
  return `${page.title}\n\n${indexExcerpt(page.body)}`;
}

/** One catalogue row per page; the same shape sync-research-r2 writes. */
export function catalogueRow(page: Page): CatalogueRow {
  return {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt: page.body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 157),
    path: `pages/${page.id}.json`,
    ...(page.origins?.length ? { origins: page.origins } : {}),
  };
}

export function parseDelta(raw: string | null): CatalogueDelta {
  if (!raw) return emptyDelta();
  try {
    const value = JSON.parse(raw) as Partial<CatalogueDelta>;
    return {
      rows: Array.isArray(value.rows) ? value.rows.filter(row => typeof row?.id === "string") : [],
      removed: Array.isArray(value.removed) ? value.removed.filter((id): id is string => typeof id === "string") : [],
      ...(typeof value.base === "string" && /^[\w-]+$/.test(value.base) ? { base: value.base } : {}),
      ...(typeof value.retired === "string" && /^[\w-]+$/.test(value.retired) ? { retired: value.retired } : {}),
    };
  } catch {
    return emptyDelta();
  }
}

export function parseState(raw: string | null): CatalogueState {
  if (!raw) return emptyState();
  try {
    const value = JSON.parse(raw) as Partial<CatalogueState>;
    return {
      ...value,
      pending: Array.isArray(value.pending) ? value.pending.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return emptyState();
  }
}

/** Upserts changed rows and drops removed ones; a page that comes back is no longer removed. */
export function applyToDelta(delta: CatalogueDelta, upserts: CatalogueRow[], removed: string[]): CatalogueDelta {
  const touched = new Set([...upserts.map(row => row.id), ...removed]);
  const gone = new Set(removed);
  return {
    ...delta,
    rows: [...delta.rows.filter(row => !touched.has(row.id)), ...upserts],
    removed: [...new Set([...delta.removed.filter(id => !upserts.some(row => row.id === id)), ...gone])],
  };
}

/** Lays the delta over the base: delta rows and vectors win, removed pages disappear. */
export function mergeCatalogue<Row extends LexicalDoc>(
  base: { manifest: Row[]; index: VectorDoc[] },
  delta: { rows: Row[]; removed: string[]; index: VectorDoc[] },
): { manifest: Row[]; index: VectorDoc[] } {
  if (!delta.rows.length && !delta.removed.length && !delta.index.length) return base;
  const replaced = new Set([...delta.rows.map(row => row.id), ...delta.removed]);
  const revectored = new Set([...delta.index.map(entry => entry.pageId), ...delta.removed]);
  const removed = new Set(delta.removed);
  return {
    manifest: [
      ...base.manifest.filter(doc => !replaced.has(doc.id)),
      ...delta.rows.filter(row => !removed.has(row.id)),
    ],
    index: [
      ...base.index.filter(entry => !revectored.has(entry.pageId)),
      ...delta.index.filter(entry => !removed.has(entry.pageId)),
    ],
  };
}

export function catalogueHealth(state: CatalogueState | null, now: number): CatalogueHealth {
  const caughtUp = state?.caughtUpAt ? Date.parse(state.caughtUpAt) : NaN;
  return {
    stale: !Number.isFinite(caughtUp) || now - caughtUp > CATALOGUE_STALE_MS,
    pending: state?.pending.length ?? 0,
    ...(state?.caughtUpAt ? { caughtUpAt: state.caughtUpAt } : {}),
    ...(state?.lastError ? { lastError: state.lastError } : {}),
  };
}

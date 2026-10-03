import type { Page } from "../domain/page";
import { getContent } from "../tidy/githubContent";
import {
  CATALOGUE_DELTA_KEY,
  CATALOGUE_DELTA_META_KEY,
  CATALOGUE_DELTA_VECTORS_KEY,
  CATALOGUE_STATE_KEY,
  applyToDelta,
  baseKeys,
  catalogueRow,
  embeddingText,
  mergeCatalogue,
  parseDelta,
  parseState,
  type CatalogueDelta,
  type CatalogueRow,
  type CatalogueState,
} from "./catalogue";
import type { VectorDoc } from "./hybridRetrieve";
import { packVectorIndex, unpackVectorIndex } from "./vectorPack";

/**
 * One catalogue run. Sized for the Workers free plan (50 outbound requests
 * per invocation): a head check, at most 2 GitHub calls to find what changed,
 * BATCH page reads, and one embeddings call (plus one retry). Anything left
 * over waits for the next run.
 */
export const CATALOGUE_BATCH = 40;
/**
 * Once the delta holds this many notes, fold it into a new base so neither
 * the delta nor any one run's memory grows with the backlog.
 */
export const CATALOGUE_FOLD_AT = 400;
/** GitHub's compare endpoint lists at most 300 files; past that, diff the manifest. */
const COMPARE_FILE_CAP = 300;
const GITHUB = "https://api.github.com";
const PAGE_FILE = /^pages\/([A-Za-z0-9][A-Za-z0-9._-]{0,120})\.json$/;

export type CatalogueStore = {
  get: (key: string) => Promise<{ text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer> } | null>;
  put: (key: string, value: string | ArrayBuffer | Uint8Array) => Promise<unknown>;
  delete?: (key: string) => Promise<unknown>;
};

export type CatalogueSyncDeps = {
  store: CatalogueStore;
  repo: string;
  token: string;
  /** Embeds texts in one call; null when no embeddings key is bound (rows stay lexical-only). */
  embed: ((texts: string[]) => Promise<number[][]>) | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  batch?: number;
};

export type CatalogueRunResult = {
  state: CatalogueState;
  catalogued: number;
  removed: number;
};

async function text(store: CatalogueStore, key: string) {
  const object = await store.get(key);
  return object ? object.text() : null;
}

function ghHeaders(token: string, accept = "application/vnd.github+json") {
  return { accept, authorization: `Bearer ${token}`, "user-agent": "life-hub-knowledge-worker" };
}

async function headSha(deps: CatalogueSyncDeps, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${GITHUB}/repos/${deps.repo}/commits/HEAD`, {
    headers: ghHeaders(deps.token, "application/vnd.github.sha"),
  });
  if (!response.ok) throw new Error(`GitHub head check failed (${response.status})`);
  const sha = (await response.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GitHub head check returned no commit");
  return sha;
}

/** Page ids touched between two commits, or null when GitHub can't list them all. */
async function changedSince(deps: CatalogueSyncDeps, fetchImpl: typeof fetch, from: string, to: string) {
  const response = await fetchImpl(`${GITHUB}/repos/${deps.repo}/compare/${from}...${to}`, {
    headers: ghHeaders(deps.token),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub compare failed (${response.status})`);
  const payload = (await response.json()) as { files?: { filename?: string; previous_filename?: string }[] };
  const files = payload.files ?? [];
  if (files.length >= COMPARE_FILE_CAP) return null;
  const ids: string[] = [];
  for (const file of files) {
    for (const name of [file.filename, file.previous_filename]) {
      const id = name?.match(PAGE_FILE)?.[1];
      if (id) ids.push(id);
    }
  }
  return ids;
}

type ManifestRow = { id?: unknown; title?: unknown; tags?: unknown };

const tagKey = (tags: unknown) =>
  Array.isArray(tags) ? tags.filter(tag => typeof tag === "string").sort().join("\n") : "";

/**
 * Full reconcile against the live manifest: notes the catalogue lacks, notes
 * whose title or tags changed, and catalogue notes the archive no longer has.
 */
async function diffAgainstManifest(deps: CatalogueSyncDeps, fetchImpl: typeof fetch) {
  const live = await getContent(deps.repo, deps.token, "manifest.json", fetchImpl);
  if (!live) throw new Error("Knowledge manifest is missing from the data repo");
  const raw = JSON.parse(live.text) as unknown;
  const liveRows = (Array.isArray(raw) ? raw : ((raw as { pages?: unknown[] })?.pages ?? [])) as ManifestRow[];

  const delta = parseDelta(await text(deps.store, CATALOGUE_DELTA_KEY));
  const baseRows = JSON.parse((await text(deps.store, baseKeys(delta.base).manifest)) ?? "[]") as CatalogueRow[];
  const known = new Map(
    mergeCatalogue({ manifest: baseRows, index: [] }, { ...delta, index: [] }).manifest.map(doc => [doc.id, doc]),
  );

  const liveIds = new Set<string>();
  const queue: string[] = [];
  for (const row of liveRows) {
    if (typeof row.id !== "string") continue;
    liveIds.add(row.id);
    const have = known.get(row.id);
    if (!have || have.title !== row.title || tagKey(have.tags) !== tagKey(row.tags)) queue.push(row.id);
  }
  const removed = [...known.keys()].filter(id => !liveIds.has(id));
  return { queue, removed };
}

async function readPage(deps: CatalogueSyncDeps, fetchImpl: typeof fetch, id: string): Promise<Page | null> {
  const file = await getContent(deps.repo, deps.token, `pages/${id}.json`, fetchImpl);
  if (!file) return null;
  const page = JSON.parse(file.text) as Page;
  return page && typeof page.id === "string" && typeof page.title === "string"
    ? { ...page, body: typeof page.body === "string" ? page.body : "", tags: Array.isArray(page.tags) ? page.tags : [] }
    : null;
}

async function readIndex(store: CatalogueStore, metaKey: string, vectorsKey: string): Promise<VectorDoc[]> {
  const [metaRaw, bytes] = await Promise.all([
    text(store, metaKey),
    store.get(vectorsKey).then(object => (object ? object.arrayBuffer() : null)),
  ]);
  if (!metaRaw || !bytes) return [];
  try {
    return unpackVectorIndex(JSON.parse(metaRaw) as { pageId: string; title: string }[], bytes);
  } catch {
    return [];
  }
}

const readDeltaIndex = (store: CatalogueStore) => readIndex(store, CATALOGUE_DELTA_META_KEY, CATALOGUE_DELTA_VECTORS_KEY);

/**
 * Folds the delta into a new versioned base, then points the delta at it in a
 * single write. Readers holding the old base keep working until they see the
 * new pointer; nobody reads a half-written base.
 */
async function foldDelta(store: CatalogueStore, delta: CatalogueDelta, version: string) {
  const from = baseKeys(delta.base);
  const baseRows = JSON.parse((await text(store, from.manifest)) ?? "[]") as CatalogueRow[];
  const merged = mergeCatalogue(
    { manifest: baseRows, index: await readIndex(store, from.meta, from.vectors) },
    { rows: delta.rows, removed: delta.removed, index: await readDeltaIndex(store) },
  );
  const to = baseKeys(version);
  if (merged.index.length) {
    const packed = packVectorIndex(merged.index);
    await store.put(to.vectors, packed.bytes);
    await store.put(to.meta, JSON.stringify(packed.meta));
  } else {
    await store.put(to.meta, "[]");
  }
  await store.put(to.manifest, JSON.stringify(merged.manifest));
  const next: CatalogueDelta = { rows: [], removed: [], base: version, ...(delta.base ? { retired: delta.base } : {}) };
  await store.put(CATALOGUE_DELTA_KEY, JSON.stringify(next));
  await store.put(CATALOGUE_DELTA_META_KEY, "[]");
  await store.delete?.(CATALOGUE_DELTA_VECTORS_KEY);
  // The script-built base stays put (a full rebuild writes there). The base
  // two folds back goes; the one just replaced waits a fold for slow readers.
  if (delta.retired) for (const key of Object.values(baseKeys(delta.retired))) await store.delete?.(key);
}

const queueOnce = (pending: string[], ids: string[]) => [...new Set([...pending, ...ids])];

export async function runCatalogueSync(deps: CatalogueSyncDeps): Promise<CatalogueRunResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const batch = deps.batch ?? CATALOGUE_BATCH;
  const previous = parseState(await text(deps.store, CATALOGUE_STATE_KEY));
  let state: CatalogueState = { ...previous, lastRunAt: now().toISOString() };
  let removedIds: string[] = [];

  try {
    const head = await headSha(deps, fetchImpl);
    if (head !== state.headSha) {
      const changed = state.headSha ? await changedSince(deps, fetchImpl, state.headSha, head) : null;
      if (changed) {
        state = { ...state, pending: queueOnce(state.pending, changed), headSha: head };
      } else {
        const diff = await diffAgainstManifest(deps, fetchImpl);
        state = { ...state, pending: queueOnce(state.pending, diff.queue), headSha: head };
        removedIds = diff.removed;
      }
    }

    const ids = state.pending.slice(0, batch);
    const pages: Page[] = [];
    for (const id of ids) {
      const page = await readPage(deps, fetchImpl, id);
      if (page) pages.push(page);
      else removedIds.push(id);
    }

    const vectors = pages.length && deps.embed ? await deps.embed(pages.map(embeddingText)) : null;
    if (vectors && vectors.length !== pages.length) throw new Error("Embeddings returned the wrong number of vectors");

    if (pages.length || removedIds.length) {
      const rows = pages.map(catalogueRow);
      for (const page of pages) await deps.store.put(`research/pages/${page.id}.json`, JSON.stringify(page));
      const delta = applyToDelta(parseDelta(await text(deps.store, CATALOGUE_DELTA_KEY)), rows, removedIds);

      const touched = new Set([...pages.map(page => page.id), ...removedIds]);
      const kept = (await readDeltaIndex(deps.store)).filter(entry => !touched.has(entry.pageId));
      const fresh = vectors ? pages.map((page, i) => ({ pageId: page.id, title: page.title, vector: vectors[i]! })) : [];
      const index = [...kept, ...fresh];

      // Vectors first, rows last: a reader never sees rows whose vectors are missing for long.
      if (index.length) {
        const packed = packVectorIndex(index);
        await deps.store.put(CATALOGUE_DELTA_VECTORS_KEY, packed.bytes);
        await deps.store.put(CATALOGUE_DELTA_META_KEY, JSON.stringify(packed.meta));
      }
      await deps.store.put(CATALOGUE_DELTA_KEY, JSON.stringify(delta));
      if (delta.rows.length + delta.removed.length >= CATALOGUE_FOLD_AT) {
        await foldDelta(deps.store, delta, now().toISOString().replace(/[^0-9]/g, "").slice(0, 14));
      }
    }

    const done = new Set(ids);
    const pending = state.pending.filter(id => !done.has(id));
    state = {
      ...state,
      pending,
      lastError: undefined,
      ...(pending.length ? {} : { caughtUpAt: now().toISOString() }),
    };
    await deps.store.put(CATALOGUE_STATE_KEY, JSON.stringify(state));
    return { state, catalogued: pages.length, removed: removedIds.length };
  } catch (error) {
    // Keep the queue and the last good commit; the next run retries from there.
    state = { ...previous, lastRunAt: state.lastRunAt, lastError: error instanceof Error ? error.message : String(error) };
    await deps.store.put(CATALOGUE_STATE_KEY, JSON.stringify(state));
    throw error;
  }
}

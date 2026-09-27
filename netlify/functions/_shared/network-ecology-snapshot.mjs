import { getJSON, setJSON } from './professional-blobs.mjs';
import { assembleWorldGraph } from './network-ecology-world.mjs';

// Network Ecology world snapshot (stale-while-revalidate).
//
// Synchronous Netlify Functions on this site are cut at 10s (the
// `timeout = 26` lines in netlify.toml are not applied — every deployed
// function reports the 10s default). Assembling the full world graph
// (GitHub import + every Blob person's links + Meeting/Event attendance)
// does not reliably fit in that on a cold start, and a killed function
// left the SPA on "Loading network ecology…" through client retries.
//
// So `/api/network-ecology/world` serves the last built graph from this
// Blob key immediately, and a background function
// (`network-ecology-world-build`, 15 minute cap) rebuilds it when stale.

export const WORLD_SNAPSHOT_KEY = 'network-ecology/world-snapshot';
export const WORLD_BUILD_LOCK_KEY = 'network-ecology/world-build-lock';
// Bump when the `/world` response shape changes so a deploy never serves a
// snapshot built by older code.
export const WORLD_SNAPSHOT_VERSION = 1;
// A snapshot older than this is still served, but triggers a rebuild.
export const WORLD_SNAPSHOT_FRESH_MS = 2 * 60_000;
// Don't start another background build while one started this recently.
export const WORLD_BUILD_LOCK_MS = 3 * 60_000;

function toMs(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export async function readWorldSnapshot(professionalStore) {
  if (!professionalStore) return null;
  const raw = await getJSON(professionalStore, WORLD_SNAPSHOT_KEY);
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== WORLD_SNAPSHOT_VERSION) return null;
  if (toMs(raw.built_at) === null) return null;
  if (!raw.world || typeof raw.world !== 'object' || !Array.isArray(raw.world.nodes)) return null;
  return raw;
}

export function isSnapshotFresh(snapshot, nowMs) {
  const builtMs = toMs(snapshot?.built_at);
  return builtMs !== null && nowMs - builtMs < WORLD_SNAPSHOT_FRESH_MS;
}

export async function writeWorldSnapshot(professionalStore, world, now = new Date()) {
  const snapshot = { version: WORLD_SNAPSHOT_VERSION, built_at: now.toISOString(), world };
  await setJSON(professionalStore, WORLD_SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function buildAndStoreWorldSnapshot(deps) {
  const now = deps.now ?? new Date();
  const world = await assembleWorldGraph({ ...deps, now });
  return writeWorldSnapshot(deps.professionalStore, world, now);
}

/** Claims the build lock; false when another build started recently. */
export async function claimWorldBuild(professionalStore, nowMs) {
  const lock = await getJSON(professionalStore, WORLD_BUILD_LOCK_KEY);
  const startedMs = toMs(lock?.started_at);
  if (startedMs !== null && nowMs - startedMs < WORLD_BUILD_LOCK_MS) return false;
  await setJSON(professionalStore, WORLD_BUILD_LOCK_KEY, { started_at: new Date(nowMs).toISOString() });
  return true;
}

export async function releaseWorldBuild(professionalStore) {
  await setJSON(professionalStore, WORLD_BUILD_LOCK_KEY, { started_at: null });
}

/** Same API host that received `/world` (see chat-job-run's chatRunUrl). */
export function worldBuildUrl(request) {
  return new URL('/api/network-ecology/world-build', request.url);
}

export async function defaultInvokeWorldBuild(request, fetchImpl = fetch) {
  const response = await fetchImpl(worldBuildUrl(request), {
    method: 'POST',
    headers: {
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    }
  });
  return response.status === 202 || response.ok;
}

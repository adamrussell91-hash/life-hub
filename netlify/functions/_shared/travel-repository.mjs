import { createGitHubClient, GitHubClientError } from './github-client.mjs';
import { decodeBlob } from './decode-blob.mjs';
import { makeId, tripSummary, validateTrip } from './travel-schema.mjs';

const TRIPS_PREFIX = 'data/travel/trips/';
const SHARE_PATH = 'data/travel/share-tokens.json';

const tripCache = new Map(); // sha -> trip
const CACHE_TTL_MS = 30_000;

function findBlob(tree, path) {
  return tree.find((item) => item.path === path && item.type === 'blob');
}

function conflictError() {
  const err = new Error('This trip changed somewhere else. Reload to see the latest.');
  err.code = 'conflict';
  err.status = 409;
  return err;
}

function encodeTrip(trip) {
  return `${JSON.stringify(trip, null, 2)}\n`;
}

export function createTravelRepository({
  env = process.env,
  fetchImpl = fetch,
  createGitHubClient: createClient = createGitHubClient,
  github = null
} = {}) {
  const client = github ?? createClient({ env, fetchImpl });

  async function listTrips() {
    const { tree } = await client.resolveTree();
    const blobs = tree.filter(
      (item) => item.type === 'blob' && item.path.startsWith(TRIPS_PREFIX) && item.path.endsWith('.json')
    );
    const trips = [];
    for (const blob of blobs) {
      const trip = await readTripBlob(blob);
      trips.push(tripSummary(trip));
    }
    trips.sort((a, b) => a.start_date.localeCompare(b.start_date));
    return trips;
  }

  async function readTripBlob(blob) {
    const cached = tripCache.get(blob.sha);
    if (cached && cached.expires > Date.now()) return cached.trip;
    const raw = decodeBlob(await client.readBlob(blob.sha));
    const trip = validateTrip(JSON.parse(raw));
    tripCache.set(blob.sha, { trip, expires: Date.now() + CACHE_TTL_MS });
    return trip;
  }

  async function getTrip(id) {
    const path = `${TRIPS_PREFIX}${id}.json`;
    const { tree } = await client.resolveTree();
    const blob = findBlob(tree, path);
    if (!blob) {
      const err = new Error('Trip not found.');
      err.code = 'not_found';
      err.status = 404;
      throw err;
    }
    const trip = await readTripBlob(blob);
    return { trip, version: blob.sha };
  }

  async function createTrip(trip) {
    const path = `${TRIPS_PREFIX}${trip.id}.json`;
    const result = await client.writeFile({
      path,
      content: encodeTrip(trip),
      message: `travel: create "${trip.title}"`
    });
    tripCache.clear();
    return { trip, version: result.sha };
  }

  async function saveTrip(trip, version, message) {
    const path = `${TRIPS_PREFIX}${trip.id}.json`;
    try {
      const result = await client.writeFile({
        path,
        content: encodeTrip(trip),
        sha: version,
        message
      });
      tripCache.clear();
      return { trip, version: result.sha };
    } catch (error) {
      if (
        error instanceof GitHubClientError ||
        error?.status === 409 ||
        error?.status === 422 ||
        /sha does not match/i.test(String(error?.message || ''))
      ) {
        throw conflictError();
      }
      throw error;
    }
  }

  async function deleteTrip(id, version) {
    const path = `${TRIPS_PREFIX}${id}.json`;
    await client.deleteFile({ path, sha: version, message: `travel: delete ${id}` });
    tripCache.clear();
    return { id, deleted: true };
  }

  async function getShareTokens() {
    const { tree } = await client.resolveTree();
    const blob = findBlob(tree, SHARE_PATH);
    if (!blob) return { map: {}, version: null };
    const raw = decodeBlob(await client.readBlob(blob.sha));
    const map = JSON.parse(raw || '{}');
    return { map, version: blob.sha };
  }

  async function saveShareTokens(map, version) {
    const content = `${JSON.stringify(map, null, 2)}\n`;
    try {
      const result = await client.writeFile({
        path: SHARE_PATH,
        content,
        ...(version ? { sha: version } : {}),
        message: 'travel: update share tokens'
      });
      return { map, version: result.sha };
    } catch (error) {
      if (error?.status === 409 || error?.status === 422) throw conflictError();
      throw error;
    }
  }

  return {
    listTrips,
    getTrip,
    createTrip,
    saveTrip,
    deleteTrip,
    getShareTokens,
    saveShareTokens,
    makeId
  };
}

export { TRIPS_PREFIX, SHARE_PATH, conflictError };

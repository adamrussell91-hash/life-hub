const CACHE_NAME = 'life-hub-private-v1';
const CACHE_KEY = '/__life-hub-private-cache__/repository';

export function createRepositoryCache(cacheStorage) {
  if (!cacheStorage || typeof cacheStorage.open !== 'function' || typeof cacheStorage.delete !== 'function') {
    throw new TypeError('Cache Storage is unavailable');
  }

  return {
    async read() {
      const cache = await cacheStorage.open(CACHE_NAME);
      const response = await cache.match(CACHE_KEY);
      if (!response) return null;
      return response.json();
    },

    async write({ manifest, files }) {
      const cache = await cacheStorage.open(CACHE_NAME);
      await cache.put(CACHE_KEY, Response.json({
        manifest: sanitizeManifest(manifest),
        files: files.map(sanitizeFile)
      }));
    },

    clear() {
      return cacheStorage.delete(CACHE_NAME);
    }
  };
}

function sanitizeManifest({ manifestId, commitSha, treeSha, from, to, files }) {
  return {
    manifestId,
    commitSha,
    treeSha,
    from,
    to,
    files: files.map(({ path, sha, size }) => ({ path, sha, size }))
  };
}

function sanitizeFile({ path, sha, content }) {
  return { path, sha, content };
}

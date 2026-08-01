const CACHE_NAME = 'life-hub-private-v1';
const CACHE_KEY = '/__life-hub-private-cache__/repository';

export function createRepositoryCache(cacheStorage) {
  if (!cacheStorage || typeof cacheStorage.open !== 'function' || typeof cacheStorage.delete !== 'function') {
    throw new TypeError('Cache Storage is unavailable');
  }

  return {
    async read(range) {
      const cache = await cacheStorage.open(CACHE_NAME);
      const response = await cache.match(rangeCacheKey(range));
      if (!response) return null;
      return response.json();
    },

    async write({ manifest, files, warnings = [] }) {
      const cache = await cacheStorage.open(CACHE_NAME);
      const sanitizedManifest = sanitizeManifest(manifest);
      await cache.put(rangeCacheKey(sanitizedManifest), Response.json({
        manifest: sanitizedManifest,
        files: files.map(sanitizeFile),
        warnings: warnings.map(sanitizeWarning)
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

function sanitizeFile({ path, sha, content, fallback }) {
  return {
    path,
    sha,
    content,
    ...(fallback && typeof fallback.contentSha === 'string' && typeof fallback.code === 'string'
      ? { fallback: { contentSha: fallback.contentSha, code: fallback.code } }
      : {})
  };
}

function sanitizeWarning({ path, code }) {
  return {
    ...(typeof path === 'string' ? { path } : {}),
    code: typeof code === 'string' ? code : 'invalid_file'
  };
}

function rangeCacheKey(range) {
  if (typeof range?.from !== 'string' || typeof range?.to !== 'string') {
    throw new TypeError('An exact repository range is required');
  }
  const query = new URLSearchParams({ from: range.from, to: range.to });
  return `${CACHE_KEY}?${query}`;
}

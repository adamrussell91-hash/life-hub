const CACHE_NAME = 'life-hub-private-v2';
const LEGACY_CACHE_NAME = 'life-hub-private-v1';
const MANIFEST_PREFIX = '/__life-hub-private-cache__/repository';
const BLOB_PREFIX = '/__life-hub-private-cache__/blob/';

export function createRepositoryCache(cacheStorage) {
  if (!cacheStorage || typeof cacheStorage.open !== 'function' || typeof cacheStorage.delete !== 'function') {
    throw new TypeError('Cache Storage is unavailable');
  }

  async function open() {
    await cacheStorage.delete(LEGACY_CACHE_NAME);
    return cacheStorage.open(CACHE_NAME);
  }

  async function readBlob(sha) {
    if (!/^[0-9a-f]{40}$/.test(sha)) return null;
    const cache = await open();
    const response = await cache.match(BLOB_PREFIX + sha);
    return response ? response.json() : null;
  }

  return {
    readBlob,

    async read(range) {
      const cache = await open();
      const response = await cache.match(rangeCacheKey(range));
      if (!response) return null;
      const record = await response.json();
      const files = [];
      for (const entry of record.manifest.files) {
        const blob = await readBlob(entry.sha);
        if (!blob || typeof blob.content !== 'string') return null;
        files.push(blob);
      }
      return { manifest: record.manifest, files, warnings: record.warnings ?? [] };
    },

    async write({ manifest, files, warnings = [] }) {
      const cache = await open();
      const sanitizedManifest = sanitizeManifest(manifest);
      for (const file of files) {
        const sanitized = sanitizeFile(file);
        await cache.put(BLOB_PREFIX + sanitized.sha, Response.json(sanitized));
      }
      await cache.put(rangeCacheKey(sanitizedManifest), Response.json({
        manifest: sanitizedManifest,
        warnings: warnings.map(sanitizeWarning)
      }));
    },

    clear() {
      return Promise.all([
        cacheStorage.delete(CACHE_NAME),
        cacheStorage.delete(LEGACY_CACHE_NAME)
      ]).then(results => results.some(Boolean));
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
  return `${MANIFEST_PREFIX}?${query}`;
}

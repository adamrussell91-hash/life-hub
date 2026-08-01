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
      await cache.put(CACHE_KEY, Response.json({ manifest, files }));
    },

    clear() {
      return cacheStorage.delete(CACHE_NAME);
    }
  };
}

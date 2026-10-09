/**
 * Live Sydney weather for the fragrance ranker.
 * Open-Meteo needs no key; readings cache for an hour in sessionStorage.
 */
import { classifyWeather } from './aesthetics-model.js';

const SYDNEY = { lat: -33.8688, lon: 151.2093 };
const CACHE_KEY = 'life-aesthetics-sydney-weather';
const TTL_MS = 60 * 60 * 1000;

function readCache(storage) {
  try {
    const raw = storage?.getItem?.(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null;
    return parsed.weather ?? null;
  } catch {
    return null;
  }
}

function writeCache(storage, weather) {
  try {
    storage?.setItem?.(CACHE_KEY, JSON.stringify({ at: Date.now(), weather }));
  } catch { /* private mode */ }
}

function fromCurrent(current) {
  return classifyWeather({
    tempC: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    precipMm: current.precipitation,
    weatherCode: current.weather_code
  });
}

/**
 * @param {{ fetch?: typeof fetch, storage?: Storage }} [opts]
 * @returns {Promise<{ weather: ReturnType<typeof classifyWeather> | null, status: 'ok' | 'cached' | 'unavailable' }>}
 */
export async function loadSydneyWeather({ fetch: fetchFn = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
  const cached = readCache(storage);
  if (cached) return { weather: cached, status: 'cached' };
  if (typeof fetchFn !== 'function') return { weather: null, status: 'unavailable' };

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${SYDNEY.lat}&longitude=${SYDNEY.lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=Australia%2FSydney`;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return { weather: null, status: 'unavailable' };
    const data = await res.json();
    const weather = fromCurrent(data?.current ?? {});
    if (!weather) return { weather: null, status: 'unavailable' };
    writeCache(storage, weather);
    return { weather, status: 'ok' };
  } catch {
    return { weather: null, status: 'unavailable' };
  }
}

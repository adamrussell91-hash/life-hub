/**
 * Live Sydney weather for the fragrance ranker.
 * Open-Meteo needs no key; readings cache for an hour in sessionStorage.
 */
import { classifyWeather } from './aesthetics-model.js';

const SYDNEY = { lat: -33.8688, lon: 151.2093 };
const CACHE_KEY = 'life-aesthetics-sydney-weather';
const TTL_MS = 60 * 60 * 1000;
const UNAVAILABLE = Object.freeze({ weather: null, status: 'unavailable' });
const FORECAST_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${SYDNEY.lat}&longitude=${SYDNEY.lon}` +
  '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=Australia%2FSydney';

function readCache(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(CACHE_KEY) ?? 'null');
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

/**
 * @param {{ fetch?: typeof fetch, storage?: Storage }} [opts]
 * @returns {Promise<{ weather: ReturnType<typeof classifyWeather> | null, status: 'ok' | 'cached' | 'unavailable' }>}
 */
export async function loadSydneyWeather({ fetch: fetchFn = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
  const cached = readCache(storage);
  if (cached) return { weather: cached, status: 'cached' };
  if (typeof fetchFn !== 'function') return UNAVAILABLE;

  try {
    const res = await fetchFn(FORECAST_URL);
    if (!res.ok) return UNAVAILABLE;
    const current = (await res.json())?.current ?? {};
    const weather = classifyWeather({
      tempC: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      precipMm: current.precipitation,
      weatherCode: current.weather_code
    });
    if (!weather) return UNAVAILABLE;
    writeCache(storage, weather);
    return { weather, status: 'ok' };
  } catch {
    return UNAVAILABLE;
  }
}

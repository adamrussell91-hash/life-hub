/**
 * Live Sydney weather and today's forecast for the fragrance ranker and outfit cuts.
 * Open-Meteo needs no key; readings cache for an hour in sessionStorage.
 */
import { classifyForecast } from './aesthetics-model.js';

const SYDNEY = { lat: -33.8688, lon: 151.2093 };
const CACHE_KEY = 'life-aesthetics-sydney-weather-v2';
const TTL_MS = 60 * 60 * 1000;
const UNAVAILABLE = Object.freeze({ weather: null, status: 'unavailable' });
const FORECAST_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${SYDNEY.lat}&longitude=${SYDNEY.lon}` +
  '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code' +
  '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
  '&forecast_days=1&timezone=Australia%2FSydney';

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
 * @returns {Promise<{ weather: ReturnType<typeof classifyForecast> | null, status: 'ok' | 'cached' | 'unavailable' }>}
 */
export async function loadSydneyWeather({ fetch: fetchFn = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
  const cached = readCache(storage);
  if (cached) return { weather: cached, status: 'cached' };
  if (typeof fetchFn !== 'function') return UNAVAILABLE;

  try {
    const res = await fetchFn(FORECAST_URL);
    if (!res.ok) return UNAVAILABLE;
    const body = await res.json();
    const weather = classifyForecast({ current: body?.current ?? {}, daily: body?.daily ?? {} });
    if (!weather) return UNAVAILABLE;
    writeCache(storage, weather);
    return { weather, status: 'ok' };
  } catch {
    return UNAVAILABLE;
  }
}

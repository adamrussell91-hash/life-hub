import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSydneyWeather } from '../../apps/life/js/app/aesthetics/sydney-weather.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); }
  };
}

test('loadSydneyWeather classifies an Open-Meteo current payload', async () => {
  const storage = memoryStorage();
  const fetchFn = async () => ({
    ok: true,
    json: async () => ({
      current: {
        temperature_2m: 29.4,
        relative_humidity_2m: 72,
        precipitation: 0,
        weather_code: 2
      }
    })
  });
  const first = await loadSydneyWeather({ fetch: fetchFn, storage });
  assert.equal(first.status, 'ok');
  assert.equal(first.weather.band, 'humid-heat');
  assert.match(first.weather.label, /muggy heat/);

  const second = await loadSydneyWeather({
    fetch: async () => { throw new Error('should use cache'); },
    storage
  });
  assert.equal(second.status, 'cached');
  assert.equal(second.weather.band, 'humid-heat');
});

test('loadSydneyWeather fails visible when the network is down', async () => {
  const result = await loadSydneyWeather({
    fetch: async () => { throw new Error('offline'); },
    storage: memoryStorage()
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.weather, null);
});

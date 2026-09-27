const cache = new Map(); // `${from}:${date}` -> { rate, date }

export function createRatesClient({ fetchImpl = fetch, now = () => new Date() } = {}) {
  async function getRate(from) {
    const currency = String(from || '').toUpperCase();
    if (!currency) {
      const err = new Error('from is required');
      err.code = 'validation_error';
      throw err;
    }
    if (currency === 'AUD') {
      const date = isoDay(now());
      return { from: 'AUD', to: 'AUD', rate: 1, date };
    }

    const day = isoDay(now());
    const key = `${currency}:${day}`;
    if (cache.has(key)) return cache.get(key);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(
        `https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=AUD`,
        {
          headers: { 'User-Agent': 'LifeHubTravel/1 (+https://life-hub.adam-russell.com)' },
          signal: controller.signal
        }
      );
      if (!response.ok) {
        const err = new Error('Exchange rates are unavailable right now.');
        err.code = 'upstream_unavailable';
        err.retryable = true;
        throw err;
      }
      const body = await response.json();
      const rate = body?.rates?.AUD;
      if (typeof rate !== 'number') {
        const err = new Error('Exchange rates are unavailable right now.');
        err.code = 'upstream_unavailable';
        err.retryable = true;
        throw err;
      }
      const result = { from: currency, to: 'AUD', rate, date: body.date || day };
      cache.set(key, result);
      return result;
    } catch (error) {
      if (error.code === 'upstream_unavailable') throw error;
      const err = new Error('Exchange rates are unavailable right now.');
      err.code = 'upstream_unavailable';
      err.retryable = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function clearCache() {
    cache.clear();
  }

  return { getRate, clearCache, _cache: cache };
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

export async function fillMoney(cost, rates) {
  if (!cost) return undefined;
  if (typeof cost.aud === 'number' && typeof cost.rate === 'number' && cost.rate_date) {
    return cost;
  }
  const quote = await rates.getRate(cost.currency);
  return {
    amount: cost.amount,
    currency: cost.currency,
    aud: cost.currency === 'AUD' ? cost.amount : Math.round(cost.amount * quote.rate * 100) / 100,
    rate: quote.rate,
    rate_date: quote.date
  };
}

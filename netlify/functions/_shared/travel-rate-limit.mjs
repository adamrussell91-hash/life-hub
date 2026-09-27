const buckets = new Map();

export function checkRateLimit(key, { limit = 30, windowMs = 60_000, now = Date.now() } = {}) {
  const bucket = buckets.get(key) || { reset: now + windowMs, count: 0 };
  if (now >= bucket.reset) {
    bucket.reset = now + windowMs;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > limit) {
    const err = new Error('Too many requests. Try again in a minute.');
    err.code = 'rate_limited';
    err.status = 429;
    err.retryable = true;
    throw err;
  }
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}

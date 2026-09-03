// Exact origins only — credentials are on. Never wildcard, prefix, or substring match.
export const UMBRELLA_APP_ORIGINS = [
  'https://life-hub.adam-russell.com',
  'https://teaching-hub.adam-russell.com',
  'https://knowledge-hub.adam-russell.com',
  'https://tasks-hub.adam-russell.com'
];

export function allowedRequestOrigins(env) {
  const configured = typeof env?.SITE_ORIGIN === 'string' ? env.SITE_ORIGIN.trim() : '';
  return [...new Set([configured, ...UMBRELLA_APP_ORIGINS].filter(Boolean))];
}

export function isAllowedRequestOrigin(origin, env) {
  return Boolean(origin) && allowedRequestOrigins(env).includes(origin);
}

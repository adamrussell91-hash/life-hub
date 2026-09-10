/**
 * Production API origin. Prefer VITE_API_BASE_URL at Pages build time.
 */
export const PLACEHOLDER_API_BASE_URL = 'https://api.adam-russell.com';

const SAME_ORIGIN_API_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'api.adam-russell.com',
  'tasks-api.adam-russell.com',
  'artasks-hub.netlify.app'
]);

function readViteApiBaseUrl(): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const value = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
    ?.VITE_API_BASE_URL;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

const PRODUCTION_API_BASE_URL = readViteApiBaseUrl() ?? PLACEHOLDER_API_BASE_URL;

/** Empty string = same-origin `/api/*` (Vite mock, or the Functions-hosted SPA). */
export function resolveApiBaseUrl(
  hostname: string,
  configured: string = PRODUCTION_API_BASE_URL
): string {
  return SAME_ORIGIN_API_HOSTS.has(hostname) ? '' : configured;
}

function resolveDefaultBaseUrl(): string {
  if (typeof location === 'undefined') return '';
  return resolveApiBaseUrl(location.hostname);
}

export const API_BASE_URL = resolveDefaultBaseUrl();

export function getApiBaseUrl(override?: string): string {
  if (override !== undefined) return override;
  if (typeof location !== 'undefined') return resolveApiBaseUrl(location.hostname);
  return API_BASE_URL;
}

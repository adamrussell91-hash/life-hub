/**
 * Professional Hub mounts only inside the Life Hub umbrella (`/professional/`)
 * — every production request is same-origin. Unlike a standalone hub with its
 * own API subdomain, there is no separate production API hostname to name
 * here. `VITE_API_BASE_URL` remains available purely for local development or
 * a preview deploy that needs to point at a different origin; it is never
 * hard-coded to a production API host.
 */
function readViteApiBaseUrl(): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const value = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
    ?.VITE_API_BASE_URL;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getApiBaseUrl(override?: string): string {
  if (override !== undefined) return override;
  return readViteApiBaseUrl() ?? '';
}

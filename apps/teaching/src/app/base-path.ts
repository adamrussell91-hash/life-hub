/** Vite `base` without a trailing slash. Empty when the app is mounted at `/`. */
export function appBasePath(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : '/';
  if (raw === '/') return '';
  return raw.replace(/\/$/, '');
}

export function stripAppBase(pathname: string): string {
  const path = pathname || '/';
  const base = appBasePath();
  if (!base) return path;
  if (path === base || path === `${base}/`) return '/';
  if (path.startsWith(`${base}/`)) return path.slice(base.length) || '/';
  return path;
}

export function withAppBase(path: string): string {
  const base = appBasePath();
  const normalized = !path || path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalized;
  if (normalized === '/') return `${base}/`;
  return `${base}${normalized}`;
}

export function currentAppPath(): string {
  if (typeof location === 'undefined') return '/';
  return stripAppBase(location.pathname);
}

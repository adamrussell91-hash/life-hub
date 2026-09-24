/**
 * Public class host. Serves published Teaching pages only.
 * Anything else — including sign-in and the umbrella root — is a dead page.
 *
 * ponytail: asset allow-list is flat `/teaching/assets/<file>` names Vite emits
 * today. A nested asset path would 404 until the pattern grows a segment.
 */

export const UPSTREAM_ORIGIN = 'https://life-hub.adam-russell.com';
export const SHELL_PATH = '/teaching/index.html';

const STUDENT_PATHS = [
  /^\/s\/lessons\/[^/]+$/,
  /^\/s\/units\/[^/]+$/,
  /^\/s\/classes\/[^/]+$/,
  /^\/s\/classes\/[^/]+\/lessons\/[^/]+$/
];

const ASSET_PATH =
  /^\/teaching\/assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|webp|avif|ico)$/;

const REDIRECT_SCRIPT =
  /<script>\s*\(function \(\) \{\s*var key = 'life-hub-spa-redirect';[\s\S]*?\}\)\(\);\s*<\/script>\s*/;

const PASS_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'last-modified',
  'accept-ranges',
  'content-range',
  'content-length',
  'content-encoding'
];

export function deadPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not available</title>
</head>
<body>
<p>This page isn't available.</p>
</body>
</html>
`;
}

export function deadPage(status = 404) {
  return new Response(deadPageHtml(), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer'
    }
  });
}

export function normalisePath(pathname) {
  let path = pathname || '/';
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.includes('\\') || path.includes('\0')) return null;
  const parts = path.split('/');
  if (parts.some((part) => part === '..' || part === '.')) return null;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

/** Bare `/s/...` path when this request may boot the student shell. */
export function studentPath(pathname) {
  const path = normalisePath(pathname);
  if (!path) return null;
  if (path.startsWith('/teaching/')) {
    const rest = path.slice('/teaching'.length);
    return STUDENT_PATHS.some((pattern) => pattern.test(rest)) ? rest : null;
  }
  return STUDENT_PATHS.some((pattern) => pattern.test(path)) ? path : null;
}

export function isTeachingAsset(pathname) {
  const path = normalisePath(pathname);
  return Boolean(path && ASSET_PATH.test(path));
}

export function scrubTeachingShell(html) {
  return html.replace(REDIRECT_SCRIPT, '').replaceAll(`${UPSTREAM_ORIGIN}`, '');
}

function passedHeaders(upstream) {
  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-robots-tag', 'noindex');
  headers.set('referrer-policy', 'no-referrer');
  return headers;
}

async function fetchUpstream(path, fetchImpl) {
  const response = await fetchImpl(new URL(path, UPSTREAM_ORIGIN), {
    method: 'GET',
    redirect: 'manual'
  });
  if (response.status >= 300 && response.status < 400) return null;
  if (!response.ok) return null;
  const finalUrl = new URL(response.url || UPSTREAM_ORIGIN);
  if (finalUrl.origin !== UPSTREAM_ORIGIN) return null;
  return response;
}

export async function handleClassSiteRequest(request, fetchImpl = fetch) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return deadPage(405);

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return deadPage();
  }

  if (studentPath(url.pathname)) {
    const upstream = await fetchUpstream(SHELL_PATH, fetchImpl);
    if (!upstream) return deadPage(502);
    const html = scrubTeachingShell(await upstream.text());
    return new Response(request.method === 'HEAD' ? null : html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'referrer-policy': 'no-referrer'
      }
    });
  }

  if (isTeachingAsset(url.pathname)) {
    const upstream = await fetchUpstream(url.pathname, fetchImpl);
    if (!upstream) return deadPage();
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: passedHeaders(upstream)
    });
  }

  return deadPage();
}

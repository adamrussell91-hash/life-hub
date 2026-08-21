import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMockApi } from './mock-api.mjs';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8'
};

const send = (response, status, body, contentType = 'text/plain; charset=utf-8') => {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
};

export function createStaticServer({ root, apiRoot = new URL('../', import.meta.url), now, sessionMs } = {}) {
  const rootPath = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const handleMockApi = createMockApi({ root: apiRoot, now, sessionMs });

  return createServer(async (request, response) => {
    if (await handleMockApi(request, response)) return;

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      send(response, 400, 'Invalid path');
      return;
    }

    const indexPost = request.method === 'POST' && (decodedPath === '/' || decodedPath === '/index.html');
    if (request.method !== 'GET' && request.method !== 'HEAD' && !indexPost) {
      send(response, 405, 'Method not allowed');
      return;
    }

    if (decodedPath.includes('\0') || decodedPath.split('/').includes('..')) {
      send(response, 400, 'Invalid path');
      return;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const filePath = resolve(rootPath, relativePath);
    if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
      send(response, 400, 'Invalid path');
      return;
    }

    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) throw new Error('not a file');
      const body = request.method === 'HEAD' ? '' : await readFile(filePath);
      send(response, 200, body, MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    } catch {
      send(response, 404, 'Not found');
    }
  });
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const host = '127.0.0.1';
  const port = Number(process.env.PORT ?? 4173);
  const server = createStaticServer({
    root: new URL('../dist/', import.meta.url),
    apiRoot: new URL('../', import.meta.url)
  });
  server.listen(port, host, () => {
    process.stdout.write(`Life Hub ready at http://${host}:${port}/\n`);
  });
}

/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRO_SRC = path.resolve(__dirname, 'src');
const TASKS_SRC = path.resolve(__dirname, '../tasks/src');

/**
 * `@/x` means "this app's src". Tasks files imported into Professional keep
 * resolving `@/x` inside apps/tasks/src, so the Tasks block engine is used
 * as it is, with no copy.
 */
function importerAwareAtAlias(): Plugin {
  return {
    name: 'professional-importer-aware-at-alias',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.startsWith('@/')) return null;
      const fromTasks = Boolean(importer) && path.normalize(importer!).startsWith(TASKS_SRC + path.sep);
      const root = fromTasks ? TASKS_SRC : PRO_SRC;
      return this.resolve(path.join(root, source.slice(2)), importer, { ...options, skipSelf: true });
    }
  };
}

function mockApiPlugin(): Plugin {
  return {
    name: 'professional-hub-mock-api',
    async configureServer(server) {
      if (process.env.VITEST) return;
      const { createMockApi } = await server.ssrLoadModule('/scripts/mock-api.ts');
      const api = createMockApi();
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }
        await api.handleNodeRequest(req, res);
      });
    }
  };
}

export default defineConfig({
  base: process.env.UMBRELLA_SPA === '1' ? '/professional/' : '/',
  resolve: { alias: { '@tasks': TASKS_SRC } },
  plugins: [importerAwareAtAlias(), mockApiPlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5176 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom'
  }
});

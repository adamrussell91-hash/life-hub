/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSrcAlias } from '../../scripts/lib/app-src-alias.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRO_SRC = path.resolve(__dirname, 'src');
const TASKS_SRC = path.resolve(__dirname, '../tasks/src');
const TEACHING_SRC = path.resolve(__dirname, '../teaching/src');

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
  // `@tasks/x` is the Tasks block page; Tasks in turn runs Teaching's block
  // engine. Each borrowed file keeps resolving `@/x` inside its own app.
  plugins: [
    appSrcAlias({ self: 'professional', apps: { professional: PRO_SRC, tasks: TASKS_SRC, teaching: TEACHING_SRC } }),
    mockApiPlugin()
  ],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5176 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts']
  }
});

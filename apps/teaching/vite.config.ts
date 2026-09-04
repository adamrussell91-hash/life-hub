/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { SeedData } from './scripts/mock-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mockApiPlugin(): Plugin {
  return {
    name: 'teaching-hub-mock-api',
    async configureServer(server) {
      if (process.env.VITEST) return;
      // Load via Vite SSR so `@/` aliases in mock-api's dependency graph resolve.
      // A static import here is bundled into vite.config by Node and breaks on `@/`.
      const { createMockApi } = await server.ssrLoadModule('/scripts/mock-api.ts');
      const seed = JSON.parse(
        readFileSync(path.resolve(__dirname, 'fixtures/seed.json'), 'utf-8')
      ) as SeedData;
      const api = createMockApi({ seed });
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
  base: process.env.UMBRELLA_SPA === '1' ? '/teaching/' : '/',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [mockApiPlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom'
  }
});

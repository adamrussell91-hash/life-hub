/// <reference types="vitest/config" />
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';
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

/**
 * Dev only: the local game-rooms Worker (`cd workers/game-rooms && npm run dev`) answers on
 * :8788, so the dev page's policy lets the live game board and phones reach it.
 */
function liveRoomsDevCsp(): Plugin {
  return {
    name: 'teaching-hub-live-rooms-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace(/connect-src 'self'/, "connect-src 'self' http://localhost:8788 ws://localhost:8788")
  };
}

export default defineConfig({
  base: process.env.UMBRELLA_SPA === '1' ? '/teaching/' : '/',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [mockApiPlugin(), liveRoomsDevCsp()],
  build: { outDir: 'dist', emptyOutDir: true },
  // Vite 7.3 applies server.fs to ?raw/?url/?worker imports too. Shared glyphs live in
  // the repo's packages/, and pdf.js comes from the root install.
  server: {
    port: 5173,
    // The comparative judgement preview runs the server's pure maths module in the page.
    fs: {
      allow: [
        searchForWorkspaceRoot(__dirname),
        path.resolve(__dirname, '../../packages'),
        path.resolve(__dirname, '../../node_modules'),
        path.resolve(__dirname, '../../netlify/functions/_shared/cj-maths.mjs')
      ]
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/setup/web-storage.ts']
  }
});

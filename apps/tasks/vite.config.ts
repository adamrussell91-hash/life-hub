/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mockApiPlugin(): Plugin {
  return {
    name: 'tasks-hub-mock-api',
    async configureServer(server) {
      const { createMockApi } = await server.ssrLoadModule('/scripts/mock-api.ts');
      const seed = JSON.parse(
        readFileSync(path.resolve(__dirname, 'fixtures/seed.json'), 'utf-8')
      );
      seed.programs = JSON.parse(
        readFileSync(path.resolve(__dirname, 'fixtures/competitions.json'), 'utf-8')
      );
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
  base: process.env.UMBRELLA_SPA === '1' ? '/tasks/' : '/',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [mockApiPlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5175 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom'
  }
});

/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [mockApiPlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5176 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom'
  }
});

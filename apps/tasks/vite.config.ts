/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groveAnimalCatalogue } from '../../scripts/lib/grove-animal-catalogue.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';

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

/** Grove models live in apps/life/assets/grove; the umbrella publishes them at /assets/grove/. */
function groveAssetsPlugin(): Plugin {
  const root = path.resolve(__dirname, '../life/assets/grove');
  return {
    name: 'tasks-hub-grove-assets',
    configureServer(server) {
      server.middlewares.use('/assets/grove', (req, res, next) => {
        if (req.url?.split('?')[0] === '/animal-catalogue.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(groveAnimalCatalogue(root)));
          return;
        }
        const relative = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = path.resolve(root, `.${relative}`);
        if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.glb') ? 'model/gltf-binary' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.end(readFileSync(file));
      });
    }
  };
}

export default defineConfig({
  base: process.env.UMBRELLA_SPA === '1' ? '/tasks/' : '/',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [mockApiPlugin(), groveAssetsPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // grove.html is Home's chromeless preview of today's clearing.
      input: { main: path.resolve(__dirname, 'index.html'), grove: path.resolve(__dirname, 'grove.html') }
    }
  },
  server: { port: 5175 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom'
  }
});

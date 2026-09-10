#!/usr/bin/env node
/**
 * GitHub Pages serves 404.html for unknown paths. Copy the built SPA shell
 * so deep links like /s/lessons/:id and /lessons/:id boot the app on refresh.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = join(root, 'dist', 'index.html');
const fallbackHtml = join(root, 'dist', '404.html');

if (!existsSync(indexHtml)) {
  console.error('copy-spa-fallback: dist/index.html missing — run vite build first');
  process.exit(1);
}

copyFileSync(indexHtml, fallbackHtml);
console.log('copy-spa-fallback: wrote dist/404.html');

#!/usr/bin/env node
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
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
writeFileSync(join(root, 'dist', '_redirects'), '/*    /index.html   200\n');
console.log('copy-spa-fallback: wrote dist/404.html and dist/_redirects');

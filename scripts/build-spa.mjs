import { spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!['teaching', 'knowledge', 'tasks'].includes(name)) {
  console.error('usage: node scripts/build-spa.mjs <teaching|knowledge|tasks>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cwd = join(root, 'apps', name);
const env = { ...process.env, UMBRELLA_SPA: '1' };

const child = spawn('npx', ['vite', 'build'], {
  cwd,
  env,
  stdio: 'inherit'
});

child.on('exit', code => {
  if (code !== 0) process.exit(code ?? 1);
  const indexHtml = join(cwd, 'dist', 'index.html');
  const fallbackHtml = join(cwd, 'dist', '404.html');
  if (!existsSync(indexHtml)) {
    console.error(`build-spa: ${name} dist/index.html missing`);
    process.exit(1);
  }
  copyFileSync(indexHtml, fallbackHtml);
  console.log(`build-spa: ${name} → dist/${name}/`);
});

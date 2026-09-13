import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!['teaching', 'knowledge', 'tasks', 'professional'].includes(name)) {
  console.error('usage: node scripts/build-spa.mjs <teaching|knowledge|tasks|professional>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cwd = join(root, 'apps', name);
const env = { ...process.env, UMBRELLA_SPA: '1' };

// Apps that declare their own `typecheck` script (currently just
// Professional) get it run first — a TypeScript error in that app must fail
// the umbrella build the same way it fails that app's own `npm run build`,
// not be silently skipped because this script calls `vite build` directly.
const packageJsonPath = join(cwd, 'package.json');
const hasTypecheckScript = existsSync(packageJsonPath)
  && Boolean(JSON.parse(readFileSync(packageJsonPath, 'utf8')).scripts?.typecheck);

if (hasTypecheckScript) {
  const typecheck = spawnSync('npm', ['run', 'typecheck'], { cwd, env, stdio: 'inherit' });
  if (typecheck.status !== 0) process.exit(typecheck.status ?? 1);
}

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

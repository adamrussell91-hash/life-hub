import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterEach } from 'vitest';

const scriptPath = join(process.cwd(), 'scripts', 'copy-spa-fallback.mjs');

describe('copy-spa-fallback', () => {
  let workDir: string | undefined;

  afterEach(() => {
    if (workDir && existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true });
    }
    workDir = undefined;
  });

  it('copies dist/index.html to dist/404.html', () => {
    workDir = mkdtempSync(join(tmpdir(), 'spa-fallback-'));
    const scriptsDir = join(workDir, 'scripts');
    const distDir = join(workDir, 'dist');
    mkdirSync(scriptsDir);
    mkdirSync(distDir);

    const scriptBody = readFileSync(scriptPath, 'utf8');
    writeFileSync(join(scriptsDir, 'copy-spa-fallback.mjs'), scriptBody);
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>Teaching Hub</title>');

    execFileSync(process.execPath, [join(scriptsDir, 'copy-spa-fallback.mjs')], {
      cwd: workDir,
      encoding: 'utf8'
    });

    expect(readFileSync(join(distDir, '404.html'), 'utf8')).toBe(
      '<!doctype html><title>Teaching Hub</title>'
    );
  });
});

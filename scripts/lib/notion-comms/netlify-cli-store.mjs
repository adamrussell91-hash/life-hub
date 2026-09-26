import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

// Adapter for a signed-in Netlify CLI. It deliberately exposes only the
// Blob-store operations repositories use; the repositories remain the sole
// place that decides record/index/link shapes.
export function createNetlifyCliStore({ name, siteID, exec = execFile }) {
  const run = (args) => exec('npx', ['--yes', 'netlify-cli', ...args], {
    env: { ...process.env, NETLIFY_SITE_ID: siteID }, maxBuffer: 2 * 1024 * 1024
  });
  const temp = () => path.join(os.tmpdir(), `notion-comms-${randomUUID()}.json`);
  return {
    async get(key, { type } = {}) {
      const file = temp();
      try {
        await run(['blobs:get', name, key, '--output', file]);
        const text = await readFile(file, 'utf8');
        return type === 'json' ? JSON.parse(text) : text;
      } catch (error) {
        // `netlify blobs:get --output` may finish successfully but omit the
        // output file for an absent key, so ENOENT is the CLI's null value.
        if (error?.code === 'ENOENT' || /not found|does not exist|404/i.test(`${error?.stdout ?? ''}\n${error?.stderr ?? ''}\n${error?.message ?? ''}`)) return null;
        throw error;
      } finally { await unlink(file).catch(() => {}); }
    },
    async setJSON(key, value) {
      const file = temp();
      try { await writeFile(file, JSON.stringify(value)); await run(['blobs:set', name, key, '--input', file, '--force']); }
      finally { await unlink(file).catch(() => {}); }
    },
    async set(key, value) { return this.setJSON(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async list({ prefix = '' } = {}) {
      const { stdout } = await run(['blobs:list', name, '--prefix', prefix, '--json']);
      const parsed = JSON.parse(stdout); const blobs = Array.isArray(parsed) ? parsed : parsed.blobs ?? [];
      return { blobs: blobs.map((blob) => typeof blob === 'string' ? { key: blob } : blob), continuationToken: null };
    }
  };
}

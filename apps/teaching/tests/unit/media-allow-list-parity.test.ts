// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALLOWED_MEDIA_MIME, MAX_MEDIA_BYTES } from '@/media/upload-rules';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootUpload = readFileSync(
  join(__dirname, '../../../../netlify/functions/media-upload.mjs'),
  'utf-8'
);

function mimeSetFromSource(source: string): Set<string> {
  const match = source.match(/ALLOWED_MEDIA_MIME\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  expect(match).toBeTruthy();
  const body = match![1]!;
  const values = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  return new Set(values);
}

describe('media allow-list parity', () => {
  it('keeps upload-rules.ts and media-upload.mjs MIME sets identical', () => {
    const fromNetlify = mimeSetFromSource(rootUpload);
    expect([...fromNetlify].sort()).toEqual([...ALLOWED_MEDIA_MIME].sort());
  });

  it('allows annotation voice containers', () => {
    expect(ALLOWED_MEDIA_MIME.has('audio/webm')).toBe(true);
    expect(ALLOWED_MEDIA_MIME.has('audio/mp4')).toBe(true);
    expect(ALLOWED_MEDIA_MIME.has('audio/ogg')).toBe(true);
  });

  it('keeps the shared byte cap', () => {
    expect(MAX_MEDIA_BYTES).toBe(10 * 1024 * 1024);
    expect(rootUpload).toContain('10 * 1024 * 1024');
  });
});

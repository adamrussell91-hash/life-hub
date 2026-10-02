import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crestNode, resolveCrestUrl } from '@/components/org-ui';
import manifest from '@/data/organisation-crests.json';

vi.mock('@/api/organisations-directory', () => ({ fetchOrgCrestUrl: vi.fn() }));
import { fetchOrgCrestUrl } from '@/api/organisations-directory';

const ref = 'shared:organisation:organisation_44c04351-5d74-6da8-f866-28798e41e9d3';
const bundled = `${import.meta.env.BASE_URL}organisation-crests/${manifest[ref]}`;

beforeEach(() => vi.mocked(fetchOrgCrestUrl).mockReset());

describe('organisation crests', () => {
  it('resolves the imported St Aloysius crest without an uploaded logo key', async () => {
    expect(await resolveCrestUrl(ref, null)).toBe(bundled);
    expect(fetchOrgCrestUrl).not.toHaveBeenCalled();
  });

  it('renders the bundled image when logo_key is null', async () => {
    const node = crestNode('SAC', 'lg', { orgRef: ref, logoKey: null });
    await vi.waitFor(() => expect(node.querySelector('img')?.getAttribute('src')).toBe(bundled));
    expect(node.querySelector<HTMLElement>('.people-crest__mono')?.hidden).toBe(true);
  });

  it('prefers an uploaded crest and does not reuse a stale upload key', async () => {
    vi.mocked(fetchOrgCrestUrl).mockResolvedValueOnce({ url: 'https://storage.example/first.png', logo_key: 'first' });
    expect(await resolveCrestUrl(ref, 'first')).toBe('https://storage.example/first.png');
    vi.mocked(fetchOrgCrestUrl).mockResolvedValueOnce({ url: 'https://storage.example/second.png', logo_key: 'second' });
    expect(await resolveCrestUrl(ref, 'second')).toBe('https://storage.example/second.png');
  });

  it('falls back to the bundled crest if uploaded storage is unavailable', async () => {
    vi.mocked(fetchOrgCrestUrl).mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await resolveCrestUrl(ref, 'unavailable')).toBe(bundled);
  });

  it('leaves unknown organisations as monograms', async () => {
    expect(await resolveCrestUrl('shared:organisation:organisation_unknown', null)).toBe(null);
    const node = crestNode('UNK', 'sm', { orgRef: 'shared:organisation:organisation_unknown' });
    await Promise.resolve();
    expect(node.querySelector('img')).toBe(null);
    expect(node.textContent).toBe('UNK');
  });

  it('restores the monogram if an image cannot be loaded', async () => {
    const node = crestNode('SAC', 'lg', { orgRef: ref });
    await vi.waitFor(() => expect(node.querySelector('img')).not.toBe(null));
    node.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(node.querySelector('img')).toBe(null);
    expect(node.querySelector<HTMLElement>('.people-crest__mono')?.hidden).toBe(false);
  });

  it('ships exactly 104 correctly sized PNGs with no Kolbe or unconfirmed Wade mapping', () => {
    expect(Object.keys(manifest)).toHaveLength(104);
    for (const [orgRef, filename] of Object.entries(manifest)) {
      expect(orgRef).toMatch(/^shared:organisation:organisation_[a-f0-9-]+$/);
      expect(filename).not.toMatch(/kolbe|wade-high/);
      const bytes = readFileSync(resolve('public/organisation-crests', filename));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(440);
      expect(bytes.readUInt32BE(20)).toBe(520);
      expect(bytes.length).toBeLessThanOrEqual(512 * 1024);
    }
  });
});

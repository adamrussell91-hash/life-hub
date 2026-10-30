import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crestNode, resetResearchedCrests, resolveCrestUrl } from '@/components/org-ui';

vi.mock('@/api/organisations-directory', () => ({
  fetchOrgCrestUrl: vi.fn(),
  fetchCrestRefs: vi.fn(),
  fetchCrestImage: vi.fn()
}));
import { fetchCrestImage, fetchCrestRefs, fetchOrgCrestUrl } from '@/api/organisations-directory';

// Invented organisation; the real researched crests are private.
const ref = 'shared:organisation:organisation_0000aaaa-1111-2222-3333-444455556666';
const researched = 'blob:researched-crest';

beforeEach(() => {
  resetResearchedCrests();
  vi.mocked(fetchOrgCrestUrl).mockReset();
  vi.mocked(fetchCrestRefs).mockReset().mockResolvedValue({ refs: [ref], status: 'ready' });
  vi.mocked(fetchCrestImage).mockReset().mockResolvedValue(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => researched) }));
});

afterEach(() => vi.unstubAllGlobals());

describe('organisation crests', () => {
  it('resolves a researched crest from the private repo without an uploaded logo key', async () => {
    expect(await resolveCrestUrl(ref, null)).toBe(researched);
    expect(fetchOrgCrestUrl).not.toHaveBeenCalled();
    expect(fetchCrestImage).toHaveBeenCalledWith(ref);
  });

  it('reads the crest list and each image once', async () => {
    await resolveCrestUrl(ref, null);
    await resolveCrestUrl(ref, null);
    expect(fetchCrestRefs).toHaveBeenCalledTimes(1);
    expect(fetchCrestImage).toHaveBeenCalledTimes(1);
  });

  it('renders the researched image when logo_key is null', async () => {
    const node = crestNode('EXA', 'lg', { orgRef: ref, logoKey: null });
    await vi.waitFor(() => expect(node.querySelector('img')?.getAttribute('src')).toBe(researched));
    expect(node.querySelector<HTMLElement>('.people-crest__mono')?.hidden).toBe(true);
  });

  it('prefers an uploaded crest and does not reuse a stale upload key', async () => {
    vi.mocked(fetchOrgCrestUrl).mockResolvedValueOnce({ url: 'https://storage.example/first.png', logo_key: 'first' });
    expect(await resolveCrestUrl(ref, 'first')).toBe('https://storage.example/first.png');
    vi.mocked(fetchOrgCrestUrl).mockResolvedValueOnce({ url: 'https://storage.example/second.png', logo_key: 'second' });
    expect(await resolveCrestUrl(ref, 'second')).toBe('https://storage.example/second.png');
    expect(fetchCrestImage).not.toHaveBeenCalled();
  });

  it('falls back to the researched crest if uploaded storage is unavailable', async () => {
    vi.mocked(fetchOrgCrestUrl).mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await resolveCrestUrl(ref, 'unavailable')).toBe(researched);
  });

  it('leaves unknown organisations as monograms', async () => {
    expect(await resolveCrestUrl('shared:organisation:organisation_unknown', null)).toBe(null);
    const node = crestNode('UNK', 'sm', { orgRef: 'shared:organisation:organisation_unknown' });
    await Promise.resolve();
    expect(node.querySelector('img')).toBe(null);
    expect(node.textContent).toBe('UNK');
    expect(fetchCrestImage).not.toHaveBeenCalled();
  });

  it('keeps monograms when the private crests are unreachable, and tries again later', async () => {
    vi.mocked(fetchCrestRefs).mockRejectedValueOnce(new Error('offline'));
    expect(await resolveCrestUrl(ref, null)).toBe(null);
    expect(await resolveCrestUrl(ref, null)).toBe(researched);
    expect(fetchCrestRefs).toHaveBeenCalledTimes(2);
  });

  it('restores the monogram if an image cannot be loaded', async () => {
    const node = crestNode('EXA', 'lg', { orgRef: ref });
    await vi.waitFor(() => expect(node.querySelector('img')).not.toBe(null));
    node.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(node.querySelector('img')).toBe(null);
    expect(node.querySelector<HTMLElement>('.people-crest__mono')?.hidden).toBe(false);
  });
});

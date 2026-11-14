// @vitest-environment-options {"settings":{"disableCSSFileLoading":true}}
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/travel-atlas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/travel-atlas')>()),
  getAtlas: vi.fn(async () => ({ items: [], settings: { home_big_mac_aud: null }, settings_version: null })),
}));

import { renderAtlas } from '@/views/atlas';

describe('Arches Atlas artwork', () => {
  it('loads each private artwork slot as a credentialed CORS image', async () => {
    const canvas = document.createElement('div');
    await renderAtlas(canvas, { isCurrent: () => true });
    const imgs = [...canvas.querySelectorAll<HTMLImageElement>('img.atlas-slot__img')];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.src).toContain('/api/travel-atlas-asset?slot=');
      expect(img.crossOrigin).toBe('use-credentials');
    }
  });
});

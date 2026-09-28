import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../public/sw.js'), 'utf8');

describe('travel service worker strategy (W3)', () => {
  it('network-firsts documents and busts stale shell caches', () => {
    expect(sw).toMatch(/travel-shell-v2/);
    expect(sw).not.toMatch(/travel-shell-v1/);
    expect(sw).toMatch(/skipWaiting/);
    expect(sw).toMatch(/client\.navigate/);
    // First install must not reload the tab that just loaded current HTML.
    expect(sw).toMatch(/if \(stale\.length === 0\) return;/);
    expect(sw).toMatch(/startsWith\('travel-shell-'\)/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
    expect(sw).toMatch(/network-first/i);
    // Must not cache-first all /travel/ paths (that kept deleted Vite hashes alive).
    expect(sw).not.toMatch(
      /pathname\.startsWith\('\/travel\/'\)\) \{\s*event\.respondWith\(caches\.match/
    );
  });
});

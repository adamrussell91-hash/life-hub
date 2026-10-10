import { describe, expect, it } from 'vitest';
import { renderHubShell, renderPrimaryNav } from '@/shell/shell';

/**
 * Travel is a Life section at /travel/, not the Life hub itself.
 * Phone More must still offer Life (home) and the other umbrella hubs.
 * Regression: currentHub:'life' hid Life from Hubs, so mobile had no way home.
 */
describe('travel mobile More hub list', () => {
  it('includes Life home and every other umbrella hub with real hrefs', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const refs = renderHubShell(root);
    renderPrimaryNav(refs, 'trips', { tripHref: '#/trip/demo' });

    const sheet = root.querySelector('.hub-more-sheet');
    expect(sheet).not.toBeNull();

    const nav = sheet!.querySelector('.hub-more-sheet__nav');
    expect(nav).not.toBeNull();

    const hrefs = [...nav!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/teaching/');
    expect(hrefs).toContain('/knowledge/');
    expect(hrefs).toContain('/tasks/');
    expect(hrefs).toContain('/professional/');

    const labels = [...nav!.querySelectorAll('a')].map((a) => a.textContent?.trim());
    expect(labels).toContain('Life');
    expect(labels).toContain('Teaching');
    expect(labels).toContain('Knowledge');
    expect(labels).toContain('Tasks');
    expect(labels).toContain('Professional');

    // Desktop ← Life must remain; phone More is the only Home exit under 720px.
    const back = root.querySelector('a.hub-rail__back[href="/"]');
    expect(back).not.toBeNull();
    expect(back?.textContent).toMatch(/Life/);
  });
});

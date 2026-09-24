import { describe, expect, it } from 'vitest';
import { renderHubShell, renderPrimaryNav } from '@/shell/shell';

describe('professional rail hub switcher', () => {
  it('offers a Tasks Hub link from the rail', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root);
    renderPrimaryNav(refs.railNav, 'meetings');

    const tasks = refs.rail.querySelector('a.hub-label[href="/tasks/"]');
    expect(tasks).not.toBeNull();
    expect(tasks?.textContent).toContain('Tasks');
    expect(refs.rail.querySelector('[data-hub="tasks"]')).not.toBeNull();
  });
});

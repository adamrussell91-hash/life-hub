import { describe, expect, it } from 'vitest';
import { renderHubShell, renderPrimaryNav } from '@/shell/shell';

describe('professional rail hub switcher', () => {
  it('offers a Tasks Hub link from the rail', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root);
    renderPrimaryNav(refs.railNav, 'calendar');

    const tasks = refs.rail.querySelector('a.hub-label[href="/tasks/"]');
    expect(tasks).not.toBeNull();
    expect(tasks?.textContent).toContain('Tasks');
    expect(refs.rail.querySelector('[data-hub="tasks"]')).not.toBeNull();
  });

  it('aligns Calendar with Home in majors (no sub indent)', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root);
    renderPrimaryNav(refs.railNav, 'home');

    const majors = refs.railNav.querySelector('.hub-rail__majors');
    const home = majors?.querySelector('a[href="#/home"]');
    const calendar = majors?.querySelector('a[href="#/calendar"]');
    expect(home).not.toBeNull();
    expect(calendar).not.toBeNull();
    expect(calendar?.classList.contains('hub-rail__link--sub')).toBe(false);
    expect(refs.rail.querySelector('.hub-rail__link--sub')).toBeNull();
    expect(refs.railNav.textContent).toMatch(/Comms/);
  });
});

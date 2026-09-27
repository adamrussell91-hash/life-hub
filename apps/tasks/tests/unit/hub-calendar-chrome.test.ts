import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chromeSrc = readFileSync(resolve(process.cwd(), 'src/views/hub-calendar-chrome.ts'), 'utf8');
const viewsCss = readFileSync(resolve(process.cwd(), 'src/styles/views.css'), 'utf8');
const kitCalendarCss = readFileSync(
  resolve(process.cwd(), '../../packages/design-kit/calendar.css'),
  'utf8'
);

describe('Tasks week calendar chrome', () => {
  it('stacks locks under the calendar instead of a right rail column', () => {
    expect(chromeSrc).toMatch(/tasks-calendar-chrome__below/);
    // Kit owns full-width workspace (#516); Tasks must not reintroduce a side column.
    expect(kitCalendarCss).toMatch(
      /\.hub-calendar__workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/
    );
    expect(kitCalendarCss).not.toMatch(
      /\.hub-calendar__workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+min\(/
    );
    expect(viewsCss).not.toMatch(
      /\.hub-calendar--workspace\s+\.hub-calendar__workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+min\(/
    );
    expect(viewsCss).toMatch(/\.tasks-calendar-chrome__below\.hub-calendar__rail/);
    // Week strip is kit-owned (all hubs) — Tasks only places grid-column.
    expect(kitCalendarCss).toMatch(
      /\.hub-calendar__rail\s+\.calendar-locks__list\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)/
    );
  });

  it('contains long lock titles inside each day column in the kit (all hubs)', () => {
    expect(kitCalendarCss).toMatch(
      /\.hub-calendar__rail\s+\.calendar-lock-row\s*\{[^}]*min-width:\s*0/
    );
    expect(kitCalendarCss).toMatch(
      /\.hub-calendar__rail\s+\.calendar-lock-row\s*\{[^}]*overflow:\s*hidden/
    );
    expect(kitCalendarCss).toMatch(
      /\.hub-calendar__rail\s+\.calendar-lock-row__task\s*\{[^}]*line-clamp:\s*3/
    );
    expect(kitCalendarCss).toMatch(
      /\.hub-calendar__rail\s+\.calendar-lock-row__task\s*\{[^}]*white-space:\s*normal/
    );
    expect(chromeSrc).toMatch(/displayLockTitle/);
    expect(chromeSrc).toMatch(/taskLabel\.title\s*=\s*lock\.title/);
    // Tasks must not reintroduce nowrap ellipsis that fights kit containment.
    expect(viewsCss).not.toMatch(
      /\.calendar-lock-row__task\s*\{[^}]*white-space:\s*nowrap/
    );
  });

  it('keeps Sort it off the brain-dump resize grip', () => {
    expect(kitCalendarCss).toMatch(/\.calendar-dump__actions/);
    expect(chromeSrc).toMatch(/calendar-dump__actions/);
  });

  it('collapses repeated words in lock titles', async () => {
    const { displayLockTitle } = await import('@/views/hub-calendar-chrome');
    expect(displayLockTitle('about about Fletcher')).toBe('about Fletcher');
    expect(displayLockTitle('Meeting about about progress')).toBe('Meeting about progress');
    expect(displayLockTitle('Good night')).toBe('Good night');
  });

  it('patches locks in place on refresh (Someday #514 pattern — not full rail remount)', () => {
    expect(chromeSrc).toMatch(/railSignature/);
    expect(chromeSrc).toMatch(/data-part="rail-locks".*replaceWith|replaceWith\(renderLocksWidget/s);
    expect(chromeSrc).toMatch(/replaceWith\(renderNextActionsWidget/);
  });

  it('mounts chrome with the real zoom so Almanac does not flash week locks', () => {
    expect(chromeSrc).toMatch(/opts\?\.zoom/);
    expect(chromeSrc).toMatch(/refresh\(\{\s*zoom:\s*initialZoom\s*\}\)/);
  });
});

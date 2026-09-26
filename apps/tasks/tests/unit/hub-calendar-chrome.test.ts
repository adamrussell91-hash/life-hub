import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chromeSrc = readFileSync(resolve(process.cwd(), 'src/views/hub-calendar-chrome.ts'), 'utf8');
const viewsCss = readFileSync(resolve(process.cwd(), 'src/styles/views.css'), 'utf8');

describe('Tasks week calendar chrome', () => {
  it('stacks locks under the calendar instead of a right rail column', () => {
    expect(chromeSrc).toMatch(/tasks-calendar-chrome__below/);
    expect(viewsCss).toMatch(
      /\.tasks-calendar-chrome__workspace\.hub-calendar__workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/
    );
    expect(viewsCss).toMatch(/\.tasks-calendar-chrome__below\.hub-calendar__rail/);
    expect(viewsCss).toMatch(
      /\.tasks-calendar-chrome__below\s+\.calendar-locks__list\s*\{[^}]*grid-template-columns:\s*repeat\(7/
    );
  });

  it('patches locks in place on refresh (Someday #514 pattern — not full rail remount)', () => {
    expect(chromeSrc).toMatch(/railSignature/);
    expect(chromeSrc).toMatch(/data-part="rail-locks".*replaceWith|replaceWith\(renderLocksWidget/s);
    expect(chromeSrc).toMatch(/replaceWith\(renderNextActionsWidget/);
  });
});

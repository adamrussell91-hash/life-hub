import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('capacity forecast chart styles are wired', () => {
  it('Tasks loads calendar-readiness.css with the day dial', () => {
    const main = readFileSync(path.resolve(process.cwd(), 'src/app/main.ts'), 'utf8');
    expect(main).toMatch(/calendar-day-dial\.css/);
    expect(main).toMatch(/calendar-readiness\.css/);
    // Import order: dial shell first, then readiness chart paint.
    expect(main.indexOf('calendar-day-dial.css')).toBeLessThan(main.indexOf('calendar-readiness.css'));
  });

  it('readiness CSS paints the band and line (not default SVG black fill)', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'design-kit/calendar-readiness.css'), 'utf8');
    expect(css).toMatch(/\.rf-band\s*\{[^}]*fill:\s*color-mix/);
    expect(css).toMatch(/\.rf-line\s*\{[^}]*fill:\s*none/);
    expect(css).toMatch(/\.rf-line\s*\{[^}]*stroke-width:\s*3/);
  });
});

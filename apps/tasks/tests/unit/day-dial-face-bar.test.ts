import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  path.resolve(process.cwd(), 'design-kit/calendar-day-dial.css'),
  'utf8'
);
const js = readFileSync(
  path.resolve(process.cwd(), 'design-kit/js/calendar/render-day-dial.js'),
  'utf8'
);

describe('day dial face bar centering', () => {
  it('mounts ‹ title › in a centre nav so Auto cannot shift the name off the dial', () => {
    expect(js).toMatch(/dd-face__nav/);
    expect(js).toMatch(/'data-part':\s*'face-nav'/);
    const mount = js.slice(js.indexOf('function mountFaceBar'));
    const body = mount.slice(0, mount.indexOf('\nfunction '));
    expect(body).toMatch(/el\([^)]*'dd-face__nav'/);
    expect(body).toMatch(/el\([^)]*'dd-face__name'/);
    expect(body).toMatch(/data-face-auto/);
  });

  it('uses a 1fr / auto / 1fr grid with Auto in the trailing column', () => {
    expect(css).toMatch(
      /\.dd-face\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/
    );
    expect(css).toMatch(/\.dd-face__nav\{[^}]*grid-column:\s*2/);
    expect(css).toMatch(/\.dd-face__auto\{[^}]*grid-column:\s*3/);
    expect(css).toMatch(/\.dd-face__nav\s*>\s*\.dd-face__step\{[^}]*order:\s*0/);
  });
});

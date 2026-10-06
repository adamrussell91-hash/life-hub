import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const goalsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/goals.css'), 'utf8');
const cardsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/cards.css'), 'utf8');
const filtersCss = readFileSync(path.resolve(process.cwd(), 'design-kit/filters.css'), 'utf8');

describe('domain chip centering', () => {
  it('does not force every .hub-chip to a 44px phone min-width from Goals CSS', () => {
    const mobile = goalsCss.match(/@media \(max-width: 719px\) \{([\s\S]*?)\n\}/);
    expect(mobile?.[1]).toBeTruthy();
    const block = mobile![1];
    // Bare `.hub-chip` in this rule left-aligned "Life" / "Other" on Board cards.
    expect(block).not.toMatch(/(?:^|,)\s*\.hub-chip\s*,/);
    expect(block).not.toMatch(/(?:^|,)\s*\.hub-chip\s*\{/);
    expect(block).toMatch(/\.goal-page\s+\.hub-chip/);
    expect(block).toMatch(/\.goals-checkin\s+\.hub-chip/);
  });

  it('centres kit hub-chip labels when a min-width remains', () => {
    expect(filtersCss).toMatch(/\.hub-chip\s*\{[^}]*justify-content:\s*center/s);
  });

  it('resets board phone chips so short domain labels hug their text', () => {
    const phone = cardsCss.match(/@media \(max-width: 720px\) \{([\s\S]*)\n\}/);
    expect(phone?.[1]).toBeTruthy();
    const chipRule = phone![1].match(
      /\.hub-canvas\s+\.hub-chip,[\s\S]*?\.morphing-popover__trigger\.status-badge\s*\{([\s\S]*?)\}/
    );
    expect(chipRule?.[1]).toMatch(/min-width:\s*0/);
    expect(chipRule?.[1]).toMatch(/justify-content:\s*center/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// travel.css loads after the design kit and sets a navy background on every
// .btn, which used to flatten the kit's --secondary / --ghost variants into
// copies of Save. The variants are restated at .btn.btn--x so they win.
const css = readFileSync(resolve(__dirname, '../../src/styles/travel.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n|,\\s*)${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? '';
}

describe('Travel button variants', () => {
  it('secondary and ghost buttons are light, not copies of the primary', () => {
    for (const selector of ['.btn.btn--secondary', '.btn.btn--ghost']) {
      const body = rule(selector);
      expect(body, selector).not.toBe('');
      expect(body, selector).not.toMatch(/background:\s*var\(--navy\)/);
      expect(body, selector).toMatch(/color:\s*var\(--(ink|marine)\)/);
    }
  });

  it('danger buttons are red, like the rest of Travel', () => {
    expect(rule('.btn.btn--danger')).toMatch(/background:\s*#9b2c2c/);
  });

  it('primary keeps the navy fill', () => {
    expect(rule('.btn.btn--primary')).toMatch(/background:\s*var\(--navy\)/);
  });
});

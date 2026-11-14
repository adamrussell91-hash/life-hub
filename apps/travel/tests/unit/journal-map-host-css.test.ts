import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const journalCss = readFileSync(resolve(__dirname, '../../src/styles/journal.css'), 'utf8');

/** Selectors of every rule that styles an element MapLibre turns into `.maplibregl-map`. */
function mapHostRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.trim();
    if (/__map-host\b/.test(selector)) rules.push({ selector, body: match[2]! });
  }
  return rules;
}

const classCount = (selector: string) => (selector.match(/\.[a-z_-][\w-]*/gi) ?? []).length;

describe('journal map hosts keep their size once MapLibre styles them', () => {
  // maplibre-gl.css loads after journal.css and sets `.maplibregl-map { position: relative }`
  // on the same element. A one-class rule loses, the host collapses to 0px and the map
  // (controls included) is clipped away: the Photo stops sheet and pin editor were blank.
  it('positions each map host with a selector that outranks .maplibregl-map', () => {
    const rules = mapHostRules(journalCss).filter((r) => /position:\s*absolute/.test(r.body));
    const hosts = rules.map((r) => r.selector);
    expect(hosts.some((s) => s.includes('journal-map-panel__map-host'))).toBe(true);
    expect(hosts.some((s) => s.includes('journal-pin-panel__map-host'))).toBe(true);
    for (const { selector } of rules) {
      for (const part of selector.split(',')) {
        expect(classCount(part), part.trim()).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

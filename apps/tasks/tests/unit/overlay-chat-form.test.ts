import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/views.css'), 'utf8');

describe('mobile overlay chat form', () => {
  it('stacks the composer as a column so Send sits under the textarea', () => {
    const formRule = viewsCss.match(
      /\.chat-view\[data-panel-mode='overlay'\]\s+\.chat-form\s*\{([^}]+)\}/g
    );
    expect(formRule?.some((rule) => /flex-direction:\s*column/.test(rule))).toBe(true);
  });

  it('makes the textarea full width under the overlay form', () => {
    expect(viewsCss).toMatch(
      /\.chat-view\[data-panel-mode='overlay'\]\s+\.chat-input[\s\S]{0,80}width:\s*100%/
    );
  });

  it('uses compact texting-sized bubbles on mobile', () => {
    expect(viewsCss).toMatch(/max-width:\s*min\(82%,\s*17\.5rem\)/);
    expect(viewsCss).toMatch(/\.chat-message__avatar\s*\{[^}]*width:\s*1\.6rem/);
  });
});

describe('chat message bubbles', () => {
  it('paints the assistant accent on the body so the avatar sits outside the bar', () => {
    expect(viewsCss).toMatch(
      /\.chat-message--assistant\[data-agent\]\s+\.chat-message__body\s*\{[^}]*border-left:/
    );
    const rowRule = viewsCss.match(/\.chat-message--assistant\[data-agent\]\s*\{([^}]+)\}/);
    expect(rowRule?.[1]).not.toMatch(/border-left:/);
  });

  it('lets the full-page chat fill the canvas', () => {
    const bodyRule = viewsCss.match(
      /\.hub-layout\[data-hub-view='clare'\]\s+\.hub-canvas__body\s*\{([^}]+)\}/
    );
    expect(bodyRule?.[1]).not.toMatch(/max-width:/);
    expect(bodyRule?.[1]).not.toMatch(/margin-inline:\s*auto/);
    expect(viewsCss).toMatch(
      /\.hub-layout\[data-hub-view='clare'\]\s+\.chat-view\s*\{[^}]*width:\s*100%/
    );
    expect(viewsCss).toMatch(
      /\.hub-layout\[data-hub-view='clare'\]\s+\.chat-message\s*\{[^}]*max-width:\s*100%/
    );
  });
});

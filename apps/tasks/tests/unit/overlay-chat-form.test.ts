import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/views.css'), 'utf8');

describe('mobile overlay chat form', () => {
  it('stacks the composer as a column so Send sits under the textarea', () => {
    expect(viewsCss).toMatch(
      /\.chat-view\s+\.chat-form\s*\{[^}]*flex-direction:\s*column/
    );
  });

  it('makes the textarea full width under the chat form on mobile', () => {
    expect(viewsCss).toMatch(/\.chat-view\s+\.chat-input[\s\S]{0,120}width:\s*100%/);
    expect(viewsCss).toMatch(/\.chat-view\s+#chat-input[\s\S]{0,120}min-width:\s*0/);
  });

  it('uses compact texting-sized bubbles on mobile', () => {
    expect(viewsCss).toMatch(/max-width:\s*min\(82%,\s*17\.5rem\)/);
    expect(viewsCss).toMatch(/\.chat-message__avatar\s*\{[^}]*width:\s*1\.6rem/);
  });

  it('raises the floating chat button above the locked mobile nav', () => {
    expect(viewsCss).toMatch(
      /\.floating-chat-button\s*\{[^}]*bottom:\s*calc\(5\.5rem\s*\+\s*env\(safe-area-inset-bottom/
    );
  });

  it('keeps the mobile overlay edge-to-edge without 100vw overflow', () => {
    expect(viewsCss).toMatch(
      /\.chat-view\[data-panel-mode='overlay'\]\s*\{[^}]*width:\s*100%/
    );
    expect(viewsCss).toMatch(
      /\.chat-view\[data-panel-mode='overlay'\]\s*\{[^}]*max-width:\s*100%/
    );
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

  it('clears the mobile nav under the full-page Clare canvas', () => {
    expect(viewsCss).toMatch(
      /\.hub-layout\[data-hub-view='clare'\]\s+\.hub-canvas\s*\{[^}]*padding-bottom:\s*calc\(5\.5rem/
    );
  });
});

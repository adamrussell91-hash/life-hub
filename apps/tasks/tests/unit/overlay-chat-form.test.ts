import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/views.css'), 'utf8');
const visualViewport = readFileSync(
  path.resolve(process.cwd(), 'src/chat/visual-viewport.ts'),
  'utf8'
);
const kitViewport = readFileSync(
  path.resolve(process.cwd(), 'design-kit/js/visual-viewport.js'),
  'utf8'
);
const kitChatCss = readFileSync(
  path.resolve(process.cwd(), 'design-kit/hub-chat-viewport.css'),
  'utf8'
);

describe('mobile overlay chat form', () => {
  it('keeps Send beside the textarea on mobile instead of stacking the composer', () => {
    expect(viewsCss).toMatch(
      /\.chat-view\s+\.chat-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/
    );
  });

  it('makes the textarea full width under the chat form on mobile', () => {
    expect(viewsCss).toMatch(/\.chat-view\s+\.chat-input[\s\S]{0,160}width:\s*100%/);
    expect(viewsCss).toMatch(/\.chat-view\s+#chat-input[\s\S]{0,160}min-width:\s*0/);
  });

  it('forces 16px input text so iOS Safari does not zoom and crush widths', () => {
    expect(viewsCss).toMatch(
      /\.chat-view\s+#chat-input[\s\S]{0,220}font-size:\s*16px/
    );
  });

  it('matches Messenger bubble density on mobile (16px / 1.25, user + assistant)', () => {
    expect(viewsCss).toMatch(
      /\.chat-message__body,\s*\.chat-message--user \.chat-message__body,\s*\.chat-message--assistant \.chat-message__body\s*\{[^}]*font-size:\s*16px/
    );
    expect(viewsCss).toMatch(
      /\.chat-message__body,\s*\.chat-message--user \.chat-message__body,\s*\.chat-message--assistant \.chat-message__body\s*\{[^}]*line-height:\s*1\.25/
    );
  });

  it('uses near-full-width bubbles on mobile instead of a 17.5rem desk card', () => {
    expect(viewsCss).toMatch(/max-width:\s*min\(92%,\s*100%\)/);
    expect(viewsCss).not.toMatch(/max-width:\s*min\(82%,\s*17\.5rem\)/);
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

  it('hides the locked mobile nav while the overlay chat is open', () => {
    expect(viewsCss).toMatch(
      /body:has\(\.chat-view\[data-panel-mode='overlay'\]:not\(\[hidden\]\)\)\s+\.hub-mobile-nav\s*\{[^}]*display:\s*none/
    );
  });

  it('re-exports the shared design-kit visual-viewport module (no per-hub fork)', () => {
    expect(visualViewport).toMatch(/design-kit\/js\/visual-viewport\.js/);
    expect(kitViewport).toMatch(/vv-keyboard-open/);
    expect(kitViewport).not.toMatch(/scrollIntoView/);
  });

  it('shares composer floor + keyboard nav hide in the design kit', () => {
    expect(kitChatCss).toMatch(/margin-top:\s*auto/);
    expect(kitChatCss).toMatch(/vv-keyboard-open[\s\S]*hub-mobile-nav/);
  });

  it('pins full-page Clare to the visual viewport and docks on keyboard', () => {
    expect(viewsCss).toMatch(
      /html\.vv-keyboard-open[\s\S]*data-hub-view='clare'[\s\S]*position:\s*fixed/
    );
    expect(viewsCss).toMatch(
      /html\.vv-keyboard-open[\s\S]*data-hub-view='clare'[\s\S]*height:\s*var\(--vv-height/
    );
    expect(viewsCss).toMatch(
      /\[data-hub-view='clare'\]:has\(#chat-form:focus-within\)[\s\S]*\.hub-canvas[\s\S]*padding-bottom:\s*0/
    );
    expect(viewsCss).toMatch(
      /\.hub-layout\[data-hub-view='clare'\]\s+\.chat-form\s*\{[^}]*margin-top:\s*auto/
    );
  });

  it('only shrinks the mobile overlay to --vv-height while the keyboard is open', () => {
    const overlayBlock = viewsCss.slice(viewsCss.indexOf(".chat-view[data-panel-mode='overlay'] {"));
    expect(overlayBlock).toMatch(
      /html\.vv-keyboard-open[\s\S]*data-panel-mode='overlay'[\s\S]*height:\s*var\(--vv-height/
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
      /\.hub-layout\[data-hub-view='clare'\]\s*\{[^}]*padding-bottom:\s*calc\(5\.5rem/
    );
    expect(viewsCss).toMatch(
      /\.hub-layout\[data-hub-view='clare'\]\s+\.hub-canvas\s*\{[^}]*padding-bottom:\s*0/
    );
  });
});

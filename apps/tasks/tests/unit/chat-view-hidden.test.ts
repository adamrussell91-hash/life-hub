import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildChatHome, buildChatView } from '@/chat/build-chat-view';
import { createChatPanelController } from '@/chat/chat-panel';

const viewsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/views.css'), 'utf8');

describe('parked Clare chat', () => {
  it('builds the overlay hidden so it can sit off the canvas', () => {
    const view = buildChatView();
    expect(view.id).toBe('chat-view');
    expect(view.hidden).toBe(true);
    expect(view.classList.contains('chat-view')).toBe(true);
    expect(view.querySelector('#chat-domain')).toBeNull();
    const hide = view.querySelector('[data-hub-scroll-hide]');
    expect(hide?.querySelector('#agent-picker')).toBeTruthy();
    expect(hide?.getAttribute('data-hub-scroll-scroller')).toBe('#chat-messages');
    expect(view.querySelector('.chat-form__tools .hub-filter')).toBeNull();
  });

  it('closes the overlay back into a host that does not take layout', () => {
    const home = buildChatHome();
    const view = buildChatView();
    home.append(view);
    const slot = document.createElement('div');
    const panel = createChatPanelController({ panel: view, homeSlot: home });

    panel.open(slot, 'var(--wave)');
    expect(view.hidden).toBe(false);
    expect(view.parentElement).toBe(slot);

    panel.close();
    expect(view.hidden).toBe(true);
    expect(view.parentElement).toBe(home);
    expect(home.id).toBe('chat-view-home');
  });

  it('overrides display:flex so [hidden] actually hides the parked panel', () => {
    expect(viewsCss).toMatch(/#chat-view-home\s*\{[^}]*display:\s*none/);
    expect(viewsCss).toMatch(/\.chat-view\[hidden\]\s*\{[^}]*display:\s*none/);
    expect(viewsCss).toMatch(/\.chat-view:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex/);
  });
});

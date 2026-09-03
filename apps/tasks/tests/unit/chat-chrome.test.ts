import { describe, expect, it } from 'vitest';
import { buildChatView } from '@/chat/build-chat-view';
import { syncChatChrome, toggleChatChrome } from '@/chat/chat-chrome';
import { appendMessage } from '@/chat/render-chat';

describe('chat chrome collapse', () => {
  it('stays expanded while the thread is empty', () => {
    const view = buildChatView();
    view.hidden = false;
    syncChatChrome(view);
    expect(view.dataset.chrome).toBeUndefined();
    expect(view.querySelector<HTMLButtonElement>('#chat-tools')?.hidden).toBe(true);
  });

  it('collapses protocols once a message lands and offers Tools', () => {
    const view = buildChatView();
    view.hidden = false;
    appendMessage(view, { role: 'assistant', text: 'Dump away.' });
    expect(view.dataset.chrome).toBe('engaged');
    const tools = view.querySelector<HTMLButtonElement>('#chat-tools')!;
    expect(tools.hidden).toBe(false);
    expect(tools.getAttribute('aria-expanded')).toBe('false');
    expect(tools.textContent).toBe('Tools');
  });

  it('toggles protocol trays back open via Tools', () => {
    const view = buildChatView();
    view.hidden = false;
    appendMessage(view, { role: 'assistant', text: 'Dump away.' });
    toggleChatChrome(view);
    expect(view.dataset.chromeExpanded).toBe('true');
    const tools = view.querySelector<HTMLButtonElement>('#chat-tools')!;
    expect(tools.getAttribute('aria-expanded')).toBe('true');
    expect(tools.textContent).toBe('Hide tools');
    toggleChatChrome(view);
    expect(view.dataset.chromeExpanded).toBeUndefined();
  });
});

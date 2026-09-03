import { describe, expect, it } from 'vitest';
import { createChatPanelController } from '@/chat/chat-panel';

describe('chat panel', () => {
  it('opens by reparenting into the slot and sets overlay mode', () => {
    const home = document.createElement('div');
    const panel = document.createElement('section');
    panel.hidden = true;
    home.append(panel);
    const slot = document.createElement('div');
    const controller = createChatPanelController({ panel, homeSlot: home });

    controller.open(slot, 'var(--wave)');

    expect(panel.parentElement).toBe(slot);
    expect(panel.hidden).toBe(false);
    expect(panel.dataset.panelMode).toBe('overlay');
    expect(panel.style.getPropertyValue('--agent-accent')).toBe('var(--wave)');
    expect(controller.isOpen()).toBe(true);
  });

  it('closes back to the home slot without clearing the accent', () => {
    const home = document.createElement('div');
    const panel = document.createElement('section');
    home.append(panel);
    const slot = document.createElement('div');
    const controller = createChatPanelController({ panel, homeSlot: home });
    controller.open(slot, 'var(--wave)');

    controller.close();

    expect(panel.parentElement).toBe(home);
    expect(panel.hidden).toBe(true);
    expect(panel.dataset.panelMode).toBeUndefined();
    expect(panel.style.getPropertyValue('--agent-accent')).toBe('var(--wave)');
    expect(controller.isOpen()).toBe(false);
  });

  it('moves the same panel when opened on a second slot', () => {
    const home = document.createElement('div');
    const panel = document.createElement('section');
    home.append(panel);
    const first = document.createElement('div');
    const second = document.createElement('div');
    const controller = createChatPanelController({ panel, homeSlot: home });

    controller.open(first, 'var(--wave)');
    controller.open(second, 'var(--navy)');

    expect(panel.parentElement).toBe(second);
    expect(first.children).toHaveLength(0);
    expect(panel.style.getPropertyValue('--agent-accent')).toBe('var(--navy)');
  });
});

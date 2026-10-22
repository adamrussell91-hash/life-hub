import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOverlay } from '@/markbook/overlay';

afterEach(() => document.body.replaceChildren());

const panel = () => {
  const content = document.createElement('div');
  const heading = document.createElement('h3');
  heading.id = 'panel-heading';
  heading.textContent = 'Panel';
  const first = document.createElement('button');
  first.textContent = 'First';
  const last = document.createElement('button');
  last.textContent = 'Last';
  content.append(heading, first, last);
  return { content, first, last };
};
const key = (target: HTMLElement, k: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

describe('overlay', () => {
  it('wraps the content as a modal dialog and makes the page inert', () => {
    const page = document.createElement('main');
    const already = document.createElement('aside');
    already.setAttribute('inert', '');
    document.body.append(page, already);
    const { content } = panel();
    const { overlay, close } = openOverlay(content, { labelledBy: 'panel-heading' });
    expect(overlay.className).toBe('mb-overlay');
    expect(overlay.parentElement).toBe(document.body);
    expect(content.getAttribute('role')).toBe('dialog');
    expect(content.getAttribute('aria-modal')).toBe('true');
    expect(content.getAttribute('aria-labelledby')).toBe('panel-heading');
    expect(page.hasAttribute('inert')).toBe(true);
    expect(overlay.hasAttribute('inert')).toBe(false);
    close();
    expect(document.body.contains(overlay)).toBe(false);
    expect(page.hasAttribute('inert')).toBe(false);
    expect(already.hasAttribute('inert')).toBe(true);
  });

  it('uses aria-label when given one', () => {
    const { content } = panel();
    openOverlay(content, { label: 'Edit things' });
    expect(content.getAttribute('aria-label')).toBe('Edit things');
  });

  it('traps Tab and Shift+Tab inside the content', () => {
    const { content, first, last } = panel();
    openOverlay(content, {});
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).toBe(first);
    key(first, 'Tab', true);
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape unless canClose says no', () => {
    let allowed = false;
    const { content, first } = panel();
    const { overlay } = openOverlay(content, { canClose: () => allowed });
    key(first, 'Escape');
    expect(document.body.contains(overlay)).toBe(true);
    allowed = true;
    key(first, 'Escape');
    expect(document.body.contains(overlay)).toBe(false);
  });

  it('returns focus to the opener, or to the fallback when the opener has gone', () => {
    const opener = document.createElement('button');
    const fallback = document.createElement('h2');
    fallback.tabIndex = -1;
    document.body.append(opener, fallback);
    opener.focus();
    const one = openOverlay(panel().content, { returnFocus: () => fallback });
    one.close();
    expect(document.activeElement).toBe(opener);
    opener.focus();
    const two = openOverlay(panel().content, { returnFocus: () => fallback });
    opener.remove();
    two.close();
    expect(document.activeElement).toBe(fallback);
  });

  it('still handles Escape and Tab after focus leaves the content, for example a backdrop click', () => {
    const { content, first } = panel();
    const { overlay } = openOverlay(content, {});
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    key(document.body, 'Tab');
    expect(document.activeElement).toBe(first);
    first.blur();
    key(document.body, 'Escape');
    expect(document.body.contains(overlay)).toBe(false);
  });

  it('stops listening once closed', () => {
    const { content } = panel();
    const canClose = vi.fn(() => true);
    const { close } = openOverlay(content, { canClose });
    close();
    key(document.body, 'Escape');
    expect(canClose).not.toHaveBeenCalled();
  });

  it('ignores keys meant for another dialog, such as a confirm card', () => {
    const { content } = panel();
    const { overlay } = openOverlay(content, {});
    const card = document.createElement('button');
    document.body.append(card);
    card.focus();
    key(card, 'Escape');
    expect(document.body.contains(overlay)).toBe(true);
  });

  it('keeps the page inert while a later overlay is still open', () => {
    const page = document.createElement('main');
    document.body.append(page);
    const a = openOverlay(panel().content, {});
    const b = openOverlay(panel().content, {});
    expect(a.overlay.hasAttribute('inert')).toBe(true);
    a.close();
    expect(page.hasAttribute('inert')).toBe(true);
    expect(b.overlay.hasAttribute('inert')).toBe(false);
    b.close();
    expect(page.hasAttribute('inert')).toBe(false);
  });

  it('only the top overlay answers Escape, and closing it wakes the one under it', () => {
    const page = document.createElement('main');
    document.body.append(page);
    const a = openOverlay(panel().content, {});
    const b = openOverlay(panel().content, {});
    key(document.body, 'Escape');
    expect(document.body.contains(b.overlay)).toBe(false);
    expect(document.body.contains(a.overlay)).toBe(true);
    expect(a.overlay.hasAttribute('inert')).toBe(false);
    expect(page.hasAttribute('inert')).toBe(true);
    a.close();
    expect(page.hasAttribute('inert')).toBe(false);
  });
});

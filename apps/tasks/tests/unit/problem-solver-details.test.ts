import { describe, expect, it, vi } from 'vitest';
import { contestedLabel, createDisclosureGroup, detailsCard, syncContested } from '../../../../packages/problem-solver/render/details';
import type { PsNode } from '../../../../packages/problem-solver/types';

const node: PsNode = { id: 'n', slot: 'cause:1', text: 'Full answer text.', state: 'contested', objection: 'Too vague.', skills: ['analysis'], turnId: 't' };

describe('details card', () => {
  it('shows text, skill chips and the coach objection', () => {
    const card = detailsCard(document, node, 'blue', 'd1');
    expect(card.id).toBe('d1');
    expect(card.querySelector('.ps-details__card--blue')).not.toBeNull();
    expect(card.querySelector('.ps-details__text')!.textContent).toBe('Full answer text.');
    expect(card.querySelectorAll('.ps-details__skills .ps-skill').length).toBe(1);
    expect(card.querySelector('.ps-details__note')!.textContent).toContain('Too vague.');
  });
});

describe('disclosure group', () => {
  it('opens one item at a time and syncs aria-expanded', () => {
    const group = createDisclosureGroup();
    const make = () => {
      const item = document.createElement('div');
      const button = document.createElement('button');
      item.append(button);
      group.register(item, button);
      return { item, button };
    };
    const a = make();
    const b = make();
    a.button.click();
    expect(a.item.classList.contains('is-open')).toBe(true);
    expect(a.button.getAttribute('aria-expanded')).toBe('true');
    b.button.click();
    expect(a.item.classList.contains('is-open')).toBe(false);
    expect(a.button.getAttribute('aria-expanded')).toBe('false');
    b.button.click();
    expect(b.item.classList.contains('is-open')).toBe(false);
  });

  it('forgets an unregistered item: close() and other clicks leave it alone', () => {
    const group = createDisclosureGroup();
    const make = () => {
      const item = document.createElement('div');
      const button = document.createElement('button');
      item.append(button);
      group.register(item, button);
      return { item, button };
    };
    const a = make();
    const b = make();
    a.button.click();
    group.unregister(a.item);
    b.button.click();
    expect(a.item.classList.contains('is-open')).toBe(true);
    group.close();
    expect(a.item.classList.contains('is-open')).toBe(true);
    expect(b.item.classList.contains('is-open')).toBe(false);
  });
});

describe('disclosure group: Escape and close', () => {
  const escape = (target: Element) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  function setup(cardInside: boolean) {
    const host = document.createElement('div');
    document.body.append(host);
    const group = createDisclosureGroup();
    const button = document.createElement('button');
    const card = document.createElement('div');
    const inner = document.createElement('a');
    inner.href = '#';
    card.append(inner);
    if (cardInside) {
      const item = document.createElement('div');
      item.append(button, card);
      host.append(item);
      group.register(item, button);
      return { host, group, button, card, inner, item, done: () => host.remove() };
    }
    host.append(button, card);
    group.register(card, button);
    return { host, group, button, card, inner, item: card, done: () => host.remove() };
  }

  it.each([true, false])('closes the open card and returns focus to its button (card inside the item: %s)', (inside) => {
    const { button, inner, item, done } = setup(inside);
    button.click();
    inner.focus();
    const event = escape(inner);
    expect(item.classList.contains('is-open')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    expect(event.defaultPrevented).toBe(true);
    done();
  });

  it('Escape on the button of an open card closes it and stops there', () => {
    const { host, button, item, done } = setup(false);
    const outer = vi.fn();
    host.addEventListener('keydown', outer);
    button.click();
    escape(button);
    expect(item.classList.contains('is-open')).toBe(false);
    expect(outer).not.toHaveBeenCalled();
    done();
  });

  it('lets Escape through to outer handlers when nothing is open', () => {
    const { host, button, done } = setup(true);
    const outer = vi.fn();
    host.addEventListener('keydown', outer);
    const event = escape(button);
    expect(outer).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    done();
  });

  it('ignores other keys', () => {
    const { button, item, done } = setup(true);
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(item.classList.contains('is-open')).toBe(true);
    done();
  });

  it('close() shuts whatever is open', () => {
    const { group, button, item, done } = setup(true);
    button.click();
    group.close();
    expect(item.classList.contains('is-open')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    done();
  });
});

describe('syncContested', () => {
  it('adds and removes the ", contested" before ". Show details"', () => {
    expect(contestedLabel('Why 1: No calendar. Show details', true)).toBe('Why 1: No calendar, contested. Show details');
    expect(contestedLabel('Why 1: No calendar, contested. Show details', false)).toBe('Why 1: No calendar. Show details');
    expect(contestedLabel('Why 1: No calendar, contested. Show details', true)).toBe('Why 1: No calendar, contested. Show details');
    expect(contestedLabel('Plain label', true)).toBe('Plain label');
  });

  it('round-trips class, tag, label and note in place', () => {
    const root = document.createElement('div');
    const item = document.createElement('div');
    const button = document.createElement('button');
    button.setAttribute('aria-controls', 'sync-1');
    button.setAttribute('aria-label', 'Cause 1: Rota. Show details');
    item.append(button);
    root.append(item, detailsCard(document, { ...node, state: 'accepted', objection: undefined }, 'red', 'sync-1'));
    const contested = { ...node, objection: 'Which rota?' };
    syncContested(item, contested, button, button);
    expect(item.classList.contains('is-contested')).toBe(true);
    const tag = button.querySelector('.ps-objection')!;
    expect(tag.getAttribute('title')).toBe('Which rota?');
    expect(button.getAttribute('aria-label')).toBe('Cause 1: Rota, contested. Show details');
    expect(root.querySelector('.ps-details__note')!.textContent).toContain('Which rota?');
    syncContested(item, { ...contested, objection: 'Still unclear.' }, button, button);
    expect(button.querySelector('.ps-objection')).toBe(tag);
    expect(tag.getAttribute('title')).toBe('Still unclear.');
    expect(root.querySelector('.ps-details__note')!.textContent).toContain('Still unclear.');
    syncContested(item, { ...node, state: 'accepted' }, button, button);
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(button.querySelector('.ps-objection')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Cause 1: Rota. Show details');
    expect(root.querySelector('.ps-details__note')).toBeNull();
  });
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageLinkHref, startPageLinks } from '@/app/page-links';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('page links on the umbrella site', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/teaching/');
    document.body.replaceChildren();
    stop = startPageLinks();
  });

  afterEach(() => {
    stop();
    vi.unstubAllEnvs();
  });

  it('adds the hub to links for its own pages, keeping query and hash', () => {
    expect(pageLinkHref('/')).toBe('/teaching/');
    expect(pageLinkHref('/classes')).toBe('/teaching/classes');
    expect(pageLinkHref('/lessons/l1?tab=a#block=b')).toBe('/teaching/lessons/l1?tab=a#block=b');
    expect(pageLinkHref('/s/lessons/l1')).toBe('/teaching/s/lessons/l1');
  });

  it('leaves everything else alone', () => {
    for (const href of [
      '/teaching/classes',
      '/tasks/#/task/t1',
      '/knowledge/#page/p1',
      '/api/export/x',
      '/assets/blocks/a.png',
      '//example.com/classes',
      'https://example.com/classes',
      '#block-1',
      'mailto:a@example.com'
    ]) {
      expect(pageLinkHref(href)).toBe(href);
    }
  });

  it('fixes links as they are added and when their address changes', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<nav><a id="nested" href="/units">Units</a></nav>';
    const direct = document.createElement('a');
    direct.href = '/lessons';
    document.body.append(host, direct);
    await settle();
    expect(host.querySelector('#nested')?.getAttribute('href')).toBe('/teaching/units');
    expect(direct.getAttribute('href')).toBe('/teaching/lessons');

    direct.setAttribute('href', '/classes');
    await settle();
    expect(direct.getAttribute('href')).toBe('/teaching/classes');
  });

  it('keeps what was typed in an editor, since that gets saved', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = '<a href="/classes">Classes</a>';
    document.body.append(editor);
    await settle();
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('/classes');
  });

  it('lets Cmd and Ctrl click reach the browser instead of the link handler', () => {
    const link = document.createElement('a');
    link.setAttribute('href', '/classes');
    const handler = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', handler);
    document.body.append(link);

    const cmd = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(cmd);
    expect(handler).not.toHaveBeenCalled();
    expect(cmd.defaultPrevented).toBe(false);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('page links with the app at the root', () => {
  it('changes nothing, as on the class site', () => {
    expect(pageLinkHref('/classes')).toBe('/classes');
  });
});

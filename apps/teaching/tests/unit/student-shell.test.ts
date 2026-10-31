import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStudentShell, guardStudentLinks, isStudentSafeHref, studentAnchor } from '@/student/shell';
import { navigate } from '@/app/router';
vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

describe('student shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(['/s/units/unit_a', '/s/classes/class_a', '/s/lessons/lesson_a'])('keeps %s on the student-safe host from LifeHub', (path) => {
    vi.stubGlobal('location', new URL('https://life-hub.adam-russell.com/teaching/s/lessons/lesson_a'));
    const link = studentAnchor(path, 'test', 'Back');
    expect(link.getAttribute('href')).toBe(`https://class.adam-russell.com${path}`);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps same-site student navigation in the SPA', () => {
    vi.stubGlobal('location', new URL('https://class.adam-russell.com/s/lessons/lesson_a'));
    const link = studentAnchor('/s/units/unit_a', 'test');
    const click = new MouseEvent('click', { cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/s/units/unit_a');
  });

  it('allows a modified click to open a student page in a new tab', () => {
    vi.stubGlobal('location', new URL('https://class.adam-russell.com/s/lessons/lesson_a'));
    const link = studentAnchor('/s/units/unit_a', 'test');
    const click = new MouseEvent('click', { cancelable: true, metaKey: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('exposes a skip link to the main content', () => {
    const { surface, content } = createStudentShell();
    const skip = surface.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.textContent).toBe('Skip to content');
    expect(skip?.getAttribute('href')).toBe('#student-main');
    expect(content.id).toBe('student-main');
  });
});

describe('student link guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  const base = 'https://class.adam-russell.com/s/lessons/lesson_a';

  it.each([
    'https://example.org/reading',
    'https://class.adam-russell.com/s/units/unit_a',
    '/s/lessons/lesson_b',
    '#part-2',
    'mailto:someone@example.org',
    'https://api.adam-russell.com/api/media/m_1/file',
    'blob:https://class.adam-russell.com/abc'
  ])('lets a student follow %s', (href) => {
    expect(isStudentSafeHref(href, base)).toBe(true);
  });

  it.each([
    'https://life-hub.adam-russell.com/teaching/',
    'https://life-hub.adam-russell.com/',
    'https://LIFE-HUB.adam-russell.com./knowledge',
    'https://adam-russell.com/',
    'https://teaching-hub.adam-russell.com/lessons/x',
    'https://api.adam-russell.com/api/session',
    '/lessons/lesson_a',
    '/sign-in',
    '/',
    '//life-hub.adam-russell.com/',
    'javascript:alert(1)'
  ])('stops a student following %s', (href) => {
    expect(isStudentSafeHref(href, base)).toBe(false);
  });

  it('disarms hub links in lesson content, including ones rendered later', async () => {
    vi.stubGlobal('location', new URL(base));
    const root = document.createElement('div');
    root.innerHTML = '<a href="https://life-hub.adam-russell.com/">Hub</a><a href="https://example.org/">Out</a>';
    document.body.append(root);
    const guard = guardStudentLinks(root);
    const [hub, out] = root.querySelectorAll('a');
    expect(hub!.hasAttribute('href')).toBe(false);
    expect(hub!.textContent).toBe('Hub');
    expect(out!.getAttribute('href')).toBe('https://example.org/');

    const late = document.createElement('a');
    late.href = '/teaching/lessons/x';
    root.append(late);
    const frame = document.createElement('iframe');
    frame.src = 'https://life-hub.adam-russell.com/teaching/';
    root.append(frame);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(late.hasAttribute('href')).toBe(false);
    expect(root.contains(frame)).toBe(false);

    out!.setAttribute('href', 'https://life-hub.adam-russell.com/tasks/');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(out!.hasAttribute('href')).toBe(false);
    guard.dispose();
  });

  it('never names a hub in the student header', () => {
    const { surface } = createStudentShell();
    expect(surface.textContent).not.toMatch(/hub/i);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classForPlainLesson, lessonToReturnTo, mountInitialsToken } from '@/student/initials-token';
import { apiGet, apiPost } from '@/api/client';

vi.mock('@/api/client', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), ApiClientError: class extends Error {} }));

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const mount = (call: () => Promise<{ need: 'initials' | null; initials?: string; unseen?: number }>) =>
  mountInitialsToken({ classId: 'class1', from: '/s/lessons/l1?class=class1', call });

describe('initials token', () => {
  it('shows initials and links to the progress page with the way back', async () => {
    const { element } = mount(async () => ({ need: null, initials: 'BB', unseen: 0 }));
    expect(element.hidden).toBe(true);
    await flush();
    expect(element.hidden).toBe(false);
    expect(element.textContent).toBe('BB');
    expect(element.querySelector('.st-token__count')).toBeNull();
    expect((element as HTMLAnchorElement).href).toContain('/s/classes/class1/profile?from=%2Fs%2Flessons%2Fl1%3Fclass%3Dclass1');
  });
  it('counts new feedback and says so to a screen reader', async () => {
    const { element } = mount(async () => ({ need: null, initials: 'BB', unseen: 2 }));
    await flush();
    expect(element.querySelector('.st-token__count')!.textContent).toBe('2');
    expect(element.getAttribute('aria-label')).toBe('My progress, BB, 2 pieces of new feedback');
  });
  it('says My progress before initials, and when the check fails', async () => {
    const need = mount(async () => ({ need: 'initials' }));
    const failed = mount(async () => { throw new Error('offline'); });
    await flush();
    expect(need.element.textContent).toBe('My progress');
    expect(failed.element.textContent).toBe('My progress');
  });
  it('picks up initials given later on the page', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ need: 'initials' })
      .mockResolvedValueOnce({ need: null, initials: 'BB', unseen: 0 });
    const token = mount(call);
    await flush();
    token.refresh();
    await flush();
    expect(token.element.textContent).toBe('BB');
  });
});

describe('lessonToReturnTo', () => {
  it('takes lesson pages only', () => {
    const from = (path: string) => lessonToReturnTo(`?from=${encodeURIComponent(path)}`);
    expect(from('/s/lessons/l1?class=class1')).toBe('/s/lessons/l1?class=class1');
    expect(from('/s/classes/c1/lessons/l1')).toBe('/s/classes/c1/lessons/l1');
    expect(from('/s/classes/c1')).toBeNull();
    expect(from('https://elsewhere.example/s/lessons/l1')).toBeNull();
    expect(from('//elsewhere.example/s/lessons/l1')).toBeNull();
    expect(lessonToReturnTo('')).toBeNull();
  });
});

describe('classForPlainLesson', () => {
  const classes = (...ids: string[]) => vi.mocked(apiGet).mockResolvedValue({ classes: ids.map((id) => ({ id })) });
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
  });
  it('takes the lesson\'s only class and remembers it, so the lookup runs once', async () => {
    classes('c1');
    expect(await classForPlainLesson('l1')).toBe('c1');
    expect(await classForPlainLesson('l1')).toBe('c1');
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/api/published/lessons/l1?classes=1');
  });
  it('picks the class that knows this device when there are several', async () => {
    classes('c1', 'c2');
    vi.mocked(apiPost).mockImplementation(async (path: string) => (path.includes('c2') ? { need: null, initials: 'BB', unseen: 0 } : { need: 'initials' }) as never);
    expect(await classForPlainLesson('l2')).toBe('c2');
  });
  it('names no class when several classes share it and none knows the device, and asks again next time', async () => {
    classes('c1', 'c2');
    vi.mocked(apiPost).mockResolvedValue({ need: 'initials' } as never);
    expect(await classForPlainLesson('l3')).toBeNull();
    await classForPlainLesson('l3');
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
  it('names no class when the lesson is on none', async () => {
    classes();
    expect(await classForPlainLesson('l4')).toBeNull();
  });
});

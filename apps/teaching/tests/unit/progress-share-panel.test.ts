import { describe, it, expect, vi } from 'vitest';
import { mountProgressSharePanel, type ShareRow } from '@/teacher/sections/progress-share-panel';

const askConfirmCard = vi.fn(() => Promise.resolve(true));
vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: (...args: unknown[]) => askConfirmCard(...(args as [])) }));

const row = (over: Partial<ShareRow> = {}): ShareRow => ({ token: 'Abc123_-Abc123_-Abc123_-', student_id: 'st_a', initials: 'PT', made_at: '2026-11-15T01:00:00Z', opened_at: null, pin: '123456', pin_used_at: null, devices: 0, ...over });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('progress share panel', () => {
  it('adds a share and shows the link and PIN', async () => {
    const api = {
      list: vi.fn(async () => ({ shares: [] as ShareRow[] })),
      add: vi.fn(async () => ({ shares: [row()], made: 'Abc123_-Abc123_-Abc123_-' })),
      newPin: vi.fn(),
      remove: vi.fn()
    };
    const host = document.createElement('div');
    mountProgressSharePanel(host, { classId: 'class1', studentId: 'st_a', studentName: 'Ana Ames', api, origin: 'https://class.example' });
    await flush();
    expect(host.textContent).toContain('No links yet.');
    host.querySelector<HTMLInputElement>('input[name="viewer-initials"]')!.value = 'pt';
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(api.add).toHaveBeenCalledWith('class1', 'st_a', 'pt');
    expect(host.textContent).toContain('https://class.example/s/share/Abc123_-Abc123_-Abc123_-');
    expect(host.textContent).toContain('PIN 123456 (works once)');
  });

  it('shows Used once the PIN is spent, and only this student’s shares', async () => {
    const api = {
      list: vi.fn(async () => ({ shares: [row({ pin: null, pin_used_at: '2026-11-15T02:00:00Z', devices: 1 }), row({ token: 'Zzz123_-Zzz123_-Zzz123_-', student_id: 'st_b' })] })),
      add: vi.fn(),
      newPin: vi.fn(),
      remove: vi.fn()
    };
    const host = document.createElement('div');
    mountProgressSharePanel(host, { classId: 'class1', studentId: 'st_a', studentName: 'Ana Ames', api, origin: 'https://class.example' });
    await flush();
    expect(host.querySelectorAll('.share-panel__row')).toHaveLength(1);
    expect(host.textContent).toContain('PIN used');
    expect(host.textContent).toContain('1 browser in');
  });

  it('new PIN and remove call the API', async () => {
    const api = {
      list: vi.fn(async () => ({ shares: [row()] })),
      add: vi.fn(),
      newPin: vi.fn(async () => ({ shares: [row({ pin: '654321' })] })),
      remove: vi.fn(async () => ({ shares: [] as ShareRow[] }))
    };
    const host = document.createElement('div');
    mountProgressSharePanel(host, { classId: 'class1', studentId: 'st_a', studentName: 'Ana Ames', api, origin: 'https://class.example' });
    await flush();
    host.querySelector<HTMLButtonElement>('[aria-label="Make a new PIN for PT"]')!.click();
    await flush();
    expect(host.textContent).toContain('PIN 654321');
    host.querySelector<HTMLButtonElement>('[aria-label="Remove PT’s link"]')!.click();
    await flush();
    expect(askConfirmCard).toHaveBeenCalled();
    expect(api.remove).toHaveBeenCalledWith('class1', 'Abc123_-Abc123_-Abc123_-');
    expect(host.textContent).toContain('No links yet.');
  });
});

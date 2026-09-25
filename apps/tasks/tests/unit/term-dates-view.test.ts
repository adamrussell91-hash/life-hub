import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHubPrefs } from '@/domain/hub-prefs';
import { tasksApi } from '@/services/client-api';
import { renderTermDatesView } from '@/views/term-dates';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getHubPrefs: vi.fn(),
    updateHubPrefs: vi.fn()
  }
}));

describe('term dates panel', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows the NSW seed as dd/mm/yy and saves an edited term through hub prefs', async () => {
    vi.mocked(tasksApi.getHubPrefs).mockResolvedValue(parseHubPrefs({}));
    vi.mocked(tasksApi.updateHubPrefs).mockImplementation(async (patch) => parseHubPrefs(patch));
    const canvas = document.createElement('div');
    await renderTermDatesView(canvas);

    expect(canvas.textContent).toContain('NSW public dates');
    expect(canvas.textContent).toContain('Fill 2027');
    const start = canvas.querySelector<HTMLInputElement>('[aria-label="T1 2026 start"]');
    expect(start?.value).toBe('2026-02-02');
    expect(canvas.textContent).toContain('02/02/26');
    expect(canvas.querySelector('[aria-label="T4 2026 end"]')?.textContent).toBe('');

    start!.value = '2026-02-09';
    start!.dispatchEvent(new Event('input', { bubbles: true }));
    const save = canvas.querySelector<HTMLButtonElement>('button[type="submit"]');
    const form = save?.closest('form');
    expect(form).not.toBeNull();
    form!.requestSubmit();

    await vi.waitFor(() => expect(tasksApi.updateHubPrefs).toHaveBeenCalled());
    const saved = vi.mocked(tasksApi.updateHubPrefs).mock.calls[0]![0];
    expect(saved.school_terms?.find((row) => row.year === 2026)?.terms[0]).toEqual({
      term: 1,
      starts_on: '2026-02-09',
      ends_on: '2026-04-02'
    });
    expect(saved.school_terms?.some((row) => row.year === 2027 && row.terms.length === 0)).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearScheduleReadCache } from '@/api/client';
import { renderEventNewView } from '@/views/events';

describe('existing event edit draft', () => {
  beforeEach(() => { clearScheduleReadCache(); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ok: true, data: { preferences: {}, groups: {} }}))); });
  afterEach(() => vi.unstubAllGlobals());
  it('shows the editor while optional priority areas are still loading', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const canvas = document.createElement('div');
    void renderEventNewView(canvas, { draft: { title: 'PD' } });
    expect(canvas.querySelector('[aria-label="Title"]')).not.toBeNull();
  });
  it('leaves the destination untouched when the edit route is no longer current', async () => {
    const canvas = document.createElement('div');
    canvas.textContent = 'Destination page';
    await renderEventNewView(canvas, { isCurrent: () => false });
    expect(canvas.textContent).toBe('Destination page');
  });
  it('keeps unlogged hours and unknown accreditation on a title-only save', async () => {
    const canvas = document.createElement('div');
    const onSave = vi.fn(async (_payload: unknown) => {});
    await renderEventNewView(canvas, { draft: { title: 'PD', start: '2026-09-17T23:00:00.000Z', end: '2026-09-19T05:00:00.000Z', timeZone: 'Australia/Sydney', hours: null, accreditation: null }, onSave });
    canvas.querySelector<HTMLInputElement>('[aria-label="Title"]')!.value = 'New title';
    canvas.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'New title', hours: null, accreditation: null });
  });
  it('keeps the end day when changing the clock time of a multi-day event', async () => {
    const canvas = document.createElement('div');
    const onSave = vi.fn(async (_payload: unknown) => {});
    await renderEventNewView(canvas, { draft: { title: 'PD', start: '2026-09-17T23:00:00.000Z', end: '2026-09-19T05:00:00.000Z', timeZone: 'Australia/Sydney' }, onSave });
    const end = canvas.querySelector<HTMLInputElement>('[aria-label="End time"]')!;
    end.value = '16:00';
    end.dispatchEvent(new Event('input'));
    canvas.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ startIso: '2026-09-17T23:00:00.000Z', endIso: '2026-09-19T06:00:00.000Z' });
  });
});

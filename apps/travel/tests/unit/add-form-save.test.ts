import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';
import { ApiClientError } from '@/api/client';

const addItem = vi.fn();
const editItem = vi.fn();
const getTrip = vi.fn();
const parseEmail = vi.fn();

vi.mock('@/api/travel', () => ({
  addItem: (...args: unknown[]) => addItem(...args),
  editItem: (...args: unknown[]) => editItem(...args),
  getTrip: (...args: unknown[]) => getTrip(...args),
  parseEmail: (...args: unknown[]) => parseEmail(...args),
  removeItem: vi.fn(),
  searchPlaces: vi.fn()
}));

import { normalizeLink, renderAddForm } from '@/components/add-form';

const trip = fixtureTrip as unknown as Trip;

function button(host: ParentNode, text: string): HTMLButtonElement {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent === text);
  if (!b) throw new Error(`no button ${text}`);
  return b;
}

function input(host: ParentNode, name: string): HTMLInputElement {
  return host.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

function pinDefaultPlace(host: ParentNode): void {
  button(host, 'Pick on map').click();
}

function open() {
  const host = document.createElement('div');
  document.body.append(host);
  const onSaved = vi.fn();
  renderAddForm(host, { trip, tripId: trip.id, version: 'sha-v1', onSaved, onClose: vi.fn() });
  const submit = () => host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const note = () => host.querySelector('form p.hint:not(.aud)')!.textContent ?? '';
  return { host, onSaved, submit, note };
}

describe('add form save', () => {
  beforeEach(() => {
    addItem.mockReset();
    editItem.mockReset();
    getTrip.mockReset();
    parseEmail.mockReset();
    document.body.replaceChildren();
  });

  it('retries once with the latest version when the trip changed elsewhere', async () => {
    const { host, onSaved, submit } = open();
    input(host, 'title').value = 'Dinner';
    pinDefaultPlace(host);
    addItem
      .mockRejectedValueOnce(new ApiClientError({ code: 'conflict', message: 'Conflict.' }, 409))
      .mockResolvedValueOnce({ trip, version: 'sha-v3' });
    getTrip.mockResolvedValueOnce({ trip, version: 'sha-v2' });

    submit();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(trip, 'sha-v3'));
    expect(addItem.mock.calls[0]![1]).toBe('sha-v1');
    expect(addItem.mock.calls[1]![1]).toBe('sha-v2');
  });

  it('names the missing ticket field instead of sending a doomed request', () => {
    const { host, submit, note } = open();
    button(host, 'Train').click();
    input(host, 'title').value = 'Rail pass';
    submit();
    expect(addItem).not.toHaveBeenCalled();
    expect(note()).toContain('carrier');
    expect(input(host, 'carrier').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses hop minutes without a mode rather than dropping them silently', () => {
    const { host, submit, note } = open();
    input(host, 'title').value = 'Museum';
    pinDefaultPlace(host);
    input(host, 'hop.minutes').value = '30';
    submit();
    expect(addItem).not.toHaveBeenCalled();
    expect(note()).toContain('next stop');
  });

  it('requires a selected place for a physical stop before sending it', () => {
    const { host, submit, note } = open();
    input(host, 'title').value = 'Museum';
    submit();
    expect(addItem).not.toHaveBeenCalled();
    expect(note()).toContain('place');
  });

  it('shows the server reason and keeps the form open', async () => {
    const { host, onSaved, submit, note } = open();
    input(host, 'title').value = 'Museum';
    pinDefaultPlace(host);
    addItem.mockRejectedValueOnce(
      new ApiClientError({ code: 'validation_error', message: 'unknown currency', details: { path: 'item.cost.currency' } }, 400)
    );
    submit();
    await vi.waitFor(() => expect(note()).toContain('unknown currency'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(input(host, 'title').value).toBe('Museum');
  });

  it('fills ticket fields and the type from a pasted email', async () => {
    const { host, note } = open();
    parseEmail.mockResolvedValueOnce({
      draft: {
        kind: 'train',
        title: 'Lisbon to Porto',
        carrier: 'CP',
        number: 'AP 131',
        from_code: 'LIS',
        to_code: 'OPO',
        depart_time: '09:00',
        arrive_time: '11:50',
        status: 'booked'
      },
      confidence: 'high',
      missing: []
    });
    button(host, 'Fill from email').click();
    await vi.waitFor(() => expect(note()).toContain('Filled from the email'));
    expect(button(host, 'Train').getAttribute('aria-checked')).toBe('true');
    expect(input(host, 'carrier').value).toBe('CP');
    expect(input(host, 'to_code').value).toBe('OPO');
    expect(input(host, 'arrive_time').value).toBe('11:50');
    expect(input(host, 'time').value).toBe('09:00');
  });
});

describe('normalizeLink', () => {
  it('accepts blank, upgrades http, adds https to bare domains, rejects other schemes', () => {
    expect(normalizeLink('  ')).toBe('');
    expect(normalizeLink('https://a.com')).toBe('https://a.com');
    expect(normalizeLink('http://a.com/x')).toBe('https://a.com/x');
    expect(normalizeLink('www.a.com')).toBe('https://www.a.com');
    expect(normalizeLink('mailto:x@y.z')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(async () => ({
    people: [
      { ref: 'shared:person:p_declan', display_name: 'Declan J.', initials: 'DJ', updated_at: '2026-10-14T01:00:00.000Z' },
      { ref: 'shared:person:p_fletcher', display_name: 'Fletcher W.', initials: 'FW', updated_at: '2026-10-13T01:00:00.000Z' }
    ],
    organisations: [],
    counts: { people: 2, organisations: 0 }
  }))
}));
vi.mock('@/api/communications', () => ({
  createCommunication: vi.fn(async () => ({ communication: { id: 'communication_new' }, created: true }))
}));
vi.mock('@/api/ledger', () => ({
  createLedgerItem: vi.fn(async (body: object) => ({ item: body, created: true }))
}));

import { renderQuickLog } from '@/views/quick-log';
import { createCommunication } from '@/api/communications';
import { createLedgerItem } from '@/api/ledger';

describe('quick log', () => {
  afterEach(() => document.body.replaceChildren());

  it('logs a chat with the most recent person and a »me promise, then opens it', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    const navigate = vi.fn();
    await renderQuickLog(canvas, { now: () => new Date('2026-10-14T02:47:00.000Z'), navigate });
    expect(canvas.querySelector('[data-person][aria-pressed="true"]')?.textContent).toContain('Declan J.');
    expect(canvas.querySelector('[data-channel="in_person"]')?.getAttribute('aria-pressed')).toBe('true');
    const field = canvas.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = 'Essay plan fine. »me send quote bank by Thu';
    canvas.querySelector<HTMLButtonElement>('[data-part="log-it"]')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('#/communication/communication_new'));
    expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({ channel: 'in_person', subject: 'Essay plan fine.' }));
    expect(createLedgerItem).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'you_owe', text: 'send quote bank by Thu', comm_ref: 'professional:communication:communication_new' })
    );
  });
});

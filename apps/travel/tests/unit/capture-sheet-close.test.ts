import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { LATE_LOCATION_WINDOW_MS, openCaptureSheet } from '@/journal/capture-sheet';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';

type Fix = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
let deliverFix: Fix | null = null;

beforeEach(() => {
  deliverFix = null;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: Fix) => {
        deliverFix = ok; // the phone is "still finding itself" until a test delivers a fix
      },
    },
  });
});

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function open(extra: Partial<Parameters<typeof openCaptureSheet>[0]> = {}) {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  const journal = lisbonPortoJournal('trp_capture_close') as JournalDocument;
  const onSaved = vi.fn();
  const onClose = vi.fn();
  openCaptureSheet({
    tripId: journal.trip_id, legId: 'leg_lpporto001', localDate: '2027-03-06', journal, version: 'fixture', anchor, onSaved, onClose, ...extra,
  });
  const sheet = anchor.querySelector('.journal-capture-sheet') as HTMLElement;
  const type = (value: string): void => {
    const area = sheet.querySelector('textarea') as HTMLTextAreaElement;
    area.value = value;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const press = (label: string): void =>
    [...anchor.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label && !b.closest('[hidden]'))!.click();
  const savedText = (): string | undefined => {
    const [envelope, momentId] = onSaved.mock.calls[0]!;
    return (envelope.journal as JournalDocument).moments.find((m) => m.id === momentId)?.text;
  };
  return { anchor, sheet, type, press, onSaved, onClose, savedText };
}

describe('the Moment sheet keeps what is in it', () => {
  it('has Discard and Done, and no Save or Cancel', () => {
    const { anchor } = open();
    const labels = [...anchor.querySelectorAll('.addform__actions button')].map((b) => b.textContent);
    expect(labels).toEqual(['Discard', 'Done']);
  });

  it('keeps a note on Done, without waiting for a location', async () => {
    const { type, press, onSaved, savedText, anchor } = open();
    type('Rain on the window.');
    press('Done');
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1), { timeout: 1500 });
    expect(savedText()).toBe('Rain on the window.');
    expect(anchor.querySelector('.journal-capture-sheet')).toBeNull();
  });

  it('keeps a note when the sheet is dismissed (Escape from outside the field, Back, a tap outside)', async () => {
    const { type, onSaved, savedText, anchor } = open();
    type('Second coffee, no plans.');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(savedText()).toBe('Second coffee, no plans.');
    expect(anchor.querySelector('.journal-capture-sheet')).toBeNull();
  });

  it('just closes when there is nothing in it', async () => {
    const { press, onSaved, onClose, anchor } = open();
    press('Done');
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
    expect(anchor.querySelector('.journal-capture-sheet')).toBeNull();
  });

  it('asks once before discarding, and Discard throws it away', async () => {
    const { type, press, onSaved, onClose, anchor } = open();
    type('Not worth keeping.');
    press('Discard');
    const bar = anchor.querySelector('.journal-capture__discard') as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect(anchor.querySelector('.journal-capture-sheet')).not.toBeNull();
    press('Keep writing');
    expect(bar.hidden).toBe(true);
    press('Discard');
    [...bar.querySelectorAll('button')].find((b) => b.textContent === 'Discard')!.click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('hands over a location that arrives just after the save, and ignores one that arrives too late', async () => {
    const onLateLocation = vi.fn();
    const first = open({ onLateLocation });
    first.type('Written while the phone was still finding itself.');
    first.press('Done');
    await vi.waitFor(() => expect(first.onSaved).toHaveBeenCalledTimes(1));
    const momentId = first.onSaved.mock.calls[0]![1];
    deliverFix!({ coords: { latitude: 41.14, longitude: -8.61, accuracy: 12 } });
    expect(onLateLocation).toHaveBeenCalledWith(momentId, { lat: 41.14, lon: -8.61 });

    const late = vi.fn();
    const second = open({ onLateLocation: late });
    second.type('Another note.');
    second.press('Done');
    await vi.waitFor(() => expect(second.onSaved).toHaveBeenCalledTimes(1));
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + LATE_LOCATION_WINDOW_MS + 1);
    deliverFix!({ coords: { latitude: 41.14, longitude: -8.61, accuracy: 12 } });
    expect(late).not.toHaveBeenCalled();
  });
});

describe('a moment added from the dock', () => {
  it('shows in the story with "Moment added" and Undo', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    renderJournal(root, { fixture: lisbonPortoJournal('trp_capture_close'), today: '2027-03-06' });
    const before = root.querySelectorAll('[data-journal-moment]').length;
    [...root.querySelectorAll<HTMLButtonElement>('.story-dock button')].find((b) => b.textContent === 'Moment')!.click();
    const area = document.querySelector('.journal-capture-sheet textarea') as HTMLTextAreaElement;
    area.value = 'Church clock struck two.';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll<HTMLButtonElement>('.journal-capture-sheet .addform__actions button')].find((b) => b.textContent === 'Done')!.click();

    const headline = () => root.querySelector('.story-strip__headline')!.textContent;
    await vi.waitFor(() => expect(headline()).toBe('Moment added'));
    expect(root.querySelectorAll('[data-journal-moment]').length).toBe(before + 1);
    expect(root.textContent).toContain('Church clock struck two.');

    [...root.querySelectorAll<HTMLButtonElement>('.story-strip__action')].find((b) => b.textContent === 'Undo')!.click();
    await vi.waitFor(() => expect(headline()).toBe('Taken back. It is in Trash.'));
    expect(root.querySelectorAll('[data-journal-moment]').length).toBe(before);
    expect(root.textContent).not.toContain('Church clock struck two.');
  });
});

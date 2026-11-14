import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspectedPhoto } from '@/journal/import-group';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import { mountImportStrip } from '@/journal/story/import-strip';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const table = new Map<string, InspectedPhoto>();
vi.mock('@/journal/exif-worker', () => ({
  inspectFile: vi.fn(async (file: File) => {
    const hit = table.get(file.name);
    if (!hit) throw new Error('unreadable');
    return hit;
  }),
}));

const trip = testTrip as unknown as Trip;

function photo(name: string, wall: string | null): File {
  table.set(name, {
    checksum: [...name].map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(64, '0'),
    mime: 'image/jpeg',
    width: 1200,
    height: 900,
    capture_wall_time: wall,
    raw_metadata: {},
    provenance: { capture_time_source: wall ? 'exif' : 'none', file_last_modified: '2027-03-06T00:00:00.000Z', gps_source: 'none' },
    needs_date: wall ? undefined : true,
  });
  return new File([name], name, { type: 'image/jpeg' });
}

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  renderJournal(root, { fixture: lisbonPortoJournal(trip.id), trip, today: '2027-03-06' });
  return root;
}

function choose(root: HTMLElement, files: File[]): void {
  const picker = root.querySelector<HTMLInputElement>('[data-journal-photo-picker]')!;
  Object.defineProperty(picker, 'files', { configurable: true, value: files });
  picker.dispatchEvent(new Event('change'));
}

const strip = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-import-strip]')!;
const headline = (root: HTMLElement) => strip(root).querySelector('.story-strip__headline')!.textContent;
const notes = (root: HTMLElement) => strip(root).querySelector('.story-strip__notes')!.textContent;
const action = (root: HTMLElement, label: string) =>
  [...strip(root).querySelectorAll<HTMLButtonElement>('.story-strip__action')].find((b) => b.textContent === label);
const liveMoments = (root: HTMLElement) => root.querySelectorAll('[data-journal-moment]').length;

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  table.clear();
  vi.restoreAllMocks();
});

describe('bringing photos in', () => {
  it('opens the phone’s photo picker straight from the round button, with no sheet', () => {
    const root = mount();
    const picker = root.querySelector<HTMLInputElement>('[data-journal-photo-picker]')!;
    const click = vi.spyOn(picker, 'click').mockImplementation(() => undefined);
    (root.querySelector('.story-dock__main') as HTMLButtonElement).click();
    expect(click).toHaveBeenCalledTimes(1);
    expect(picker.accept).toBe('image/jpeg,image/png');
    expect(picker.multiple).toBe(true);
    expect(document.querySelector('.sheet-back')).toBeNull();
    expect(strip(root).hidden).toBe(true);
  });

  it('files the photos with no review, shows them in the story and offers Undo', async () => {
    const root = mount();
    const before = liveMoments(root);
    (root.querySelector('[data-story-view="photos"]') as HTMLButtonElement).click();
    choose(root, [photo('a.jpg', '2027:03:06 15:00:00'), photo('b.jpg', '2027:03:06 15:10:00'), photo('c.jpg', '2027:03:06 21:00:00')]);
    await vi.waitFor(() => expect(headline(root)).toBe('Filed 3 photos into 2 moments'));
    expect(document.querySelector('.sheet-back')).toBeNull();
    // Back in the story, with the new moments settling in.
    expect(root.querySelector('[data-story-showing]')?.getAttribute('data-story-showing') ?? root.getAttribute('data-story-showing')).toBe('story');
    expect(liveMoments(root)).toBe(before + 2);
    expect(root.querySelectorAll('.story-moment--new')).toHaveLength(2);
    expect(root.querySelector('.story-cover__stats')!.textContent).toContain('15 photos');

    action(root, 'Undo')!.click();
    await vi.waitFor(() => expect(headline(root)).toBe('Taken back. The photos are in Trash.'));
    expect(liveMoments(root)).toBe(before);
  });

  it('skips photos already in the journal and says so', async () => {
    const root = mount();
    const a = photo('a.jpg', '2027:03:06 15:00:00');
    choose(root, [a]);
    await vi.waitFor(() => expect(headline(root)).toBe('Filed 1 photo into 1 moment'));
    const count = liveMoments(root);
    // The second file is one the reader cannot make sense of.
    choose(root, [a, new File(['??'], 'broken.jpg', { type: 'image/jpeg' })]);
    await vi.waitFor(() => expect(headline(root)).toBe('Nothing new to file'));
    expect(notes(root)).toBe('1 was already here · 1 file could not be read');
    expect(liveMoments(root)).toBe(count);
  });

  it('asks which day a photo with no date is from, then files it there', async () => {
    const root = mount();
    const before = liveMoments(root);
    choose(root, [photo('dated.jpg', '2027:03:04 10:00:00'), photo('shot1.png', null), photo('shot2.png', null)]);
    await vi.waitFor(() => expect(headline(root)).toBe('Filed 1 photo into 1 moment'));
    expect(notes(root)).toBe('2 photos have no date');
    expect(liveMoments(root)).toBe(before + 1);

    action(root, 'Choose a day')!.click();
    const sheet = document.querySelector('.story-sheet')!;
    expect(sheet.querySelector('.story-sheet__title')!.textContent).toBe('2 photos have no date');
    const rows = [...sheet.querySelectorAll<HTMLButtonElement>('.story-sheet__row')];
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.map((r) => r.textContent).join('|')).toContain('Day 4 · Saturday 6 March');
    rows.find((r) => r.textContent?.includes('Day 5'))!.click();
    await vi.waitFor(() => expect(headline(root)).toBe('Filed 2 photos into 1 moment'));
    expect(root.querySelector('#day_lp0307 [data-journal-moment]')).not.toBeNull();
    expect(liveMoments(root)).toBe(before + 2);
  });
});

describe('status strip', () => {
  it('counts through the photos, then shows a message with actions and leaves by itself', () => {
    vi.useFakeTimers();
    const strip = mountImportStrip();
    expect(strip.el.hidden).toBe(true);
    strip.reading(3, 12);
    expect(strip.el.hidden).toBe(false);
    expect(strip.el.querySelector('.story-strip__headline')!.textContent).toBe('Reading 4 of 12 photos…');
    expect((strip.el.querySelector('progress') as HTMLProgressElement).value).toBeCloseTo(0.25);
    strip.reading(12, 12);
    expect(strip.el.querySelector('.story-strip__headline')!.textContent).toBe('Filing 12 photos…');

    const undo = vi.fn();
    strip.message({ text: 'Filed 12 photos into 4 moments', notes: ['3 were already here'], actions: [{ label: 'Undo', onSelect: undo }], autoHideMs: 10_000 });
    expect(strip.el.getAttribute('role')).toBe('status');
    expect((strip.el.querySelector('progress') as HTMLElement).hidden).toBe(true);
    (strip.el.querySelector('.story-strip__action') as HTMLButtonElement).click();
    expect(undo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9_999);
    expect(strip.el.hidden).toBe(false);
    vi.advanceTimersByTime(2);
    expect(strip.el.hidden).toBe(true);

    strip.message({ text: 'Could not save. Your photos are safe on this phone.', tone: 'problem' });
    expect(strip.el.classList.contains('story-strip--problem')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(strip.el.hidden).toBe(false); // a problem stays until dismissed
    (strip.el.querySelector('.story-strip__close') as HTMLButtonElement).click();
    expect(strip.el.hidden).toBe(true);
    vi.useRealTimers();
  });
});

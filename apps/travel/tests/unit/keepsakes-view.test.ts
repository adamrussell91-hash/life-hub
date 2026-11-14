import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { boardCountLine, renderKeepsakeBoard } from '@/journal/keepsakes/board';
import { drawKeepsake, keepsakeLabel, ticketDate } from '@/journal/keepsakes/draw';
import { KEEP_KINDS, openKeepSheet } from '@/journal/keepsakes/keep-sheet';
import { openKeepsakeSheet } from '@/journal/keepsakes/keepsake-sheet';
import { listKeepsakes, type BookingKeepsake, type Keepsake, type PhotoKeepsake } from '@/journal/keepsakes/model';
import { renderStoryKeep } from '@/journal/keepsakes/story-keep';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { readSouvenirsMap } from '@/journal/souvenirs';
import { listTrashRows } from '@/journal/trash-view';
import { hideBookingKeepsake, removeKeepsake } from '@/journal/keepsakes/model';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip;
const journal = lisbonPortoJournal(trip.id) as JournalDocument;
const all = listKeepsakes(journal, trip);
const mediaById = new Map(journal.media.map((m) => [m.id, m]));
const draw = (k: Keepsake): HTMLElement => drawKeepsake(k, { tripId: trip.id, mediaById });
const byId = (id: string): Keepsake => all.find((k) => k.id === id)!;

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

describe('drawKeepsake', () => {
  it('writes a short date', () => {
    expect(ticketDate('2027-03-05')).toBe('5 Mar 2027');
    expect(ticketDate('soon')).toBe('');
  });

  it('draws a booked ticket with carrier, number, places, date and time, and nothing else from the booking', () => {
    const train = byId('booking_itm_testtrain01') as BookingKeepsake;
    const node = draw(train);
    expect(node.classList.contains('keepsake--train')).toBe(true);
    expect(node.textContent).toContain('Test Rail · IC200');
    expect(node.textContent).toContain('Lisbon to Porto');
    expect(node.textContent).toContain('5 Mar 2027');
    expect(node.textContent).toContain('10:30 am');
    expect(node.textContent).toContain('LSB');
    expect(node.textContent).not.toMatch(/TEST-TRAIN-4|57|35|EUR|Intercity/);
    expect(node.getAttribute('aria-hidden')).toBe('true');
  });

  it('cuts a photo to the shape of its kind', () => {
    expect(draw(byId('sv_lptramticket')).className).toContain('is-ticket');
    expect(draw(byId('sv_lpfadoflyer')).className).toContain('is-poster');
    expect(draw(byId('sv_lpcoaster')).className).toContain('is-round');
    expect(draw(byId('sv_lptramticket')).querySelector('img')).not.toBeNull();
  });

  it('draws a keepsake with no photo as a tag carrying its name', () => {
    const tag = draw(byId('sv_lpmagnet'));
    expect(tag.classList.contains('keepsake--tag')).toBe(true);
    expect(tag.textContent).toBe('Tile fridge magnet');
    expect(tag.querySelector('img')).toBeNull();
  });

  it('draws a stamp with country, city and arrival date', () => {
    const stamp = draw(byId('stamp_leg_lpporto001'));
    expect([...stamp.children].map((n) => n.textContent)).toEqual(['Portugal', 'Porto', '5 Mar 2027']);
  });

  it('names each keepsake in words', () => {
    expect(keepsakeLabel(byId('sv_lptramticket'))).toBe('Tram 28 ticket');
    expect(keepsakeLabel(byId('booking_itm_testflight01'))).toBe('Test Air TA101, SYD to Lisbon');
    expect(keepsakeLabel(byId('stamp_leg_lplisbon01'))).toBe('Arrival stamp, Lisbon');
  });
});

describe('renderStoryKeep', () => {
  it('shows the object as a button with the same facts in text beside it', () => {
    const k = byId('sv_lptramticket') as PhotoKeepsake;
    const onOpen = vi.fn();
    const row = renderStoryKeep({ keepsake: k, drawn: draw(k), meta: '11:20 am', onOpen });
    expect(row.id).toBe('keep_sv_lptramticket');
    expect(row.querySelector('.story-keep__text')!.textContent).toBe('Kept: Tram 28 ticket11:20 am');
    const btn = row.querySelector('button')!;
    expect(btn.getAttribute('aria-label')).toBe('Open keepsake: Tram 28 ticket');
    btn.click();
    expect(onOpen).toHaveBeenCalledWith(k, btn);
  });
});

describe('renderKeepsakeBoard', () => {
  const cities = [
    { id: 'leg_lplisbon01', name: 'Lisbon', arrived: 'Arrived 3 Mar 2027' },
    { id: 'leg_lpporto001', name: 'Porto', arrived: 'Arrived 5 Mar 2027' },
  ];

  it('counts what was kept and how much of it came from bookings', () => {
    expect(boardCountLine(all)).toBe('6 kept, 2 of them from your bookings');
    expect(boardCountLine(all.filter((k) => k.type === 'stamp'))).toBe('Nothing kept yet');
    expect(boardCountLine(all.filter((k) => k.type !== 'photo'))).toBe('2 kept, all from your bookings');
  });

  it('groups keepsakes by city under that city’s stamp', () => {
    const onOpen = vi.fn();
    const onKeep = vi.fn();
    const board = renderKeepsakeBoard({ keepsakes: all, cities, draw, onOpen, onKeep });
    const sections = [...board.querySelectorAll('.keep-board__section')];
    expect(sections).toHaveLength(2);
    expect(sections[0]!.querySelector('.keep-board__city-text')!.textContent).toBe('LisbonArrived 3 Mar 2027');
    expect(sections[0]!.querySelector('.keep-board__stamp .keepsake--stamp')).not.toBeNull();
    const ids = (section: Element) => [...section.querySelectorAll('[data-keepsake-id]')].map((n) => n.getAttribute('data-keepsake-id'));
    expect(ids(sections[0]!)).toEqual(['booking_itm_testflight01', 'sv_lptramticket', 'sv_lpfadoflyer', 'booking_itm_testtrain01']);
    expect(ids(sections[1]!)).toEqual(['sv_lpcoaster', 'sv_lpmagnet']);

    (board.querySelector('[data-keepsake-id="sv_lpcoaster"]') as HTMLButtonElement).click();
    expect(onOpen.mock.calls[0]![0]).toBe(byId('sv_lpcoaster'));
    (board.querySelector('.keep-board__add') as HTMLButtonElement).click();
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('says so when a city has nothing kept, and offers no Keep button when saving is off', () => {
    const board = renderKeepsakeBoard({ keepsakes: all.filter((k) => k.legId !== 'leg_lpporto001' || k.type === 'stamp'), cities, draw, onOpen: () => {} });
    expect(board.querySelectorAll('.keep-board__section')[1]!.textContent).toContain('Nothing kept here yet.');
    expect(board.querySelector('.keep-board__add')).toBeNull();
  });

  it('keeps an old record with no city in its own group', () => {
    const board = renderKeepsakeBoard({
      keepsakes: [{ type: 'photo', id: 'sv_x', kind: 'other', title: 'Pebble', legId: '', localDate: '' }],
      cities,
      draw,
      onOpen: () => {},
    });
    expect(board.textContent).toContain('Not filed under a city');
  });
});

describe('keepsake sheet', () => {
  it('offers Go to that day and, for a booked ticket, Remove from keepsakes', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const k = byId('booking_itm_testtrain01');
    const onGoToDay = vi.fn();
    const onRemove = vi.fn();
    openKeepsakeSheet({ anchor: host, keepsake: k, drawn: draw(k), meta: 'Day 3 · Friday 5 March · 10:30 am', onGoToDay, onRemove });
    const labels = [...host.querySelectorAll('.story-sheet__row-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Go to that day', 'Remove from keepsakes']);
    expect(host.textContent).toContain('Kept automatically from your booking');
    (host.querySelectorAll('.story-sheet__row')[1] as HTMLButtonElement).click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.story-sheet')).toBeNull();
  });

  it('gives a stamp no Remove', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const k = byId('stamp_leg_lplisbon01');
    openKeepsakeSheet({ anchor: host, keepsake: k, drawn: draw(k), meta: 'Arrived 3 Mar 2027', onGoToDay: () => {} });
    expect([...host.querySelectorAll('.story-sheet__row-label')].map((n) => n.textContent)).toEqual(['Go to that day']);
  });
});

describe('keep sheet', () => {
  function open(extra: Partial<Parameters<typeof openKeepSheet>[0]> = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    const onSaved = vi.fn();
    openKeepSheet({
      anchor: host, tripId: trip.id, journal, version: 'fixture', legId: 'leg_lpporto001', localDate: '2027-03-06',
      timeZone: 'Europe/Lisbon', onSaved, ...extra,
    });
    return { host, onSaved };
  }

  it('asks what it is: four kinds, and a way to keep a name with no photo', () => {
    const { host } = open();
    expect([...host.querySelectorAll('.keep-choices .story-sheet__row-label')].map((n) => n.textContent)).toEqual([
      ...KEEP_KINDS.map((k) => k.label),
      'No photo, just a name',
    ]);
    const picker = host.querySelector('input[type="file"]') as HTMLInputElement;
    expect(picker.accept).toBe('image/*');
  });

  it('saves a named keepsake under today in the current city and closes', async () => {
    const { host, onSaved } = open();
    (host.querySelectorAll('.keep-choices .story-sheet__row')[4] as HTMLButtonElement).click();
    const form = host.querySelector('.keep-form') as HTMLFormElement;
    const [name, note] = [...form.querySelectorAll('input[type="text"]')] as HTMLInputElement[];
    form.requestSubmit();
    expect(onSaved).not.toHaveBeenCalled(); // a name is needed when there is no photo
    name!.value = 'Pressed camellia';
    note!.value = 'From the garden by the bridge';
    form.requestSubmit();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const saved = Object.values(readSouvenirsMap(onSaved.mock.calls[0]![0].journal)).find((r) => r.title === 'Pressed camellia')!;
    expect(saved).toMatchObject({ kind: 'other', source: 'photo', leg_id: 'leg_lpporto001', local_date: '2027-03-06', note: 'From the garden by the bridge' });
    expect(saved.local_time).toMatch(/^\d{2}:\d{2}$/);
    expect(host.querySelector('.story-sheet')).toBeNull();
  });

  it('links to the moment and uses its photo when opened from a moment', async () => {
    const moment = journal.moments.find((m) => m.id === 'mom_lparch001')!;
    const momentPhoto = mediaById.get(moment.media_ids[0]!)!;
    const { host, onSaved } = open({ moment, momentPhoto });
    (host.querySelectorAll('.keep-choices .story-sheet__row')[1] as HTMLButtonElement).click();
    const form = host.querySelector('.keep-form') as HTMLFormElement;
    expect(form.querySelector('.keepsake.is-poster img')).not.toBeNull();
    form.requestSubmit();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const saved = Object.values(readSouvenirsMap(onSaved.mock.calls[0]![0].journal)).find((r) => r.title === 'Poster')!;
    expect(saved).toMatchObject({ kind: 'poster', moment_id: 'mom_lparch001', media_id: momentPhoto.id });
    expect(saved.leg_id).toBeUndefined();
  });

  it('does not close on Escape while a name is being typed', () => {
    const { host } = open();
    (host.querySelectorAll('.keep-choices .story-sheet__row')[4] as HTMLButtonElement).click();
    const name = host.querySelector('.keep-form input[type="text"]') as HTMLInputElement;
    name.focus();
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(host.querySelector('.story-sheet')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(host.querySelector('.story-sheet')).toBeNull();
  });
});

describe('Trash', () => {
  it('lists a removed keepsake and a hidden booked ticket', () => {
    let next = removeKeepsake(journal, 'sv_lpcoaster');
    next = hideBookingKeepsake(next, 'itm_testtrain01', 'Test Rail IC200');
    const rows = listTrashRows(next).filter((r) => r.keepsakeId);
    expect(rows).toEqual([
      { keepsakeId: 'sv_lpcoaster', restoreOnly: false, label: 'Coaster from the tavern', detail: 'Keepsake' },
      { keepsakeId: 'sv_hide_itm_testtrain01', restoreOnly: true, label: 'Test Rail IC200', detail: 'Booked ticket, removed from keepsakes' },
    ]);
  });
});

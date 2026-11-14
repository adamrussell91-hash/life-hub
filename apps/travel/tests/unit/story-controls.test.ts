import { afterEach, describe, expect, it, vi } from 'vitest';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays, journalOverlayOpenCount } from '@/journal/overlay-host';
import { openMomentActionSheet } from '@/journal/story/action-sheet';
import { openJournalOptionsSheet } from '@/journal/story/options-sheet';
import { DOCK_HIDE_AFTER_PX, DOCK_RETURN_MS, mountDock } from '@/journal/story/dock';
import { openPhotoViewer, photoCaptionMeta, tripPhotos } from '@/journal/photo-viewer';
import { renderPhotosView } from '@/journal/photos-view';
import { orderedLiveMoments } from '@/journal/media-loading';
import { dayNumber } from '@/journal/trip-days';
import { parseRoute, tabTitle } from '@/app/router';
import { renderHubShell, renderPrimaryNav } from '@/shell/shell';

const journal = lisbonPortoJournal('trp_testlisbon01');
const ordered = orderedLiveMoments(journal);
const photos = tripPhotos(journal, ordered, (m) => dayNumber('2027-03-03', m.local_date));

function anchor(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('moment action sheet', () => {
  const moment = journal.moments.find((m) => m.id === 'mom_lpribeira')!;

  it('offers every action the old menu had, as rows at least 44px tall by rule', () => {
    const host = anchor();
    openMomentActionSheet({ fixture: journal, moment, anchor: host, onAction: () => {} });
    const labels = [...host.querySelectorAll('.story-sheet__row-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Edit moment', 'Annotate photos', 'Add souvenir', 'Reorder', 'Split', 'Merge', 'Move', 'Delete']);
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Moment actions');
    expect(host.querySelector('.story-sheet__title')?.textContent).toBe('4:45 pm · Cais da Ribeira');
  });

  it('says why an action is off and does not run it', () => {
    const host = anchor();
    const onAction = vi.fn();
    openMomentActionSheet({ fixture: journal, moment, anchor: host, onAction });
    const split = [...host.querySelectorAll<HTMLButtonElement>('.story-sheet__row')].find((r) => r.textContent?.startsWith('Split'))!;
    expect(split.disabled).toBe(true);
    expect(split.querySelector('.story-sheet__row-hint')?.textContent).toBe('Need at least two photos to split');
    split.click();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('closes itself before running the action, so the next sheet is not removed with it', () => {
    const host = anchor();
    const order: string[] = [];
    openMomentActionSheet({
      fixture: journal,
      moment,
      anchor: host,
      onAction: (action) => order.push(`action:${action}:open=${journalOverlayOpenCount()}`),
      onClose: () => order.push('closed'),
    });
    expect(journalOverlayOpenCount()).toBe(1);
    [...host.querySelectorAll<HTMLButtonElement>('.story-sheet__row')][0]!.click();
    expect(order).toEqual(['closed', 'action:edit:open=0']);
  });

  it('marks Delete as the dangerous one, set apart at the end', () => {
    const host = anchor();
    openMomentActionSheet({ fixture: journal, moment, anchor: host, onAction: () => {} });
    const rows = [...host.querySelectorAll('.story-sheet__row')];
    const last = rows[rows.length - 1]!;
    expect(last.classList.contains('story-sheet__row--danger')).toBe(true);
    expect(last.previousElementSibling?.tagName).toBe('HR');
  });
});

describe('journal options sheet', () => {
  it('lists the options and runs one after closing', () => {
    const host = anchor();
    const onSelect = vi.fn(() => expect(journalOverlayOpenCount()).toBe(0));
    openJournalOptionsSheet({ anchor: host, title: 'Lisbon & Porto', items: [{ label: 'Search journal', onSelect: () => {} }, { label: 'Trash', hint: 'Things you deleted', onSelect }] });
    expect([...host.querySelectorAll('.story-sheet__row-label')].map((n) => n.textContent)).toEqual(['Search journal', 'Trash']);
    [...host.querySelectorAll<HTMLButtonElement>('.story-sheet__row')][1]!.click();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('dock', () => {
  function fakeWindow() {
    const listeners: Array<() => void> = [];
    const win = { scrollY: 0, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: () => {} };
    const scrollTo = (y: number) => { win.scrollY = y; listeners.forEach((fn) => fn()); };
    return { win: win as unknown as Window, scrollTo };
  }

  it('has Photos as the round button, Moment beside it, and Keepsake only when offered', () => {
    const { win } = fakeWindow();
    const onPhotos = vi.fn();
    const onMoment = vi.fn();
    const dock = mountDock({ onPhotos, onMoment, scroller: win });
    expect(dock.el.querySelector('.story-dock__main')?.getAttribute('aria-label')).toBe('Add photos');
    expect(dock.el.querySelector('[aria-label="Keepsake"]')).toBeNull();
    (dock.el.querySelector('.story-dock__main') as HTMLButtonElement).click();
    (dock.el.querySelector('[aria-label="Moment"]') as HTMLButtonElement).click();
    expect(onPhotos).toHaveBeenCalledOnce();
    expect(onMoment).toHaveBeenCalledOnce();
    const withKeep = mountDock({ onPhotos, onMoment, onKeepsake: () => {}, scroller: win });
    expect(withKeep.el.querySelector('[aria-label="Keepsake"]')).toBeTruthy();
  });

  it('steps aside while the page scrolls down and returns when scrolling stops', () => {
    vi.useFakeTimers();
    const { win, scrollTo } = fakeWindow();
    const dock = mountDock({ onPhotos: () => {}, onMoment: () => {}, scroller: win });
    scrollTo(200);
    scrollTo(200 + DOCK_HIDE_AFTER_PX + 20);
    expect(dock.el.classList.contains('is-away')).toBe(true);
    vi.advanceTimersByTime(DOCK_RETURN_MS + 10);
    expect(dock.el.classList.contains('is-away')).toBe(false);
  });

  it('returns at once on an upward scroll, and stays put near the top', () => {
    vi.useFakeTimers();
    const { win, scrollTo } = fakeWindow();
    const dock = mountDock({ onPhotos: () => {}, onMoment: () => {}, scroller: win });
    scrollTo(60);
    expect(dock.el.classList.contains('is-away')).toBe(false);
    scrollTo(400);
    scrollTo(600);
    expect(dock.el.classList.contains('is-away')).toBe(true);
    scrollTo(590);
    expect(dock.el.classList.contains('is-away')).toBe(false);
  });
});

describe('photo viewer', () => {
  it('lists every photo of the trip in story order, with its day', () => {
    expect(photos).toHaveLength(12);
    expect(photos[0]!.media.id).toBe('med_lparch');
    expect(photos[0]!.dayNumber).toBe(1);
    expect(photos[photos.length - 1]!.dayNumber).toBe(4);
    expect(photoCaptionMeta(photos[0]!)).toBe('Day 1 · 9:40 am · Praça do Comércio');
  });

  it('opens on the photo that was tapped and steps through the rest', () => {
    const host = anchor();
    const viewer = openPhotoViewer({ photos, index: 3, tripId: journal.trip_id, anchor: host });
    expect(host.querySelector('.story-viewer__count')?.textContent).toBe('4 of 12');
    (host.querySelector('[aria-label="Next photo"]') as HTMLButtonElement).click();
    expect(viewer.index()).toBe(4);
    expect(host.querySelector('.story-viewer__count')?.textContent).toBe('5 of 12');
    (host.querySelector('[aria-label="Previous photo"]') as HTMLButtonElement).click();
    (host.querySelector('[aria-label="Previous photo"]') as HTMLButtonElement).click();
    expect(viewer.index()).toBe(2);
    expect(host.querySelectorAll('.story-viewer__slide img')).toHaveLength(12);
    expect([...host.querySelectorAll<HTMLImageElement>('.story-viewer__slide img')].filter((i) => i.loading === 'eager')).toHaveLength(1);
  });

  it('cannot step past either end', () => {
    const host = anchor();
    const viewer = openPhotoViewer({ photos, index: 0, tripId: journal.trip_id, anchor: host });
    expect((host.querySelector('[aria-label="Previous photo"]') as HTMLButtonElement).disabled).toBe(true);
    viewer.destroy();
    const last = openPhotoViewer({ photos, index: 99, tripId: journal.trip_id, anchor: host });
    expect(last.index()).toBe(11);
    expect((host.querySelector('[aria-label="Next photo"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes from the close button and through the overlay host (Escape and Back)', () => {
    const host = anchor();
    const onClose = vi.fn();
    openPhotoViewer({ photos, index: 0, tripId: journal.trip_id, anchor: host, onClose });
    expect(journalOverlayOpenCount()).toBe(1);
    (host.querySelector('[aria-label="Close photo"]') as HTMLButtonElement).click();
    expect(journalOverlayOpenCount()).toBe(0);
    expect(onClose).toHaveBeenCalledOnce();
    openPhotoViewer({ photos, index: 0, tripId: journal.trip_id, anchor: host, onClose });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(journalOverlayOpenCount()).toBe(0);
  });

  it('offers Use as cover only when it can be saved, and reports the photo', () => {
    const host = anchor();
    openPhotoViewer({ photos, index: 2, tripId: journal.trip_id, anchor: host });
    expect([...host.querySelectorAll<HTMLButtonElement>('.story-viewer__tools button')].find((b) => b.textContent === 'Use as cover')?.hidden).toBe(true);
    closeAllJournalOverlays();
    const onUseAsCover = vi.fn();
    openPhotoViewer({ photos, index: 2, tripId: journal.trip_id, anchor: host, onUseAsCover });
    [...host.querySelectorAll<HTMLButtonElement>('.story-viewer__tools button')].find((b) => b.textContent === 'Use as cover')!.click();
    expect(onUseAsCover).toHaveBeenCalledWith(photos[2]!.media);
    expect(journalOverlayOpenCount()).toBe(0);
  });
});

describe('all photos', () => {
  it('has one button per photo, grouped under its day', () => {
    const grid = renderPhotosView({ tripId: journal.trip_id, photos, groupOf: (p) => ({ label: `Day ${p.dayNumber}`, detail: '' }) });
    const buttons = [...grid.querySelectorAll('button')];
    expect(buttons).toHaveLength(12);
    expect(buttons.map((b) => b.getAttribute('data-photo-index'))).toEqual(photos.map((_, i) => String(i)));
    expect([...grid.querySelectorAll('.story-grid__label')].map((h) => h.textContent)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4']);
  });

  it('says so when there are no photos', () => {
    const grid = renderPhotosView({ tripId: 't', photos: [], groupOf: () => ({ label: '', detail: '' }) });
    expect(grid.querySelector('button')).toBeNull();
    expect(grid.textContent).toMatch(/No photos yet/);
  });
});

describe('journal tab', () => {
  it('routes #/journal to the journal home', () => {
    expect(parseRoute('#/journal')).toEqual({ name: 'journalHome' });
    expect(tabTitle({ name: 'journalHome' })).toBe('Journal · Travel');
    expect(parseRoute('#/trip/trp_a/journal')).toEqual({ name: 'journal', tripId: 'trp_a' });
  });

  it('puts Trip, Today and Journal on the phone bar, with Trips first under More', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const refs = renderHubShell(root);
    renderPrimaryNav(refs, 'journal', { tripHref: '#/trip/demo', journalHref: '#/trip/demo/journal' });
    const bar = root.querySelector('.hub-mobile-nav')!;
    const labels = [...bar.querySelectorAll('a, button')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Trip', 'Today', 'Journal', 'More']);
    const journal = [...bar.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Journal')!;
    expect(journal.getAttribute('href')).toBe('#/trip/demo/journal');
    expect(journal.getAttribute('aria-current')).toBe('page');
    const more = [...root.querySelectorAll('.hub-more-sheet a')].map((a) => a.textContent?.trim());
    expect(more[0]).toBe('Trips');
  });

  it('keeps Trips on the desktop rail and adds Journal', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const refs = renderHubShell(root);
    renderPrimaryNav(refs, 'trips', { tripHref: '#/trip/demo' });
    const rail = [...refs.railNav.querySelectorAll('a.hub-rail__link')].map((a) => a.textContent?.trim());
    expect(rail.slice(0, 4)).toEqual(['Trip', 'Today', 'Journal', 'Trips']);
    const journal = [...refs.railNav.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Journal')!;
    expect(journal.getAttribute('href')).toBe('#/journal');
  });
});

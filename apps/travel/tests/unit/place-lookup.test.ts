import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { applyPlaceNames, lookUpPlaces, momentsNeedingPlace, PLACE_LOOKUPS_PER_RUN } from '@/journal/place-lookup';
import { renderJournal } from '@/journal/render-journal';
import type { JournalMoment } from '@/journal/types';

/** The fixture with two moments stripped of their names, as photos filed from the camera roll are. */
function nameless(): JournalDocument {
  const journal = lisbonPortoJournal('trp_places_test') as JournalDocument;
  return {
    ...journal,
    moments: journal.moments.map((m) =>
      m.id === 'mom_lparch001' || m.id === 'mom_lpbeach01' ? { ...m, place: undefined, coordinates: m.coordinates ?? { lat: 38.7, lon: -9.13 } } : m,
    ),
  };
}

const at = (id: string, lat: number, lon: number): JournalMoment => ({
  id, leg_id: 'leg_a', local_date: '2027-03-03', media_ids: [], display_order: 1, lifecycle: 'live', coordinates: { lat, lon },
});

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

describe('place lookup', () => {
  it('finds live moments with a location and no name', () => {
    const journal = nameless();
    expect(momentsNeedingPlace(journal).map((m) => m.id)).toEqual(['mom_lparch001', 'mom_lpbeach01']);
    expect(momentsNeedingPlace(journal, ['mom_lpbeach01']).map((m) => m.id)).toEqual(['mom_lpbeach01']);
  });

  it('asks once for photos taken on the same spot', async () => {
    const lookup = vi.fn(async () => ({ name: 'Rua do Exemplo' }));
    const names = await lookUpPlaces([at('a', 38.71, -9.14), at('b', 38.7101, -9.1401), at('c', 38.75, -9.2)], lookup);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect([...names]).toEqual([['a', 'Rua do Exemplo'], ['b', 'Rua do Exemplo'], ['c', 'Rua do Exemplo']]);
  });

  it('stops at the first failure and keeps what it has', async () => {
    const lookup = vi.fn().mockResolvedValueOnce({ name: 'Largo da Amostra' }).mockRejectedValueOnce(new Error('offline'));
    const names = await lookUpPlaces([at('a', 1, 1), at('b', 2, 2), at('c', 3, 3)], lookup);
    expect([...names]).toEqual([['a', 'Largo da Amostra']]);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('leaves a moment unnamed when the lookup has nothing sure to say, and never asks more than the limit', async () => {
    const lookup = vi.fn(async () => ({ name: null }));
    const many = Array.from({ length: 20 }, (_, i) => at(`m${i}`, i, i));
    expect((await lookUpPlaces(many, lookup)).size).toBe(0);
    expect(lookup).toHaveBeenCalledTimes(PLACE_LOOKUPS_PER_RUN);
  });

  it('writes names in as looked up, and never over a name that is already there', () => {
    const journal = nameless();
    const next = applyPlaceNames(journal, new Map([['mom_lparch001', 'Rua do Exemplo'], ['mom_lptram001', 'Somewhere else']]));
    expect(next.moments.find((m) => m.id === 'mom_lparch001')!.place).toEqual({ name: 'Rua do Exemplo', source: 'lookup' });
    expect(next.moments.find((m) => m.id === 'mom_lptram001')!.place).toEqual(journal.moments.find((m) => m.id === 'mom_lptram001')!.place);
    expect(next.revision).toBe(journal.revision + 1);
    expect(applyPlaceNames(journal, new Map([['mom_lptram001', 'Somewhere else']]))).toBe(journal);
  });

  it('names nameless moments in the story a moment after it opens', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const lookupPlace = vi.fn(async (lat: number) => ({ name: lat > 40 ? 'Cais do Ensaio' : 'Rua do Exemplo' }));
    renderJournal(root, { fixture: nameless(), today: '2027-03-06', lookupPlace });
    expect(root.querySelector('#mom_lparch001')!.textContent).not.toContain('Rua do Exemplo');
    await vi.waitFor(() => expect(root.querySelector('#mom_lparch001')!.textContent).toContain('Rua do Exemplo'));
    expect(root.querySelector('#mom_lpbeach01')!.textContent).toContain('Cais do Ensaio');
    expect(lookupPlace).toHaveBeenCalledTimes(2);
  });

  it('does not look anything up in a preview with no lookup given', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderJournal(root, { fixture: nameless(), today: '2027-03-06' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

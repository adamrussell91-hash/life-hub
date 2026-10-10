import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { applyRestore, applySoftDelete } from '@/journal/delete-flow';
import {
  JOURNAL_SOUVENIRS_PREF_KEY,
  applySouvenirDeleteForMoment,
  applySouvenirRestoreForMoment,
  defaultJournalSouvenir,
  listLiveSouvenirs,
  readSouvenirsMap,
  upsertJournalSouvenir,
} from '@/journal/souvenirs';

function miniJournal(preferences: Record<string, unknown> = {}): JournalDocument {
  return {
    id: 'jrn_sv',
    schema_version: 1,
    trip_id: 'trp_sv',
    title: 'Souvenir trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences,
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_sv',
        pattern_id: 'kul',
        destination: 'KL',
        timezone: 'Asia/Kuala_Lumpur',
        order: 1,
        lifecycle: 'live',
      },
    ],
    days: [],
    moments: [
      {
        id: 'mom_1',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: ['med_1'],
        display_order: 1,
        lifecycle: 'live',
      },
    ],
    media: [
      {
        id: 'med_1',
        url: '/x.jpg',
        width: 400,
        height: 300,
        lifecycle: 'live',
      },
    ],
    transitions: [],
  };
}

describe('journal souvenirs', () => {
  it('stores live souvenirs in preferences', () => {
    let journal = miniJournal();
    const row = defaultJournalSouvenir({
      title: 'Fridge magnet',
      moment_id: 'mom_1',
      media_id: 'med_1',
    });
    journal = upsertJournalSouvenir(journal, row);
    expect(listLiveSouvenirs(journal)).toHaveLength(1);
    const map = readSouvenirsMap(journal);
    expect(map[row.id].title).toBe('Fridge magnet');
    expect(journal.preferences?.[JOURNAL_SOUVENIRS_PREF_KEY]).toBeTruthy();
  });

  it('soft-deletes linked souvenirs when a moment is deleted and restores with the moment', () => {
    const row = defaultJournalSouvenir({
      title: 'Ticket stub',
      moment_id: 'mom_1',
    });
    let journal = upsertJournalSouvenir(miniJournal(), row);
    journal = applySoftDelete(journal, { kind: 'moment', id: 'mom_1' });
    expect(listLiveSouvenirs(journal)).toHaveLength(0);
    const stored = readSouvenirsMap(journal)[row.id];
    expect(stored.lifecycle).toBe('deleted');
    expect(stored.deleted_with).toBe('mom_1');

    journal = applyRestore(journal, { kind: 'moment', id: 'mom_1' });
    expect(listLiveSouvenirs(journal)).toHaveLength(1);
  });

  it('links souvenirs by media id on the moment', () => {
    const row = defaultJournalSouvenir({
      title: 'Postcard',
      media_id: 'med_1',
    });
    let journal = upsertJournalSouvenir(miniJournal(), row);
    const moment = journal.moments[0]!;
    journal = applySouvenirDeleteForMoment(journal, moment);
    expect(readSouvenirsMap(journal)[row.id].lifecycle).toBe('deleted');
    journal = applySouvenirRestoreForMoment(journal, moment.id);
    expect(readSouvenirsMap(journal)[row.id].lifecycle).toBe('live');
  });
});

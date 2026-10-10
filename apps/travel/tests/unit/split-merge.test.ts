import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import {
  applyMergeToJournal,
  applySplitToJournal,
  mergeMoments,
  moveMoment,
  splitMoment,
} from '@/journal/moment-operations';
import type { JournalMoment } from '@/journal/types';

function baseMoment(overrides: Partial<JournalMoment> = {}): JournalMoment {
  return {
    id: 'mom_test',
    leg_id: 'leg_kul',
    local_date: '2026-03-01',
    media_ids: ['med_a', 'med_b', 'med_c'],
    display_order: 2,
    lifecycle: 'live',
    local_time: '11:40',
    text: 'Reflection A',
    place: { name: 'Market' },
    coordinates: { lat: 1, lon: 2 },
    location_source: 'exif',
    ...overrides,
  };
}

describe('Codex check 4 — split merge move without lost media', () => {
  it('splits, merges, and moves without duplicating or dropping attachments', () => {
    const moment = baseMoment();
    const { a, b } = splitMoment(moment, ['med_a', 'med_c'], 'mom_new');
    expect([...a.media_ids, ...b.media_ids].sort()).toEqual(moment.media_ids.sort());

    const merged = mergeMoments(
      [
        baseMoment({ id: 'mom_a', media_ids: ['med_a'], display_order: 1 }),
        baseMoment({ id: 'mom_b', media_ids: ['med_b'], display_order: 2 }),
      ],
      { locationFromMomentId: 'mom_a' },
    );
    expect(merged.media_ids).toEqual(['med_a', 'med_b']);

    const fixture = klIstanbulFixture();
    const kul = fixture.moments.find((m) => m.id === 'mom_kul_pair')!;
    const { moment: moved } = moveMoment(
      kul,
      { legId: 'leg_ist', localDate: '2026-03-04', timezoneMode: 'keep_wall_clock' },
      fixture.legs,
    );
    expect(moved.leg_id).toBe('leg_ist');
    expect(moved.media_ids).toEqual(kul.media_ids);
  });
});

describe('splitMoment media accounting', () => {
  it('partitions media exactly once with no empty sides', () => {
    const moment = baseMoment();
    const { a, b } = splitMoment(moment, ['med_a', 'med_c'], 'mom_new');
    expect(a.media_ids).toEqual(['med_a', 'med_c']);
    expect(b.media_ids).toEqual(['med_b']);
    expect([...a.media_ids, ...b.media_ids].sort()).toEqual(moment.media_ids.sort());
    expect(a.id).toBe(moment.id);
    expect(b.id).toBe('mom_new');
    expect(a.text).toBe('Reflection A');
    expect(b.text).toBeUndefined();
  });

  it('rejects empty or full selection', () => {
    const moment = baseMoment();
    expect(() => splitMoment(moment, [], 'mom_new')).toThrow(/proper subset/i);
    expect(() => splitMoment(moment, ['med_a', 'med_b', 'med_c'], 'mom_new')).toThrow(
      /proper subset/i,
    );
  });
});

describe('mergeMoments', () => {
  it('preserves paragraphs and explicit location choice', () => {
    const a = baseMoment({
      id: 'mom_a',
      display_order: 1,
      media_ids: ['med_a'],
      text: 'First paragraph.',
    });
    const b = baseMoment({
      id: 'mom_b',
      display_order: 2,
      media_ids: ['med_b'],
      text: 'Second paragraph.',
      place: { name: 'Harbour' },
      coordinates: { lat: 3, lon: 4 },
    });
    const merged = mergeMoments([a, b], { locationFromMomentId: 'mom_b' });
    expect(merged.media_ids).toEqual(['med_a', 'med_b']);
    expect(merged.text).toBe('First paragraph.\n\nSecond paragraph.');
    expect(merged.place?.name).toBe('Harbour');
    expect(merged.id).toBe('mom_a');
  });
});

describe('moveMoment preview', () => {
  it('keeps wall clock when requested', () => {
    const fixture = klIstanbulFixture();
    const moment = fixture.moments.find((m) => m.id === 'mom_kul_pair')!;
    const { moment: moved, previewLocalTime } = moveMoment(
      moment,
      {
        legId: 'leg_ist',
        localDate: '2026-03-04',
        timezoneMode: 'keep_wall_clock',
      },
      fixture.legs,
    );
    expect(moved.local_time).toBe('11:40');
    expect(previewLocalTime).toBe('11:40');
    expect(moved.local_date).toBe('2026-03-04');
    expect(moved.leg_id).toBe('leg_ist');
  });
});

describe('journal patches', () => {
  it('applySplitToJournal keeps every media id once', () => {
    const fixture = klIstanbulFixture();
    const journal = { ...fixture, leg_ids: [], preferences: {}, operations: [] };
    const target = journal.moments.find((m) => m.id === 'mom_kul_gallery')!;
    const beforeIds = new Set(journal.moments.flatMap((m) => m.media_ids));
    const next = applySplitToJournal(journal, target.id, ['med_kul_g1', 'med_kul_g2']);
    const afterIds = new Set(next.moments.flatMap((m) => m.media_ids));
    expect(afterIds).toEqual(beforeIds);
    expect(next.moments.filter((m) => m.media_ids.includes('med_kul_g1')).length).toBe(1);
    expect(next.moments.some((m) => m.media_ids.length === 2 && m.media_ids.includes('med_kul_g3'))).toBe(
      true,
    );
  });

  it('applyMergeToJournal removes secondary moment', () => {
    const fixture = klIstanbulFixture();
    const journal = { ...fixture, leg_ids: [], preferences: {}, operations: [] };
    const next = applyMergeToJournal(journal, ['mom_kul_single', 'mom_kul_pair'], {
      locationFromMomentId: 'mom_kul_single',
    });
    expect(next.moments.some((m) => m.id === 'mom_kul_pair')).toBe(false);
    const merged = next.moments.find((m) => m.id === 'mom_kul_single');
    expect(merged?.media_ids).toEqual(['med_kul_1', 'med_kul_2a', 'med_kul_2b']);
  });
});

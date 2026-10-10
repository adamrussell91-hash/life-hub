import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import {
  __setJournalConflictUiForTests,
  mergeJournalAfterConflict,
  momentFieldConflicts,
  planMomentConflicts,
  recoverJournalSaveConflict,
} from '@/journal/conflict-resolve';
import * as journalApi from '@/api/journal';
import { ApiClientError } from '@/api/client';

function baseJournal(moments: JournalMoment[]): JournalDocument {
  return {
    id: 'jrn_test',
    schema_version: 1,
    trip_id: 'trp_test',
    title: 'Test',
    revision: 2,
    lifecycle: 'live',
    leg_ids: ['leg_1'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_1',
        trip_id: 'trp_test',
        pattern_id: 'pat_1',
        destination: 'Istanbul',
        timezone: 'Europe/Istanbul',
        order: 0,
        lifecycle: 'live',
      },
    ],
    days: [],
    moments,
    media: [],
    transitions: [],
  };
}

function moment(overrides: Partial<JournalMoment> & { id: string }): JournalMoment {
  return {
    leg_id: 'leg_1',
    local_date: '2026-06-01',
    media_ids: [],
    display_order: 1,
    lifecycle: 'live',
    ...overrides,
  };
}

afterEach(() => {
  __setJournalConflictUiForTests(null);
  vi.restoreAllMocks();
});

describe('journal conflict merge', () => {
  it('detects field differences on the same moment', () => {
    const a = moment({ id: 'mom_1', text: 'Morning' });
    const b = moment({ id: 'mom_1', text: 'Evening', local_time: '18:00' });
    expect(momentFieldConflicts(a, b)).toEqual(['text', 'local_time']);
  });

  it('two sessions editing same moment — field pick keeps local reflection', () => {
    const shared = moment({ id: 'mom_1', text: 'Original', local_time: '09:00' });
    const server = baseJournal([{ ...shared, text: 'Server edit' }]);
    const local = baseJournal([{ ...shared, text: 'Local edit' }]);
    const plans = planMomentConflicts(server, local);
    expect(plans).toHaveLength(1);
    const merged = mergeJournalAfterConflict(server, local, {
      mom_1: { mode: 'fields', fields: { text: 'local' } },
    });
    const saved = merged.moments.find((m) => m.id === 'mom_1');
    expect(saved?.text).toBe('Local edit');
    expect(saved?.local_time).toBe('09:00');
  });

  it('two sessions editing same moment — keep both preserves both copies', () => {
    const shared = moment({ id: 'mom_1', text: 'Shared', display_order: 2 });
    const server = baseJournal([{ ...shared, text: 'Server version' }]);
    const local = baseJournal([{ ...shared, text: 'Local version' }]);
    const merged = mergeJournalAfterConflict(server, local, {
      mom_1: { mode: 'keep_both' },
    });
    const live = merged.moments.filter((m) => m.lifecycle === 'live' && m.leg_id === 'leg_1');
    expect(live).toHaveLength(2);
    const texts = live.map((m) => m.text).sort();
    expect(texts).toEqual(['Local version', 'Server version']);
    expect(live[0]!.id).not.toBe(live[1]!.id);
  });
});

describe('recoverJournalSaveConflict', () => {
  it('loads server journal on 409 retry path and saves merged result', async () => {
    const serverMoment = moment({ id: 'mom_1', text: 'On server' });
    const localMoment = moment({ id: 'mom_1', text: 'On device' });
    const serverJournal = baseJournal([serverMoment]);
    const localJournal = baseJournal([localMoment]);

    vi.spyOn(journalApi, 'getJournal').mockResolvedValue({
      journal: serverJournal,
      version: 'sha_server',
    });
    const saveSpy = vi
      .spyOn(journalApi, 'saveJournal')
      .mockResolvedValue({ journal: localJournal, version: 'sha_saved' });

    __setJournalConflictUiForTests(async () => ({
      mom_1: { mode: 'fields', fields: { text: 'local' } },
    }));

    const result = await recoverJournalSaveConflict('trp_test', 'sha_stale', localJournal);
    expect(journalApi.getJournal).toHaveBeenCalledWith('trp_test');
    expect(saveSpy).toHaveBeenCalledWith(
      'trp_test',
      'sha_server',
      expect.objectContaining({
        moments: expect.arrayContaining([
          expect.objectContaining({ id: 'mom_1', text: 'On device' }),
        ]),
      }),
    );
    expect(result.version).toBe('sha_saved');
  });
});

describe('isJournalSaveConflict', () => {
  it('recognises ApiClientError conflict', async () => {
    const { isJournalSaveConflict } = await import('@/journal/conflict-resolve');
    const err = new ApiClientError({ code: 'conflict', message: 'stale' }, 409);
    expect(isJournalSaveConflict(err)).toBe(true);
  });
});

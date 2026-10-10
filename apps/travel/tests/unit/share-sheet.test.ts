import { describe, expect, it } from 'vitest';
import { isJournalShareScopeValid } from '@/journal/share-sheet';

describe('journal share scope', () => {
  it('requires explicit leg or moment selection', () => {
    expect(isJournalShareScopeValid({ moment_ids: [], leg_ids: [] })).toBe(false);
    expect(isJournalShareScopeValid({ moment_ids: ['mom_1'], leg_ids: [] })).toBe(true);
    expect(isJournalShareScopeValid({ moment_ids: [], leg_ids: ['leg_1'] })).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { leftOffLine, sameSheet, sheetUrl } from '@/guides/share-sheet';

describe('share sheet', () => {
  it('points the link at the class site', () => {
    expect(sheetUrl('abc')).toBe('https://class.adam-russell.com/s/sheets/abc');
  });

  it('treats sheets as the same when only the moment they were built differs', () => {
    expect(sameSheet({ title: 'A', shared_at: '1' }, { title: 'A', shared_at: '2' })).toBe(true);
    expect(sameSheet({ title: 'A', shared_at: '1' }, { title: 'B', shared_at: '1' })).toBe(false);
    expect(sameSheet(null, { title: 'A' })).toBe(false);
  });

  it('says what was left off, and nothing when nothing was', () => {
    expect(leftOffLine({ blocks: 1, promise_lines: 2, minutes_sections: 0, voice_unpublished: 0 })).toBe(
      'Also left off: 1 block that is private or takes answers, 2 promise lines.'
    );
    expect(leftOffLine({ blocks: 0, promise_lines: 0, minutes_sections: 0, voice_unpublished: 0 })).toBe('');
  });
});

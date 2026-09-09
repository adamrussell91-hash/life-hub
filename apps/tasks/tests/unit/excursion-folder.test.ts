import { describe, expect, it } from 'vitest';
import { DEFAULT_FOLDER_ITEM_NAMES, cloneDefaultFolderItems } from '@/domain/excursion-folder';

describe('excursion folder catalog', () => {
  it('seeds every item off, with a unique id and the real folder names', () => {
    const items = cloneDefaultFolderItems();
    expect(items).toHaveLength(DEFAULT_FOLDER_ITEM_NAMES.length);
    expect(items.every((item) => item.on === false)).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.map((item) => item.name)).toEqual(DEFAULT_FOLDER_ITEM_NAMES);
  });

  it('clones independently', () => {
    const a = cloneDefaultFolderItems();
    const b = cloneDefaultFolderItems();
    a[0]!.on = true;
    expect(b[0]!.on).toBe(false);
  });
});

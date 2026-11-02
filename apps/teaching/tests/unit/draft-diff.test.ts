import { describe, expect, it } from 'vitest';
import { wordDiff, changesSheet } from '@/marking/draft-diff';

const flat = (a: string, b: string) => wordDiff(a, b).map((s) => `${s.kind[0]}:${s.text}`).join('|');

describe('wordDiff', () => {
  it('shows a swapped word', () => expect(flat('the big dog', 'the small dog')).toBe('s:the |r:big|a:small|s: dog'));
  it('shows added words', () => expect(flat('the dog', 'the old dog')).toBe('s:the |a:old |s:dog'));
  it('shows removed words', () => expect(flat('the old dog', 'the dog')).toBe('s:the |r:old |s:dog'));
  it('keeps punctuation apart from the word', () => expect(flat('a dog.', 'a dog!')).toBe('s:a dog|r:.|a:!'));
  it('joins back to both texts', () => {
    const parts = wordDiff('one two three', 'one four three');
    expect(parts.filter((p) => p.kind !== 'added').map((p) => p.text).join('')).toBe('one two three');
    expect(parts.filter((p) => p.kind !== 'removed').map((p) => p.text).join('')).toBe('one four three');
  });
  it('says when nothing changed', () => expect(changesSheet('same', 'same').textContent).toBe('No changes'));
});

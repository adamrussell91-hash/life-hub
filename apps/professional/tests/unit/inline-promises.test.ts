import { describe, expect, it } from 'vitest';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner } from '@/lib/inline-promises';

describe('extractInlinePromises', () => {
  it('finds »me and »Name lines', () => {
    const text = 'Good redraft.\n»me send the quote bank by Thu\n»Declan · rewrite the fence paragraph';
    expect(extractInlinePromises(text)).toEqual([
      { owner: 'me', text: 'send the quote bank by Thu' },
      { owner: 'Declan', text: 'rewrite the fence paragraph' }
    ]);
  });
  it('ignores empty promises and plain text', () => {
    expect(extractInlinePromises('»me   \nno marker here')).toEqual([]);
  });
});

describe('blockPlainText', () => {
  it('reads html and text from nested blocks', () => {
    const blocks = [
      { id: 'a', block_type: 'rich_text', content: { html: '<p>»me <b>quote bank</b></p>' } },
      { id: 'b', block_type: 'section', content: { blocks: [{ id: 'c', block_type: 'quote', content: { text: '»Declan redraft' } }] } }
    ];
    expect(blockPlainText(blocks)).toBe('»me quote bank\n»Declan redraft');
  });
});

describe('resolvePromiseOwner', () => {
  const people = [
    { ref: 'shared:person:p_declan', name: 'Declan J.' },
    { ref: 'shared:person:p_denielle', name: 'Denielle J.' }
  ];
  it('me owes the first person; a name owes by first-name match', () => {
    expect(resolvePromiseOwner('me', people)).toEqual({
      direction: 'you_owe',
      person_ref: 'shared:person:p_declan'
    });
    expect(resolvePromiseOwner('Denielle', people)).toEqual({
      direction: 'they_owe',
      person_ref: 'shared:person:p_denielle'
    });
    expect(resolvePromiseOwner('Greg', people)).toBeNull();
    expect(resolvePromiseOwner('me', [])).toBeNull();
  });
});

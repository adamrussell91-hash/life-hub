import { describe, expect, it } from 'vitest';
import {
  buildAnchor,
  granularityOf,
  orphans,
  resolveAnchor
} from '@/blocks/annotation-anchor';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';

const text = dulceAnnotationFixture.content.text;

describe('annotation anchors', () => {
  it('resolves an exact offset hit', () => {
    const anchor = dulceAnnotationFixture.content.annotations[0]!.anchor;
    const result = resolveAnchor(text, anchor);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.lineId).toBe('line_4');
    expect(result.start).toBe(38);
    expect(result.end).toBe(44);
    expect(result.exact).toBe('trudge');
  });

  it('falls back to quote when a nearby word is edited', () => {
    const edited = structuredClone(text);
    // Prefix text so stored offsets miss, while the quote context around "trudge" stays.
    edited.stanzas[0]!.lines[3]!.text =
      'Then, and towards our distant rest began to trudge.';
    const anchor = dulceAnnotationFixture.content.annotations[0]!.anchor;
    const result = resolveAnchor(edited, {
      ...anchor,
      start: 13,
      end: 17
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(edited.stanzas[0]!.lines[3]!.text.slice(result.start!, result.end!)).toBe(
      'trudge'
    );
  });

  it('disambiguates a duplicated quote with prefix', () => {
    const duplicated = structuredClone(text);
    duplicated.stanzas[0]!.lines[0]!.text =
      'like old beggars under sacks, like old beggars under sacks,';
    const phrase = dulceAnnotationFixture.content.annotations[1]!.anchor;
    const result = resolveAnchor(duplicated, {
      ...phrase,
      start: 999,
      end: 1000,
      quote: {
        exact: 'like old beggars under sacks',
        prefix: ', ',
        suffix: ','
      }
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Second occurrence starts after the comma+space of the first phrase
    expect(result.start).toBe(30);
  });

  it('marks deleted text as orphan', () => {
    const emptied = structuredClone(text);
    emptied.stanzas[0]!.lines[3]!.text = 'Gone.';
    const result = resolveAnchor(
      emptied,
      dulceAnnotationFixture.content.annotations[0]!.anchor
    );
    expect(result.status).toBe('orphan');
  });

  it('orphans when offsets run past the end of the line', () => {
    const short = structuredClone(text);
    short.stanzas[0]!.lines[0]!.text = 'Short';
    const result = resolveAnchor(short, {
      granularity: 'word',
      stanza: 'stanza_1',
      line: 'line_1',
      start: 0,
      end: 40,
      quote: { exact: 'Bent double' }
    });
    expect(result.status).toBe('orphan');
  });

  it('buildAnchor slices equal quote.exact for a word', () => {
    const line = text.stanzas[0]!.lines[0]!;
    const start = line.text.indexOf('beggars');
    const end = start + 'beggars'.length;
    const anchor = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_1',
      start,
      end
    });
    expect(anchor).not.toBeNull();
    expect(anchor!.quote.exact).toBe(line.text.slice(start, end));
    expect(anchor!.granularity).toBe('word');
  });

  it('granularityOf classifies line and stanza', () => {
    expect(
      granularityOf(text, { stanzaId: 'stanza_1', lineId: 'line_2', wholeLine: true })
    ).toBe('line');
    expect(granularityOf(text, { stanzaId: 'stanza_1', wholeStanza: true })).toBe(
      'stanza'
    );
  });

  it('orphans() lists annotations that no longer resolve', () => {
    const broken = structuredClone(dulceAnnotationFixture);
    broken.content.text.stanzas[0]!.lines[0]!.text = 'Rewritten entirely.';
    const list = orphans(broken);
    expect(list.map((a) => a.id)).toEqual(
      expect.arrayContaining(['ann_phrase', 'ann_stanza'])
    );
    expect(list.map((a) => a.id)).not.toContain('ann_line');
    expect(list.map((a) => a.id)).not.toContain('ann_word');
  });
});

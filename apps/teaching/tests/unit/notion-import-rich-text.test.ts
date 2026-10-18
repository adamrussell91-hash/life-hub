import { describe, expect, it } from 'vitest';
import { plainText, richTextHtml } from '@/notion-import/rich-text';
import type { NotionRichText } from '@/notion-import/types';

const t = (plain_text: string, annotations = {}, href: string | null = null, type: NotionRichText['type'] = 'text'): NotionRichText =>
  ({ type, plain_text, href, annotations });

describe('richTextHtml', () => {
  it('escapes text', () => {
    expect(richTextHtml([t('a < b & "c"')])).toBe('a &lt; b &amp; &quot;c&quot;');
  });
  it('keeps bold, italic and underline', () => {
    expect(richTextHtml([t('x', { bold: true, italic: true, underline: true })]))
      .toBe('<strong><em><u>x</u></em></strong>');
  });
  it('drops colour, strikethrough and inline code to plain text', () => {
    expect(richTextHtml([t('x', { color: 'red', strikethrough: true, code: true })])).toBe('x');
  });
  it('keeps safe links and drops unsafe ones', () => {
    expect(richTextHtml([t('go', {}, 'https://example.com/a?b=1&c=2')]))
      .toBe('<a href="https://example.com/a?b=1&amp;c=2">go</a>');
    expect(richTextHtml([t('bad', {}, 'javascript:alert(1)')])).toBe('bad');
  });
  it('keeps relative Notion links by resolving them against notion.so', () => {
    expect(richTextHtml([t('Other page', {}, '/0123456789abcdef0123456789abcdef')]))
      .toBe('<a href="https://www.notion.so/0123456789abcdef0123456789abcdef">Other page</a>');
  });
  it('turns mentions into plain text even when they carry an href', () => {
    expect(richTextHtml([t('Some Page', {}, 'https://www.notion.so/abc', 'mention')])).toBe('Some Page');
  });
  it('turns newlines into <br>', () => {
    expect(richTextHtml([t('a\nb')])).toBe('a<br>b');
  });
});

describe('plainText', () => {
  it('joins spans', () => {
    expect(plainText([t('a'), t('b')])).toBe('ab');
  });
  it('handles undefined', () => {
    expect(plainText(undefined)).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';

describe('sanitizeRichTextHtml', () => {
  it('strips script tags from rich text', () => {
    expect(sanitizeRichTextHtml('<p>Hi</p><script>alert(1)</script>')).toBe(
      '<p>Hi</p>'
    );
  });

  it('strips style tags from rich text', () => {
    expect(
      sanitizeRichTextHtml('<p>Hi</p><style>body{color:red}</style>')
    ).toBe('<p>Hi</p>');
  });

  it('strips onclick event handlers', () => {
    expect(
      sanitizeRichTextHtml('<p onclick="alert(1)">Click me</p>')
    ).toBe('<p>Click me</p>');
  });

  it('allows p, strong, em, u tags', () => {
    expect(
      sanitizeRichTextHtml(
        '<p><strong>Bold</strong> and <em>italic</em> and <u>underline</u></p>'
      )
    ).toBe(
      '<p><strong>Bold</strong> and <em>italic</em> and <u>underline</u></p>'
    );
  });

  it('allows ul, ol, li tags', () => {
    expect(
      sanitizeRichTextHtml('<ul><li>one</li></ul><ol><li>first</li></ol>')
    ).toBe('<ul><li>one</li></ul><ol><li>first</li></ol>');
  });

  it('allows a tags with href', () => {
    expect(
      sanitizeRichTextHtml('<a href="https://example.com">link</a>')
    ).toBe('<a href="https://example.com">link</a>');
  });

  it('allows blockquote and br tags', () => {
    expect(
      sanitizeRichTextHtml('<blockquote>quote</blockquote><p>line<br>break</p>')
    ).toBe('<blockquote>quote</blockquote><p>line<br>break</p>');
  });

  it('strips disallowed tags but keeps text content', () => {
    expect(sanitizeRichTextHtml('<div>Hello <span>world</span></div>')).toBe(
      'Hello world'
    );
  });

  it('strips javascript href from anchors', () => {
    expect(
      sanitizeRichTextHtml('<a href="javascript:alert(1)">bad</a>')
    ).toBe('<a>bad</a>');
  });
});

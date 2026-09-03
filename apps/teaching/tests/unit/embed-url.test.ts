import { describe, it, expect } from 'vitest';
import { parseEmbedInput, embedFrameSrc } from '@/blocks/embed-url';

describe('parseEmbedInput', () => {
  it('detects Google Slides and derives embed url', () => {
    const parsed = parseEmbedInput(
      'https://docs.google.com/presentation/d/abc123XYZ/edit#slide=id.p'
    );
    expect(parsed).toEqual({
      provider: 'google_slides',
      embed_url: 'https://docs.google.com/presentation/d/abc123XYZ/embed'
    });
  });

  it('detects published Google Slides and keeps the public embed id', () => {
    const parsed = parseEmbedInput(
      'https://docs.google.com/presentation/d/e/2PACX-1vABC/pub?start=false'
    );
    expect(parsed).toEqual({
      provider: 'google_slides',
      embed_url: 'https://docs.google.com/presentation/d/e/2PACX-1vABC/embed'
    });
  });

  it('passes through an existing Slides embed url', () => {
    const url = 'https://docs.google.com/presentation/d/e/2PACX-1vABC/embed?start=false';
    expect(parseEmbedInput(url)).toEqual({
      provider: 'google_slides',
      embed_url: url
    });
  });

  it('detects Google Docs and derives a preview embed url', () => {
    expect(parseEmbedInput('https://docs.google.com/document/d/doc99/edit')).toEqual({
      provider: 'google_docs',
      embed_url: 'https://docs.google.com/document/d/doc99/preview'
    });
  });

  it('detects Drive file and derives a preview embed url', () => {
    expect(parseEmbedInput('https://drive.google.com/file/d/fileABC/view')).toEqual({
      provider: 'pdf',
      embed_url: 'https://drive.google.com/file/d/fileABC/preview'
    });
  });

  it('detects Drive open?id= links', () => {
    expect(parseEmbedInput('https://drive.google.com/open?id=fileABC')).toEqual({
      provider: 'pdf',
      embed_url: 'https://drive.google.com/file/d/fileABC/preview'
    });
  });

  it('detects Google Sheets as a previewable generic embed', () => {
    expect(parseEmbedInput('https://docs.google.com/spreadsheets/d/sheet99/edit')).toEqual({
      provider: 'generic',
      embed_url: 'https://docs.google.com/spreadsheets/d/sheet99/preview'
    });
  });

  it('detects direct pdf urls', () => {
    expect(parseEmbedInput('https://cdn.example.com/notes/week1.pdf')).toEqual({
      provider: 'pdf'
    });
  });

  it('detects Google Maps place with coordinates', () => {
    const parsed = parseEmbedInput(
      'https://www.google.com/maps/place/Sydney/@-33.8688,151.2093,12z'
    );
    expect(parsed?.provider).toBe('google_maps');
    expect(parsed?.embed_url).toContain('output=embed');
    expect(parsed?.embed_url).toContain('-33.8688');
    expect(parsed?.embed_url).toContain('151.2093');
  });

  it('passes through existing maps embed urls', () => {
    const url = 'https://www.google.com/maps/embed?pb=hello';
    expect(parseEmbedInput(url)).toEqual({
      provider: 'google_maps',
      embed_url: url
    });
  });

  it('returns generic for unknown http urls', () => {
    expect(parseEmbedInput('https://example.com/page')).toEqual({
      provider: 'generic'
    });
  });

  it('returns null for empty or non-http', () => {
    expect(parseEmbedInput('')).toBeNull();
    expect(parseEmbedInput('javascript:alert(1)')).toBeNull();
  });
});

describe('embedFrameSrc', () => {
  it('uses embed_url when present', () => {
    expect(
      embedFrameSrc({
        url: 'https://docs.google.com/presentation/d/abc/edit',
        provider: 'google_slides',
        embed_url: 'https://docs.google.com/presentation/d/abc/embed'
      })
    ).toBe('https://docs.google.com/presentation/d/abc/embed');
  });

  it('derives preview frames for Docs and Drive files', () => {
    expect(
      embedFrameSrc({ url: 'https://docs.google.com/document/d/x/edit', provider: 'google_docs' })
    ).toBe('https://docs.google.com/document/d/x/preview');
    expect(
      embedFrameSrc({ url: 'https://drive.google.com/file/d/fileABC/view', provider: 'pdf' })
    ).toBe('https://drive.google.com/file/d/fileABC/preview');
  });

  it('returns null for a pdf that has no in-page viewer', () => {
    expect(embedFrameSrc({ url: 'https://x.com/a.pdf', provider: 'pdf' })).toBeNull();
  });

  it('falls back to url for generic', () => {
    expect(embedFrameSrc({ url: 'https://example.com', provider: 'generic' })).toBe(
      'https://example.com'
    );
  });
});

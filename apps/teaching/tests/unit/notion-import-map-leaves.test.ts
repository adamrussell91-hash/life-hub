// apps/teaching/tests/unit/notion-import-map-leaves.test.ts
import { describe, expect, it } from 'vitest';
import { mapBlocks } from '@/notion-import/map-blocks';
import { BlockSchema } from '@/schemas/block';
import { bullet, external, node, notionFile, numbered, p, rt, state, todo } from './notion-import-fixtures';

const valid = (blocks: unknown[]) => blocks.every((b) => BlockSchema.safeParse(b).success);

describe('text runs', () => {
  it('merges consecutive paragraphs and lists into one rich_text block', () => {
    const st = state();
    const blocks = mapBlocks([p('One'), bullet('A', [bullet('A1')]), bullet('B'), numbered('N'), todo('T', true)], 'top', st);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].block_type).toBe('rich_text');
    expect((blocks[0] as any).content.html).toBe(
      '<p>One</p><ul><li>A<ul><li>A1</li></ul></li><li>B</li></ul><ol><li>N</li></ol><ul><li>☑ T</li></ul>'
    );
    expect(valid(blocks)).toBe(true);
  });

  it('skips empty paragraphs', () => {
    expect(mapBlocks([p('')], 'top', state())).toEqual([]);
  });
});

describe('leaf blocks', () => {
  it('maps headings to the three variants', () => {
    const blocks = mapBlocks([
      node('heading_1', { rich_text: rt('H1') }),
      node('heading_2', { rich_text: rt('H2') }),
      node('heading_3', { rich_text: rt('H3') })
    ], 'top', state());
    expect(blocks.map((b: any) => [b.variant, b.content.text])).toEqual([
      ['page', 'H1'], ['section', 'H2'], ['subsection', 'H3']
    ]);
  });

  it('maps quote, divider, equation, code and table', () => {
    const table = node('table', { has_column_header: true }, [
      node('table_row', { cells: [rt('Week'), rt('Topic')] }),
      node('table_row', { cells: [rt('1'), rt('Intro')] })
    ]);
    const blocks = mapBlocks([
      node('quote', { rich_text: rt('Q') }),
      node('divider'),
      node('equation', { expression: 'e=mc^2' }),
      node('code', { rich_text: rt('print(1)'), language: 'python' }),
      table
    ], 'top', state());
    expect(blocks.map((b) => b.block_type)).toEqual(['quote', 'divider', 'equation', 'code', 'table']);
    expect((blocks[4] as any).content).toEqual({ headers: ['Week', 'Topic'], rows: [['1', 'Intro']] });
    expect(valid(blocks)).toBe(true);
  });

  it('puts a Notion-hosted image behind a media placeholder', () => {
    const st = state();
    const img = node('image', { ...notionFile('https://files.example/img.png'), caption: rt('A diagram') });
    const [block] = mapBlocks([img], 'top', st) as any[];
    expect(block.block_type).toBe('image');
    expect(block.content.url).toBe(`notion-media:${img.id}`);
    expect(block.content.alt_text).toBe('A diagram');
    expect(st.media).toEqual([expect.objectContaining({ ref: img.id, purpose: 'image', url: 'https://files.example/img.png' })]);
  });

  it('keeps external images as they are and warns on missing alt text', () => {
    const st = state();
    const [block] = mapBlocks([node('image', { ...external('https://cdn.example/x.jpg'), caption: [] })], 'top', st) as any[];
    expect(block.content.url).toBe('https://cdn.example/x.jpg');
    expect(block.content.alt_text).toBe('');
    expect(st.media).toEqual([]);
    expect(st.warnings.map((w) => w.rule)).toEqual(['alt_text']);
  });

  it('maps YouTube to a video block and an uploaded video to a file video', () => {
    const st = state();
    const upload = node('video', notionFile('https://files.example/clip.mp4', 'clip.mp4'));
    const blocks = mapBlocks([
      node('video', external('https://www.youtube.com/watch?v=dQw4w9WgXcQ')),
      upload
    ], 'top', st) as any[];
    expect(blocks[0].content).toMatchObject({ provider: 'youtube', external_id: 'dQw4w9WgXcQ' });
    expect(blocks[1].content).toMatchObject({ provider: 'file', url: `notion-media:${upload.id}` });
    expect(valid(blocks)).toBe(true);
  });

  it('maps files, pdfs, audio, embeds and bookmarks', () => {
    const st = state();
    const blocks = mapBlocks([
      node('file', { ...notionFile('https://files.example/a.docx', 'worksheet.docx'), caption: [] }),
      node('pdf', notionFile('https://files.example/r.pdf', 'reading.pdf')),
      node('audio', notionFile('https://files.example/a.mp3', 'a.mp3')),
      node('embed', { url: 'https://docs.google.com/presentation/d/abc123/edit' }),
      node('embed', { url: 'https://codepen.io/someone/pen/xyz' }),
      node('bookmark', { url: 'https://example.com/article', caption: rt('Article') })
    ], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['attachment', 'embed', 'audio', 'embed', 'embed', 'embed']);
    expect(blocks[0].content).toMatchObject({ title: 'worksheet.docx', filename: 'worksheet.docx' });
    expect(blocks[1].content.provider).toBe('pdf');
    expect(blocks[3].content.provider).toBe('google_slides');
    expect(blocks[4].content.provider).toBe('generic');
    expect(blocks[5].content).toMatchObject({ url: 'https://example.com/article', title: 'Article', provider: 'generic' });
    expect(valid(blocks)).toBe(true);
  });

  it('turns an uploaded .html file into an html_app with an html placeholder', () => {
    const st = state();
    const f = node('file', { ...notionFile('https://files.example/sim.html', 'sim.html'), caption: [] });
    const [block] = mapBlocks([f], 'top', st) as any[];
    expect(block.block_type).toBe('html_app');
    expect(block.content.html).toBe(`notion-media:${f.id}`);
    expect(st.media[0].purpose).toBe('html');
  });

  it('turns a full-page HTML code block into an html_app unless kept as code', () => {
    const html = '<!doctype html><html><body><script>1</script></body></html>';
    const code = node('code', { rich_text: rt(html), language: 'html' });
    const st = state();
    expect((mapBlocks([code], 'top', st)[0] as any).block_type).toBe('html_app');
    expect(st.html_apps).toHaveLength(1);
    const kept = state({ html_as_code: new Set([code.id]) });
    expect((mapBlocks([code], 'top', kept)[0] as any).block_type).toBe('code');
  });

  it('keeps an HTML snippet that is not a full page as code', () => {
    const code = node('code', { rich_text: rt('<p>hi</p>'), language: 'html' });
    expect((mapBlocks([code], 'top', state())[0] as any).block_type).toBe('code');
  });

  it('warns on mermaid code', () => {
    const st = state();
    mapBlocks([node('code', { rich_text: rt('flowchart TB'), language: 'mermaid' })], 'top', st);
    expect(st.warnings.map((w) => w.rule)).toEqual(['mermaid']);
  });

  it('turns synced blocks into plain text', () => {
    const synced = node('synced_block', { synced_from: null }, [p('Shared'), bullet('Point')]);
    const [block] = mapBlocks([synced], 'top', state()) as any[];
    expect(block.block_type).toBe('rich_text');
    expect(block.content.html).toBe('<p>Shared</p><p>Point</p>');
  });

  it('skips linked databases and unsupported blocks with warnings', () => {
    const st = state();
    const blocks = mapBlocks([node('child_database', { title: 'Lessons' }), node('unsupported')], 'top', st);
    expect(blocks).toEqual([]);
    expect(st.warnings.map((w) => w.rule)).toEqual(['skipped', 'unsupported']);
  });
});

describe('no silent content loss', () => {
  const rules = (st: any) => st.warnings.map((w: any) => w.rule);
  const img = () => node('image', { ...notionFile('https://files.example/i.png'), caption: rt('cap') });

  it('moves non-text paragraph children after the text with a warning', () => {
    const st = state();
    const blocks = mapBlocks([node('paragraph', { rich_text: rt('Intro') }, [img()])], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['rich_text', 'image']);
    expect(rules(st)).toContain('flattened');
    expect(valid(blocks)).toBe(true);
  });

  it('keeps media under a quote after it', () => {
    const st = state();
    const blocks = mapBlocks([node('quote', { rich_text: rt('Q') }, [p('more'), img()])], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['quote', 'image']);
    expect(blocks[0].content.quote).toBe('Q\nmore');
    expect(rules(st)).toContain('flattened');
  });

  it('warns on synced blocks and keeps their media', () => {
    const st = state();
    const blocks = mapBlocks([node('synced_block', { synced_from: null }, [p('Shared'), img()])], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['rich_text', 'image']);
    expect(rules(st)).toContain('flattened');
  });

  it('turns an external .html file into a generic embed, not an html_app', () => {
    const st = state();
    const [b] = mapBlocks([node('file', { ...external('https://cdn.example/sim.html'), name: 'sim.html', caption: [] })], 'top', st) as any[];
    expect(b.block_type).toBe('embed');
    expect(b.content).toMatchObject({ provider: 'generic', url: 'https://cdn.example/sim.html' });
    expect(rules(st)).toContain('flattened');
    expect(valid([b])).toBe(true);
  });

  it('keeps hosted video captions', () => {
    const [b] = mapBlocks([node('video', { ...notionFile('https://files.example/c.mp4', 'c.mp4'), caption: rt('Watch') })], 'top', state()) as any[];
    expect(b.content.caption).toBe('Watch');
  });

  it('maps a direct external video file to a file video, and other external video to a warned embed', () => {
    const st = state();
    const blocks = mapBlocks([
      node('video', external('https://cdn.example/clip.mp4')),
      node('video', external('https://videos.example/watch/1'))
    ], 'top', st) as any[];
    expect(blocks[0].content).toMatchObject({ provider: 'file', url: 'https://cdn.example/clip.mp4' });
    expect(blocks[1].block_type).toBe('embed');
    expect(rules(st)).toEqual(['flattened']);
    expect(valid(blocks)).toBe(true);
  });

  it('skips media blocks with no file, with a warning', () => {
    const st = state();
    const blocks = mapBlocks([node('image', {}), node('pdf', {}), node('video', {}), node('file', {}), node('audio', {})], 'top', st);
    expect(blocks).toEqual([]);
    expect(rules(st)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
    expect(st.warnings[0].message).toBe('Image has no file; skipped.');
  });
});

describe('nested blocks stay in place', () => {
  const img = () => node('image', { ...notionFile('https://files.example/i.png'), caption: rt('cap') });

  it('ends the text run at a paragraph that has block children', () => {
    const st = state();
    const blocks = mapBlocks([node('paragraph', { rich_text: rt('A') }, [img()]), p('B')], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['rich_text', 'image', 'rich_text']);
    expect(blocks[0].content.html).toBe('<p>A</p>');
    expect(blocks[2].content.html).toBe('<p>B</p>');
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
    expect(valid(blocks)).toBe(true);
  });

  it('moves blocks under a list item after it and continues the list', () => {
    const st = state();
    const blocks = mapBlocks([bullet('One', [bullet('Sub'), img()]), bullet('Two')], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['rich_text', 'image', 'rich_text']);
    expect(blocks[0].content.html).toBe('<ul><li>One<ul><li>Sub</li></ul></li></ul>');
    expect(blocks[2].content.html).toBe('<ul><li>Two</li></ul>');
    expect(st.warnings.map((w) => w.message)).toEqual(['Blocks nested under a list item were moved after it.']);
    expect(valid(blocks)).toBe(true);
  });

  it('continues numbering after a moved block', () => {
    const one = node('numbered_list_item', { rich_text: rt('one') }, [img()]);
    const blocks = mapBlocks([one, numbered('two'), numbered('three')], 'top', state()) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['rich_text', 'image', 'rich_text']);
    expect(blocks[0].content.html).toBe('<ol><li>one</li></ol>');
    expect(blocks[2].content.html).toBe('<ol start="2"><li>two</li><li>three</li></ol>');
  });

  it('keeps paragraph children in their original order', () => {
    const blocks = mapBlocks([node('paragraph', { rich_text: rt('A') }, [img(), p('child')])], 'top', state()) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['rich_text', 'image', 'rich_text']);
    expect(blocks[0].content.html).toBe('<p>A</p>');
    expect(blocks[2].content.html).toBe('<p>child</p>');
  });

  it('keeps text children inside the list item', () => {
    const blocks = mapBlocks([bullet('One', [p('extra')])], 'top', state()) as any[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content.html).toBe('<ul><li>One<br>extra</li></ul>');
  });

  it('labels a pdf with no file as PDF', () => {
    const st = state();
    mapBlocks([node('pdf', {})], 'top', st);
    expect(st.warnings[0].message).toBe('PDF has no file; skipped.');
  });
});

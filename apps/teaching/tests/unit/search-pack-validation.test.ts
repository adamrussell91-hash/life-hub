import { describe, expect, it } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { CoverSchema } from '@/schemas/cover';
import type { AiProposal } from '@/ai/proposals';
import type { SearchPack } from '@/ai/search-pack';
import { visitBlocks } from '@/blocks/walk-blocks';
import {
  validateProposalAgainstSearchPack,
  type SearchPackViolation
} from '@/ai/search-pack-validation';

const PACK_SOURCE = 'https://www.britannica.com/topic/cheese';
const PACK_IMAGE = 'https://museum.example/images/cheese.jpg';
const PACK_IMAGE_PAGE = 'https://museum.example/cheese';
const PACK_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const PACK_VIDEO_ID = 'dQw4w9WgXcQ';

const INVENTED_IMAGE = 'https://invented.example/fake.jpg';
const INVENTED_PAGE = 'https://invented.example/page';
const INVENTED_VIDEO_ID = 'aBcDeFgHiJk';

function searchPack(overrides: Partial<SearchPack> = {}): SearchPack {
  return {
    query: 'cheese',
    searched_at: '2026-08-16T10:00:00.000Z',
    available: true,
    sources: [
      {
        title: 'Cheese',
        url: PACK_SOURCE,
        snippet: 'All about cheese.',
        domain: 'www.britannica.com',
        education_score: 80
      }
    ],
    images: [
      {
        image_url: PACK_IMAGE,
        source_page_url: PACK_IMAGE_PAGE,
        title: 'A wheel of cheese'
      }
    ],
    videos: [
      {
        provider: 'youtube',
        external_id: PACK_VIDEO_ID,
        url: PACK_VIDEO_URL,
        title: 'How cheese is made'
      }
    ],
    ...overrides
  };
}

const PACK = searchPack();

let blockCounter = 0;

/** Parse through the real BlockSchema so fixtures can never drift from the schema. */
function block(input: Record<string, unknown>): Block {
  blockCounter += 1;
  return BlockSchema.parse({
    id: `block_${blockCounter}`,
    type: 'block',
    visibility: 'student_teacher',
    layout: {},
    print: {},
    settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1,
    ...input
  });
}

function imageBlock(url: string): Block {
  return block({ block_type: 'image', content: { url, alt_text: 'Cheese' } });
}

function richTextBlock(html: string): Block {
  return block({ block_type: 'rich_text', content: { html } });
}

function headingBlock(text: string): Block {
  return block({ block_type: 'heading', variant: 'section', content: { text } });
}

function sectionBlock(children: Block[]): Block {
  return block({
    block_type: 'section',
    content: { title: 'Section', blocks: children }
  });
}

function columnsBlock(left: Block[], right: Block[]): Block {
  return block({
    block_type: 'columns',
    content: {
      preset: '50-50',
      columns: [
        { width: 6, blocks: left },
        { width: 6, blocks: right }
      ]
    }
  });
}

function tabsBlock(first: Block[], second: Block[]): Block {
  return block({
    block_type: 'tabs',
    content: {
      tabs: [
        { id: 'tab_1', label: 'One', blocks: first },
        { id: 'tab_2', label: 'Two', blocks: second }
      ]
    }
  });
}

function insert(blocks: Block[]): AiProposal {
  return { kind: 'insert_blocks', position: 'below', blocks };
}

function violationsFor(proposal: AiProposal, pack: SearchPack = PACK): SearchPackViolation[] {
  const result = validateProposalAgainstSearchPack(proposal, pack);
  return result.ok ? [] : result.violations;
}

function expectOk(proposal: AiProposal, pack: SearchPack = PACK): void {
  expect(validateProposalAgainstSearchPack(proposal, pack)).toEqual({ ok: true });
}

describe('visitBlocks', () => {
  it('visits every block with an indexed path and recurses into sections, columns, and tabs', () => {
    const nested = sectionBlock([
      columnsBlock([imageBlock(PACK_IMAGE)], [headingBlock('Right')]),
      tabsBlock([richTextBlock('<p>One</p>')], [headingBlock('Two')])
    ]);
    const seen: Array<{ type: Block['block_type']; path: string }> = [];

    visitBlocks([headingBlock('Top'), nested], (visited, path) => {
      seen.push({ type: visited.block_type, path });
    });

    expect(seen).toEqual([
      { type: 'heading', path: 'blocks[0]' },
      { type: 'section', path: 'blocks[1]' },
      { type: 'columns', path: 'blocks[1].content.blocks[0]' },
      { type: 'image', path: 'blocks[1].content.blocks[0].content.columns[0].blocks[0]' },
      { type: 'heading', path: 'blocks[1].content.blocks[0].content.columns[1].blocks[0]' },
      { type: 'tabs', path: 'blocks[1].content.blocks[1]' },
      { type: 'rich_text', path: 'blocks[1].content.blocks[1].content.tabs[0].blocks[0]' },
      { type: 'heading', path: 'blocks[1].content.blocks[1].content.tabs[1].blocks[0]' }
    ]);
  });

  it('honours a custom root path', () => {
    const paths: string[] = [];
    visitBlocks([imageBlock(PACK_IMAGE)], (_block, path) => paths.push(path), 'section');
    expect(paths).toEqual(['section[0]']);
  });

  it('never treats arbitrary nested objects as blocks', () => {
    const decoy = block({
      block_type: 'heading',
      variant: 'section',
      content: { text: 'Decoy' },
      settings: {
        blocks: [{ id: 'ghost', type: 'block', block_type: 'image', content: { url: INVENTED_IMAGE } }]
      }
    });
    const ids: string[] = [];

    visitBlocks([decoy], (visited) => ids.push(visited.id));

    expect(ids).toEqual([decoy.id]);
  });
});

describe('validateProposalAgainstSearchPack — accepted media', () => {
  it('accepts images and videos the pack returned', () => {
    expectOk(
      insert([
        imageBlock(PACK_IMAGE),
        block({
          block_type: 'video',
          content: { provider: 'youtube', external_id: PACK_VIDEO_ID, url: PACK_VIDEO_URL }
        })
      ])
    );
  });

  it('accepts a video referenced by pack provider and id without a url', () => {
    expectOk(
      insert([
        block({
          block_type: 'video',
          content: { provider: 'youtube', external_id: PACK_VIDEO_ID }
        })
      ])
    );
  });

  it('passes proposals with no media at all', () => {
    expectOk(insert([headingBlock('No media here'), richTextBlock('<p>Just words</p>')]));
  });

  it('ignores empty optional media fields', () => {
    expectOk(
      insert([
        block({
          block_type: 'diagram',
          content: { source: 'svg', svg_markup: '<svg></svg>' }
        }),
        block({
          block_type: 'timeline',
          content: {
            events: [{ id: 'e1', when: '1900', label: 'Event', description: 'Something happened' }]
          }
        })
      ])
    );
  });
});

describe('validateProposalAgainstSearchPack — invented media', () => {
  it('rejects an invented youtube external id by field and exact value', () => {
    const violations = violationsFor(
      insert([
        block({
          block_type: 'video',
          content: { provider: 'youtube', external_id: INVENTED_VIDEO_ID, url: PACK_VIDEO_URL }
        })
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.external_id',
        block_type: 'video',
        field: 'external_id',
        value: INVENTED_VIDEO_ID,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('rejects a pack video id claimed under the wrong provider', () => {
    const violations = violationsFor(
      insert([
        block({
          block_type: 'video',
          content: { provider: 'vimeo', external_id: PACK_VIDEO_ID }
        })
      ])
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'external_id', value: PACK_VIDEO_ID });
  });

  it('rejects an invented image url with the exact value', () => {
    expect(violationsFor(insert([imageBlock(INVENTED_IMAGE)]))).toEqual([
      {
        path: 'blocks[0].content.url',
        block_type: 'image',
        field: 'url',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('matches pack urls exactly rather than by host or path prefix', () => {
    const nearMiss = `${PACK_IMAGE}?w=800`;
    expect(violationsFor(insert([imageBlock(nearMiss)]))).toMatchObject([{ value: nearMiss }]);
  });

  it('reports every violation, not just the first', () => {
    const violations = violationsFor(
      insert([
        imageBlock(INVENTED_IMAGE),
        imageBlock(`${INVENTED_IMAGE}?two`),
        block({
          block_type: 'audio',
          content: { url: `${INVENTED_IMAGE}?three` }
        })
      ])
    );

    expect(violations.map((violation) => violation.value)).toEqual([
      INVENTED_IMAGE,
      `${INVENTED_IMAGE}?two`,
      `${INVENTED_IMAGE}?three`
    ]);
  });
});

describe('validateProposalAgainstSearchPack — structured media fields', () => {
  it('checks gallery items by index', () => {
    const violations = violationsFor(
      insert([
        block({
          block_type: 'gallery',
          content: {
            layout: 'grid',
            items: [
              { id: 'g1', url: PACK_IMAGE, alt_text: 'Allowed' },
              { id: 'g2', url: INVENTED_IMAGE, alt_text: 'Invented' }
            ]
          }
        })
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.items[1].url',
        block_type: 'gallery',
        field: 'url',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks embed url and embed_url', () => {
    const violations = violationsFor(
      insert([
        block({
          block_type: 'embed',
          content: { url: PACK_SOURCE, provider: 'generic', embed_url: INVENTED_PAGE }
        }),
        block({
          block_type: 'embed',
          content: { url: INVENTED_PAGE, provider: 'generic' }
        })
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.embed_url',
        block_type: 'embed',
        field: 'embed_url',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      },
      {
        path: 'blocks[1].content.url',
        block_type: 'embed',
        field: 'url',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks audio and attachment urls', () => {
    const violations = violationsFor(
      insert([
        block({ block_type: 'audio', content: { url: INVENTED_PAGE, title: 'Clip' } }),
        block({
          block_type: 'attachment',
          content: { url: INVENTED_PAGE, title: 'Worksheet' }
        })
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.url',
        block_type: 'audio',
        field: 'url',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      },
      {
        path: 'blocks[1].content.url',
        block_type: 'attachment',
        field: 'url',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks flashcard card images', () => {
    const violations = violationsFor(
      insert([
        block({
          block_type: 'flashcards',
          content: {
            cards: [
              { id: 'c1', front: 'Front', back: 'Back', image_url: PACK_IMAGE },
              { id: 'c2', front: 'Front', back: 'Back', image_url: INVENTED_IMAGE }
            ]
          }
        })
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.cards[1].image_url',
        block_type: 'flashcards',
        field: 'image_url',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks diagram images', () => {
    expect(
      violationsFor(
        insert([
          block({
            block_type: 'diagram',
            content: { source: 'image', image_url: INVENTED_IMAGE, image_alt: 'Diagram' }
          })
        ])
      )
    ).toEqual([
      {
        path: 'blocks[0].content.image_url',
        block_type: 'diagram',
        field: 'image_url',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks timeline event images and links', () => {
    const violations = violationsFor(
      insert([
        block({
          block_type: 'timeline',
          content: {
            events: [
              {
                id: 'e1',
                when: '1900',
                label: 'Allowed',
                description: 'Uses pack media',
                image_url: PACK_IMAGE,
                link_url: PACK_SOURCE
              },
              {
                id: 'e2',
                when: '1950',
                label: 'Invented',
                description: 'Uses invented media',
                image_url: INVENTED_IMAGE,
                link_url: INVENTED_PAGE
              }
            ]
          }
        })
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.events[1].image_url',
        block_type: 'timeline',
        field: 'image_url',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      },
      {
        path: 'blocks[0].content.events[1].link_url',
        block_type: 'timeline',
        field: 'link_url',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks the replace_lesson cover url', () => {
    const violations = violationsFor({
      kind: 'replace_lesson',
      title: 'Cheese',
      cover: CoverSchema.parse({ url: INVENTED_IMAGE, alt_text: 'Invented' }),
      blocks: [headingBlock('Cheese')]
    });

    expect(violations).toEqual([
      { path: 'cover.url', field: 'url', value: INVENTED_IMAGE, reason: 'not_in_pack' }
    ]);
  });

  it('accepts a cover url the pack returned', () => {
    expectOk({
      kind: 'replace_lesson',
      cover: CoverSchema.parse({ url: PACK_IMAGE, alt_text: 'Cheese' }),
      blocks: []
    });
  });
});

describe('validateProposalAgainstSearchPack — nested layouts', () => {
  it('finds media inside sections, columns, and tabs', () => {
    const violations = violationsFor(
      insert([
        sectionBlock([
          imageBlock(INVENTED_IMAGE),
          columnsBlock([imageBlock(`${INVENTED_IMAGE}?col`)], [headingBlock('Right')]),
          tabsBlock([imageBlock(`${INVENTED_IMAGE}?tab`)], [headingBlock('Two')])
        ])
      ])
    );

    expect(violations.map((violation) => violation.path)).toEqual([
      'blocks[0].content.blocks[0].content.url',
      'blocks[0].content.blocks[1].content.columns[0].blocks[0].content.url',
      'blocks[0].content.blocks[2].content.tabs[0].blocks[0].content.url'
    ]);
    expect(violations.every((violation) => violation.block_type === 'image')).toBe(true);
  });
});

describe('validateProposalAgainstSearchPack — html attributes', () => {
  it('accepts exact pack urls in rich text, html, and html_app markup', () => {
    expectOk(
      insert([
        richTextBlock(`<p><a href="${PACK_SOURCE}">Read</a></p>`),
        block({ block_type: 'html', content: { html: `<img src='${PACK_IMAGE}' alt="Cheese">` } }),
        block({
          block_type: 'html_app',
          content: { html: `<iframe SRC="${PACK_VIDEO_URL}"></iframe>` }
        })
      ])
    );
  });

  it('matches HREF and SRC case-insensitively with both quote styles', () => {
    expectOk(
      insert([
        richTextBlock(`<a HREF="${PACK_SOURCE}">Double</a><img SRC='${PACK_IMAGE}' alt="x">`)
      ])
    );

    const violations = violationsFor(
      insert([
        richTextBlock(`<a HREF='${INVENTED_PAGE}'>Fake</a><img SRC="${INVENTED_IMAGE}">`)
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.html',
        block_type: 'rich_text',
        field: 'href',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      },
      {
        path: 'blocks[0].content.html',
        block_type: 'rich_text',
        field: 'src',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('rejects invented https hrefs and srcs in markup', () => {
    const violations = violationsFor(
      insert([
        richTextBlock(`<p><a HREF='${INVENTED_PAGE}'>Fake</a><img src="${INVENTED_IMAGE}"></p>`)
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.html',
        block_type: 'rich_text',
        field: 'href',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      },
      {
        path: 'blocks[0].content.html',
        block_type: 'rich_text',
        field: 'src',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('ignores relative, anchor, mailto, javascript, data, empty, and non-https attributes', () => {
    expectOk(
      insert([
        richTextBlock(
          [
            '<a href="/lessons/cheese">Relative</a>',
            '<a href="#top">Anchor</a>',
            '<a href="mailto:teacher@example.com">Mail</a>',
            '<a href="javascript:alert(1)">Script</a>',
            '<img src="data:image/png;base64,AAAA">',
            '<img src="">',
            '<a href="http://insecure.example/page">Insecure</a>'
          ].join('')
        )
      ])
    );
  });

  it('ignores data-src, xlink:href, and unquoted prose urls', () => {
    expectOk(
      insert([
        richTextBlock(
          [
            `<img data-src="${INVENTED_IMAGE}">`,
            `<use xlink:href="${INVENTED_PAGE}">`,
            `Prose says src=${INVENTED_IMAGE} and href=${INVENTED_PAGE} without quotes`
          ].join('')
        )
      ])
    );
  });

  it('reports one violation per distinct markup reference', () => {
    const violations = violationsFor(
      insert([
        richTextBlock(
          `<a href="${INVENTED_PAGE}">One</a><a href="${INVENTED_PAGE}">Again</a><img src="${INVENTED_PAGE}">`
        )
      ])
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.html',
        block_type: 'rich_text',
        field: 'href',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      },
      {
        path: 'blocks[0].content.html',
        block_type: 'rich_text',
        field: 'src',
        value: INVENTED_PAGE,
        reason: 'not_in_pack'
      }
    ]);
  });
});

describe('validateProposalAgainstSearchPack — proposal surfaces', () => {
  it('checks replace_block', () => {
    expect(
      violationsFor({
        kind: 'replace_block',
        block_id: 'b1',
        block: imageBlock(INVENTED_IMAGE)
      })
    ).toEqual([
      {
        path: 'block[0].content.url',
        block_type: 'image',
        field: 'url',
        value: INVENTED_IMAGE,
        reason: 'not_in_pack'
      }
    ]);
  });

  it('checks replace_section including children', () => {
    const violations = violationsFor({
      kind: 'replace_section',
      section_id: 's1',
      section: sectionBlock([imageBlock(INVENTED_IMAGE)])
    });

    expect(violations.map((violation) => violation.path)).toEqual([
      'section[0].content.blocks[0].content.url'
    ]);
  });

  it('checks replace_lesson blocks', () => {
    const violations = violationsFor({
      kind: 'replace_lesson',
      blocks: [imageBlock(INVENTED_IMAGE)]
    });

    expect(violations.map((violation) => violation.path)).toEqual(['blocks[0].content.url']);
  });

  it('passes proposal kinds that carry no media', () => {
    expectOk({ kind: 'delete_blocks', ids: ['b1'] });
    expectOk({ kind: 'reorder_blocks', parent: { kind: 'root' }, ordered_ids: ['b1', 'b2'] });
    expectOk({ kind: 'review_only', summary: 'Looks good.' });
  });
});

describe('validateProposalAgainstSearchPack — unavailable pack', () => {
  it('fails every external reference closed when the pack is unavailable', () => {
    const pack = searchPack({ available: false, sources: [], images: [], videos: [] });
    const violations = violationsFor(
      insert([
        imageBlock(PACK_IMAGE),
        block({
          block_type: 'video',
          content: { provider: 'youtube', external_id: PACK_VIDEO_ID }
        }),
        richTextBlock(`<a href="${PACK_SOURCE}">Source</a>`)
      ]),
      pack
    );

    expect(violations).toEqual([
      {
        path: 'blocks[0].content.url',
        block_type: 'image',
        field: 'url',
        value: PACK_IMAGE,
        reason: 'pack_unavailable'
      },
      {
        path: 'blocks[1].content.external_id',
        block_type: 'video',
        field: 'external_id',
        value: PACK_VIDEO_ID,
        reason: 'pack_unavailable'
      },
      {
        path: 'blocks[2].content.html',
        block_type: 'rich_text',
        field: 'href',
        value: PACK_SOURCE,
        reason: 'pack_unavailable'
      }
    ]);
  });

  it('still passes a media-free proposal when the pack is unavailable', () => {
    expectOk(insert([headingBlock('Words only')]), searchPack({ available: false }));
  });

  it('ignores pack entries that are present while available is false', () => {
    const violations = violationsFor(
      insert([
        imageBlock(PACK_IMAGE),
        block({
          block_type: 'video',
          content: { provider: 'youtube', external_id: PACK_VIDEO_ID }
        })
      ]),
      searchPack({ available: false })
    );

    expect(violations).toMatchObject([
      { field: 'url', value: PACK_IMAGE, reason: 'pack_unavailable' },
      { field: 'external_id', value: PACK_VIDEO_ID, reason: 'pack_unavailable' }
    ]);
  });
});

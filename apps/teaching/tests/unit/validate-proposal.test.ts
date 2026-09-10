import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { emptySearchPack, type SearchPack } from '@/ai/search-pack';
import { validateMutatingProposal } from '@/ai/validate-proposal';
import type { AiProposal } from '@/ai/proposals';

const PACK_IMAGE = 'https://cdn.example.com/diagram.png';

const pack: SearchPack = {
  ...emptySearchPack('spacing', '2026-08-18T00:00:00.000Z'),
  available: true,
  images: [
    {
      title: 'Spacing',
      image_url: PACK_IMAGE,
      source_page_url: 'https://www.britannica.com/topic/memory',
      width: 800,
      height: 600
    }
  ]
};

function insert(blocks: ReturnType<typeof createBlock>[]): AiProposal {
  return { kind: 'insert_blocks', position: 'below', blocks };
}

describe('validateMutatingProposal', () => {
  it('rejects a caption-only image diagram that would fail publish', () => {
    const diagram = createBlock('diagram', 'dg_caption');
    if (diagram.block_type !== 'diagram') throw new Error('expected diagram');
    diagram.content = {
      source: 'image',
      image_url: '',
      image_alt: '',
      caption: 'Spacing vs massed practice'
    };

    expect(validateMutatingProposal(insert([diagram]), pack)).toEqual({
      ok: false,
      error: 'Diagram “Spacing vs massed practice”: Diagram image needs a valid http(s) URL to publish'
    });
  });

  it('accepts an image diagram grounded in the search pack', () => {
    const diagram = createBlock('diagram', 'dg_ok');
    if (diagram.block_type !== 'diagram') throw new Error('expected diagram');
    diagram.content = {
      source: 'image',
      image_url: PACK_IMAGE,
      image_alt: 'A forgetting curve'
    };

    expect(validateMutatingProposal(insert([diagram]), pack)).toEqual({ ok: true });
  });
});

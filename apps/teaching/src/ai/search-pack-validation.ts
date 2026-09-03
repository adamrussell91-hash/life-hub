import type { Block } from '@/schemas/block';
import type { AiProposal } from '@/ai/proposals';
import type { SearchPack } from '@/ai/search-pack';
import type { VideoProvider } from '@/blocks/video-url';
import { visitBlocks } from '@/blocks/walk-blocks';

export type SearchPackViolation = {
  path: string;
  block_type?: Block['block_type'];
  field: string;
  value: string;
  reason: 'not_in_pack' | 'pack_unavailable';
};

type UrlReference = {
  kind: 'url';
  path: string;
  field: string;
  value: string;
  block_type?: Block['block_type'];
};

type VideoReference = {
  kind: 'video';
  path: string;
  field: string;
  value: string;
  provider: VideoProvider;
  block_type: Block['block_type'];
};

type ExternalReference = UrlReference | VideoReference;

/**
 * Exact href/src only (case-insensitive), single- or double-quoted values.
 * Does not match data-src, xlink:href, or unquoted prose.
 */
const HTML_URL_ATTRIBUTE = /(?<![\w:-])(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function addUrl(
  references: ExternalReference[],
  path: string,
  field: string,
  value: string | undefined,
  blockType?: Block['block_type']
): void {
  if (typeof value !== 'string' || !value.trim()) return;
  references.push({ kind: 'url', path, field, value, block_type: blockType });
}

function collectHtmlUrls(
  references: ExternalReference[],
  html: string,
  path: string,
  blockType: Block['block_type']
): void {
  for (const match of html.matchAll(HTML_URL_ATTRIBUTE)) {
    const field = match[1]!.toLowerCase();
    const value = (match[2] ?? match[3] ?? '').trim();
    if (!value.toLowerCase().startsWith('https://')) continue;

    references.push({ kind: 'url', path, field, value, block_type: blockType });
  }
}

function collectBlockReferences(
  references: ExternalReference[],
  block: Block,
  blockPath: string
): void {
  const content = `${blockPath}.content`;

  switch (block.block_type) {
    case 'image':
      addUrl(references, `${content}.url`, 'url', block.content.url, block.block_type);
      return;
    case 'gallery':
      block.content.items.forEach((item, index) => {
        addUrl(references, `${content}.items[${index}].url`, 'url', item.url, block.block_type);
      });
      return;
    case 'video':
      if (block.content.external_id.trim()) {
        references.push({
          kind: 'video',
          path: `${content}.external_id`,
          field: 'external_id',
          value: block.content.external_id,
          provider: block.content.provider,
          block_type: block.block_type
        });
      }
      addUrl(references, `${content}.url`, 'url', block.content.url, block.block_type);
      return;
    case 'embed':
      addUrl(references, `${content}.url`, 'url', block.content.url, block.block_type);
      addUrl(
        references,
        `${content}.embed_url`,
        'embed_url',
        block.content.embed_url,
        block.block_type
      );
      return;
    case 'audio':
    case 'attachment':
      addUrl(references, `${content}.url`, 'url', block.content.url, block.block_type);
      return;
    case 'flashcards':
      block.content.cards.forEach((card, index) => {
        addUrl(
          references,
          `${content}.cards[${index}].image_url`,
          'image_url',
          card.image_url,
          block.block_type
        );
      });
      return;
    case 'diagram':
      addUrl(
        references,
        `${content}.image_url`,
        'image_url',
        block.content.image_url,
        block.block_type
      );
      return;
    case 'timeline':
      block.content.events.forEach((event, index) => {
        addUrl(
          references,
          `${content}.events[${index}].image_url`,
          'image_url',
          event.image_url,
          block.block_type
        );
        addUrl(
          references,
          `${content}.events[${index}].link_url`,
          'link_url',
          event.link_url,
          block.block_type
        );
      });
      return;
    case 'rich_text':
    case 'html':
    case 'html_app':
      collectHtmlUrls(references, block.content.html, `${content}.html`, block.block_type);
      return;
    default:
      return;
  }
}

function collectTreeReferences(
  references: ExternalReference[],
  blocks: Block[],
  rootPath: string
): void {
  visitBlocks(blocks, (block, path) => collectBlockReferences(references, block, path), rootPath);
}

function collectProposalReferences(proposal: AiProposal): ExternalReference[] {
  const references: ExternalReference[] = [];

  switch (proposal.kind) {
    case 'replace_block':
      collectTreeReferences(references, [proposal.block], 'block');
      break;
    case 'replace_section':
      collectTreeReferences(references, [proposal.section], 'section');
      break;
    case 'replace_lesson':
      addUrl(references, 'cover.url', 'url', proposal.cover?.url);
      collectTreeReferences(references, proposal.blocks, 'blocks');
      break;
    case 'insert_blocks':
      collectTreeReferences(references, proposal.blocks, 'blocks');
      break;
    default:
      break;
  }

  return references;
}

function allowedUrlsFrom(pack: SearchPack): Set<string> {
  const allowed = new Set<string>();
  for (const source of pack.sources) allowed.add(source.url);
  for (const image of pack.images) {
    allowed.add(image.image_url);
    allowed.add(image.source_page_url);
  }
  for (const video of pack.videos) allowed.add(video.url);
  return allowed;
}

function videoKey(provider: VideoProvider, externalId: string): string {
  return `${provider}\u0000${externalId}`;
}

/**
 * Fail closed: an AI proposal may only reference media the search pack actually
 * returned. Anything else — including everything at all when the search failed —
 * is a violation.
 */
export function validateProposalAgainstSearchPack(
  proposal: AiProposal,
  pack: SearchPack
): { ok: true } | { ok: false; violations: SearchPackViolation[] } {
  const references = collectProposalReferences(proposal);
  if (references.length === 0) return { ok: true };

  const allowedUrls = pack.available ? allowedUrlsFrom(pack) : new Set<string>();
  const allowedVideos = pack.available
    ? new Set(pack.videos.map((video) => videoKey(video.provider, video.external_id)))
    : new Set<string>();

  const violations: SearchPackViolation[] = [];
  const seen = new Set<string>();

  for (const reference of references) {
    const allowed =
      reference.kind === 'video'
        ? allowedVideos.has(videoKey(reference.provider, reference.value))
        : allowedUrls.has(reference.value);
    if (allowed) continue;

    const violation: SearchPackViolation = {
      path: reference.path,
      ...(reference.block_type ? { block_type: reference.block_type } : {}),
      field: reference.field,
      value: reference.value,
      reason: pack.available ? 'not_in_pack' : 'pack_unavailable'
    };
    const key = `${violation.path}\u0000${violation.field}\u0000${violation.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push(violation);
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

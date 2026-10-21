// apps/tasks/src/views/decision-book/record-blocks.ts
// The decision record as page blocks: a heading, one rich text block per section, and the
// provenance caption with a link back to the decision. The provenance graphic is its own image
// block (the main model's emblem inside its section's), written above the heading on a full
// write; its source is a static file the Tasks build serves (public/decision-book/provenance/).
// The caption and the link back go in the rich text block at the end, not on the image.
// Ids are fixed per session and version, so a retried append never duplicates a block.
import { createBlock } from '@teaching/blocks/create-block';
import type { Block } from '@/schemas/block';
import { reviseName } from '../../../../../packages/problem-solver/naming.mjs';
import { toolNamed } from './decor';
import type { PsRecordOffer } from '../../../../../packages/problem-solver/types';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function recordBlockId(sessionId: string, version: number, n: number): string {
  return `dm-rec-${sessionId.slice(0, 8)}-v${version}-${n}`;
}

/** The provenance image's address: absolute, since an image block only shows http(s) sources. */
export function provenanceUrl(model: string, origin = location.origin, base = import.meta.env.BASE_URL): string {
  return new URL(`${base}decision-book/provenance/${model}.svg`, origin).href;
}

/** The record's text blocks: a full record on a write, only the changed sections on an update. */
export function recordBlocks(offer: PsRecordOffer, opts: { sessionId: string; date: string }): Block[] {
  let n = 0;
  const id = () => recordBlockId(opts.sessionId, offer.version, (n += 1));
  const heading = (text: string, variant: 'section' | 'subsection'): Block => {
    const block = createBlock('heading', id()) as Extract<Block, { block_type: 'heading' }>;
    return { ...block, variant, content: { text } };
  };
  const rich = (html: string): Block => {
    const block = createBlock('rich_text', id()) as Extract<Block, { block_type: 'rich_text' }>;
    return { ...block, content: { html } };
  };
  const write = offer.kind === 'write';
  const title = write ? offer.file.title : `Update: ${reviseName(offer.file.title, { version: offer.version, date: opts.date })}`;
  const sections = offer.file.sections.filter((s) => write || offer.changed.includes(s.key));
  const back = `<a href="#/decision-maker?id=${encodeURIComponent(opts.sessionId)}">Open this decision in Decision Maker</a>`;
  return [
    heading(title, write ? 'section' : 'subsection'),
    ...sections.map((s) => rich(`<p><strong>${esc(s.heading)}</strong></p>${s.lines.length === 1 ? `<p>${esc(s.lines[0])}</p>` : `<ul>${s.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}`)),
    rich(`<p><em>${esc(offer.provenance.caption)}</em></p><p>${back}</p>`)
  ];
}

/** The provenance image block, or null when the record has no main model to show. */
export function recordGraphic(offer: PsRecordOffer, opts: { sessionId: string; date: string }, url: (model: string) => string = provenanceUrl): Block | null {
  const model = offer.provenance.model;
  if (!model) return null;
  const block = createBlock('image', recordBlockId(opts.sessionId, offer.version, 0)) as Extract<Block, { block_type: 'image' }>;
  return { ...block, variant: 'small', content: { url: url(model), alt_text: `${toolNamed(model)?.name ?? 'The Decision Book'} emblem, inside its section's emblem` } };
}

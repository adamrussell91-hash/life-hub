// apps/tasks/src/views/get-things-done/record-blocks.ts
// The action record as page blocks: a heading, one rich text block per section, and the
// provenance caption with a link back to the session. The provenance graphic is its own image
// block (the technique's emblem inside its section's), written above the heading on a full
// write; its source is a static file the Tasks build serves (public/get-things-done/provenance/,
// made by scripts/generate-get-things-done-provenance.mjs). Ids are fixed per session and
// version, so a retried append never duplicates a block. As Decision Maker's record-blocks.ts.
import { createBlock } from '@teaching/blocks/create-block';
import type { Block } from '@/schemas/block';
import { reviseName } from '../../../../../packages/problem-solver/naming.mjs';
import { toolNamed } from './decor';
import type { PsRecordOffer } from '../../../../../packages/problem-solver/types';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What Gear Shifter's offer carries for its graphic (packages/get-things-done/record.mjs actionProvenance). */
type GearProvenance = { technique: string | null; caption: string };

export function recordBlockId(sessionId: string, version: number, n: number): string {
  return `gt-rec-${sessionId.slice(0, 8)}-v${version}-${n}`;
}

/** The provenance image's address: absolute, since an image block only shows http(s) sources. */
export function provenanceUrl(technique: string, origin = location.origin, base = import.meta.env.BASE_URL): string {
  return new URL(`${base}get-things-done/provenance/${technique}.svg`, origin).href;
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
  const back = `<a href="#/gear-shifter?id=${encodeURIComponent(opts.sessionId)}">Open this session in Gear Shifter</a>`;
  const caption = (offer.provenance as unknown as GearProvenance).caption;
  return [
    heading(title, write ? 'section' : 'subsection'),
    ...sections.map((s) => rich(`<p><strong>${esc(s.heading)}</strong></p>${s.lines.length === 1 ? `<p>${esc(s.lines[0])}</p>` : `<ul>${s.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}`)),
    rich(`<p><em>${esc(caption)}</em></p><p>${back}</p>`)
  ];
}

/** The provenance image block, or null when the record has no technique to show. */
export function recordGraphic(offer: PsRecordOffer, opts: { sessionId: string; date: string }, url: (technique: string) => string = provenanceUrl): Block | null {
  const technique = (offer.provenance as unknown as GearProvenance).technique;
  if (!technique) return null;
  const block = createBlock('image', recordBlockId(opts.sessionId, offer.version, 0)) as Extract<Block, { block_type: 'image' }>;
  return { ...block, variant: 'small', content: { url: url(technique), alt_text: `${toolNamed(technique)?.name ?? 'The Get Things Done Book'} emblem, inside its section’s emblem` } };
}

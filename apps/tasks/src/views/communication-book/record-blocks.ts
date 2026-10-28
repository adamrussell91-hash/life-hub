// apps/tasks/src/views/communication-book/record-blocks.ts
// The Communication Book record as page blocks: a heading, one rich text block per section, and the
// provenance caption with a link back to the session. There is no provenance graphic in v1.
// Ids are fixed per session and version, so a retried append never duplicates a block. As the
// Collaboration Book's record-blocks.ts.
import { createBlock } from '@teaching/blocks/create-block';
import type { Block } from '@/schemas/block';
import { reviseName } from '../../../../../packages/problem-solver/naming.mjs';
import type { PsRecordOffer } from '../../../../../packages/problem-solver/types';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What the Communication Book's offer carries for its caption (packages/communication-book/record.mjs actionProvenance). */
type CommProvenance = { caption: string };

export function recordBlockId(sessionId: string, version: number, n: number): string {
  return `cmb-rec-${sessionId.slice(0, 8)}-v${version}-${n}`;
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
  const back = `<a href="#/communication-book?id=${encodeURIComponent(opts.sessionId)}">Open this session in the Communication Book</a>`;
  const caption = (offer.provenance as unknown as CommProvenance).caption;
  return [
    heading(title, write ? 'section' : 'subsection'),
    ...sections.map((s) => rich(`<p><strong>${esc(s.heading)}</strong></p>${s.lines.length === 1 ? `<p>${esc(s.lines[0])}</p>` : `<ul>${s.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}`)),
    rich(`<p><em>${esc(caption)}</em></p><p>${back}</p>`)
  ];
}

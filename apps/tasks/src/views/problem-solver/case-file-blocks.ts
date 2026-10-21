// apps/tasks/src/views/problem-solver/case-file-blocks.ts
// The case file as page blocks: a heading, one rich text block per section and a link back.
// Ids are fixed per session and version, so a retried append never duplicates a block.
import { createBlock } from '@teaching/blocks/create-block';
import type { Block } from '@/schemas/block';
import { reviseName } from '../../../../../packages/problem-solver/naming.mjs';
import type { PsCaseFileOffer } from '../../../../../packages/problem-solver/types';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function caseFileBlockId(sessionId: string, version: number, n: number): string {
  return `ps-cf-${sessionId.slice(0, 8)}-v${version}-${n}`;
}

export function caseFileBlocks(offer: PsCaseFileOffer, opts: { sessionId: string; date: string }): Block[] {
  let n = 0;
  const id = () => caseFileBlockId(opts.sessionId, offer.version, (n += 1));
  const heading = (text: string, variant: 'section' | 'subsection'): Block => {
    const block = createBlock('heading', id()) as Extract<Block, { block_type: 'heading' }>;
    return { ...block, variant, content: { text } };
  };
  const rich = (html: string): Block => {
    const block = createBlock('rich_text', id()) as Extract<Block, { block_type: 'rich_text' }>;
    return { ...block, content: { html } };
  };
  const title = offer.kind === 'write' ? offer.file.title : `Update: ${reviseName(offer.file.title, { version: offer.version, date: opts.date })}`;
  const sections = offer.file.sections.filter((s) => offer.kind === 'write' || offer.changed.includes(s.key));
  return [
    heading(title, offer.kind === 'write' ? 'section' : 'subsection'),
    ...sections.map((s) => rich(`<p><strong>${esc(s.heading)}</strong></p>${s.lines.length === 1 ? `<p>${esc(s.lines[0])}</p>` : `<ul>${s.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}`)),
    rich(`<p><a href="#/problem-solver?id=${encodeURIComponent(opts.sessionId)}">Open this problem in Problem Solver</a></p>`)
  ];
}

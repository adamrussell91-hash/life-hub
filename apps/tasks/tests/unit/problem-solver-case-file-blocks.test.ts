// apps/tasks/tests/unit/problem-solver-case-file-blocks.test.ts
import { describe, expect, it } from 'vitest';
import { caseFileBlockId, caseFileBlocks } from '../../src/views/problem-solver/case-file-blocks';
import { reviseName } from '../../../../packages/problem-solver/naming.mjs';
import type { PsCaseFileOffer } from '../../../../packages/problem-solver/types';

const SID = 's1234567-aaaa-bbbb-cccc-dddddddddddd';
const file = {
  title: 'Late rota Problem Solver 20261102 v1',
  version: 1,
  sections: [
    { key: 'problem', heading: 'The problem', lines: ['Rota goes out late'] },
    { key: 'actions', heading: 'Actions', lines: ['Draft template', 'Send by Friday'] },
    { key: 'notes', heading: 'Notes', lines: ['Tom & Jo <b>'] }
  ]
};
const write: PsCaseFileOffer = { kind: 'write', version: 1, file, digests: { problem: 'a', actions: 'b', notes: 'c' }, key: 'k1', changed: [] };
const opts = { sessionId: SID, date: '20261102' };

describe('caseFileBlocks', () => {
  it('a write is a section heading, one rich text block per section and a link back', () => {
    const blocks = caseFileBlocks(write, opts);
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toMatchObject({ block_type: 'heading', variant: 'section', content: { text: file.title } });
    expect(blocks.slice(1, 4).every((b) => b.block_type === 'rich_text')).toBe(true);
    const last = blocks[4] as { block_type: string; content: { html: string } };
    expect(last.block_type).toBe('rich_text');
    expect(last.content.html).toContain(`#/problem-solver?id=${SID}`);
    expect(last.content.html).toContain('Open this problem in Problem Solver');
  });

  it('ids are ps-cf-<8 of the session>-v<version>-<n> from 1', () => {
    expect(caseFileBlockId(SID, 2, 3)).toBe('ps-cf-s1234567-v2-3');
    expect(caseFileBlocks(write, opts).map((b) => b.id)).toEqual([1, 2, 3, 4, 5].map((n) => `ps-cf-s1234567-v1-${n}`));
  });

  it('one line is a paragraph, several are a list', () => {
    const blocks = caseFileBlocks(write, opts) as unknown as { content: { html: string } }[];
    expect(blocks[1].content.html).toBe('<p><strong>The problem</strong></p><p>Rota goes out late</p>');
    expect(blocks[2].content.html).toBe('<p><strong>Actions</strong></p><ul><li>Draft template</li><li>Send by Friday</li></ul>');
  });

  it('escapes the text', () => {
    const blocks = caseFileBlocks(write, opts) as unknown as { content: { html: string } }[];
    expect(blocks[3].content.html).toContain('Tom &amp; Jo &lt;b&gt;');
    expect(blocks[3].content.html).not.toContain('<b>');
  });

  it('an update is a subsection heading, only the changed sections and the link', () => {
    const update: PsCaseFileOffer = { kind: 'update', version: 2, file: { ...file, version: 2 }, digests: { problem: 'a', actions: 'b2', notes: 'c' }, key: 'k2', changed: ['actions'] };
    const blocks = caseFileBlocks(update, opts);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ block_type: 'heading', variant: 'subsection' });
    expect((blocks[0] as { content: { text: string } }).content.text).toBe(`Update: ${reviseName(file.title, { version: 2, date: '20261102' })}`);
    expect((blocks[1] as unknown as { content: { html: string } }).content.html).toContain('Actions');
    expect((blocks[2] as unknown as { content: { html: string } }).content.html).toContain('Open this problem in Problem Solver');
    expect(blocks.map((b) => b.id)).toEqual([1, 2, 3].map((n) => `ps-cf-s1234567-v2-${n}`));
  });
});

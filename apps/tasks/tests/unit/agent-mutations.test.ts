import { describe, expect, it } from 'vitest';
import { parseAgentMutations, sanitizeTaskPatch } from '@/domain/agent-mutations';

describe('parseAgentMutations', () => {
  it('keeps supported mutation kinds and drops junk', () => {
    const mutations = parseAgentMutations([
      {
        kind: 'page_blocks',
        entity_type: 'task',
        entity_id: 't1',
        summary: 'Add a code block',
        page_blocks: [{ block_type: 'code', id: 'b1' }]
      },
      {
        kind: 'repo_file',
        path: 'src/domain/queries.ts',
        content: 'export const x = 1;\n',
        commit_message: 'agent: note',
        summary: 'Patch queries'
      },
      { kind: 'nope', summary: 'x' },
      { kind: 'repo_file', path: '../secrets', content: 'x', summary: 'bad' }
    ]);
    expect(mutations).toHaveLength(2);
    expect(mutations[0]?.kind).toBe('page_blocks');
    expect(mutations[1]?.kind).toBe('repo_file');
  });

  it('sanitizes task patches', () => {
    const patch = sanitizeTaskPatch({
      title: 'Hello',
      id: 'should-drop',
      schema_version: 99,
      priority: 'high'
    });
    expect(patch).toEqual({ title: 'Hello', priority: 'high' });
  });
});

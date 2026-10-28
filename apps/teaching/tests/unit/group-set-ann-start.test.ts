// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createGroupSetTools } from '@/quiz/group-set-tools';
import type { Block, GroupSet } from '@/schemas/block';

const config: GroupSet = { name: 'Descriptive', class_id: 'c1', group_id: 'g1', students: ['s1'], tags: ['tech:imagery'], target: 3 } as GroupSet;
const section = { id: 'sec1', block_type: 'section', content: { title: 'Descriptive', blocks: [], group_set: config } } as unknown as Block;

function strip(startAnn: () => Promise<void>) {
  const tools = createGroupSetTools({
    getBlocks: () => [section],
    onBlocks: () => {},
    idFactory: () => 'b1',
    names: () => new Map(),
    refreshMembers: async () => [],
    startAnn
  });
  const row = document.createElement('div');
  tools.decorate(row, section);
  (row.querySelector('.qz-gs-strip__ann') as HTMLButtonElement).click();
  return row;
}

describe('group set Ann drafts', () => {
  it('says Ann is writing in the chat once her job starts', async () => {
    const startAnn = vi.fn(async () => {});
    const row = strip(startAnn);
    (row.querySelector('.qz-gs-strip__go') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(row.querySelector('.qz-gs-strip__confirm')?.textContent).toContain('writing them in the chat'));
    expect(startAnn).toHaveBeenCalledWith('sec1', config);
  });

  it('shows why Ann did not start and lets the teacher try again', async () => {
    const row = strip(async () => {
      throw new Error('Ann is busy on this lesson.');
    });
    const go = row.querySelector('.qz-gs-strip__go') as HTMLButtonElement;
    go.click();
    await vi.waitFor(() => expect(row.querySelector('.qz-gs-strip__confirm')?.textContent).toContain('Ann didn’t start: Ann is busy'));
    expect(go.disabled).toBe(false);
  });
});

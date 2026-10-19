import { describe, it, expect, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { mountBlockAssistant, createAlchemyButton } from '@/alchemy/block-assistant';
import { createProposalCards } from '@/alchemy/agent-cards';
import type { AgentJob, AgentProposal } from '@/alchemy/agent-client';

vi.mock('@/alchemy/agent-client', async (load) => ({ ...(await load<typeof import('@/alchemy/agent-client')>()), recordDecision: vi.fn(async () => ({})) }));

type Text = { text: string };
function jobWith(proposals: AgentProposal[]): AgentJob {
  return { job: 'j1', kind: 'lesson', id: 'l', blockId: null, scope: 'lesson', status: 'done', progress: [], result: { summary: 'Done.', proposals, stoppedEarly: false }, error: null, decisions: {}, created_at: '' };
}
const proposal = (blockId: string, oldStr: string, newStr: string, id = 'p1'): AgentProposal => ({
  id, blockId, path: 'content.text', oldStr, newStr, why: 'Open with recall.', source: { noteId: 'n1', title: 'Invented note', quote: 'Recall beats rereading.' }, blockLabel: 'heading', blockType: 'heading'
});
const heading = (id: string, text: string) => { const b = createBlock('heading', id); (b.content as Text).text = text; return b; };

describe('Ann’s suggestion cards', () => {
  it('apply one exact patch, show its source, and mark it applied', async () => {
    let entity = { title: 'Lesson', blocks: [heading('h', 'Warm up')] };
    const cards = createProposalCards({ getEntity: () => entity, apply: async next => { entity = next as typeof entity; }, onError: () => {} });
    document.body.append(cards.element);
    cards.show(jobWith([proposal('h', 'Warm up', 'Warm up: what do you remember?')]));
    expect(cards.element.querySelector('.alchemy-agent-card__quote')?.textContent).toBe('Recall beats rereading.');
    expect(cards.element.querySelector('del')?.textContent).toBe('Warm up');
    (cards.element.querySelector('.btn--primary') as HTMLButtonElement).click();
    await vi.waitFor(() => expect((entity.blocks[0].content as Text).text).toBe('Warm up: what do you remember?'));
    await vi.waitFor(() => expect(cards.element.querySelector('.alchemy-agent-card__state')?.textContent).toBe('Applied'));
    cards.element.remove();
  });

  it('marks a suggestion stale when its words are no longer on the page', async () => {
    let applied = false;
    const cards = createProposalCards({ getEntity: () => ({ title: 'Lesson', blocks: [heading('h', 'Changed by the teacher')] }), apply: async () => { applied = true; }, onError: () => {} });
    cards.show(jobWith([proposal('h', 'Warm up', 'Retrieval warm up')]));
    (cards.element.querySelector('.btn--primary') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(cards.element.querySelector('.alchemy-agent-card--stale')).not.toBeNull());
    expect(applied).toBe(false);
  });

  it('accept all applies every pending suggestion in order', async () => {
    let entity = { title: 'Lesson', blocks: [heading('a', 'First'), heading('b', 'Second')] };
    const cards = createProposalCards({ getEntity: () => entity, apply: async next => { entity = next as typeof entity; }, onError: () => {} });
    cards.show(jobWith([proposal('a', 'First', 'First, recall', 'p1'), proposal('b', 'Second', 'Second, model', 'p2')]));
    (cards.element.querySelector('.alchemy-agent__accept-all') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(entity.blocks.map(x => (x.content as Text).text)).toEqual(['First, recall', 'Second, model']));
  });
});

describe('Ask Ann about a block', () => {
  it('puts one quiet button on each top-level row', () => {
    const tabs = createBlock('tabs', 't') as ReturnType<typeof createBlock> & { content: { tabs: Array<{ blocks: unknown[] }> } };
    tabs.content.tabs[0].blocks = [heading('q', 'Nested')];
    const host = document.createElement('div');
    const row = document.createElement('div'); row.className = 'lesson-page__block'; row.dataset.blockId = 't';
    const nested = document.createElement('div'); nested.className = 'block'; nested.dataset.blockId = 'q'; row.append(nested);
    host.append(row); document.body.append(host);
    const assistant = mountBlockAssistant({ host, kind: 'lesson', id: 'l', getEntity: () => ({ title: 'Lesson', blocks: [tabs] }), flush: async () => {}, apply: async () => {} });
    expect(host.querySelectorAll('.alchemy-block-button').length).toBe(1);
    expect(nested.querySelector('.alchemy-block-button')).toBeNull();
    assistant.dispose(); host.remove();
  });

  it('asks only when the teacher presses Ask, scoped to the block, then shows the cards', async () => {
    const entity = { title: 'Lesson', blocks: [heading('h', 'Warm up')] };
    const host = document.createElement('div'); document.body.append(host);
    const start = vi.fn(async () => ({ ...jobWith([]), status: 'working' as const, result: null }));
    const follow = vi.fn(async (_first: AgentJob, onUpdate: (j: AgentJob) => void) => { const done = jobWith([proposal('h', 'Warm up', 'Recall first')]); onUpdate(done); return done; });
    const assistant = mountBlockAssistant({ host, kind: 'lesson', id: 'l', getEntity: () => entity, flush: async () => {}, apply: async () => {}, start, follow });
    const button = createAlchemyButton('h'); host.append(button);
    expect(button.getAttribute('aria-label')).toContain('Ann');
    button.click();
    expect(start).not.toHaveBeenCalled();
    const dialog = document.querySelector('.alchemy-review') as HTMLDialogElement;
    (dialog.querySelector('textarea') as HTMLTextAreaElement).value = 'Make it punchier';
    (dialog.querySelector('form') as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect(dialog.querySelector('.alchemy-agent-card ins')?.textContent).toBe('Recall first'));
    expect(start).toHaveBeenCalledWith({ kind: 'lesson', id: 'l', blockId: 'h', request: 'Make it punchier' });
    assistant.dispose(); host.remove();
  });
});

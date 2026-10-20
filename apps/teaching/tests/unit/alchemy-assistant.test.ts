import { describe, it, expect, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createAlchemyButton } from '@/alchemy/block-assistant';
import { changeInContext } from '@/alchemy/change-context';
import { createReviewStore } from '@/alchemy/review-state';
import { mountInlineCards } from '@/alchemy/inline-cards';
import { mountAnnBar, researchTrail } from '@/alchemy/ann-bar';
import type { AgentJob, AgentProposal } from '@/alchemy/agent-client';

vi.mock('@/alchemy/agent-client', async (load) => ({
  ...(await load<typeof import('@/alchemy/agent-client')>()),
  recordDecision: vi.fn(async () => ({})),
  readAgentSettings: vi.fn(async () => ({ rulesNoteId: 'r1', rulesNoteTitle: 'Invented rules' })),
  latestAgentReview: vi.fn(async () => null)
}));

type Text = { text: string };
const heading = (id: string, text: string) => { const b = createBlock('heading', id); (b.content as Text).text = text; return b; };
const proposal = (blockId: string, oldStr: string, newStr: string, id = 'p1', source = true): AgentProposal => ({
  id, blockId, path: 'content.text', oldStr, newStr, why: 'Open with recall.',
  source: source ? { noteId: 'n1', title: 'Invented note', quote: 'Recall beats rereading.' } : null, blockLabel: 'heading: “x”', blockType: 'heading'
});
const done = (proposals: AgentProposal[], job = 'j1', progress: string[] = []): AgentJob => ({
  job, kind: 'lesson', id: 'l', blockId: null, scope: 'lesson', status: 'done', progress: progress.map(text => ({ at: '', text })),
  result: { summary: 'Two changes from your notes.', proposals, stoppedEarly: false }, error: null, decisions: {}, created_at: ''
});

/** Rows as the lesson page draws them; redraw() rebuilds them like mount-page does. */
function page(blocks: Array<ReturnType<typeof createBlock>>) {
  const host = document.createElement('div');
  document.body.append(host);
  const redraw = () => host.replaceChildren(...blocks.map(b => { const row = document.createElement('div'); row.className = 'lesson-page__block'; row.dataset.blockId = b.id; row.textContent = (b.content as Partial<Text>).text ?? ''; return row; }));
  redraw();
  return { host, redraw };
}

describe('change in context', () => {
  it('shows the sentence around the edit with removed and added words', () => {
    const c = changeInContext('<p>First idea. Students read the poem twice. Then discuss.</p>', 'read the poem twice', 'read the poem aloud once');
    expect(c).toMatchObject({ before: 'Students ', removed: 'read the poem twice', added: 'read the poem aloud once', after: '.' });
  });
  it('drops broken markup at the edges and trims long text', () => {
    const long = 'word '.repeat(60);
    const c = changeInContext(`<p class="x">${long}target${long}</p>`, 'target', 'goal')!;
    expect(c.trimmedStart && c.trimmedEnd).toBe(true);
    expect(c.before).not.toMatch(/</);
    expect(changeInContext('<b>bold</b> text', '<b>bold', '<b>strong')?.removed).toBe('bold');
  });
  it('is null when the words are gone or appear twice', () => {
    expect(changeInContext('nothing here', 'missing', 'x')).toBeNull();
    expect(changeInContext('twice twice', 'twice', 'x')).toBeNull();
  });
});

describe('review store', () => {
  it('steps through pending suggestions and skips decided ones', () => {
    const store = createReviewStore();
    store.setReview(done([proposal('a', 'A', 'AA', 'p1'), proposal('b', 'B', 'BB', 'p2'), proposal('c', 'C', 'CC', 'p3')]));
    expect(store.step(1)?.key).toBe('j1:p1');
    store.decide('j1:p2', 'dismissed');
    expect(store.step(1)?.key).toBe('j1:p3');
    expect(store.step(1)?.key).toBe('j1:p1');
    expect(store.pending()).toHaveLength(2);
    store.closeReview();
    expect(store.pending()).toHaveLength(0);
  });
  it('reads Ann’s research trail from her progress lines', () => {
    const t = researchTrail(done([], 'j', ['Reading your rules', 'Searching: retrieval', 'Reading: Note A', 'Reading lesson: Next', 'Reading: Note A', 'Searching: spacing']));
    expect([t.searches, t.notes]).toEqual([2, 1]);
    expect(t.steps.map(s => s.kind)).toEqual(['search', 'note', 'lesson', 'note', 'search']);
  });
});

describe('suggestions in the lesson', () => {
  function setup(blocks: Array<ReturnType<typeof createBlock>>) {
    let entity = { title: 'Lesson', blocks };
    const { host, redraw } = page(blocks);
    const store = createReviewStore();
    const cards = mountInlineCards({ host, store, kind: 'lesson', id: 'l', getEntity: () => entity, flush: async () => {}, apply: async next => { entity = next as typeof entity; }, undoMs: 50 });
    return { host, redraw, store, cards, entity: () => entity };
  }

  it('puts a card under the block it changes and survives a redraw', () => {
    const { host, redraw, store, cards } = setup([heading('h', 'Warm up'), heading('k', 'Other')]);
    store.setReview(done([proposal('h', 'Warm up', 'Warm up: what do you remember?')]));
    cards.sync();
    const row = host.querySelector('[data-block-id="h"]')!;
    expect(row.classList.contains('ann-target')).toBe(true);
    expect(row.querySelector('.ann-card__change del')?.textContent).toBe('Warm up');
    expect(row.querySelector('.ann-card__change ins')?.textContent).toBe('Warm up: what do you remember?');
    expect(row.querySelector('.ann-card__quote')?.textContent).toBe('Recall beats rereading.');
    expect(host.querySelector('[data-block-id="k"] .ann-card')).toBeNull();
    redraw();
    cards.sync();
    expect(host.querySelector('[data-block-id="h"] .ann-card')).not.toBeNull();
    cards.dispose();
  });

  it('accepts a suggestion, shows Applied with undo, then clears it', async () => {
    const { host, store, cards, entity } = setup([heading('h', 'Warm up')]);
    store.setReview(done([proposal('h', 'Warm up', 'Recall first')]));
    cards.sync();
    (host.querySelector('.ann-card__accept') as HTMLButtonElement).click();
    await vi.waitFor(() => expect((entity().blocks[0].content as Text).text).toBe('Recall first'));
    cards.sync();
    expect(host.querySelector('.ann-card--applied')?.textContent).toContain('Applied');
    await vi.waitFor(() => { cards.sync(); expect(host.querySelector('.ann-card')).toBeNull(); });
    cards.dispose();
  });

  it('marks a suggestion stale when its words have gone, and never applies it', async () => {
    const { host, store, cards, entity } = setup([heading('h', 'Changed by the teacher')]);
    store.setReview(done([proposal('h', 'Warm up', 'Recall first')]));
    cards.sync();
    expect(host.querySelector('.ann-card--stale')).not.toBeNull();
    expect((entity().blocks[0].content as Text).text).toBe('Changed by the teacher');
    cards.dispose();
  });

  it('accept all applies every pending suggestion in order', async () => {
    const { store, cards, entity } = setup([heading('a', 'First'), heading('b', 'Second')]);
    store.setReview(done([proposal('a', 'First', 'First, recall', 'p1'), proposal('b', 'Second', 'Second, model', 'p2', false)]));
    await cards.acceptAll();
    expect(entity().blocks.map(b => (b.content as Text).text)).toEqual(['First, recall', 'Second, model']);
    cards.dispose();
  });

  it('shows a nested suggestion on its top-level row and names the block', () => {
    const tabs = createBlock('tabs', 't') as ReturnType<typeof createBlock> & { content: { tabs: Array<{ blocks: unknown[] }> } };
    tabs.content.tabs[0].blocks = [heading('q', 'Nested question')];
    const { host, store, cards } = setup([tabs]);
    store.setReview(done([proposal('q', 'Nested question', 'Sharper question')]));
    cards.sync();
    expect(host.querySelector('[data-block-id="t"] .ann-card__label')?.textContent).toContain('in heading');
    cards.dispose();
  });
});

describe('asking about one block', () => {
  it('opens an ask box under the block, sends the request and shows the answer in place', async () => {
    const entity = { title: 'Lesson', blocks: [heading('h', 'Warm up')] };
    const { host } = page(entity.blocks);
    const start = vi.fn(async () => ({ ...done([]), status: 'working' as const, result: null, scope: 'block' as const }));
    const follow = vi.fn(async (_f: AgentJob, onUpdate: (j: AgentJob) => void) => { const j = done([proposal('h', 'Warm up', 'Recall first')], 'j2'); onUpdate(j); return j; });
    const store = createReviewStore();
    const cards = mountInlineCards({ host, store, kind: 'lesson', id: 'l', getEntity: () => entity, flush: async () => {}, apply: async () => {}, start, follow });
    const button = createAlchemyButton('h');
    host.querySelector('[data-block-id="h"]')!.append(button);
    host.addEventListener('alchemy-open', e => store.openAsk((e as CustomEvent<{ blockId: string }>).detail.blockId));
    button.click();
    cards.sync();
    const input = host.querySelector('.ann-ask__input') as HTMLInputElement;
    input.value = 'Make it punchier';
    input.dispatchEvent(new Event('input'));
    (host.querySelector('.ann-ask') as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => { cards.sync(); expect(host.querySelector('[data-block-id="h"] .ann-card ins')?.textContent).toBe('Recall first'); });
    expect(start).toHaveBeenCalledWith({ kind: 'lesson', id: 'l', blockId: 'h', request: 'Make it punchier' });
    expect(host.querySelector('.ann-ask')).toBeNull();
    cards.dispose();
  });
});

describe('Ann’s bar', () => {
  it('starts a review, shows her live step, then the count and stepping controls', async () => {
    const store = createReviewStore();
    const host = document.createElement('div'); document.body.append(host);
    let push: (j: AgentJob) => void = () => {};
    const start = vi.fn(async () => ({ ...done([]), status: 'working' as const, result: null, progress: [{ at: '', text: 'Searching: memory' }] }));
    const follow = vi.fn((first: AgentJob, onUpdate: (j: AgentJob) => void) => { onUpdate(first); return new Promise<AgentJob>(resolve => { push = j => { onUpdate(j); resolve(j); }; }); });
    const bar = mountAnnBar(host, { store, kind: 'lesson', id: 'l', flush: async () => {}, acceptAll: async () => {}, start, follow, latest: async () => null });
    expect(host.querySelector('.ann-bar__start')).toBeNull();
    (host.querySelector('.ann-bar__chip') as HTMLButtonElement).click();
    (host.querySelector('.ann-bar__start') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host.querySelector('.ann-bar__live')?.textContent).toBe('Searching: memory'));
    expect(host.querySelector('.ann-bar__counter')?.textContent).toBe('1 search · 0 notes read');
    push(done([proposal('h', 'a', 'b', 'p1'), proposal('k', 'c', 'd', 'p2')], 'j1', ['Searching: memory', 'Reading: Invented note']));
    await vi.waitFor(() => expect(host.querySelector('.ann-bar__count')?.textContent).toBe('2 suggestions'));
    (host.querySelector('.ann-bar__next') as HTMLButtonElement).click();
    expect(store.state.focus).toBe('j1:p1');
    (host.querySelector('.ann-bar__counter') as HTMLButtonElement).click();
    expect(host.querySelector('.ann-bar__trail a')?.textContent).toBe('Invented note');
    (host.querySelector('.ann-bar__close') as HTMLButtonElement).click();
    expect(host.querySelector('.ann-bar')?.getAttribute('data-state')).toBe('idle');
    bar.dispose(); host.remove();
  });
});

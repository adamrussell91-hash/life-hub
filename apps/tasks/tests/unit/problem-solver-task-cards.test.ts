// apps/tasks/tests/unit/problem-solver-task-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mountTaskCards } from '../../src/views/problem-solver/task-cards';
import { TaskNotLinkedError } from '../../src/views/problem-solver/task-bridge';
import type { PsSession } from '../../../../packages/problem-solver/types';

const base = { id: 's', title: 'Late rota', runner: { status: 'idle', mode: 'turn', error: null }, proposedTasks: [], reviewProposal: null, reviewTaskId: null } as unknown as PsSession;
const p = (id: string, status = 'proposed') => ({ id, title: `Task ${id}`, status, due: '2026-10-24', source: { runId: 'k', nodeId: id } });
const handlers = () => ({ create: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn().mockResolvedValue(undefined), createReview: vi.fn().mockResolvedValue(undefined), dismissReview: vi.fn().mockResolvedValue(undefined) });

describe('task cards', () => {
  it('one card per proposed task; confirmed and dismissed ones show none', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, proposedTasks: [p('a'), p('b', 'confirmed'), p('c', 'dismissed')] } as PsSession);
    expect(cards.el.querySelectorAll('.ps-taskcard')).toHaveLength(1);
  });
  it('edits survive an update and are sent on Create task', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    const s = { ...base, proposedTasks: [p('a')] } as PsSession;
    cards.update(s);
    const title = cards.el.querySelector<HTMLInputElement>('.ps-taskcard input[name="title"]')!;
    title.value = 'Draft the rota template';
    cards.update(s);
    expect(cards.el.querySelector<HTMLInputElement>('.ps-taskcard input[name="title"]')).toBe(title);
    cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!.click();
    await Promise.resolve();
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { title: 'Draft the rota template', due: '2026-10-24' });
  });
  it('a failed create keeps the card, shows the error and re-enables the button', async () => {
    const h = handlers();
    h.create.mockRejectedValueOnce(new Error('Tasks is offline'));
    const cards = mountTaskCards(h);
    cards.update({ ...base, proposedTasks: [p('a')] } as PsSession);
    const button = cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!;
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cards.el.querySelector('.ps-taskcard__error')!.textContent).toContain('Tasks is offline');
    expect(button.disabled).toBe(false);
  });
  it('buttons are disabled while the coach is thinking', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, runner: { status: 'running', mode: 'turn', error: null }, proposedTasks: [p('a')] } as PsSession);
    expect(cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!.disabled).toBe(true);
  });
  it('the review card shows a date picker set to the proposal date, and sends the picked date', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    cards.update({ ...base, reviewProposal: { title: 'Review: Late rota', due: '2099-11-02', reason: 'A first look.', status: 'proposed' } } as PsSession);
    const date = cards.el.querySelector<HTMLInputElement>('.ps-reviewcard input[type="date"]')!;
    expect(date.value).toBe('2099-11-02');
    date.value = '2099-11-09';
    cards.el.querySelector<HTMLButtonElement>('[data-act="create-review"]')!.click();
    await Promise.resolve();
    expect(h.createReview).toHaveBeenCalledWith({ title: 'Review: Late rota', due: '2099-11-09' });
  });
  it('a card goes once its proposal is confirmed, the section hides when empty, and the coach hint shows while busy', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, runner: { status: 'queued', mode: 'turn', error: null }, proposedTasks: [p('a')] } as PsSession);
    expect(cards.el.hidden).toBe(false);
    expect(cards.el.querySelector('.ps-taskcard__hint')!.textContent).toBe('Waiting for the coach…');
    cards.update({ ...base, proposedTasks: [p('a', 'confirmed')] } as PsSession);
    expect(cards.el.querySelector('.ps-taskcard')).toBeNull();
    expect(cards.el.hidden).toBe(true);
  });
  it('the review card goes once the review task exists', () => {
    const cards = mountTaskCards(handlers());
    const reviewProposal = { title: 'Review: Late rota', due: '2026-11-02', reason: 'A first look.', status: 'proposed' };
    cards.update({ ...base, reviewProposal } as PsSession);
    expect(cards.el.querySelector('.ps-reviewcard')).not.toBeNull();
    cards.update({ ...base, reviewProposal, reviewTaskId: 'task-9' } as PsSession);
    expect(cards.el.querySelector('.ps-reviewcard')).toBeNull();
  });
});

describe('task cards, review fixes', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const review = (over: Record<string, unknown> = {}) => ({ title: 'Review: Late rota', due: '2099-11-02', reason: 'A first look.', status: 'proposed', ...over });

  it('the busy hint is announced politely', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, proposedTasks: [p('a')] } as PsSession);
    expect(cards.el.querySelector('.ps-taskcard__hint')!.getAttribute('aria-live')).toBe('polite');
  });

  it('a task created but not linked says so on the card, with a link to the task', async () => {
    const h = handlers();
    h.create.mockRejectedValueOnce(new TaskNotLinkedError('task-7'));
    const cards = mountTaskCards(h);
    cards.update({ ...base, proposedTasks: [p('a')] } as PsSession);
    cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!.click();
    await flush();
    const error = cards.el.querySelector('.ps-taskcard__error')!;
    expect(error.textContent).toContain('not linked');
    expect(error.querySelector('a')!.getAttribute('href')).toBe('#/task/task-7');
  });

  it('when the card has gone by the time it fails, a short notice says so instead', async () => {
    const h = handlers();
    let fail!: (err: unknown) => void;
    h.create.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    const cards = mountTaskCards(h);
    cards.update({ ...base, proposedTasks: [p('a')] } as PsSession);
    cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!.click();
    cards.update({ ...base, proposedTasks: [p('a', 'dismissed')] } as PsSession);
    fail(new TaskNotLinkedError('task-7'));
    await flush();
    const notice = cards.el.querySelector('.ps-taskcards__notice')!;
    expect(cards.el.hidden).toBe(false);
    expect(notice.textContent).toContain('not linked');
    expect(notice.querySelector('a')!.getAttribute('href')).toBe('#/task/task-7');
  });

  it('after a card removes itself, focus moves to the next card, else the fallback', async () => {
    const composer = document.createElement('textarea');
    document.body.append(composer);
    const h = handlers();
    const cards = mountTaskCards(h, { fallbackFocus: () => composer });
    document.body.append(cards.el);
    const s = { ...base, proposedTasks: [p('a'), p('b')] } as PsSession;
    cards.update(s);
    h.create.mockImplementationOnce(async () => cards.update({ ...s, proposedTasks: [p('a', 'confirmed'), p('b')] } as PsSession));
    cards.el.querySelector<HTMLButtonElement>('[data-proposal="a"] [data-act="create"]')!.click();
    await flush();
    expect(document.activeElement).toBe(cards.el.querySelector('[data-proposal="b"] input[name="title"]'));
    h.dismiss.mockImplementationOnce(async () => cards.update({ ...s, proposedTasks: [p('a', 'confirmed'), p('b', 'dismissed')] } as PsSession));
    cards.el.querySelector<HTMLButtonElement>('[data-proposal="b"] [data-act="dismiss"]')!.click();
    await flush();
    expect(document.activeElement).toBe(composer);
    cards.el.remove();
    composer.remove();
  });

  it('the review card follows a changed proposal until the person edits a field', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, reviewProposal: review() } as PsSession);
    cards.update({ ...base, reviewProposal: review({ title: 'Review: rota', due: '2099-11-09', reason: 'Two weeks in.' }) } as PsSession);
    const title = cards.el.querySelector<HTMLInputElement>('.ps-reviewcard input[name="title"]')!;
    const date = cards.el.querySelector<HTMLInputElement>('.ps-reviewcard input[type="date"]')!;
    expect(title.value).toBe('Review: rota');
    expect(date.value).toBe('2099-11-09');
    expect(cards.el.querySelector('.ps-reviewcard')!.textContent).toContain('Two weeks in.');
    title.value = 'My own title';
    title.dispatchEvent(new Event('input'));
    cards.update({ ...base, reviewProposal: review({ title: 'Review: again', due: '2099-11-16' }) } as PsSession);
    expect(title.value).toBe('My own title');
    expect(date.value).toBe('2099-11-16');
  });

  it('a review date before today is refused on the card', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    cards.update({ ...base, reviewProposal: review() } as PsSession);
    cards.el.querySelector<HTMLInputElement>('.ps-reviewcard input[type="date"]')!.value = '2001-01-01';
    cards.el.querySelector<HTMLButtonElement>('[data-act="create-review"]')!.click();
    await flush();
    expect(h.createReview).not.toHaveBeenCalled();
    expect(cards.el.querySelector('.ps-reviewcard .ps-taskcard__error')!.textContent).toMatch(/today or later/);
  });
});


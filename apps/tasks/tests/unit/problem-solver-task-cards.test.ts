// apps/tasks/tests/unit/problem-solver-task-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mountTaskCards } from '../../src/views/problem-solver/task-cards';
import { TaskNotLinkedError } from '../../src/views/problem-solver/task-bridge';
import { CaseFilePageGone } from '../../src/views/problem-solver/case-file-bridge';
import { caseFileOffer, composeCaseFile, sectionDigests } from '../../../../packages/problem-solver/case-file.mjs';
import type { PsSession } from '../../../../packages/problem-solver/types';

const base = { id: 's', title: 'Late rota', runner: { status: 'idle', mode: 'turn', error: null }, proposedTasks: [], reviewProposal: null, reviewTaskId: null } as unknown as PsSession;
const p = (id: string, status = 'proposed') => ({ id, title: `Task ${id}`, status, due: '2026-10-24', source: { runId: 'k', nodeId: id } });
const PLACES = [{ value: 'project:p1', label: 'Project: Kitchen rota' }, { value: 'task:t1', label: 'Task: Draft rota' }, { value: 'new', label: 'New project: x' }];
const handlers = () => ({
  create: vi.fn().mockResolvedValue(undefined),
  dismiss: vi.fn().mockResolvedValue(undefined),
  createReview: vi.fn().mockResolvedValue(undefined),
  dismissReview: vi.fn().mockResolvedValue(undefined),
  places: vi.fn().mockResolvedValue(PLACES),
  writeCaseFile: vi.fn().mockResolvedValue(undefined),
  dismissCaseFile: vi.fn().mockResolvedValue(undefined)
});

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
  it('the review card shows while Improve waits, and goes once the review has started or finished', () => {
    const cards = mountTaskCards(handlers());
    const reviewProposal = { title: 'Review: Late rota', due: '2026-11-02', reason: 'A first look.', status: 'proposed' };
    const state = (status: string) => ({ status, due: '2026-11-02', returnTo: null, startedAt: null });
    cards.update({ ...base, reviewProposal, reviewState: state('waiting') } as unknown as PsSession);
    expect(cards.el.querySelector('.ps-reviewcard')).not.toBeNull();
    cards.update({ ...base, reviewProposal, reviewState: state('reviewing') } as unknown as PsSession);
    expect(cards.el.querySelector('.ps-reviewcard')).toBeNull();
    cards.update({ ...base, reviewProposal, reviewState: null } as unknown as PsSession);
    expect(cards.el.querySelector('.ps-reviewcard')).not.toBeNull();
    cards.update({ ...base, reviewProposal, reviewState: state('done') } as unknown as PsSession);
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


describe('case-file card', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const NAME = 'Kitchen rota case file 20261020 v1 Final';
  const node = (slot: string, text: string) => ({ id: `n-${slot}`, slot, text, title: slot, state: 'accepted' });
  const five = (keep = 'Publish on Wednesday') => ({
    id: 'r5', tool: 'five_cs', status: 'done', edges: [],
    nodes: [node('contextualise', 'So next term starts calmly'), node('categorise', 'On the project page'), node('condense:1', keep), node('correct', 'Nothing needs correcting'), node('correspond', NAME)]
  });
  const doc = (keep?: string, extra: Record<string, unknown> = {}) => ({
    ...base,
    status: 'active', model: { id: 'seven_step', reason: '' }, phase: 'document', links: [],
    frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed often', whatCanBeDone: 'c' },
    steps: { document: { runs: [five(keep)], status: 'open', objection: null } },
    learnings: [], reviewState: null, caseFile: null, caseFileDeclined: null,
    ...extra
  }) as unknown as PsSession;
  /** Written before with an older "What to keep", so the offer is an update of that section. */
  const written = (target = { kind: 'project', id: 'p1' }) => {
    const sections = sectionDigests(composeCaseFile(doc('Publish on Monday'))!);
    return doc(undefined, { caseFile: { title: NAME, version: 1, target, writtenAt: 'x', sections, history: [] } });
  };

  it('shows no card while there is nothing to offer', () => {
    const cards = mountTaskCards(handlers());
    const s = doc(undefined, { phase: 'implement', steps: { implement: { runs: [], status: 'open', objection: null } } });
    expect(caseFileOffer(s)).toBeNull();
    cards.update(s);
    expect(cards.el.querySelector('.ps-casefilecard')).toBeNull();
    expect(cards.el.hidden).toBe(true);
  });

  it('the write card has the title, the places, the sections and two buttons', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    const s = doc();
    cards.update(s);
    await flush();
    const card = cards.el.querySelector('article.ps-casefilecard')!;
    expect(card.querySelector('.ps-taskcard__meta')!.textContent).toBe('Write the case file?');
    expect(card.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe(NAME);
    expect(h.places).toHaveBeenCalledWith(s);
    const select = card.querySelector<HTMLSelectElement>('select[name="place"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['project:p1', 'task:t1', 'new']);
    expect([...select.options].map((o) => o.textContent)).toEqual(['Project: Kitchen rota', 'Task: Draft rota', `New project: ${NAME}`]);
    expect(select.value).toBe('project:p1');
    const headings = [...card.querySelectorAll('ul.ps-casefilecard__sections li')].map((li) => li.textContent);
    expect(headings).toEqual(caseFileOffer(s)!.file.sections.map((x) => x.heading));
    expect(card.querySelector('[data-act="write-casefile"]')!.textContent).toBe('Write case file');
    expect(card.querySelector('[data-act="dismiss-casefile"]')!.textContent).toBe('Not now');
  });

  it('offers only a new project when the places cannot be loaded', async () => {
    const h = handlers();
    h.places.mockRejectedValueOnce(new Error('offline'));
    const cards = mountTaskCards(h);
    cards.update(doc());
    await flush();
    const select = cards.el.querySelector<HTMLSelectElement>('.ps-casefilecard select')!;
    expect([...select.options].map((o) => o.value)).toEqual(['new']);
    expect(cards.el.querySelector('.ps-casefilecard .ps-taskcard__error')!.textContent).toBe('');
  });

  it('a title that breaks a strict naming rule is refused on the card', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    cards.update(doc());
    await flush();
    const title = cards.el.querySelector<HTMLInputElement>('.ps-casefilecard input[name="title"]')!;
    title.value = 'rota stuff';
    cards.el.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!.click();
    await flush();
    expect(h.writeCaseFile).not.toHaveBeenCalled();
    expect(cards.el.querySelector('.ps-casefilecard .ps-taskcard__error')!.textContent).toBe('Add the date as YYYYMMDD, for example 20261020.');
  });

  it('Write case file sends the place and title, and reads Writing… while pending', async () => {
    const h = handlers();
    let done!: () => void;
    h.writeCaseFile.mockImplementationOnce(() => new Promise<void>((r) => (done = r)));
    const cards = mountTaskCards(h);
    const s = doc();
    cards.update(s);
    await flush();
    const button = cards.el.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!;
    button.click();
    expect(button.textContent).toBe('Writing…');
    expect(h.writeCaseFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'write', key: caseFileOffer(s)!.key }), { place: { kind: 'project', id: 'p1' }, title: NAME });
    done();
    await flush();
    const select = cards.el.querySelector<HTMLSelectElement>('.ps-casefilecard select')!;
    select.value = 'new';
    select.dispatchEvent(new Event('change'));
    button.click();
    expect(h.writeCaseFile).toHaveBeenLastCalledWith(expect.anything(), { place: 'new', title: NAME });
  });

  it('Not now sets the offer aside by its key', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    const s = doc();
    cards.update(s);
    cards.el.querySelector<HTMLButtonElement>('[data-act="dismiss-casefile"]')!.click();
    await flush();
    expect(h.dismissCaseFile).toHaveBeenCalledWith(caseFileOffer(s)!.key);
  });

  it('the update card lists the changed sections and has no title or place', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    const s = written();
    expect(caseFileOffer(s)!.kind).toBe('update');
    cards.update(s);
    const card = cards.el.querySelector('.ps-casefilecard')!;
    expect(card.querySelector('.ps-taskcard__meta')!.textContent).toBe('Add an update to the case file?');
    expect([...card.querySelectorAll('.ps-casefilecard__sections li')].map((li) => li.textContent)).toEqual(['What to keep']);
    expect(card.querySelector('input, select')).toBeNull();
    expect(card.querySelector('[data-act="write-casefile"]')!.textContent).toBe('Add update');
    expect(card.querySelector('[data-act="dismiss-casefile"]')!.textContent).toBe('Not now');
    card.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!.click();
    await flush();
    expect(h.writeCaseFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update', version: 2 }), { place: { kind: 'project', id: 'p1' }, title: NAME });
    expect(h.places).not.toHaveBeenCalled();
  });

  it('when the page has gone, the update card turns into the write form for a copy elsewhere', async () => {
    const h = handlers();
    h.writeCaseFile.mockRejectedValueOnce(new CaseFilePageGone());
    const cards = mountTaskCards(h, { today: () => '20261102' });
    const s = written();
    cards.update(s);
    const card = cards.el.querySelector('.ps-casefilecard')!;
    card.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!.click();
    await flush();
    expect(cards.el.querySelector('.ps-casefilecard')).toBe(card);
    expect(card.querySelector('.ps-taskcard__error')!.textContent).toContain('is gone');
    expect(card.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Kitchen rota case file 20261102 v2 Final');
    const select = card.querySelector<HTMLSelectElement>('select[name="place"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['task:t1', 'new']);
    const primary = card.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!;
    expect(primary.textContent).toBe('Write it there');
    expect(card.querySelectorAll('.ps-casefilecard__sections li').length).toBe(caseFileOffer(s)!.file.sections.length);
    primary.click();
    await flush();
    expect(h.writeCaseFile).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'update' }), { place: { kind: 'task', id: 't1' }, title: 'Kitchen rota case file 20261102 v2 Final', moved: true });
  });

  it('is kept across updates while the offer is the same, and replaced when it changes', async () => {
    const cards = mountTaskCards(handlers());
    cards.update(doc());
    const card = cards.el.querySelector('.ps-casefilecard')!;
    const title = card.querySelector<HTMLInputElement>('input[name="title"]')!;
    title.value = 'Kitchen rota notes 20261020 v1 Final';
    cards.update(doc());
    expect(cards.el.querySelector('.ps-casefilecard')).toBe(card);
    expect(title.value).toBe('Kitchen rota notes 20261020 v1 Final');
    cards.update(doc('Publish on Tuesday'));
    expect(cards.el.querySelector('.ps-casefilecard')).not.toBe(card);
    cards.update(doc(undefined, { caseFileDeclined: caseFileOffer(doc())!.key }));
    expect(cards.el.querySelector('.ps-casefilecard')).toBeNull();
  });

  it('sits after the task cards and the review card', () => {
    const cards = mountTaskCards(handlers());
    cards.update(doc(undefined, { proposedTasks: [p('a')], reviewProposal: { title: 'Review: rota', due: '2099-11-02', reason: '', status: 'proposed' } }));
    const order = [...cards.el.children].map((child) => child.className.split(' ')[0]);
    expect(order).toEqual(['ps-taskcard', 'ps-reviewcard', 'ps-casefilecard', 'ps-taskcards__notices']);
  });
});

// The Question Book's client against the local mock API (invented questions only): the shelf,
// one input per response type, autosave with the value shapes answers.mjs defines, Clear,
// Earlier versions, Your questions, and Notice a pattern's three-answer gate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESPONSE_TYPES } from '../../../../packages/question-book/answers.mjs';
import { GROUPS, OWN_CHAPTER } from '../../../../packages/question-book/catalogue.mjs';
import { MOCK_QUESTIONS, createQuestionBookMock } from '../../scripts/question-book-mock';

const net = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), mock: null as null | ReturnType<typeof import('../../scripts/question-book-mock').createQuestionBookMock> }));

vi.mock('../../src/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/api/client')>();
  const call = (method: string) => async (path: string, body?: unknown) => {
    const reply = net.mock!.handle(method, new URL(path, 'http://local.test'), body);
    const envelope = reply!.body as { ok: boolean; data?: unknown; error?: { code: string; message: string } };
    if (!envelope.ok) throw new real.ApiClientError(envelope.error!, reply!.status);
    return envelope.data;
  };
  net.get.mockImplementation(call('GET'));
  net.put.mockImplementation(call('PUT'));
  net.post.mockImplementation(call('POST'));
  return { ...real, apiGet: net.get, apiPut: net.put, apiPost: net.post };
});

import { SAVE_DELAY_MS, renderQuestionBookView, unmountQuestionBookView } from '../../src/views/question-book/view';

beforeEach(() => {
  net.mock = createQuestionBookMock({ now: () => Date.parse('2026-10-28T10:00:00.000Z') });
  net.put.mockClear();
  net.post.mockClear();
});

afterEach(() => {
  unmountQuestionBookView();
  vi.useRealTimers();
  document.body.replaceChildren();
  location.hash = '';
});

async function open(hash: string): Promise<HTMLElement> {
  location.hash = hash;
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderQuestionBookView(canvas);
  return canvas;
}

const chapter = (id: string) => open(`#/question-book?chapter=${id}`);
const card = (page: HTMLElement, id: string) => page.querySelector<HTMLElement>(`.qb-q[data-question="${id}"]`)!;
const qid = (prompt: string) => MOCK_QUESTIONS.find((q) => q.prompt === prompt)!.id;
const lastPut = () => net.put.mock.calls.at(-1)?.[1] as { chapter: string; question: string; value: unknown } | undefined;
const settle = () => new Promise((r) => setTimeout(r, 0));
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const pick = (input: HTMLInputElement) => {
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('shelf', () => {
  it('shows the book, the four rules and the five groups with their chapters', async () => {
    const page = await open('#/question-book');
    expect(page.querySelector('.qb-page.qb-scope')).not.toBeNull();
    expect(page.querySelector('.qb-emblem--book')).not.toBeNull();
    expect(page.querySelectorAll('.qb-rules__item')).toHaveLength(4);
    const groups = [...page.querySelectorAll<HTMLElement>('.qb-group')];
    expect(groups.map((g) => g.dataset.group)).toEqual(GROUPS.map((g: { key: string }) => g.key));
    expect(groups.map((g) => g.querySelector('.qb-group__title')!.textContent)).toEqual(GROUPS.map((g: { title: string }) => g.title));
    expect(page.querySelectorAll('.qb-tile')).toHaveLength(42);
    const own = page.querySelector<HTMLElement>(`.qb-group[data-group="identity_and_convictions"] .qb-tile[data-chapter="${OWN_CHAPTER}"]`);
    expect(own).not.toBeNull();
    const rightNow = page.querySelector<HTMLElement>('.qb-tile[data-chapter="qb_right_now"]')!;
    expect(rightNow.querySelector('a')!.getAttribute('href')).toBe('#/question-book?chapter=qb_right_now');
    expect(rightNow.querySelector('.qb-progress__text')!.textContent).toBe('2 of 10 answered');
    expect(rightNow.querySelector('.qb-tile__updated')!.textContent).toMatch(/^Last updated /);
  });
});

describe('chapter page', () => {
  it('draws a labelled input for every response type', async () => {
    const seen = new Set<string>();
    for (const id of [...new Set(MOCK_QUESTIONS.map((q) => q.chapter))]) {
      const page = await chapter(id);
      expect(page.querySelector('.qb-back')!.getAttribute('href')).toBe('#/question-book');
      for (const q of MOCK_QUESTIONS.filter((x) => x.chapter === id)) {
        const c = card(page, q.id);
        expect(c, q.id).not.toBeNull();
        expect(c.querySelector('.qb-q__n')!.textContent).toBe(String(q.n));
        expect(c.querySelector('.qb-q__body')!.querySelector('input, textarea, button'), q.response.type).not.toBeNull();
        for (const control of c.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.qb-q__body input:not([type="radio"]), .qb-q__body textarea')) {
          const named = control.getAttribute('aria-labelledby') || control.getAttribute('aria-label') || c.querySelector(`label[for="${control.id}"]`);
          expect(named, `${q.response.type} control has a label`).toBeTruthy();
        }
        expect(c.querySelector('select'), 'no selects').toBeNull();
        seen.add(q.response.type);
      }
      unmountQuestionBookView();
      document.body.replaceChildren();
    }
    expect([...seen].sort()).toEqual([...RESPONSE_TYPES].sort());
  });

  it('shows the from label, the right controls for a few types and the text-box note', async () => {
    const page = await chapter('qb_right_now');
    expect(card(page, qid('Do you hum while you cook?')).querySelector('.qb-q__from')!.textContent).toBe('from Odds and ends');
    expect(card(page, qid('When does your day feel most your own?')).querySelector('input[type="time"]')).not.toBeNull();
    const tidy = card(page, qid('How tidy is your desk right now?'));
    expect(tidy.querySelector('input[type="range"]')).not.toBeNull();
    expect([...tidy.querySelectorAll('.qb-slider__ends span')].map((s) => s.textContent)).toEqual(['chaos', 'gleaming']);
    expect(tidy.querySelector('.qb-slider__value')!.textContent).toBe('Not set');
    const siblings = await chapter('qb_you_and_your_siblings');
    expect(card(siblings, qid('Sketch the house you grew up in.')).querySelector('.qb-note')!.textContent).toBe('Write it for now — a drawn version may come later.');
    const career = await chapter('qb_career');
    expect(card(career, qid('Which of these do you do each week?')).querySelector('.qb-scroll table')).not.toBeNull();
    expect(card(career, qid('Which of the last two questions was easier to answer?')).querySelectorAll('.qb-compare__prompt')).toHaveLength(2);
  });
});

describe('autosave', () => {
  it('saves text after a pause, with the main shape', async () => {
    vi.useFakeTimers();
    const page = await chapter('qb_career');
    const id = qid('What would you change first about your job?');
    type(card(page, id).querySelector('textarea')!, 'Fewer meetings on Mondays');
    expect(net.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(lastPut()).toEqual({ chapter: 'qb_career', question: id, value: { main: 'Fewer meetings on Mondays' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(card(page, id).querySelector('.qb-q__status')!.textContent).toBe('Saved');
  });

  it('saves labelled parts of a text question into parts, and a pick at once', async () => {
    vi.useFakeTimers();
    const page = await chapter('qb_right_now');
    const desk = card(page, qid('Think of a small object on your desk.'));
    const areas = desk.querySelectorAll('textarea');
    expect(areas).toHaveLength(2);
    type(areas[1], 'It holds the door');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(lastPut()!.value).toEqual({ parts: { 1: 'It holds the door' } });
    const seat = card(page, qid('Which window seat do you choose?'));
    pick(seat.querySelector<HTMLInputElement>('input[value="window"]')!);
    expect(lastPut()!.value).toEqual({ main: 'window' });
  });

  it('holds shares until they make 100, then saves the list', async () => {
    vi.useFakeTimers();
    const page = await chapter('qb_career');
    const id = qid('Split a free working afternoon:');
    const c = card(page, id);
    const inputs = [...c.querySelectorAll<HTMLInputElement>('.qb-shares__input')];
    expect(inputs).toHaveLength(3);
    type(inputs[0], '60');
    type(inputs[1], '50');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(net.put).not.toHaveBeenCalled();
    expect(c.querySelector('.qb-shares__total')!.getAttribute('data-state')).toBe('bad');
    expect(c.querySelector('.qb-q__status')!.textContent).toMatch(/add up to 110/);
    type(inputs[1], '30');
    type(inputs[2], '10');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(lastPut()).toEqual({ chapter: 'qb_career', question: id, value: { main: [60, 30, 10] } });
    expect(c.querySelector('.qb-shares__total')!.getAttribute('data-state')).toBe('done');
  });

  it('keeps 0 on a profile scale as a real answer', async () => {
    vi.useFakeTimers();
    const page = await chapter('qb_your_future');
    const id = qid('Your outlook on a few scales:');
    const ranges = card(page, id).querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(ranges).toHaveLength(3);
    type(ranges[0], '0');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(lastPut()!.value).toEqual({ main: [0, null, null] });
  });

  it('places a quadrant item by tapping a cell, and ranks with the buttons', async () => {
    const page = await chapter('qb_career');
    const chart = card(page, qid('Place the paid jobs you have done:'));
    const name = chart.querySelector<HTMLInputElement>('.qb-chart-add input')!;
    name.value = 'Paper round';
    chart.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    chart.querySelector<HTMLButtonElement>('.qb-quad__place[data-cell="upper_right"]')!.click();
    expect(lastPut()!.value).toEqual({ main: { items: [{ label: 'Paper round', cell: 'upper_right' }] } });
    await settle();
    const rank = card(page, qid('Rank what matters most in a working week:'));
    rank.querySelector<HTMLButtonElement>('[aria-label="Add clear goals to the ranking"]')!.click();
    await settle();
    rank.querySelector<HTMLButtonElement>('[aria-label="Add quiet time to the ranking"]')!.click();
    await settle();
    rank.querySelector<HTMLButtonElement>('[aria-label="Move quiet time up"]')!.click();
    await settle();
    expect(lastPut()!.value).toEqual({ main: ['quiet time', 'clear goals'] });
  });

  it('Clear sends null, and Earlier versions lists the old answer', async () => {
    const page = await chapter('qb_right_now');
    const id = qid('What did you notice first when you woke up today?');
    const c = card(page, id);
    expect(c.querySelector('textarea')!.value).toBe('Rain on the skylight.');
    c.querySelector<HTMLButtonElement>('.qb-q__foot .qb-link-btn--quiet')!.click();
    expect(lastPut()).toEqual({ chapter: 'qb_right_now', question: id, value: null });
    expect(c.querySelector('textarea')!.value).toBe('');
    await settle();
    c.querySelector<HTMLButtonElement>('[aria-controls^="qb-history-"]')!.click();
    await settle();
    await settle();
    expect(c.querySelector('.qb-version__text')!.textContent).toBe('Rain on the skylight.');
  });
});

describe('your questions', () => {
  it('adds a row and saves the whole list', async () => {
    vi.useFakeTimers();
    const page = await chapter(OWN_CHAPTER);
    const add = [...page.querySelectorAll<HTMLButtonElement>('.qb-own button')].find((b) => /add/i.test(b.textContent ?? '') || /add/i.test(b.getAttribute('aria-label') ?? ''));
    expect(add).toBeTruthy();
    add!.click();
    await vi.advanceTimersByTimeAsync(0);
    const areas = page.querySelectorAll<HTMLTextAreaElement>('.qb-own__row textarea');
    expect(areas).toHaveLength(2);
    type(areas[0], 'What made you laugh this week?');
    type(areas[1], 'A dog in a raincoat');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    const body = lastPut() as unknown as { chapter: string; own: Array<{ question: string; answer: string }> };
    expect(body.chapter).toBe(OWN_CHAPTER);
    expect(body.own.map(({ question, answer }) => ({ question, answer }))).toEqual([{ question: 'What made you laugh this week?', answer: 'A dog in a raincoat' }]);
  });
});

describe('notice a pattern', () => {
  it('stays disabled under three answers, then shows the observation', async () => {
    const page = await chapter('qb_right_now');
    const button = page.querySelector<HTMLButtonElement>('.qb-notice__go')!;
    expect(button.textContent).toBe('Notice a pattern · about 3 cents');
    expect(button.disabled).toBe(true);
    expect(page.querySelector('.qb-notice__hint')!.textContent).toBe('Answer at least 3 questions in this chapter first (2 so far).');
    pick(card(page, qid('Which window seat do you choose?')).querySelector<HTMLInputElement>('input[value="aisle"]')!);
    await settle();
    expect(button.disabled).toBe(false);
    button.click();
    expect(button.textContent).toBe('Noticing…');
    await settle();
    expect(page.querySelector('.qb-notice__result .qb-noted__observation')!.textContent).toMatch(/quiet comforts/);
    expect(page.querySelector('.qb-notice__result .qb-noted__question')!.textContent).toMatch(/protect next week/);
    expect(net.post).toHaveBeenCalledWith('/api/question-book/notice', { chapter: 'qb_right_now' });
  });
});

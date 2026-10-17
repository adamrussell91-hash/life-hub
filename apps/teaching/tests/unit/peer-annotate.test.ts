import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn() };
});

import { apiGet, apiPut } from '@/api/client';
import { sentences, giveView, receivedView, matchTechnique, videoAt, type Code } from '@/blocks/peer-annotate';
import { mountBankEditor, parseStart } from '@/blocks/peer-annotate-bank';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import type { LiteraryTechnique } from '@/blocks/literary-elements';

const getMock = apiGet as unknown as ReturnType<typeof vi.fn>;
const putMock = apiPut as unknown as ReturnType<typeof vi.fn>;

const CODES: Code[] = [
  { id: 'wrong-technique', label: 'Wrong technique', colour: 'peach', ask: 'Should be:' },
  { id: 'great-quote', label: 'Great quote', colour: 'sage' }
];
const TEXT = 'The sea is like a hungry dog. This shows danger!\nAt the end it is calm.';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  getMock.mockReset();
  putMock.mockReset();
});

describe('sentences', () => {
  it('splits lines into paragraphs and sentences with exact offsets', () => {
    const list = sentences(TEXT);
    expect(list.map((s) => TEXT.slice(s.start, s.end))).toEqual([
      'The sea is like a hungry dog.',
      'This shows danger!',
      'At the end it is calm.'
    ]);
    expect(list.map((s) => s.para)).toEqual([0, 0, 1]);
    expect(sentences('No full stop at the end').map((s) => s.end)).toEqual([23]);
    expect(sentences('He said “stop.” Then left.').length).toBe(2);
  });
});

describe('giving notes', () => {
  function mount(onSend = vi.fn().mockResolvedValue(true)) {
    const view = giveView({
      pieces: [{ text: TEXT, sent: false }, { text: 'Second piece.', sent: false }],
      codes: CODES,
      draftKey: (p) => `test:notes-${p}`,
      onSend,
      onError: vi.fn()
    });
    document.body.replaceChildren(view);
    return { view, onSend };
  }
  const sentence = (view: HTMLElement, i: number) => view.querySelectorAll<HTMLElement>('.pa-sentence')[i]!;

  it('tap a sentence, extend to the next, pick a button that asks, add, send', async () => {
    const { view, onSend } = mount();
    expect(view.textContent).toContain('Piece 1 of 2');
    sentence(view, 0).click();
    expect(view.querySelector('.pa-quote')?.textContent).toBe('“The sea is like a hungry dog.”');
    sentence(view, 1).click();
    expect(view.querySelector('.pa-quote')?.textContent).toContain('dog. This shows danger!');
    const add = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Add note')!;
    expect(add.disabled).toBe(true);
    [...view.querySelectorAll<HTMLButtonElement>('.pa-code')].find((b) => b.textContent?.includes('Wrong technique'))!.click();
    const ask = view.querySelector<HTMLInputElement>('.pa-ask')!;
    expect(view.querySelector('.pa-ask')?.closest('.pf-field')?.textContent).toContain('Should be:');
    ask.value = 'metaphor';
    ask.dispatchEvent(new Event('input'));
    const add2 = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Add note')!;
    expect(add2.disabled).toBe(false);
    add2.click();
    expect(view.querySelectorAll('.pa-note').length).toBe(1);
    expect(view.querySelector('.pa-note__title')?.textContent).toBe('Wrong technique: metaphor');
    expect(view.querySelectorAll('.pa-run--mark').length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('test:notes-0')!)).toHaveLength(1);
    const send = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Send, then piece 2')!;
    send.click();
    await flush();
    expect(onSend).toHaveBeenCalledWith(0, [{ start: 0, end: 48, code_id: 'wrong-technique', answer: 'metaphor' }], send);
    expect(localStorage.getItem('test:notes-0')).toBeNull();
  });

  it('a plain comment needs no button; tapping the selection again clears it; drafts come back', () => {
    const { view } = mount();
    sentence(view, 2).click();
    const comment = view.querySelector<HTMLInputElement>('.pa-comment')!;
    comment.value = 'Lovely ending';
    comment.dispatchEvent(new Event('input'));
    [...view.querySelectorAll('button')].find((b) => b.textContent === 'Add note')!.click();
    sentence(view, 0).click();
    sentence(view, 0).click();
    expect(view.querySelector<HTMLElement>('.pa-tray')!.hidden).toBe(true);
    const again = mount().view;
    expect(again.querySelector('.pa-note__title')?.textContent).toBe('Comment');
    expect(again.querySelector('.pa-note__comment')?.textContent).toBe('Lovely ending');
  });
});

describe('getting it back', () => {
  it('two layers, a summary, toggles, and a card for the tapped words', () => {
    const view = receivedView(
      TEXT,
      [
        { notes: [{ start: 0, end: 29, quote: 'The sea is like a hungry dog.', code_id: 'wrong-technique', code_label: 'Wrong technique', answer: 'metaphor' }] },
        { notes: [{ start: 0, end: 29, quote: 'The sea is like a hungry dog.', code_id: 'great-quote', code_label: 'Great quote', comment: 'Good pick' }] }
      ],
      CODES
    );
    document.body.replaceChildren(view);
    expect([...view.querySelectorAll('.pa-layer')].map((b) => b.textContent)).toEqual(['Reviewer 1', 'Reviewer 2']);
    expect(view.querySelector('.pa-summary')?.textContent).toBe('1 × Wrong technique · 1 × Great quote');
    expect(view.querySelector('.pa-run--both')).not.toBeNull();
    view.querySelector<HTMLElement>('.pa-run--mark')!.click();
    expect([...view.querySelectorAll('.pa-card__title')].map((c) => c.textContent)).toEqual(['Wrong technique: metaphor', 'Great quote']);
    expect(view.textContent).not.toMatch(/Blue|Green|star|circle/);
    view.querySelectorAll<HTMLButtonElement>('.pa-layer')[0]!.click();
    expect(view.querySelector('.pa-layer')?.getAttribute('aria-pressed')).toBe('false');
    expect(view.querySelector('.pa-summary')?.textContent).toBe('1 × Great quote');
    expect(view.querySelector('.pa-run--both')).toBeNull();
  });

  it('attaches the teacher’s video at its start time', () => {
    const codes: Code[] = [{ id: 'ev', label: 'Needs evidence', colour: 'blue', resource: { kind: 'video', url: 'https://www.youtube.com/watch?v=abc', start: 62, title: 'Embedding quotes' } }];
    const view = receivedView(TEXT, [{ notes: [{ start: 30, end: 48, quote: 'This shows danger!', code_id: 'ev', code_label: 'Needs evidence' }] }], codes);
    view.querySelector<HTMLElement>('.pa-run--mark')!.click();
    const link = view.querySelector<HTMLAnchorElement>('.pa-res')!;
    expect(link.href).toBe('https://www.youtube.com/watch?v=abc&t=62');
    expect(link.rel).toContain('noopener');
    expect(link.textContent).toContain('from 1:02');
  });
});

describe('helpers', () => {
  it('matches a typed technique to the table', () => {
    const t = (id: string, name: string) => ({ id, name }) as LiteraryTechnique;
    const table = [t('metaphor', 'Metaphor'), t('simile', 'Simile'), t('personification', 'Personification')];
    expect(matchTechnique(table, 'a metaphor')?.id).toBe('metaphor');
    expect(matchTechnique(table, 'Similes')?.id).toBe('simile');
    expect(matchTechnique(table, 'nope')).toBeUndefined();
  });
  it('builds video links and reads start times', () => {
    expect(videoAt('https://vimeo.com/1', 30)).toBe('https://vimeo.com/1#t=30');
    expect(videoAt('https://youtu.be/x')).toBe('https://youtu.be/x');
    expect(parseStart('1:05')).toBe(65);
    expect(parseStart('90')).toBe(90);
    expect(parseStart('')).toBeUndefined();
    expect(parseStart('a:b')).toBeUndefined();
  });
});

describe('editor', () => {
  it('switches mode, loads the shared bank and saves it', async () => {
    getMock.mockResolvedValue({ codes: CODES });
    putMock.mockImplementation(async (_path: string, body: { codes: Code[] }) => ({ codes: body.codes }));
    const block = createBlock('peer_feedback', 'peer1');
    const changed = vi.fn();
    const editor = createBlockEditor(block, changed);
    document.body.replaceChildren(editor);
    expect(editor.textContent).toContain('First feedback box');
    [...editor.querySelectorAll('button')].find((b) => b.textContent === 'Notes on the text')!.click();
    expect(changed.mock.calls.at(-1)![0].content.mode).toBe('annotate');
    expect(editor.textContent).not.toContain('First feedback box');
    await flush();
    expect(getMock).toHaveBeenCalledWith('/api/peer-feedback/bank');
    const labels = [...editor.querySelectorAll<HTMLInputElement>('.pa-bank__row input')].filter((i) => i.closest('.pf-field')?.textContent?.startsWith('Label'));
    expect(labels.map((i) => i.value)).toEqual(['Wrong technique', 'Great quote']);
    labels[1]!.value = 'Brilliant quote';
    labels[1]!.dispatchEvent(new Event('input'));
    [...editor.querySelectorAll('button')].find((b) => b.textContent === 'Save buttons')!.click();
    await flush();
    expect(putMock.mock.calls[0]![1].codes[1].label).toBe('Brilliant quote');
    expect(editor.querySelector('.pa-bank__status')?.textContent).toContain('Saved');
  });

  it('a standalone bank editor shows server errors', async () => {
    getMock.mockResolvedValue({ codes: CODES });
    putMock.mockRejectedValue(new Error('nope'));
    const bank = mountBankEditor();
    await flush();
    [...bank.querySelectorAll('button')].find((b) => b.textContent === 'Save buttons')!.click();
    await flush();
    expect(bank.querySelector('.pa-bank__status')?.getAttribute('data-tone')).toBe('error');
  });

  it('prints an annotate block without the two feedback boxes', () => {
    const block = createBlock('peer_feedback', 'peer1');
    if (block.block_type !== 'peer_feedback') throw new Error('Expected peer feedback');
    const printed = renderBlock({ ...block, content: { ...block.content, mode: 'annotate' } }, 'print');
    expect(printed.textContent).toContain('Notes on a classmate’s answer');
    expect(printed.textContent).not.toContain('One suggestion or question');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWordHelp,
  normaliseWordHelp,
  openWordCard,
  readWordHelp,
  removeWordHelp,
  wordsPresentIn,
  type WordHelpEntry
} from '@/blocks/word-help';
import { createStudentWordHelpBar } from '@/blocks/word-help-bar';
import { pollTextToolJob } from '@/blocks/text-tools-client';
import { closeExplainerMenu, createRichTextTools, openFryReview, openQuestionFirstReview } from '@/blocks/rich-text-tools';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';

// No network in unit tests: the library answers "no matrix" unless a test injects its own.
vi.mock('@/blocks/morphemic-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/blocks/morphemic-client')>()),
  loadMatrix: async () => null,
  matrixStatus: async () => 'none'
}));


const entry = (word: string, extra: Partial<WordHelpEntry> = {}): WordHelpEntry => ({
  word,
  kind: 'uncommon',
  part_of_speech: 'noun',
  pronunciation: 'say-it',
  definition: `Meaning of ${word}.`,
  etymology: 'From Latin.',
  example: `An example with ${word}.`,
  ...extra
});

type RichText = Extract<Block, { block_type: 'rich_text' }>;

function richText(html: string, settings: Record<string, unknown> = {}): RichText {
  return {
    id: 'block_rt',
    type: 'block',
    block_type: 'rich_text',
    variant: 'plain',
    visibility: 'student_teacher',
    layout: {},
    print: {},
    settings,
    content: { html },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1
  } as RichText;
}

function body(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('applyWordHelp', () => {
  it('wraps every occurrence, keeps the text, and skips links', () => {
    const root = body('<p>Zeitgeist matters. The <em>zeitgeist</em> shifts.</p><p><a href="/x">zeitgeist</a> and in medias res.</p>');
    const found = applyWordHelp(root, [entry('zeitgeist'), entry('in medias res', { kind: 'foreign' })]);
    expect(found).toBe(2);
    const terms = [...root.querySelectorAll('.word-help-term')].map((t) => t.textContent);
    expect(terms).toEqual(['Zeitgeist', 'zeitgeist', 'in medias res']);
    expect(root.querySelector('a .word-help-term')).toBeNull();
    expect(root.textContent).toBe('Zeitgeist matters. The zeitgeist shifts.zeitgeist and in medias res.');
    expect(root.classList.contains('word-help-on')).toBe(true);
  });

  it('matches whole words only and prefers the longer phrase', () => {
    const root = body('<p>A pyrrhic victory, and ubiquitously pyrrhic.</p>');
    applyWordHelp(root, [entry('pyrrhic'), entry('pyrrhic victory'), entry('ubiquitous')]);
    expect([...root.querySelectorAll('.word-help-term')].map((t) => t.textContent)).toEqual(['pyrrhic victory', 'pyrrhic']);
  });

  it('removeWordHelp restores the original markup', () => {
    const html = '<p>The <strong>juxtaposition</strong> is stark.</p>';
    const root = body(html);
    applyWordHelp(root, [entry('juxtaposition')]);
    removeWordHelp(root);
    expect(root.innerHTML).toBe(html);
  });

  it('wordsPresentIn drops words a later edit removed', () => {
    expect(wordsPresentIn('The ephemeral glow.', [entry('ephemeral'), entry('gone')]).map((e) => e.word)).toEqual(['ephemeral']);
  });
});

describe('dictionary card', () => {
  it('shows the word, pronunciation, tags, definition, example and origin, and closes on Escape', () => {
    const root = body('<p>Ephemeral.</p>');
    applyWordHelp(root, [entry('Ephemeral', { kind: 'technical', etymology: 'From Greek ephemeros, lasting a day.' })]);
    const term = root.querySelector<HTMLButtonElement>('.word-help-term')!;
    term.click();
    const card = document.querySelector('.word-card')!;
    expect(card.querySelector('.word-card__word')?.textContent).toBe('Ephemeral');
    expect(card.querySelector('.word-card__say')?.textContent).toBe('say-it');
    expect(card.querySelector('.word-card__tag--technical')?.textContent).toBe('Technical');
    expect(card.querySelector('.word-card__definition')?.textContent).toBe('Meaning of Ephemeral.');
    expect(card.querySelector('.word-card__origin')?.textContent).toContain('lasting a day');
    expect(term.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.word-card')).toBeNull();
    expect(term.getAttribute('aria-expanded')).toBe('false');
  });

  it('only one card is open at a time', () => {
    const root = body('<p>alpha beta</p>');
    const [a, b] = [document.createElement('button'), document.createElement('button')];
    root.append(a, b);
    openWordCard(a, entry('alpha'));
    openWordCard(b, entry('beta'));
    expect(document.querySelectorAll('.word-card')).toHaveLength(1);
  });
});

describe('normalise and read', () => {
  it('drops malformed cards and maps unknown kinds', () => {
    expect(normaliseWordHelp([{ word: 'x' }, null, { word: 'y', definition: 'd', kind: 'weird' }])).toEqual([
      { word: 'y', kind: 'uncommon', part_of_speech: '', pronunciation: '', definition: 'd', etymology: '', example: '' }
    ]);
    expect(readWordHelp({ settings: { word_help: { words: [entry('a')] } } })).toHaveLength(1);
    expect(readWordHelp({ settings: {} })).toEqual([]);
  });
});

describe('student render', () => {
  it('lights a teacher pre-scan straight away and toggles it off and on', () => {
    const block = richText('<p>The ephemeral glow.</p>', { word_help: { words: [entry('ephemeral')], scanned_at: 'x' } });
    const el = renderBlock(block, 'student', { lessonId: 'lesson_1' });
    document.body.append(el);
    expect(el.querySelectorAll('.word-help-term')).toHaveLength(1);
    const button = el.querySelector<HTMLButtonElement>('.word-help-bar__btn')!;
    expect(button.textContent).toBe('Dictionary scan');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(el.querySelectorAll('.word-help-term')).toHaveLength(0);
    button.click();
    expect(el.querySelectorAll('.word-help-term')).toHaveLength(1);
  });

  it('teacher view lights saved words but has no student button; print shows neither', () => {
    const block = richText('<p>The ephemeral glow.</p>', { word_help: { words: [entry('ephemeral')] } });
    const teacher = renderBlock(block, 'teacher', { lessonId: 'lesson_1' });
    expect(teacher.querySelectorAll('.word-help-term')).toHaveLength(1);
    expect(teacher.querySelector('.word-help-bar')).toBeNull();
    const print = renderBlock(block, 'print', { lessonId: 'lesson_1' });
    expect(print.querySelector('.word-help-term, .word-help-bar')).toBeNull();
  });

  it('runs a scan on press when there is no pre-scan, and shows the server reason on failure', async () => {
    const root = body('<p>The ephemeral glow.</p>');
    const scan = vi.fn().mockRejectedValueOnce(new Error('Too many requests. Try again in a minute.')).mockResolvedValueOnce([entry('ephemeral')]);
    const bar = createStudentWordHelpBar({ body: root, lessonId: 'l', blockId: 'b', preScanned: [], scan });
    document.body.append(bar);
    const button = bar.querySelector<HTMLButtonElement>('button')!;
    const status = bar.querySelector('.word-help-bar__status')!;

    button.click();
    expect(root.classList.contains('word-help-scanning')).toBe(true);
    await vi.waitFor(() => expect(status.textContent).toBe('Too many requests. Try again in a minute.'));
    expect(root.classList.contains('word-help-scanning')).toBe(false);

    button.click();
    await vi.waitFor(() => expect(root.querySelectorAll('.word-help-term')).toHaveLength(1));
    expect(scan).toHaveBeenCalledWith('l', 'b');
    expect(root.classList.contains('word-help-revealed')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('says so when a scan finds nothing', async () => {
    const root = body('<p>The cat sat.</p>');
    const bar = createStudentWordHelpBar({ body: root, lessonId: 'l', blockId: 'b', preScanned: [], scan: async () => [] });
    bar.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(bar.textContent).toContain('Every word in this block is one you can read on your own.'));
  });
});

describe('pollTextToolJob', () => {
  it('polls until done and surfaces a job error', async () => {
    const wait = vi.fn(async () => {});
    const poll = vi.fn()
      .mockResolvedValueOnce({ key: 'k', status: 'working' })
      .mockResolvedValueOnce({ key: 'k', status: 'done', result: { words: [] } });
    const result = await pollTextToolJob(async () => ({ key: 'k', status: 'working' }), poll, { wait });
    expect(result).toEqual({ words: [] });
    expect(poll).toHaveBeenCalledTimes(2);
    await expect(
      pollTextToolJob(async () => ({ key: 'k', status: 'error', error: 'The AI service is not configured.' }), poll, { wait })
    ).rejects.toThrow('The AI service is not configured.');
  });
});

describe('teacher text tools', () => {
  function setup(html: string, settings: Record<string, unknown> = {}) {
    let latest = richText(html, settings);
    let current = html;
    const host = document.createElement('div');
    const tiptap = {
      host,
      getHtml: () => current,
      setHtml: vi.fn((next: string) => {
        current = next;
      })
    };
    const onChange = vi.fn((next: RichText) => {
      latest = next;
    });
    return { tiptap, onChange, getLatest: () => latest };
  }

  function pickTemplate(button: HTMLButtonElement, template: 'fry' | 'question_first') {
    document.body.append(button);
    button.click();
    const item = document.querySelector<HTMLButtonElement>(`.text-tools-menu [data-template="${template}"]`);
    if (!item) throw new Error('menu did not open');
    item.click();
  }

  function waitForDialog(selector: string) {
    return vi.waitFor(() => {
      const found = document.querySelector(selector);
      if (!found) throw new Error('no dialog yet');
      return found;
    });
  }

  afterEach(() => {
    closeExplainerMenu();
    document.querySelectorAll('.text-tools-review, .text-tools-btn').forEach((el) => el.remove());
  });

  it('Dictionary scan saves cards on the block settings and lists them', async () => {
    const ctx = setup('<p>The ephemeral glow.</p>');
    const tools = createRichTextTools({ ...ctx, scan: async () => [entry('ephemeral')] });
    document.body.append(tools.status, tools.strip);
    expect(tools.buttons.map((b) => b.textContent)).toEqual(['Dictionary scan', 'Explainer', 'Technique scan']);
    expect(tools.strip.hidden).toBe(false);
    expect(tools.strip.textContent).toContain('+ Add word');

    tools.buttons[0].click();
    await vi.waitFor(() => expect(ctx.onChange).toHaveBeenCalled());
    expect(ctx.getLatest().settings.word_help).toMatchObject({ words: [entry('ephemeral')] });
    expect(tools.strip.hidden).toBe(false);
    expect(tools.strip.textContent).toContain('1 word lit for students');

    tools.strip.querySelector<HTMLButtonElement>('.word-help-strip__clear')!.click();
    expect(ctx.getLatest().settings.word_help).toBeUndefined();
    expect(tools.strip.textContent).toContain('Words under this block');
  });

  it('a failed scan shows the server message and leaves settings alone', async () => {
    const ctx = setup('<p>Text</p>');
    const tools = createRichTextTools({ ...ctx, scan: async () => { throw new Error('This block is too long for one pass.'); } });
    tools.buttons[0].click();
    await vi.waitFor(() => expect(tools.status.textContent).toBe('This block is too long for one pass.'));
    expect(tools.status.classList.contains('text-tools-status--error')).toBe(true);
    expect(ctx.onChange).not.toHaveBeenCalled();
  });

  it('Fry explainer waits for Replace, then swaps the text with undo', async () => {
    const ctx = setup('<p>Old text about voice.</p>');
    const tools = createRichTextTools({ ...ctx, rewrite: async () => ({ html: '<p>Just do it.</p>' }) });
    pickTemplate(tools.buttons[1], 'fry');
    const dialog = await vi.waitFor(() => {
      const found = document.querySelector('.text-tools-review');
      if (!found) throw new Error('no dialog yet');
      return found;
    });
    expect(ctx.tiptap.setHtml).not.toHaveBeenCalled();
    expect(dialog.querySelector('.text-tools-review__preview')?.innerHTML).toBe('<p>Just do it.</p>');
    expect(dialog.querySelector('.text-tools-review__length')?.textContent).toBe('4 words → 3 words');
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Replace text')!.click();
    expect(ctx.tiptap.setHtml).toHaveBeenCalledWith('<p>Just do it.</p>', true);
    const undo = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Undo');
    undo?.click();
    expect(ctx.tiptap.setHtml).toHaveBeenLastCalledWith('<p>Old text about voice.</p>', true);
  });

  it('the Explainer button opens a menu of templates and closes it again', () => {
    const ctx = setup('<p>Text</p>');
    const tools = createRichTextTools(ctx);
    const button = tools.buttons[1];
    document.body.append(button);
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    button.click();
    const menu = document.querySelector('.text-tools-menu')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect([...menu.querySelectorAll('.text-tools-menu__label')].map((el) => el.textContent)).toEqual(['Fry explainer', 'Question first']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.text-tools-menu')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('Question first adds the chosen hook above the text, which stays as written, with undo', async () => {
    const ctx = setup('<p>Old text about voice.</p>');
    const questionFirst = vi.fn(async () => ({
      question: 'Why do scientists hide the doer?',
      hooks: [
        { type: 'contradiction' as const, html: '<p>Scientists are told to be clear.</p>' },
        { type: 'prediction' as const, html: '<p>Which sentence sounds more certain?</p>' },
        { type: 'dilemma' as const, html: '<p>Name the doer, or name the result?</p>' }
      ]
    }));
    const tools = createRichTextTools({ ...ctx, questionFirst });
    pickTemplate(tools.buttons[1], 'question_first');
    const dialog = await waitForDialog('.text-tools-review--hooks');
    expect(questionFirst).toHaveBeenCalledWith('<p>Old text about voice.</p>');
    expect(ctx.tiptap.setHtml).not.toHaveBeenCalled();
    expect(dialog.querySelector('.text-tools-review__question')?.textContent).toBe('Your text answers: Why do scientists hide the doer?');
    expect([...dialog.querySelectorAll('.text-tools-hook__type')].map((el) => el.textContent)).toEqual(['Contradiction', 'Prediction', 'Dilemma']);
    expect(dialog.querySelector('.text-tools-review__length')?.textContent).toBe('Adds 6 words above your text. Your text stays as written.');

    const prediction = dialog.querySelector<HTMLInputElement>('input[value="prediction"]')!;
    prediction.checked = true;
    prediction.dispatchEvent(new Event('change'));
    expect(dialog.querySelector('.text-tools-review__length')?.textContent).toBe('Adds 5 words above your text. Your text stays as written.');
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Add above text')!.click();
    expect(ctx.tiptap.setHtml).toHaveBeenCalledWith('<p>Which sentence sounds more certain?</p><p>Old text about voice.</p>', true);

    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Undo')?.click();
    expect(ctx.tiptap.setHtml).toHaveBeenLastCalledWith('<p>Old text about voice.</p>', true);
  });

  it('a failed Question first shows the server message and changes nothing', async () => {
    const ctx = setup('<p>Short.</p>');
    const tools = createRichTextTools({
      ...ctx,
      questionFirst: async () => {
        throw new Error('There is not enough here to write a hook for.');
      }
    });
    pickTemplate(tools.buttons[1], 'question_first');
    await vi.waitFor(() => expect(tools.status.textContent).toBe('There is not enough here to write a hook for.'));
    expect(ctx.tiptap.setHtml).not.toHaveBeenCalled();
    expect(document.querySelector('.text-tools-review')).toBeNull();
  });

  it('the Question first preview offers Add and Discard and Discard changes nothing', () => {
    const onAdd = vi.fn();
    const dialog = openQuestionFirstReview({ question: '', hooks: [{ type: 'dilemma', html: '<p>Wall or beach?</p>' }] }, onAdd);
    expect(dialog.querySelector('h2')?.textContent).toBe('Question first');
    expect(dialog.querySelector('.text-tools-review__question')).toBeNull();
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Add above text', 'Discard']);
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Discard')!.click();
    expect(onAdd).not.toHaveBeenCalled();
    expect(document.querySelector('.text-tools-review')).toBeNull();
  });

  it('the Fry preview always offers Replace and Discard, never a refusal', () => {
    const dialog = openFryReview({ html: '<p>Why does a poem need a stage?</p>' }, '<p>Course intro</p>', () => {});
    expect(dialog.querySelector('h2')?.textContent).toBe('Fry explainer');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Replace text', 'Discard']);
  });
});

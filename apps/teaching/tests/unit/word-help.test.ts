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
import { createRichTextTools, openFryReview } from '@/blocks/rich-text-tools';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';

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
    await vi.waitFor(() => expect(bar.textContent).toContain('No tricky words in this block.'));
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

  it('Dictionary scan saves cards on the block settings and lists them', async () => {
    const ctx = setup('<p>The ephemeral glow.</p>');
    const tools = createRichTextTools({ ...ctx, scan: async () => [entry('ephemeral')] });
    document.body.append(tools.status, tools.strip);
    expect(tools.buttons.map((b) => b.textContent)).toEqual(['Dictionary scan', 'Fry explainer']);
    expect(tools.strip.hidden).toBe(true);

    tools.buttons[0].click();
    await vi.waitFor(() => expect(ctx.onChange).toHaveBeenCalled());
    expect(ctx.getLatest().settings.word_help).toMatchObject({ words: [entry('ephemeral')] });
    expect(tools.strip.hidden).toBe(false);
    expect(tools.strip.textContent).toContain('1 word lit for students');

    tools.strip.querySelector<HTMLButtonElement>('.word-help-strip__clear')!.click();
    expect(ctx.getLatest().settings.word_help).toBeUndefined();
    expect(tools.strip.hidden).toBe(true);
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
    const tools = createRichTextTools({ ...ctx, rewrite: async () => ({ declined: false, html: '<p>Just do it.</p>' }) });
    tools.buttons[1].click();
    const dialog = await vi.waitFor(() => {
      const found = document.querySelector('.text-tools-review');
      if (!found) throw new Error('no dialog yet');
      return found;
    });
    expect(ctx.tiptap.setHtml).not.toHaveBeenCalled();
    expect(dialog.querySelector('.text-tools-review__preview')?.innerHTML).toBe('<p>Just do it.</p>');
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Replace text')!.click();
    expect(ctx.tiptap.setHtml).toHaveBeenCalledWith('<p>Just do it.</p>', true);
    const undo = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Undo');
    undo?.click();
    expect(ctx.tiptap.setHtml).toHaveBeenLastCalledWith('<p>Old text about voice.</p>', true);
  });

  it('a declined Fry rewrite explains why and offers no replace', () => {
    const dialog = openFryReview({ declined: true, reason: 'This is a procedure.' }, () => {});
    expect(dialog.textContent).toContain('This is a procedure.');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Close']);
  });
});

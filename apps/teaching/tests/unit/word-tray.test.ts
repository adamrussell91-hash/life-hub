import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WordHelpEntry } from '@/blocks/word-help';
import { copiedStorageKey, createWordTray } from '@/blocks/word-tray';
import { createRichTextTools } from '@/blocks/rich-text-tools';
import { renderBlock } from '@/blocks/render';
import { LESSON_BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

type RichText = Extract<Block, { block_type: 'rich_text' }>;

const entry = (word: string, extra: Partial<WordHelpEntry> = {}): WordHelpEntry => ({
  word,
  kind: 'technical',
  part_of_speech: 'noun',
  pronunciation: 'say-it',
  definition: `Meaning of ${word}.`,
  etymology: 'From Greek.',
  example: '',
  ...extra
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value)
  } as Storage;
}

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

function press(root: ParentNode, text: string): void {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`No button "${text}"`);
  button.click();
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('word tray', () => {
  it('shows pinned words as pills and opens one word at a time under the text', () => {
    const tray = createWordTray({
      lessonId: 'l1',
      pinned: [entry('paradox'), entry('orthodox')],
      copyStep: true,
      storage: memoryStorage()
    });
    document.body.append(tray.root);
    const pills = tray.root.querySelectorAll<HTMLButtonElement>('.word-tray__pill');
    expect([...pills].map((p) => p.textContent)).toEqual(['paradox›', 'orthodox›']);
    const panel = tray.root.querySelector<HTMLElement>('.word-tray__panel')!;
    expect(panel.hidden).toBe(true);

    pills[0].click();
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.word-tray__word')?.textContent).toBe('paradox');
    expect(pills[0].getAttribute('aria-expanded')).toBe('true');

    pills[1].click();
    expect(panel.querySelector('.word-tray__word')?.textContent).toBe('orthodox');
    expect(pills[0].getAttribute('aria-expanded')).toBe('false');

    pills[1].click();
    expect(panel.hidden).toBe(true);
  });

  it('a family word starts in Play with the word, built from the tapped word', () => {
    const tray = createWordTray({ lessonId: 'l1', pinned: [entry('paradox')], copyStep: true, storage: memoryStorage() });
    document.body.append(tray.root);
    tray.open(entry('paradox'));
    const steps = [...tray.root.querySelectorAll('.word-tray__step')].map((s) => s.textContent);
    expect(steps).toEqual(['1Play with the word', '2Copy it down']);
    expect(tray.root.querySelector('.morph-matrix__result .morph-matrix__word')?.textContent).toBe('paradox');
    expect(tray.root.querySelector('.morph-matrix__chip[aria-pressed="true"]')?.textContent).toBe('para-');
  });

  it('Copy it down lays out the book page and ticks the pill once copied', () => {
    const storage = memoryStorage();
    const tray = createWordTray({ lessonId: 'l1', pinned: [entry('paradox')], copyStep: true, storage });
    document.body.append(tray.root);
    tray.open(entry('paradox'));
    press(tray.root, 'Copy it down →');
    const book = tray.root.querySelector('.word-tray__book')!;
    expect(book.textContent).toContain('Means:');
    expect(book.textContent).toContain('I built:');
    expect([...book.querySelectorAll('.morph-matrix__tile')].map((t) => t.textContent)).toEqual(['para', 'dox']);

    press(tray.root, "I've copied it into my book");
    expect(tray.root.querySelector('.word-tray__check')?.textContent).toBe('✓ Copied into my book');
    expect(tray.root.querySelector('.word-tray__pill .word-tray__tick')).not.toBeNull();
    expect(JSON.parse(storage.getItem(copiedStorageKey('l1'))!)).toEqual(['paradox']);
  });

  it('a word with no family gets only Copy it down; with the step off, just the meaning', () => {
    const tray = createWordTray({ lessonId: 'l1', pinned: [], copyStep: true, storage: memoryStorage() });
    document.body.append(tray.root);
    tray.open(entry('ephemeral'));
    expect(tray.root.querySelector('.word-tray__steps')).toBeNull();
    expect(tray.root.querySelector('.word-tray__book')?.textContent).not.toContain('I built:');

    const plain = createWordTray({ lessonId: 'l1', pinned: [], copyStep: false, storage: memoryStorage() });
    plain.open(entry('ephemeral'));
    expect(plain.root.querySelector('.word-tray__book, .word-tray__steps')).toBeNull();
    expect(plain.root.querySelector('.word-tray__def')?.textContent).toBe('Meaning of ephemeral.');
  });

  it('in a lesson a lit word opens the tray, not the floating card; elsewhere the card stays', () => {
    const settings = { word_help: { words: [entry('paradox', { pinned: true }), entry('glow')], scanned_at: 'x' } };
    const el = renderBlock(richText('<p>A paradox in the glow.</p>', settings), 'student', { lessonId: 'l1' });
    document.body.append(el);
    expect([...el.querySelectorAll('.word-tray__pill')].map((p) => p.textContent)).toEqual(['paradox›']);
    const glow = [...el.querySelectorAll<HTMLButtonElement>('.word-help-term')].find((t) => t.textContent === 'glow')!;
    glow.click();
    expect(document.querySelector('.word-card')).toBeNull();
    expect(el.querySelector('.word-tray__word')?.textContent).toBe('glow');

    const page = renderBlock(richText('<p>A paradox in the glow.</p>', settings), 'student', {});
    document.body.append(page);
    expect(page.querySelector('.word-tray')).toBeNull();
    page.querySelector<HTMLButtonElement>('.word-help-term')!.click();
    expect(document.querySelector('.word-card')).not.toBeNull();
  });

  it('a pinned word the text no longer holds leaves the strip; a typed-in word stays', () => {
    const settings = {
      word_help: { words: [entry('gone', { pinned: true }), entry('anomaly', { added: true })], scanned_at: 'x' }
    };
    const el = renderBlock(richText('<p>Some text.</p>', settings), 'student', { lessonId: 'l1' });
    expect([...el.querySelectorAll('.word-tray__pill')].map((p) => p.textContent)).toEqual(['anomaly›']);
  });
});

describe('teacher word strip', () => {
  function setup(html: string, settings: Record<string, unknown> = {}) {
    let latest = richText(html, settings);
    const tiptap = { host: document.createElement('div'), getHtml: () => html, setHtml: vi.fn() };
    const onChange = vi.fn((next: RichText) => {
      latest = next;
    });
    return { tiptap, onChange, getLatest: () => latest };
  }

  it('pins scanned words, adds a typed word, and turns the copy step off', () => {
    const ctx = setup('<p>The ephemeral glow.</p>', { word_help: { words: [entry('ephemeral')], scanned_at: 'x' } });
    const tools = createRichTextTools(ctx);
    document.body.append(tools.strip);
    const words = () => (ctx.getLatest().settings.word_help as { words: WordHelpEntry[] }).words;

    press(tools.strip, 'ephemeral');
    expect(words()[0]?.pinned).toBe(true);

    press(tools.strip, '+ Add word');
    const [term, meaning] = tools.strip.querySelectorAll<HTMLInputElement>('.word-help-strip__add-form input');
    term.value = 'anomaly';
    meaning.value = 'Something unusual.';
    tools.strip.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(words()[1]).toMatchObject({ word: 'anomaly', definition: 'Something unusual.', added: true, pinned: true });

    const copy = tools.strip.querySelector<HTMLInputElement>('.word-help-strip__copy input')!;
    expect(copy.checked).toBe(true);
    copy.checked = false;
    copy.dispatchEvent(new Event('change'));
    expect(ctx.getLatest().settings.word_help).toMatchObject({ copy_step: false });

    press(tools.strip, 'Clear');
    expect(words().map((w) => w.word)).toEqual(['anomaly']);
  });

  it('a fresh scan keeps the teacher pins and typed words', async () => {
    const ctx = setup('<p>The ephemeral glow.</p>', {
      word_help: { words: [entry('ephemeral', { pinned: true }), entry('anomaly', { added: true })], scanned_at: 'x' }
    });
    const tools = createRichTextTools({ ...ctx, scan: async () => [entry('ephemeral'), entry('glow')] });
    tools.buttons[0].click();
    await vi.waitFor(() => expect(ctx.onChange).toHaveBeenCalledTimes(2));
    const words = (ctx.getLatest().settings.word_help as { words: WordHelpEntry[] }).words;
    expect(words.map((w) => [w.word, Boolean(w.pinned)])).toEqual([
      ['ephemeral', true],
      ['glow', false],
      ['anomaly', true]
    ]);
  });
});

describe('block menus', () => {
  it('Definition leaves the lesson menu but stays on the homepage', () => {
    expect(LESSON_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('definition');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).toContain('definition');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WordHelpEntry } from '@/blocks/word-help';
import { createWordTray } from '@/blocks/word-tray';
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
    const tray = createWordTray({ pinned: [entry('paradox'), entry('orthodox')], storage: memoryStorage() });
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

  it('a family word shows the matrix built from the tapped word, with no copy-down page', () => {
    const tray = createWordTray({ pinned: [entry('paradox')], storage: memoryStorage() });
    document.body.append(tray.root);
    tray.open(entry('paradox'));
    expect(tray.root.querySelector('.morph-matrix__result .morph-matrix__word')?.textContent).toBe('paradox');
    expect(tray.root.querySelector('.morph-matrix__chip[aria-pressed="true"]')?.textContent).toBe('para-');
    expect(tray.root.textContent).not.toContain('Copy it down');
  });

  it('a word with no family shows just its meaning', () => {
    const tray = createWordTray({ pinned: [], storage: memoryStorage() });
    tray.open(entry('ephemeral'));
    expect(tray.root.querySelector('.morph-matrix')).toBeNull();
    expect(tray.root.querySelector('.word-tray__def')?.textContent).toBe('Meaning of ephemeral.');
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

  it('pins scanned words and adds a typed word', () => {
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

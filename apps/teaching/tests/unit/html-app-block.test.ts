import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import type { Block } from '@/schemas/block';
import { PublishableLessonSchema } from '@/schemas/lesson';
import { BLOCK_GROUPS, NEW_BLOCK_TYPES, createBlock } from '@/blocks/create-block';
import { findBlockById } from '@/blocks/find-block';
import {
  clampHtmlAppAiRequest,
  resolveHtmlAppAiLane,
  HTML_APP_AI_MAX_MESSAGES,
  HTML_APP_AI_MAX_CONTENT_CHARS
} from '@/blocks/html-app-ai';
import { buildHtmlAppSrcdoc } from '@/blocks/html-app-srcdoc';
import { renderHtmlAppBlock, renderBlock } from '@/blocks/render';
import { createHtmlAppEditor } from '@/blocks/editors';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'large',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('html_app schema', () => {
  it('parses without ai', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: { html: '<p>Hi</p>', height_px: 480 }
    });
    expect(block.block_type).toBe('html_app');
    if (block.block_type !== 'html_app') return;
    expect(block.content.ai).toBeUndefined();
  });

  it('parses with ai lane', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: {
        html: '<button>Go</button>',
        title: 'Sort',
        height_px: 400,
        ai: {
          enabled: true,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          system: 'Stay in character as a sorting coach.',
          max_tokens: 512
        }
      }
    });
    if (block.block_type !== 'html_app') return;
    expect(block.content.ai?.provider).toBe('anthropic');
  });

  it('rejects bad provider', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'html_app',
        content: {
          html: 'x',
          ai: {
            enabled: true,
            provider: 'gemini',
            model: 'x',
            system: 'y',
            max_tokens: 100
          }
        }
      })
    ).toThrow();
  });
});

describe('createBlock html_app', () => {
  it('defaults empty html, height 480, no ai', () => {
    const block = createBlock('html_app', 'h1');
    expect(block.block_type).toBe('html_app');
    if (block.block_type !== 'html_app') return;
    expect(block.content.html).toBe('');
    expect(block.content.height_px).toBe(480);
    expect(block.content.ai).toBeUndefined();
  });

  it('lists under Basic', () => {
    expect(NEW_BLOCK_TYPES).toContain('html_app');
    const basic = BLOCK_GROUPS.find((g) => g.label === 'Basic');
    expect(basic?.types).toContain('html_app');
  });
});

describe('html_app publish', () => {
  const validLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'L',
    slug: 'l',
    unit_id: 'unit_1',
    sequence: 1,
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const,
    blocks: [] as unknown[]
  };

  it('rejects empty html', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [{ ...baseBlock, block_type: 'html_app', content: { html: '  ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects ai without system', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'html_app',
          content: {
            html: '<p>x</p>',
            ai: {
              enabled: true,
              provider: 'openai',
              model: 'gpt-4o-mini',
              system: '   ',
              max_tokens: 512
            }
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('accepts html with ai lane', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'html_app',
          content: {
            html: '<p>x</p>',
            ai: {
              enabled: true,
              provider: 'openai',
              model: 'gpt-4o-mini',
              system: 'Focus on metaphors only.',
              max_tokens: 512
            }
          }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});

describe('findBlockById', () => {
  it('finds nested html_app in columns', () => {
    const nested = {
      ...baseBlock,
      id: 'app_1',
      block_type: 'html_app' as const,
      content: { html: '<p>x</p>' }
    };
    const columns = {
      ...baseBlock,
      id: 'col_1',
      block_type: 'columns' as const,
      content: {
        preset: '50-50' as const,
        columns: [
          { width: 6, blocks: [nested] },
          { width: 6, blocks: [] }
        ]
      }
    };
    expect(findBlockById([columns as Block], 'app_1')?.id).toBe('app_1');
  });
});

describe('html-app-ai helpers', () => {
  it('clamps max_tokens via resolveHtmlAppAiLane', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: {
        html: '<p>x</p>',
        ai: {
          enabled: true,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system: 'Stay on topic.',
          max_tokens: 1800
        }
      }
    });
    const lane = resolveHtmlAppAiLane(block);
    expect(lane?.provider).toBe('openai');
    expect(lane?.max_tokens).toBe(1800);
  });

  it('returns null when ai missing', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: { html: '<p>x</p>' }
    });
    expect(resolveHtmlAppAiLane(block)).toBeNull();
  });

  it('clamps messages and total chars', () => {
    const messages = Array.from({ length: 30 }, () => ({
      role: 'user' as const,
      content: 'x'.repeat(1000)
    }));
    const clamped = clampHtmlAppAiRequest(messages);
    expect(clamped.length).toBeLessThanOrEqual(HTML_APP_AI_MAX_MESSAGES);
    const total = clamped.reduce((n, m) => n + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(HTML_APP_AI_MAX_CONTENT_CHARS);
  });
});

describe('html-app srcdoc', () => {
  it('wraps fragments and injects AI bootstrap when requested', () => {
    const doc = buildHtmlAppSrcdoc('<button id="b">Go</button>', {
      injectAi: true,
      lessonId: 'lesson_1',
      blockId: 'block_001',
      apiBaseUrl: 'https://api.example.com'
    });
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('TeachingHubAI');
    expect(doc).toContain('lesson_1');
    expect(doc).toContain('/api/html-app-ai');
  });

  it('skips bootstrap when injectAi false', () => {
    const doc = buildHtmlAppSrcdoc('<p>x</p>', { injectAi: false });
    expect(doc).not.toContain('TeachingHubAI');
  });
});

describe('renderHtmlAppBlock', () => {
  it('sets sandbox without allow-same-origin', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: { html: '<p>Hi</p>', height_px: 320 }
    });
    if (block.block_type !== 'html_app') return;
    const el = renderHtmlAppBlock(block, 'student', { lessonId: 'lesson_1' });
    const iframe = el.querySelector('iframe');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.style.height).toBe('320px');
  });

  it('injects bootstrap only when ai present', () => {
    const withAi = BlockSchema.parse({
      ...baseBlock,
      id: 'with_ai',
      block_type: 'html_app',
      content: {
        html: '<p>x</p>',
        ai: {
          enabled: true,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system: 'Focus.',
          max_tokens: 256
        }
      }
    });
    if (withAi.block_type !== 'html_app') return;
    const el = renderBlock(withAi, 'student', { lessonId: 'lesson_1' });
    const srcdoc = el.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('TeachingHubAI');
  });
});

describe('html_app editor', () => {
  it('toggles ai fields into content', () => {
    const block = createBlock('html_app', 'e1');
    if (block.block_type !== 'html_app') return;
    let latest = block;
    const el = createHtmlAppEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );
    const html = el.querySelector('textarea.block-editor__html-app-html') as HTMLTextAreaElement;
    html.value = '<p>Hi</p>';
    html.dispatchEvent(new Event('input'));
    expect(latest.content.html).toBe('<p>Hi</p>');

    const toggle = el.querySelector('input.block-editor__html-app-ai-enabled') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(latest.content.ai?.enabled).toBe(true);
    expect(latest.content.ai?.provider).toBe('openai');
  });
});

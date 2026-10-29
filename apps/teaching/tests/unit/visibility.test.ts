import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { createBlock } from '@/blocks/create-block';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import type { Block } from '@/schemas/block';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stripFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/annotation-teacher-strip.json'), 'utf8')
) as {
  sentinel: string;
  teacher_layer_id: string;
  teacher_only_block_id: string;
  annotation: Block;
  flashcards: Block;
  teacher_only_block: Block;
  ok_block: Block;
};

function assertTeacherNotesGone(blocks: Block[]): void {
  const json = JSON.stringify(blocks);
  expect(json).not.toContain(stripFixture.sentinel);
  expect(json).not.toContain(stripFixture.teacher_layer_id);
  expect(json).not.toContain('"kind":"teacher"');
  expect(json).not.toContain(stripFixture.teacher_only_block_id);
}

describe('filterBlocksForStudent', () => {
  it('drops teacher_only blocks for students', () => {
    const blocks: Block[] = [
      createBlock('rich_text', 'a'),
      (() => {
        const b = createBlock('rich_text', 'b');
        b.visibility = 'teacher_only';
        return b;
      })()
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out.map((b) => b.id)).toEqual(['a']);
  });

  it('keeps all student_teacher blocks', () => {
    const blocks: Block[] = [createBlock('rich_text', 'a'), createBlock('rich_text', 'c')];
    const out = filterBlocksForStudent(blocks);
    expect(out.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when all blocks are teacher_only', () => {
    const blocks: Block[] = [
      (() => {
        const b = createBlock('rich_text', 'x');
        b.visibility = 'teacher_only';
        return b;
      })(),
      (() => {
        const b = createBlock('rich_text', 'y');
        b.visibility = 'teacher_only';
        return b;
      })()
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out).toEqual([]);
  });

  it('recursively drops teacher_only children inside section and columns', () => {
    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    const visible = createBlock('rich_text', 'vis');
    const hidden = createBlock('rich_text', 'hid');
    hidden.visibility = 'teacher_only';
    section.content.blocks = [visible, hidden] as typeof section.content.blocks;

    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    const colHidden = createBlock('rich_text', 'col_hid');
    colHidden.visibility = 'teacher_only';
    columns.content.columns[0]!.blocks = [createBlock('rich_text', 'col_vis'), colHidden] as typeof columns.content.columns[0]['blocks'];
    section.content.blocks.push(columns);

    const out = filterBlocksForStudent([section]);
    expect(out).toHaveLength(1);
    const s = out[0]!;
    if (s.block_type !== 'section') throw new Error('expected section');
    expect(s.content.blocks.map((b) => b.id)).toEqual(['vis', 'cols']);
    const c = s.content.blocks[1]!;
    if (c.block_type !== 'columns') throw new Error('expected columns');
    expect(c.content.columns[0]!.blocks.map((b) => b.id)).toEqual(['col_vis']);
  });

  it('drops a lecture scene script, inside chapters too', () => {
    const heading = { ...createBlock('heading', 'h1'), content: { text: 'Scene', script: 'Say this first.' } } as Block;
    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    section.content.blocks = [{ ...heading, id: 'h2' }] as typeof section.content.blocks;
    const out = filterBlocksForStudent([heading, section]);
    expect(JSON.stringify(out)).not.toContain('Say this first.');
    expect(out[0]!.content).toEqual({ text: 'Scene' });
  });

  it('drops an entire teacher_only section', () => {
    const section = createBlock('section', 'sec');
    section.visibility = 'teacher_only';
    expect(filterBlocksForStudent([section])).toEqual([]);
  });

  it('recursively drops teacher_only children inside tabs panels', () => {
    const tabs = createBlock('tabs', 'tabs1');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    const visible = createBlock('rich_text', 'vis');
    const hidden = createBlock('rich_text', 'hid');
    hidden.visibility = 'teacher_only';
    tabs.content.tabs[0]!.blocks = [visible, hidden] as (typeof tabs.content.tabs)[number]['blocks'];

    const out = filterBlocksForStudent([tabs]);
    expect(out).toHaveLength(1);
    const t = out[0]!;
    if (t.block_type !== 'tabs') throw new Error('expected tabs');
    expect(t.content.tabs[0]!.blocks.map((b) => b.id)).toEqual(['vis']);
  });

  it('strips annotation teacher layers at top level', () => {
    const out = sanitizeBlocksDeep(
      filterBlocksForStudent([
        structuredClone(stripFixture.annotation),
        structuredClone(stripFixture.flashcards),
        structuredClone(stripFixture.teacher_only_block),
        structuredClone(stripFixture.ok_block)
      ])
    );
    assertTeacherNotesGone(out);
    const ann = out.find((b) => b.block_type === 'annotation');
    expect(ann?.block_type).toBe('annotation');
    if (ann?.block_type !== 'annotation') return;
    expect(ann.content.layers.map((l) => l.id)).toEqual(['layer_structure', 'layer_voice']);
    expect(ann.content.annotations.map((a) => a.id)).toEqual(['ann_student', 'ann_thread']);
    expect(ann.content.annotations[0]!.body.attachments).toEqual([
      { kind: 'block', block_id: 'block_ok_resource' },
      { kind: 'link', url: 'https://example.com', label: 'ok' }
    ]);
    expect(ann.content.voice_tracks).toHaveLength(1);
    const track = ann.content.voice_tracks![0]!;
    expect(track.id).toBe('track_published');
    expect(track.transcript.words).toEqual([]);
    expect(track.clips.map((c) => c.id)).toEqual(['clip_approved']);
    expect(track.extras?.map((e) => e.id)).toEqual(['extra_ok']);
    const cards = out.find((b) => b.block_type === 'flashcards');
    expect(cards?.block_type).toBe('flashcards');
    if (cards?.block_type !== 'flashcards') return;
    expect(cards.content.cards[0]).not.toHaveProperty('source');
  });

  it('strips annotation teacher layers inside section, columns, and tabs', () => {
    const annotation = structuredClone(stripFixture.annotation);
    const teacherOnly = structuredClone(stripFixture.teacher_only_block);
    const ok = structuredClone(stripFixture.ok_block);

    const section = createBlock('section', 'sec_strip');
    if (section.block_type !== 'section') throw new Error('expected section');
    section.content.blocks = [
      annotation,
      structuredClone(stripFixture.flashcards),
      teacherOnly,
      ok
    ] as typeof section.content.blocks;

    const columns = createBlock('columns', 'cols_strip');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    columns.content.columns[0]!.blocks = [
      structuredClone(stripFixture.annotation),
      structuredClone(stripFixture.teacher_only_block)
    ] as (typeof columns.content.columns)[number]['blocks'];

    const tabs = createBlock('tabs', 'tabs_strip');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    tabs.content.tabs[0]!.blocks = [
      structuredClone(stripFixture.annotation),
      structuredClone(stripFixture.teacher_only_block)
    ] as (typeof tabs.content.tabs)[number]['blocks'];

    const out = sanitizeBlocksDeep(filterBlocksForStudent([section, columns, tabs]));
    assertTeacherNotesGone(out);
  });

  it('drops a Teacher-style callout even when it is marked for students', () => {
    const teacher = createBlock('callout', 'mine');
    const shared = createBlock('callout', 'theirs');
    if (teacher.block_type !== 'callout') throw new Error('expected callout');
    teacher.content.style = 'teacher';
    expect(filterBlocksForStudent([teacher, shared]).map((b) => b.id)).toEqual(['theirs']);
  });
});

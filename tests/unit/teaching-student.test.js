import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  filterBlocksForStudent,
  sanitizeBlocksDeep,
  sanitizeRichTextHtml
} from '../../netlify/functions/_shared/teaching-student.mjs';

const stripFixture = JSON.parse(
  readFileSync(
    new URL('../../apps/teaching/fixtures/annotation-teacher-strip.json', import.meta.url),
    'utf8'
  )
);

function assertTeacherNotesGone(blocks) {
  const json = JSON.stringify(blocks);
  assert.doesNotMatch(json, new RegExp(stripFixture.sentinel));
  assert.doesNotMatch(json, new RegExp(stripFixture.teacher_layer_id));
  assert.doesNotMatch(json, /"kind":"teacher"/);
  assert.doesNotMatch(json, new RegExp(stripFixture.teacher_only_block_id));
}

test('student block filter drops teacher-only rows', () => {
  const kept = filterBlocksForStudent([
    { id: 't', visibility: 'teacher', block_type: 'rich_text', content: { html: 'no' } },
    { id: 's', visibility: 'student_teacher', block_type: 'rich_text', content: { html: 'yes' } }
  ]);
  assert.deepEqual(kept.map(block => block.id), ['s']);
});

test('rich text sanitizer strips script and javascript hrefs', () => {
  const html = sanitizeRichTextHtml('<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
  assert.match(html, /<p>ok<\/p>/);
  assert.doesNotMatch(html, /script/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('filterBlocksForStudent strips annotation teacher layers (shared fixture)', () => {
  const out = sanitizeBlocksDeep(
    filterBlocksForStudent([
      structuredClone(stripFixture.annotation),
      structuredClone(stripFixture.flashcards),
      structuredClone(stripFixture.teacher_only_block),
      structuredClone(stripFixture.ok_block)
    ])
  );
  assertTeacherNotesGone(out);
  const ann = out.find(block => block.block_type === 'annotation');
  assert.equal(ann.content.layers.map(layer => layer.id).join(','), 'layer_structure');
  assert.equal(
    ann.content.annotations.map(row => row.id).join(','),
    'ann_student,ann_thread'
  );
  assert.deepEqual(
    ann.content.annotations[0].body.attachments.map(att => att.block_id || att.kind),
    ['block_ok_resource', 'link']
  );
  assert.equal(ann.content.voice_tracks, undefined);
  const cards = out.find(block => block.block_type === 'flashcards');
  assert.equal(cards.content.cards[0].source, undefined);
});

test('filterBlocksForStudent strips annotation teacher layers inside section/columns/tabs', () => {
  const section = {
    id: 'sec_strip',
    block_type: 'section',
    visibility: 'student_teacher',
    content: {
      title: 'Sec',
      blocks: [
        structuredClone(stripFixture.annotation),
        structuredClone(stripFixture.flashcards),
        structuredClone(stripFixture.teacher_only_block),
        structuredClone(stripFixture.ok_block)
      ]
    }
  };
  const columns = {
    id: 'cols_strip',
    block_type: 'columns',
    visibility: 'student_teacher',
    content: {
      columns: [
        {
          id: 'col_1',
          blocks: [
            structuredClone(stripFixture.annotation),
            structuredClone(stripFixture.teacher_only_block)
          ]
        }
      ]
    }
  };
  const tabs = {
    id: 'tabs_strip',
    block_type: 'tabs',
    visibility: 'student_teacher',
    content: {
      tabs: [
        {
          id: 'tab_1',
          title: 'One',
          blocks: [
            structuredClone(stripFixture.annotation),
            structuredClone(stripFixture.teacher_only_block)
          ]
        }
      ]
    }
  };
  assertTeacherNotesGone(sanitizeBlocksDeep(filterBlocksForStudent([section, columns, tabs])));
});

test('sanitizeBlocksDeep cleans annotation body html', async () => {
  const cleaned = sanitizeBlocksDeep([
    {
      id: 'a1',
      block_type: 'annotation',
      visibility: 'student_teacher',
      content: {
        text: { kind: 'verse', stanzas: [{ id: 's1', lines: [{ id: 'l1', text: 'Hello' }] }] },
        layers: [],
        annotations: [
          {
            id: 'n1',
            layer_id: 'layer_1',
            anchor: {
              granularity: 'word',
              stanza: 's1',
              line: 'l1',
              start: 0,
              end: 5,
              quote: { exact: 'Hello' }
            },
            body: {
              html: '<p>ok</p><script>alert(1)</script><img onerror="x" src="y"><a href="javascript:alert(1)">x</a>',
              attachments: []
            }
          }
        ],
        settings: { show_markers: true }
      }
    }
  ]);
  const html = cleaned[0].content.annotations[0].body.html;
  assert.match(html, /ok/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('public Teaching handlers call isPublicStudentApi and never the session cookie', async () => {
  const gate = await readFile(new URL('../../netlify/functions/_shared/public-student-gate.mjs', import.meta.url), 'utf8');
  assert.match(gate, /isPublicStudentApi/);
  assert.doesNotMatch(gate, /readUmbrellaSessionCookie|verifySessionToken|LIFE_HUB_PASSPHRASE/);

  for (const name of ['published-lesson', 'published-unit', 'published-class', 'media-file', 'html-app-ai']) {
    const source = await readFile(new URL(`../../netlify/functions/${name}.mjs`, import.meta.url), 'utf8');
    assert.match(source, /createPublicStudentHandler/, name);
    assert.doesNotMatch(source, /readUmbrellaSessionCookie/, name);
  }
});

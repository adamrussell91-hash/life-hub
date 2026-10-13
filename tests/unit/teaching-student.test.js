import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  filterBlocksForStudent,
  sanitizeRichTextHtml
} from '../../netlify/functions/_shared/teaching-student.mjs';

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

test('sanitizeBlocksDeep cleans annotation body html', async () => {
  const { sanitizeBlocksDeep } = await import('../../netlify/functions/_shared/teaching-student.mjs');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { newId } from '../../netlify/functions/_shared/teaching-blobs.mjs';
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

test('filterBlocksForStudent keeps With teacher talking points off the student copy', () => {
  const block = { id: 'w1', type: 'block', block_type: 'with_teacher', variant: 'medium', visibility: 'student_teacher', content: { talking_points: ['Ask about the ending'] } };
  const [out] = filterBlocksForStudent([{ type: 'block', block_type: 'section', id: 's1', visibility: 'student_teacher', content: { blocks: [block] } }]);
  assert.deepEqual(out.content.blocks[0].content.talking_points, []);
});

test('filterBlocksForStudent drops Teacher-style callouts', () => {
  const callout = (id, style) => ({ id, type: 'block', block_type: 'callout', variant: 'medium', visibility: 'student_teacher', content: { style, body: id } });
  const out = filterBlocksForStudent([callout('mine', 'teacher'), callout('theirs', 'important')]);
  assert.deepEqual(out.map(b => b.id), ['theirs']);
});

test('sanitizeRichTextHtml drops disguised script links and handlers', () => {
  const html = sanitizeRichTextHtml(
    '<a href="java&#9;script:alert(1)">a</a><a href=" JAVASCRIPT:x">b</a><a href="data:text/html,x">c</a>' +
      '<svg/onload=alert(1)></svg><img src=x onerror=alert(1)><a href="https://ok.example/p">d</a><a href="/lesson">e</a>'
  );
  assert.doesNotMatch(html, /script:|data:|onload|onerror/i);
  assert.match(html, /href="https:\/\/ok\.example\/p"/);
  assert.match(html, /href="\/lesson"/);
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
  assert.equal(ann.content.layers.map(layer => layer.id).join(','), 'layer_structure,layer_voice');
  assert.equal(
    ann.content.annotations.map(row => row.id).join(','),
    'ann_student,ann_thread'
  );
  assert.deepEqual(
    ann.content.annotations[0].body.attachments.map(att => att.block_id || att.kind),
    ['block_ok_resource', 'link']
  );
  assert.equal(ann.content.voice_tracks.length, 1);
  assert.equal(ann.content.voice_tracks[0].id, 'track_published');
  assert.deepEqual(ann.content.voice_tracks[0].transcript.words, []);
  assert.deepEqual(
    ann.content.voice_tracks[0].clips.map(clip => clip.id),
    ['clip_approved']
  );
  assert.deepEqual(
    ann.content.voice_tracks[0].extras.map(extra => extra.id),
    ['extra_ok']
  );
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

  for (const name of ['published-lesson', 'published-unit', 'published-class', 'html-app-ai']) {
    const source = await readFile(new URL(`../../netlify/functions/${name}.mjs`, import.meta.url), 'utf8');
    assert.match(source, /createPublicStudentHandler/, name);
    assert.doesNotMatch(source, /readUmbrellaSessionCookie/, name);
  }
  // media-file is public too, but serves only media a live student page uses. The
  // owner's session may widen that to the whole library (library previews); it is read
  // in one helper and never gates what a student can already see.
  const media = await readFile(new URL('../../netlify/functions/media-file.mjs', import.meta.url), 'utf8');
  assert.match(media, /createPublicStudentHandler/);
  assert.equal(media.match(/readUmbrellaSessionCookie\(/g)?.length, 1);
  assert.match(media, /async function hasOwnerSession\(/);
  assert.match(media, /!owner && !\(await isPubliclyReferenced\(/);
});

test('filterBlocksForStudent strips Thinking Toolkit teacher notes and class notes (shared fixture)', () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('../../apps/teaching/fixtures/toolkit-teacher-strip.json', import.meta.url),
      'utf8'
    )
  );
  const kept = filterBlocksForStudent(fixture.blocks);
  const json = JSON.stringify(kept);
  assert.doesNotMatch(json, new RegExp(fixture.sentinel));
  assert.doesNotMatch(json, /"teacher_note"/);
  assert.doesNotMatch(json, /"teacher_jots"/);
  for (const id of fixture.kept_block_ids) assert.match(json, new RegExp(`"id":"${id}"`));
  for (const id of fixture.dropped_block_ids) assert.doesNotMatch(json, new RegExp(`"id":"${id}"`));
});

test('filterBlocksForStudent drops a lecture scene script, keeping its narration', () => {
  const heading = {
    id: 'h1', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher',
    content: { text: 'Scene', script: 'Say this first.', narration: { url: '/n.webm', duration_s: 4, transcript: 'Said.' } }
  };
  const section = { id: 's1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: 'C', blocks: [heading] } };
  const [top, chapter] = filterBlocksForStudent([heading, section]);
  assert.deepEqual(top.content, { text: 'Scene', narration: heading.content.narration });
  assert.equal(chapter.content.blocks[0].content.script, undefined);
});

test('new Teaching ids carry 64 random bits from the CSPRNG', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId('media')));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^media_[a-z0-9]+_[0-9a-f]{16}$/);
});

function explainerBlock(status) {
  const anchor = { granularity: 'phrase', stanza: 'stanza_1', line: 'line_1', start: 4, end: 10, quote: { exact: 'harbour' } };
  return {
    id: 'ex1',
    type: 'block',
    block_type: 'explainer',
    visibility: 'student_teacher',
    content: {
      layout: 'text',
      text: { kind: 'prose', stanzas: [{ id: 'stanza_1', lines: [{ id: 'line_1', text: 'The harbour fills with light.' }] }] },
      tray: [
        { id: 'tray_used', html: '<p onclick="x()">Used</p>' },
        { id: 'tray_spare', html: '<p>Spare</p>' }
      ],
      recording: {
        status,
        clips: [{ url: '/a.webm', mime: 'audio/webm', start_s: 0, duration_s: 5 }],
        duration_s: 5,
        events: [
          { id: 'n1', t: 1, kind: 'note', anchor, html: '<p>Note<script>bad()</script></p>', tray_id: 'tray_used' },
          { id: 'p1', t: 2, kind: 'pause', prompt: 'Think' }
        ]
      }
    }
  };
}

test('filterBlocksForStudent keeps a published explainer recording and only the tray notes it used', () => {
  const [block] = filterBlocksForStudent([{ type: 'block', block_type: 'section', id: 's1', visibility: 'student_teacher', content: { blocks: [explainerBlock('published')] } }])[0].content.blocks;
  assert.equal(block.content.recording.events.length, 2);
  assert.deepEqual(block.content.tray.map(n => n.id), ['tray_used']);
});

test('filterBlocksForStudent drops a draft explainer recording and the whole tray', () => {
  const [block] = filterBlocksForStudent([explainerBlock('draft')]);
  assert.equal(block.content.recording, undefined);
  assert.deepEqual(block.content.tray, []);
  assert.equal(block.content.text.stanzas.length, 1);
});

test('sanitizeBlocksDeep cleans explainer tray and note html', () => {
  const [block] = sanitizeBlocksDeep([explainerBlock('published')]);
  assert.doesNotMatch(block.content.tray[0].html, /onclick/);
  assert.doesNotMatch(block.content.recording.events[0].html, /script/);
  assert.equal(block.content.recording.events[1].prompt, 'Think');
});

test('sanitizeBlocksDeep drops unsafe explainer board links and keeps board events for students', () => {
  const block = explainerBlock('published');
  block.content.board_start = { format: 'excalidraw', version: 1, elements: [{ id: 'b1', type: 'rectangle', link: 'javascript:alert(1)' }], appState: {}, files: {} };
  block.content.recording.events.push({ id: 's1', t: 3, kind: 'stroke', element: { id: 'p1', type: 'freedraw', points: [[0, 0]], link: 'https://example.org' }, offsets: [0] });
  const [clean] = sanitizeBlocksDeep(filterBlocksForStudent([block]));
  assert.equal(clean.content.board_start.elements[0].link, null);
  assert.equal(clean.content.recording.events.at(-1).element.link, 'https://example.org');
});

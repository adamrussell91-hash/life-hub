import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAlchemistPrompt } from '../../netlify/functions/_shared/knowledge-alchemist.mjs';
import { runChatTurn } from '../../netlify/functions/_shared/knowledge-chat-turn.mjs';
import { runCoachTurn } from '../../netlify/functions/_shared/knowledge-coach-turn.mjs';
import { assembleClementinePrompt } from '../../netlify/functions/_shared/knowledge-prompts.mjs';
import {
  HUMANIZER_LAYER_HEADING,
  KNOWLEDGE_QUALITY_HEADING,
  formatKnowledgeQualityBlock
} from '../../netlify/functions/_shared/load-humanizer.mjs';

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

test('Knowledge assembler stays four-layer unless a quality tail is passed', () => {
  const assembled = assembleClementinePrompt({
    voice: 'You ARE Professor Clementine Haig.',
    job: 'Synthesise from the archive.',
    surface: 'chat',
    payload: 'Query: working memory'
  });
  assert.equal(assembled, [
    'You ARE Professor Clementine Haig.',
    'Synthesise from the archive.',
    'chat',
    'Query: working memory'
  ].join('\n\n'));
  assert.doesNotMatch(assembled, new RegExp(HUMANIZER_LAYER_HEADING));
});

test('Knowledge quality tail is appended once after voice, job, and research contracts', () => {
  const quality = formatKnowledgeQualityBlock();
  const assembled = assembleClementinePrompt({
    voice: 'You ARE Professor Clementine Haig.',
    job: 'Never the wrong office.',
    surface: 'Cite notes as [Title](pageId).',
    payload: 'Latest question:\nWhat is load-bearing?',
    quality
  });
  const voiceAt = assembled.indexOf('You ARE Professor Clementine Haig.');
  const citeAt = assembled.indexOf('Cite notes as [Title](pageId).');
  const qualityAt = assembled.indexOf(KNOWLEDGE_QUALITY_HEADING);
  const humanizerAt = assembled.indexOf(HUMANIZER_LAYER_HEADING);
  assert.ok(voiceAt >= 0 && citeAt > voiceAt);
  assert.ok(qualityAt > citeAt);
  assert.ok(humanizerAt > qualityAt);
  assert.equal(count(assembled, HUMANIZER_LAYER_HEADING), 1);
  assert.match(assembled, /does not change research, retrieval, hats/);
});

test('Alchemist JSON rail does not receive Humanizer', () => {
  const prompt = buildAlchemistPrompt({
    voice: 'You ARE Professor Clementine Haig.',
    job: 'University job.',
    lessonText: 'Students compare two sources.',
    retrieved: [{ title: 'Working memory', pageId: 'note-1', excerpt: 'Miller' }]
  });
  assert.match(prompt, /Return only a JSON array/);
  assert.doesNotMatch(prompt, new RegExp(HUMANIZER_LAYER_HEADING));
  assert.doesNotMatch(prompt, new RegExp(KNOWLEDGE_QUALITY_HEADING));
});

test('Knowledge chat write prompt keeps archive contracts and adds Humanizer once', async () => {
  let started;
  await runChatTurn({
    voice: 'You ARE Professor Clementine Haig.',
    universityJob: 'Never the wrong office.',
    hat: 'synthesis',
    messages: [{ role: 'user', content: 'What do the notes jointly support?' }],
    compose: true,
    priorResearch: {
      query: 'support',
      findings: [{ pageId: 'note-1', title: 'Working memory', excerpt: 'Miller' }],
      gaps: [],
      followUpQueries: []
    },
    write: {
      start: async input => {
        started = input;
        return { status: 'done', reply: 'The notes support a load limit.' };
      }
    }
  });
  assert.ok(started);
  assert.match(started.system, /Never invent a page/);
  assert.match(started.system, /\[Title\]\(pageId\)/);
  assert.match(started.system, /central claim/);
  assert.match(started.system, /Working memory/);
  assert.equal(count(started.system, HUMANIZER_LAYER_HEADING), 1);
  assert.match(started.system, /does not change research, retrieval, hats/);
  assert.equal(started.webSearch, undefined);
});

test('Knowledge coach reply prompt gets Humanizer; archive pull stays a kernel call', async () => {
  const urls = [];
  const result = await runCoachTurn({
    voice: 'You ARE Professor Clementine Haig.',
    universityJob: 'Never the wrong office.',
    messages: [{ role: 'user', content: 'What do I already have on load?' }],
    env: {
      RESEARCH_KERNEL_URL: 'https://kernel.example',
      RESEARCH_KERNEL_SHARED_SECRET: 'secret'
    },
    fetchImpl: async url => {
      urls.push(String(url));
      return new Response(JSON.stringify({
        query: 'load',
        status: 'done',
        findings: [{ pageId: 'note-1', title: 'Working memory', excerpt: 'Miller', stance: 'supports' }],
        gaps: [],
        followUpQueries: []
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    complete: async (system, messages) => {
      assert.equal(count(system, HUMANIZER_LAYER_HEADING), 1);
      assert.match(system, /Cite notes as \[Title\]\(pageId\)/);
      assert.match(system, /Never refuse a question as the wrong office/);
      assert.match(system, /Working memory/);
      assert.equal(messages[0].content, 'What do I already have on load?');
      return 'Cite [Working memory](note-1).';
    }
  });
  assert.equal(result.reply, 'Cite [Working memory](note-1).');
  assert.ok(urls.some(url => url.includes('/quick_research')));
});

test('research kernel, tidy, and Worker synthesis do not import Humanizer', () => {
  const files = [
    'netlify/functions/_shared/knowledge-alchemist.mjs',
    'netlify/functions/_shared/knowledge-research.mjs',
    'netlify/functions/_shared/knowledge-kernel.mjs',
    'netlify/functions/_shared/knowledge-tidy.mjs',
    'netlify/functions/knowledge-tidy.mjs',
    'apps/knowledge/src/clementine/assemble.ts',
    'apps/knowledge/src/research/synthesize.ts'
  ];
  for (const relative of files) {
    const text = readFileSync(join(process.cwd(), relative), 'utf8');
    assert.doesNotMatch(text, /load-humanizer|Humanizer|formatKnowledgeQualityBlock/);
  }
});

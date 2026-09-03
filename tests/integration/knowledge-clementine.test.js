import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createKnowledgeAttachmentHandler } from '../../netlify/functions/knowledge-attachment.mjs';
import { createKnowledgeAttachmentsSignHandler } from '../../netlify/functions/knowledge-attachments-sign.mjs';
import { createKnowledgeCaptureHandler } from '../../netlify/functions/knowledge-capture.mjs';
import { createKnowledgeClementineChatHandler } from '../../netlify/functions/knowledge-clementine-chat.mjs';
import { createKnowledgeClementineCoachHandler } from '../../netlify/functions/knowledge-clementine-coach.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  GITHUB_TOKEN: 'knowledge-read-token',
  GITHUB_REPOSITORY: 'adamrussell91-hash/life-hub-data',
  ANTHROPIC_API_KEY: 'anthropic-test',
  RESEARCH_KERNEL_SHARED_SECRET: 'kernel-secret',
  RESEARCH_KERNEL_URL: 'https://knowledge-hub-research.example',
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'knowledge-hub-archive',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const now = () => Date.parse('2026-08-01T01:00:00Z');
const cwd = fileURLToPath(new URL('../..', import.meta.url));

function authed(url, init = {}) {
  return new Request(url, {
    ...init,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com',
      ...(init.headers ?? {})
    }
  });
}

test('Clementine, capture, and attachments require the Life session and never load Teaching Blobs', async () => {
  let storeLoads = 0;
  const deps = {
    env,
    now,
    getContentStore: async () => {
      storeLoads += 1;
      throw new Error('Teaching Blobs must not load');
    }
  };
  const response = await createKnowledgeCaptureHandler(deps)(new Request(
    'https://api.adam-russell.com/api/knowledge/capture',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
  ));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(storeLoads, 0);
});

test('Clementine coach returns a Life envelope from Anthropic plus optional archive', async () => {
  const urls = [];
  const handler = createKnowledgeClementineCoachHandler({
    env,
    now,
    cwd,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      if (String(url).includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{ type: 'text', text: 'Cite [Working memory](note-1).' }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        query: 'memory',
        round: 1,
        status: 'done',
        findings: [{
          pageId: 'note-1',
          title: 'Working memory',
          sourceUrl: '',
          excerpt: 'Miller',
          stance: 'related',
          analysis: 'match'
        }],
        gaps: [],
        followUpQueries: []
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const response = await handler(authed('https://api.adam-russell.com/api/knowledge/clementine-coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'What is working memory?' }] })
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.data.reply, /Working memory/);
  assert.equal(body.data.research.findings[0].pageId, 'note-1');
  assert.ok(urls.some(url => url.includes('/quick_research')));
  assert.ok(urls.some(url => url.includes('anthropic.com')));
});

test('Clementine chat starts the Worker write clock behind the Life session', async () => {
  const handler = createKnowledgeClementineChatHandler({
    env,
    now,
    cwd,
    archivePull: async () => ({
      query: 'memory',
      round: 1,
      status: 'done',
      findings: [{
        pageId: 'note-1',
        title: 'Working memory',
        sourceUrl: '',
        excerpt: 'Miller',
        stance: 'related',
        analysis: 'match'
      }],
      gaps: [],
      followUpQueries: []
    }),
    write: {
      start: async input => {
        assert.match(input.system, /Clementine|archive|Working memory/i);
        return { writeSessionId: 'write-1', status: 'writing' };
      },
      poll: async () => {
        throw new Error('poll must not run on start');
      }
    }
  });
  const response = await handler(authed('https://api.adam-russell.com/api/knowledge/clementine-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hat: 'scoping',
      messages: [{ role: 'user', content: 'What do I have on working memory?' }]
    })
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, 'writing');
  assert.equal(body.data.writeSessionId, 'write-1');
});

test('Capture proxies r2_key to the research Worker', async () => {
  const handler = createKnowledgeCaptureHandler({
    env,
    now,
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://knowledge-hub-research.example/capture');
      assert.equal(init.headers['x-research-kernel-secret'], 'kernel-secret');
      assert.equal(JSON.parse(init.body).r2_key, 'notes/page_hub_aa/voice.webm');
      return new Response(JSON.stringify({ text: 'transcribed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const response = await handler(authed('https://api.adam-russell.com/api/knowledge/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ r2_key: 'notes/page_hub_aa/voice.webm' })
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.text, 'transcribed');
});

test('Attachment sign and download use S3 presign helpers, not a Blobs bind', async () => {
  const signed = await createKnowledgeAttachmentsSignHandler({
    env,
    now,
    signPut: async ({ key, bucket }) => {
      assert.equal(bucket, 'knowledge-hub-archive');
      assert.equal(key, 'notes/page_hub_aa/scan.pdf');
      return 'https://r2.example/put';
    }
  })(authed('https://api.adam-russell.com/api/knowledge/attachments-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: 'scan.pdf',
      content_type: 'application/pdf',
      byte_size: 12,
      page_id: 'page_hub_aa',
      area: 'notes'
    })
  }));
  assert.equal(signed.status, 200);
  assert.equal((await signed.json()).data.put_url, 'https://r2.example/put');

  const download = await createKnowledgeAttachmentHandler({
    env,
    now,
    fetchImpl: async url => {
      assert.match(String(url), /knowledge-hub-data\/contents\/pages\/page_hub_aa\.json/);
      return new Response(JSON.stringify({
        sha: 'a'.repeat(40),
        encoding: 'base64',
        content: Buffer.from(JSON.stringify({
          id: 'page_hub_aa',
          attachments: [{ id: 'att-1', r2_key: 'notes/page_hub_aa/scan.pdf' }]
        })).toString('base64')
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    signGet: async ({ key }) => {
      assert.equal(key, 'notes/page_hub_aa/scan.pdf');
      return 'https://r2.example/get';
    }
  })(authed('https://api.adam-russell.com/api/knowledge/attachments/page_hub_aa/att-1'));
  assert.equal(download.status, 200);
  assert.equal((await download.json()).data.url, 'https://r2.example/get');
});

test('Clementine and attachment sources never read GITHUB_REPOSITORY or bind Blobs', async () => {
  const files = [
    'netlify/functions/knowledge-clementine-coach.mjs',
    'netlify/functions/knowledge-clementine-chat.mjs',
    'netlify/functions/knowledge-capture.mjs',
    'netlify/functions/knowledge-attachments-sign.mjs',
    'netlify/functions/knowledge-attachment.mjs',
    'netlify/functions/_shared/knowledge-r2.mjs',
    'netlify/functions/_shared/knowledge-kernel.mjs'
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<!KNOWLEDGE_)GITHUB_REPOSITORY/);
    assert.doesNotMatch(source, /life-hub-data/);
    assert.doesNotMatch(source, /@netlify\/blobs/);
    assert.doesNotMatch(source, /KNOWLEDGE_HUB_PASSPHRASE_HASH/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);

// Every HTML shell the Pages build serves. Pages cannot set response headers, so the
// policy is a <meta http-equiv>; frame-ancestors, report-uri and sandbox cannot be set there.
const SHELLS = [
  'apps/life/index.html',
  'apps/life/capture-inbox.html',
  'apps/knowledge/index.html',
  'apps/knowledge/public/tools/mindmap.html',
  'apps/tasks/index.html',
  'apps/tasks/grove.html',
  'apps/tasks/line.html',
  'apps/tasks/grove-world-preview.html',
  'apps/professional/index.html',
  'apps/travel/index.html',
  'apps/teaching/index.html',
  'scripts/pages-spa-fallback.html'
];

// Teaching renders HTML-app blocks in sandboxed srcdoc iframes. A srcdoc document inherits
// the page's policy, and those apps run author-written inline scripts and CDN libraries.
const INLINE_SCRIPT_ALLOWED = new Set(['apps/teaching/index.html']);

function directives(policy) {
  return new Map(
    policy.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const [name, ...values] = part.split(/\s+/);
      return [name, values];
    })
  );
}

for (const shell of SHELLS) {
  test(`${shell} declares a Content-Security-Policy`, async () => {
    const html = await readFile(new URL(shell, root), 'utf8');
    const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/g)];
    assert.equal(metas.length, 1, 'exactly one CSP meta');
    const policyAt = metas[0].index;
    const firstScript = html.search(/<script\b/i);
    if (firstScript !== -1) assert.ok(policyAt < firstScript, 'the policy comes before any script');

    const d = directives(metas[0][1]);
    for (const [name, value] of [['default-src', "'self'"], ['object-src', "'none'"], ['base-uri', "'self'"], ['form-action', "'self'"]]) {
      assert.deepEqual(d.get(name), [value], name);
    }
    const script = d.get('script-src') ?? [];
    assert.ok(script.includes("'self'"));
    assert.ok(!script.includes("'unsafe-eval'"), 'no unsafe-eval');
    assert.ok(!script.includes('*') && !script.includes('data:') && !script.includes('blob:'));
    assert.ok(!(d.get('connect-src') ?? []).includes('*'));
    assert.ok(!(d.get('connect-src') ?? []).includes('https:'));

    if (INLINE_SCRIPT_ALLOWED.has(shell)) return;
    assert.ok(!script.includes("'unsafe-inline'"), 'no unsafe-inline scripts');
    assert.ok(!script.includes('https:'), 'no scheme-wide script source');
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, 'no inline event handlers');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      const hash = `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`;
      assert.ok(script.includes(hash), `inline script is hashed in script-src (update the policy when the script changes): ${hash}`);
    }
  });
}

test('Teaching can reach the live game rooms (class.adam-russell.com/g: sockets and the poll fallback)', async () => {
  const html = await readFile(new URL('apps/teaching/index.html', root), 'utf8');
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const connect = directives(policy).get('connect-src') ?? [];
  assert.ok(connect.includes('wss://class.adam-russell.com'), 'live game sockets');
  assert.ok(connect.includes('https://class.adam-russell.com'), 'live game poll fallback');
});

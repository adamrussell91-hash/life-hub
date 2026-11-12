import test from 'node:test';
import vm from 'node:vm';
import { JOIN_JS } from '../../workers/class-site/join-page.mjs';
import assert from 'node:assert/strict';
import {
  deadPageHtml,
  handleClassSiteRequest,
  isLinePath,
  isTeachingAsset,
  scrubTeachingShell,
  studentPath
} from '../../workers/class-site/routes.mjs';

const SHELL = `<!DOCTYPE html>
<html><head><title>Teaching Hub</title>
<script>
      (function () {
        var key = 'life-hub-spa-redirect';
        var redirect = sessionStorage.getItem(key);
        if (!redirect) return;
        if (redirect === '/teaching' || redirect.indexOf('/teaching/') === 0) {
          sessionStorage.removeItem(key);
          history.replaceState(null, '', redirect);
        }
      })();
    </script>
<script type="module" src="/teaching/assets/index-abc.js"></script>
</head><body><div id="app"></div></body></html>`;

function mockFetch(handlers) {
  return async (input) => {
    const url = String(input);
    const handler = handlers.find((entry) => url.endsWith(entry.path));
    if (!handler) return new Response('missing', { status: 404 });
    return new Response(handler.body, {
      status: 200,
      headers: handler.headers ?? { 'content-type': 'text/html; charset=utf-8' }
    });
  };
}

test('student paths are the published lesson, unit, and class routes only', () => {
  assert.equal(studentPath('/s/lessons/lesson_1'), '/s/lessons/lesson_1');
  assert.equal(studentPath('/s/units/unit_1/'), '/s/units/unit_1');
  assert.equal(studentPath('/s/classes/class_1'), '/s/classes/class_1');
  assert.equal(
    studentPath('/s/classes/class_1/lessons/lesson_1'),
    '/s/classes/class_1/lessons/lesson_1'
  );
  assert.equal(studentPath('/s/classes/class_1/profile'), '/s/classes/class_1/profile');
  assert.equal(studentPath('/s/feedback/tok_1'), '/s/feedback/tok_1');
  assert.equal(studentPath('/s/feedback'), null);
  assert.equal(studentPath('/s/sheets/tok_1'), '/s/sheets/tok_1');
  assert.equal(studentPath('/s/sheets'), null);
  assert.equal(studentPath('/s/classes/class_1/profile/x'), null);
  assert.equal(studentPath('/teaching/s/lessons/lesson_1'), null);
  assert.equal(studentPath('/'), null);
  assert.equal(studentPath('/sign-in'), null);
  assert.equal(studentPath('/teaching/'), null);
  assert.equal(studentPath('/teaching/sign-in'), null);
  assert.equal(studentPath('/teaching/lessons/lesson_1'), null);
  assert.equal(studentPath('/s/lessons/../../sign-in'), null);
});

test('only flat teaching build assets are proxied', () => {
  assert.equal(isTeachingAsset('/teaching/assets/index-abc.js'), true);
  assert.equal(isTeachingAsset('/teaching/assets/KaTeX_Main-Regular-B22Nviop.woff2'), true);
  assert.equal(isTeachingAsset('/teaching/index.html'), false);
  assert.equal(isTeachingAsset('/teaching/assets/../index.html'), false);
  assert.equal(isTeachingAsset('/assets/index-abc.js'), false);
});

test('shell scrub removes the umbrella redirect', () => {
  const html = scrubTeachingShell(SHELL);
  assert.equal(html.includes('life-hub'), false);
  assert.equal(/hub/i.test(html.match(/<title>[^<]*<\/title>/)[0]), false);
  assert.match(html, /\/teaching\/assets\/index-abc\.js/);
});

test('a published lesson is served without the umbrella name or a sign-in link', async () => {
  const response = await handleClassSiteRequest(
    new Request('https://class.adam-russell.com/s/lessons/lesson_1'),
    mockFetch([{ path: '/teaching/index.html', body: SHELL }])
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(html.includes('life-hub'), false);
  assert.equal(/sign[\s-]*in/i.test(html), false);
  assert.match(html, /\/teaching\/assets\/index-abc\.js/);
});

test('chopped and teacher paths are a dead page', async () => {
  const fetchImpl = mockFetch([{ path: '/teaching/index.html', body: SHELL }]);
  for (const path of ['/sign-in', '/teaching/', '/teaching/sign-in', '/knowledge/', '/s/lessons', '/join']) {
    const response = await handleClassSiteRequest(
      new Request(`https://class.adam-russell.com${path}`),
      fetchImpl
    );
    const html = await response.text();
    assert.equal(response.status, 404, path);
    assert.equal(html, deadPageHtml());
    assert.equal(html.includes('life-hub'), false);
    assert.equal(/sign[\s-]*in/i.test(html), false);
    assert.equal(html.includes('<a '), false);
  }
});

test('teaching assets proxy and other files do not', async () => {
  const fetchImpl = mockFetch([
    {
      path: '/teaching/assets/index-abc.js',
      body: 'console.log("lesson")',
      headers: { 'content-type': 'text/javascript' }
    }
  ]);
  const asset = await handleClassSiteRequest(
    new Request('https://class.adam-russell.com/teaching/assets/index-abc.js'),
    fetchImpl
  );
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'console.log("lesson")');

  const shell = await handleClassSiteRequest(
    new Request('https://class.adam-russell.com/teaching/index.html'),
    fetchImpl
  );
  assert.equal(shell.status, 404);
});

test('decoded assets are not labelled as compressed', async () => {
  const response = await handleClassSiteRequest(
    new Request('https://class.adam-russell.com/teaching/assets/index-abc.js'),
    async () =>
      new Response('console.log(1)', {
        status: 200,
        headers: {
          'content-type': 'text/javascript',
          'content-encoding': 'gzip',
          'content-length': '99'
        }
      })
  );
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(await response.text(), 'console.log(1)');
});

const LINE_SHELL = `<!DOCTYPE html>
<html><head><title>MindWorks Pathways</title>
<script type="module" crossorigin src="/tasks/assets/line-abc.js"></script>
</head><body class="pl-page"><main id="line"></main></body></html>`;

test('the published personal line is served on the class host', async () => {
  assert.equal(isLinePath('/line'), true);
  assert.equal(isLinePath('/line/'), true);
  assert.equal(isLinePath('/tasks/'), false);
  assert.equal(isLinePath('/tasks/line.html'), false);

  const response = await handleClassSiteRequest(
    new Request('https://class.adam-russell.com/line'),
    mockFetch([{ path: '/tasks/line.html', body: LINE_SHELL }])
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(html.includes('life-hub'), false);
  assert.match(html, /\/tasks\/assets\/line-abc\.js/);
  assert.match(html, /<title>MindWorks Pathways<\/title>/);
});

test('tasks build assets proxy, the tasks app does not', async () => {
  assert.equal(isTeachingAsset('/tasks/assets/line-abc.js'), true);
  assert.equal(isTeachingAsset('/tasks/assets/../index.html'), false);
  for (const path of ['/tasks/', '/tasks/index.html', '/tasks/line.html']) {
    const response = await handleClassSiteRequest(
      new Request(`https://class.adam-russell.com${path}`),
      mockFetch([{ path: '/tasks/index.html', body: 'hub' }, { path: '/tasks/line.html', body: LINE_SHELL }])
    );
    assert.equal(response.status, 404, path);
  }
});

// The home page is "Join a game": the code on the board opens that lesson for that class. Invented ids only.
test('the class site home page is the join page, with its own script and styles under a strict policy', async () => {
  const fetchImpl = mockFetch([]);
  for (const path of ['/', '/?join=135790']) {
    const response = await handleClassSiteRequest(new Request(`https://class.adam-russell.com${path}`), fetchImpl);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /Join a game/);
    assert.match(html, /<script src="\/join\.js" defer><\/script>/);
    assert.equal(html.includes('life-hub'), false);
    assert.equal(/sign[\s-]*in/i.test(html), false);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src https:\/\/api\.adam-russell\.com/);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  }
  const js = await handleClassSiteRequest(new Request('https://class.adam-russell.com/join.js'), fetchImpl);
  assert.match(js.headers.get('content-type'), /javascript/);
  const css = await handleClassSiteRequest(new Request('https://class.adam-russell.com/join.css'), fetchImpl);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const head = await handleClassSiteRequest(new Request('https://class.adam-russell.com/', { method: 'HEAD' }), fetchImpl);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

function runJoinPage({ search = '', reply }) {
  const listeners = {};
  const el = (id) => ({ id, value: '', disabled: false, textContent: '', attrs: {}, focus() { this.focused = true; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener(type, fn) { listeners[`${id}:${type}`] = fn; }, querySelector: () => button });
  const button = el('button');
  const nodes = { join: el('join'), code: el('code'), msg: el('msg') };
  nodes.join.querySelector = () => button;
  const calls = [];
  const assigned = [];
  const ctx = {
    document: { getElementById: (id) => nodes[id] },
    location: { search, assign: (url) => assigned.push(url) },
    URLSearchParams,
    fetch: async (url, init) => { calls.push({ url, init }); return reply(url); }
  };
  vm.runInNewContext(JOIN_JS, ctx);
  return { nodes, calls, assigned, submit: (value) => { nodes.code.value = value; listeners['join:submit']({ preventDefault() {} }); } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('join page: a code from the link looks up straight away and opens that lesson for that class', async () => {
  const page = runJoinPage({ search: '?join=135790', reply: () => json(200, { ok: true, data: { code: '135790', lesson_id: 'lesson_t1', class_id: 'class_t1' } }) });
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(page.calls[0].url, 'https://api.adam-russell.com/api/published/game-code/135790');
  assert.equal(page.calls[0].init.credentials, 'omit');
  assert.deepEqual(page.assigned, ['/s/classes/class_t1/lessons/lesson_t1?join=135790']);
});

test('join page: a short code asks for six numbers; a closed one says so and lets them try again', async () => {
  const page = runJoinPage({ reply: () => json(404, { ok: false, error: { code: 'bad_code', message: 'That code isn’t open. Check the board.' } }) });
  page.submit('12 34');
  assert.equal(page.calls.length, 0);
  assert.match(page.nodes.msg.textContent, /6 numbers/);
  page.submit('246 810');
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(page.calls[0].url.endsWith('/246810'), true);
  assert.match(page.nodes.msg.textContent, /isn’t open/);
  assert.equal(page.assigned.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deadPageHtml,
  handleClassSiteRequest,
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
  assert.equal(studentPath('/teaching/s/lessons/lesson_1'), '/s/lessons/lesson_1');
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
  for (const path of ['/', '/sign-in', '/teaching/', '/teaching/sign-in', '/knowledge/', '/s/lessons']) {
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

async function browserAssetText() {
  const root = new URL('../../', import.meta.url);
  const paths = [
    'apps/life/index.html',
    'apps/life/css/app.css',
    'apps/life/manifest.webmanifest',
    'apps/life/service-worker.js',
    'node_modules/js-yaml/dist/js-yaml.mjs'
  ];
  for (const directory of ['apps/life/js/app', 'apps/life/js/core']) {
    const entries = await readdir(new URL(directory, root));
    paths.push(...entries.filter(name => name.endsWith('.js')).map(name => `${directory}/${name}`));
  }
  return (await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')))).join('\n');
}

test('Home shell exposes landmarks and named rendering regions', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const htmlWithoutFonts = html.replace(/https:\/\/fonts\.(googleapis|gstatic)\.com[^"'\s]*/g, '');

  for (const fragment of [
    '<header',
    '<nav',
    '<main',
    '<h1',
    'id="home-dashboard"',
    'id="app-status"',
    'aria-live="polite"',
    'class="hub-mobile-nav"'
  ]) {
    assert.match(html, new RegExp(fragment));
  }
  assert.doesNotMatch(htmlWithoutFonts, /https?:\/\//);
});

test('authenticated shell provides a semantic sign-in gate and reachable controls', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');

  assert.match(html, /class="sign-in__mark"/);
  assert.match(html, /packages\/design-kit\/icons\/life-hub\.svg/);

  for (const fragment of [
    'id="sign-in-view"',
    'class="sign-in"',
    'class="sign-in__card"',
    'id="sign-in-form"',
    'novalidate',
    'enterkeyhint="go"',
    '<label class="sign-in__label" for="sign-in-passphrase"',
    'id="sign-in-passphrase"',
    'type="password"',
    'autocomplete="current-password"',
    'id="sign-in-error"',
    'role="alert"',
    'class="btn btn--primary sign-in__submit"',
    'id="app-shell"',
    'id="refresh-button"',
    'id="last-synced"',
    'id="provider-status"',
    'id="sign-out-button"'
  ]) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.match(html, /id="app-shell"[^>]*hidden/);
});

test('Life Hub tile is favicon and sign-in only, never beside the page title', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const copy = html.slice(html.indexOf('page-header__copy'), html.indexOf('page-header__actions'));
  assert.match(copy, /class="page-header__title-row"/);
  assert.match(copy, /id="page-title"/);
  assert.doesNotMatch(copy, /class="hub-mark"/);
  assert.doesNotMatch(html, /class="hub-mark"/);
  assert.match(html, /class="sign-in__mark"/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /icons\/life-hub\.svg/);
});

test('Life chrome does not revive retired rail marks, gate copy, or the calorie slider', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /class="brand-mark"/);
  assert.doesNotMatch(html, /class="nav-dot"/);
  assert.doesNotMatch(html, /sign-in__supporting/);
  assert.doesNotMatch(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /nutrition-energy-slider/);
  assert.doesNotMatch(css, /\.brand-mark\b/);
  assert.doesNotMatch(css, /\.nav-dot\b/);
  assert.doesNotMatch(css, /hub-spotlight/);
});

test('skip link is unavailable until the authenticated shell is revealed', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const shellStart = html.indexOf('id="app-shell"');
  const skipLink = html.indexOf('class="skip-link"');
  const mainContent = html.indexOf('id="main-content"');

  assert.ok(shellStart >= 0);
  assert.ok(skipLink > shellStart);
  assert.ok(mainContent > skipLink);
});

test('browser assets contain no server environment names that reveal values', async () => {
  const assets = await browserAssetText();
  assert.doesNotMatch(assets, /github_pat_|ghp_|gho_/);
  for (const name of [
    'LIFE_HUB_PASSPHRASE_HASH',
    'SESSION_SECRET',
    'GITHUB_REPOSITORY',
    'GITHUB_BRANCH',
    'GITHUB_TOKEN',
    'GITHUB_TOKEN_EXPIRES'
  ]) {
    assert.doesNotMatch(assets, new RegExp(name));
  }
});

test('renderer assigns untrusted values as text instead of HTML', async () => {
  const source = await readFile(new URL('../../apps/life/js/app/render-home.js', import.meta.url), 'utf8');

  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('responsive stylesheet contains the approved palette and mobile breakpoint', async () => {
  const css = [
    await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8'),
    await readFile(new URL('../../packages/design-kit/tokens.css', import.meta.url), 'utf8')
  ].join('\n');

  for (const color of ['#FBF8F2', '#0A1536', '#142B51', '#376FB7', '#F68620']) {
    assert.match(css, new RegExp(color, 'i'));
  }
  assert.match(css, /@media\s*\([^)]*max-width:\s*48rem/);
  assert.match(css, /min-height:\s*44px/);
});

test('author styles preserve the semantic hidden state', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');

  assert.match(css, /\[hidden\]\s*{\s*display:\s*none\s*!important;?\s*}/);
});

test('full-page Chat uses the canvas width and hides the Talking to chip while empty', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+\.page-header[\s\S]*max-width:\s*none/
  );
  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+main[\s\S]*max-width:\s*none/
  );
  assert.match(
    css,
    /\.chat-view:not\(\[data-panel-mode\]\):not\(\[data-chrome='engaged'\]\)\s+#chat-who\s*\{\s*display:\s*none/
  );
});

test('short chat bubbles are sized by text, not Copy/Retry, and status lines do not pulse', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');
  const bodyRule = css.match(/(?:^|\n)\.chat-message__body\s*\{[^}]+\}/)?.[0] ?? '';
  const actionsRule = css.match(/(?:^|\n)\.chat-message__actions\s*\{[^}]+\}/)?.[0] ?? '';
  assert.match(bodyRule, /flex:\s*1 1 auto/);
  assert.match(bodyRule, /width:\s*max-content/);
  assert.doesNotMatch(bodyRule, /12rem/);
  assert.match(actionsRule, /width:\s*0/);
  assert.match(actionsRule, /min-width:\s*100%/);
  assert.doesNotMatch(css, /chat-status-pulse/);
});

test('full-page Chat locks the canvas height and anchors the composer on the floor', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+\.page-frame[\s\S]*height:\s*100dvh/
  );
  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+#chat-view \.chat-messages[\s\S]*min-height:\s*0/
  );
  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+#chat-view \.chat-messages[\s\S]*scrollbar-gutter:\s*stable/
  );
  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+#chat-view \.chat-form[\s\S]*margin-top:\s*auto/
  );
  assert.doesNotMatch(
    css,
    /\.chat-view:not\(\[data-panel-mode\]\)[^{]*\.chat-form[\s\S]{0,200}left:\s*0/
  );
});

test('full-page Chat on phone pins the canvas to the visual viewport and docks on keyboard', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');
  const mobile = css.match(/@media \(max-width:\s*720px\)\s*\{[\s\S]*$/);
  assert.ok(mobile, 'mobile breakpoint exists');

  assert.match(
    mobile[0],
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+\.page-frame[\s\S]*height:\s*var\(--vv-height/
  );
  assert.match(
    mobile[0],
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+\.page-frame[\s\S]*top:\s*var\(--vv-offset-top/
  );
  assert.match(
    mobile[0],
    /html\.vv-keyboard-open[\s\S]*:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)[\s\S]*\.hub-mobile-nav[\s\S]*display:\s*none/
  );
  assert.match(
    mobile[0],
    /#chat-form:focus-within[\s\S]*\.hub-mobile-nav[\s\S]*display:\s*none/
  );
  assert.match(
    mobile[0],
    /#chat-form:focus-within[\s\S]*\.page-frame[\s\S]*padding-bottom:\s*0/
  );
});

test('Mind fills the shared 76rem shell; only Chat lifts the canvas width', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');

  assert.match(css, /main\s*\{\s*max-width:\s*76rem/);
  assert.doesNotMatch(
    css,
    /:has\(#mind-dashboard:not\(\[hidden\]\)\)[^{]*\{[^}]*max-width:\s*(?:none|\d+rem)/
  );
  assert.match(
    css,
    /:has\(#chat-view:not\(\[hidden\]\):not\(\[data-panel-mode\]\)\)\s+main[\s\S]*max-width:\s*none/
  );
  assert.match(css, /\.body-range\.hub-pills\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.mind-board\s*\{[^}]*max-width:\s*100%/);
});

test('service worker paints cached images immediately and keeps scripts network-first', async () => {
  const worker = await readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /function staleWhileRevalidate/);
  assert.match(worker, /function networkFirst/);
  assert.match(worker, /isStaticImage\(url\.pathname\)/);
  assert.match(worker, /life-hub-shell-v152/);
});

test('web app manifest is installable and uses only local icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../apps/life/manifest.webmanifest', import.meta.url)));

  assert.equal(manifest.name, 'Life Hub');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('assets/icons/')));
});

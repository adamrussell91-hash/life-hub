import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { syncChatPageRails } from '../../packages/design-kit/js/hub-motion.js';

test('chat rail eases the page header shut and keeps tokens', async () => {
  const css = await readFile(new URL('../../packages/design-kit/hub-chat-viewport.css', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  assert.match(motion, /--hub-motion-rail:\s*560ms/);
  assert.match(motion, /--hub-motion-ease:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
  assert.match(css, /\.page-header\.is-chat-rail\s*\{[^}]*padding-block:\s*var\(--space-2\)/);
  assert.match(css, /\.page-header\.is-chat-rail\.is-chat-rail-merged\s*\{[^}]*padding-block:\s*0/);
  assert.match(css, /font-size:\s*var\(--text-base\)/);
  assert.match(css, /@starting-style/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.chat-view__toolbar \.date-chip/);
  // Phone chrome uses flex: 1 0 100% on labelled actions; the chat rail must
  // keep New chat intrinsic or it overflows past the canvas at 390.
  assert.match(
    css,
    /\.page-header\.is-chat-rail \.page-header__actions\s*\{[^}]*flex:\s*0 0 auto/
  );
  assert.match(css, /\.page-header\.is-chat-rail \.page-header__copy\s*\{[^}]*min-width:\s*0/);
});

function mount(html) {
  const window = new Window({ url: 'http://localhost/' });
  window.document.body.innerHTML = html;
  return window.document;
}

test('full-page chat collapses the header, then parks actions on the engaged rail', () => {
  const document = mount(`
    <div class="page-frame">
      <header class="page-header">
        <div class="page-header__copy">
          <p class="page-header__eyebrow">Talk to your agents</p>
          <div class="page-header__title-row"><h1 class="page-header__title">Chat</h1></div>
        </div>
        <div class="page-header__actions"><button type="button" id="refresh-button">Refresh</button></div>
      </header>
      <main>
        <section id="chat-view" class="chat-view" hidden>
          <header class="chat-view__toolbar">
            <div id="chat-who" class="chat-view__who"></div>
            <div class="chat-view__actions">
              <button type="button" id="chat-new">New chat</button>
              <button type="button" id="chat-tools">Tools</button>
            </div>
          </header>
        </section>
      </main>
    </div>
  `);
  const header = document.querySelector('.page-header');
  const chat = document.querySelector('#chat-view');
  const actions = document.querySelector('.page-header__actions');

  syncChatPageRails(document);
  assert.equal(header.classList.contains('is-chat-rail'), false);
  assert.equal(actions.parentElement, header);

  chat.hidden = false;
  syncChatPageRails(document);
  assert.equal(header.classList.contains('is-chat-rail'), true);
  assert.equal(header.classList.contains('is-chat-rail-merged'), false);
  assert.equal(actions.parentElement, header, 'empty thread keeps utilities on the title rail');
  assert.equal(document.querySelector('#chat-new').parentElement, actions, 'New chat joins the title rail');
  assert.equal(actions.firstElementChild.id, 'chat-new');

  chat.dataset.chrome = 'engaged';
  syncChatPageRails(document);
  assert.equal(header.classList.contains('is-chat-rail-merged'), true);
  const slot = document.querySelector('.chat-view__actions');
  assert.equal(actions.parentElement, slot);
  assert.equal(document.querySelector('#chat-new').parentElement, actions, 'New chat rides with the utilities');
  assert.equal(document.querySelector('#chat-tools').nextElementSibling, actions, 'utilities sit at the end of the rail');

  delete chat.dataset.chrome;
  syncChatPageRails(document);
  assert.equal(header.classList.contains('is-chat-rail-merged'), false);
  assert.equal(actions.parentElement, header);
  assert.equal(document.querySelector('#chat-new').parentElement, actions);

  chat.hidden = true;
  syncChatPageRails(document);
  assert.equal(header.classList.contains('is-chat-rail'), false);
  assert.equal(actions.parentElement, header);
  assert.equal(document.querySelector('#chat-new').parentElement.className, 'chat-view__actions');
  assert.equal(document.querySelector('#chat-new').nextElementSibling.id, 'chat-tools');
});

test('overlay chat and confirm cards do not collapse the page header', () => {
  const document = mount(`
    <div class="page-frame">
      <header class="page-header" id="canvas-header">
        <div class="page-header__actions" id="canvas-actions"></div>
      </header>
      <main>
        <section class="chat-view" data-panel-mode="overlay">
          <header class="chat-view__toolbar"><div class="chat-view__actions"></div></header>
        </section>
        <article class="confirm-card">
          <header class="page-header" id="card-header"></header>
        </article>
      </main>
    </div>
  `);
  syncChatPageRails(document);
  assert.equal(document.querySelector('#canvas-header').classList.contains('is-chat-rail'), false);
  assert.equal(document.querySelector('#card-header').classList.contains('is-chat-rail'), false);
  assert.equal(document.querySelector('#canvas-actions').parentElement.id, 'canvas-header');
});

test('Knowledge and Teaching chat pages use the thin rail without a Messenger toolbar', () => {
  const document = mount(`
    <main class="canvas">
      <header class="page-header" id="knowledge">
        <div class="page-header__actions" id="knowledge-actions"></div>
      </header>
      <section class="coach chat"></section>
    </main>
    <div class="teacher-layout__canvas">
      <header class="page-header" id="teaching">
        <div class="page-header__actions" id="teaching-actions"></div>
      </header>
      <div class="teacher-chat"></div>
    </div>
  `);
  syncChatPageRails(document);
  assert.equal(document.querySelector('#knowledge').classList.contains('is-chat-rail'), true);
  assert.equal(document.querySelector('#knowledge').classList.contains('is-chat-rail-merged'), false);
  assert.equal(document.querySelector('#knowledge-actions').parentElement.id, 'knowledge');
  assert.equal(document.querySelector('#teaching').classList.contains('is-chat-rail'), true);
  assert.equal(document.querySelector('#teaching-actions').parentElement.id, 'teaching');
});

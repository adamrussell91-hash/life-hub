import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';
let browser, server, baseUrl;

before(async () => {
  server = createStaticServer({ root: new URL('../../dist/', import.meta.url), apiRoot: new URL('../..', import.meta.url) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function signIn(page) {
  await page.clock.setFixedTime(new Date('2026-07-30T12:00:00+10:00'));
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

test('sending a message routes to the mocked agent and renders a confirmable record', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#home-dashboard').isHidden(), true);

  await page.locator('#chat-input').fill('Chadwick, log a 30 minute workout');
  await page.locator('#chat-send').click();

  const assistantBubble = page.locator('.chat-message--assistant[data-agent="chadwick"]').first();
  await assistantBubble.waitFor();
  assert.equal(await assistantBubble.getAttribute('data-agent'), 'chadwick');

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor();
  await proposal.locator('.record-proposal__confirm').click();
  await page.locator('.record-proposal >> text=Saved.').waitFor();
  await context.close();
});

test('discarding a proposal removes it without confirming', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-input').fill('Chadwick, log a session');
  await page.locator('#chat-send').click();

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor();
  await proposal.locator('.record-proposal__discard').click();
  await assert.rejects(proposal.waitFor({ timeout: 500 }));
  await context.close();
});

test('navigating back to Home hides the chat view again', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('.desktop-rail .nav-item[data-section="home"]').click();
  await page.locator('#chat-view').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#home-dashboard').isVisible(), true);
  await context.close();
});

test('Brisket meal log reaches a Confirm card with sodium, not the cut-off recovery bubble', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-input').fill(
    'Hi brisket, for dinner I had a big slice of home made lasagna, beef and pork'
  );
  await page.locator('#chat-send').click();

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('.chat-message--assistant[data-agent="brisket"]').count() > 0, true);
  const body = await page.locator('#chat-messages').innerText();
  assert.doesNotMatch(body, /got cut off before it finished/i);
  assert.doesNotMatch(body, /didn.?t finish that reply/i);
  assert.match(await proposal.innerText(), /Sodium/i);
  await context.close();
});

test('a flattened Chadwick prescription renders as stacked exercise rows', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-input').fill('Chadwick, describe the session — full send');
  await page.locator('#chat-send').click();

  const workout = page.locator('.chat-workout');
  await workout.waitFor();
  assert.equal(await page.locator('.chat-workout__exercise').count(), 8);
  assert.equal(await page.locator('.chat-workout__name').first().innerText(), 'Bar Squat');
  assert.match(await page.locator('.chat-workout__cue').first().innerText(), /legs first/i);
  assert.match(await page.locator('.chat-workout__set-load').first().innerText(), /10 × 25 kg/);
  assert.doesNotMatch(await workout.innerText(), /Set 1: 10 reps x 25kg \(cable: none\) - Set 2:/);
  await context.close();
});

test('lock it onto Fitness shows a Confirm card', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-input').fill('lock it onto Fitness');
  await page.locator('#chat-send').click();

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor();
  assert.match(await proposal.innerText(), /Save to Fitness|Start workout|Confirm/i);
  await context.close();
});

test('empty Chat names the agent once and uses the full canvas width', async () => {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1100 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#agent-picker [data-agent-slug="brisket"]').click();

  assert.equal(await page.locator('#chat-who').isVisible(), false);
  assert.equal(await page.locator('.agent-picker__name').first().innerText(), 'Brisket');
  assert.match(await page.locator('.agent-protocol-pills__eyebrow').innerText(), /^can$/i);
  assert.match(await page.locator('#chat-empty').innerText(), /meals, macros/i);
  assert.doesNotMatch(await page.locator('#chat-empty').innerText(), /brisket/i);

  const widths = await page.evaluate(() => {
    const frame = document.querySelector('.page-frame');
    const main = document.querySelector('main');
    const header = document.querySelector('.page-header');
    const style = getComputedStyle(frame);
    const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return {
      canvas: frame.clientWidth - pad,
      main: main.getBoundingClientRect().width,
      header: header.getBoundingClientRect().width
    };
  });
  assert.ok(widths.main > 1216, 'Chat must be wider than the old 76rem column');
  assert.ok(Math.abs(widths.main - widths.canvas) < 2, 'Chat main should fill the canvas');
  assert.ok(Math.abs(widths.header - widths.canvas) < 2, 'Chat header should fill the canvas');

  await context.close();
});

test('full-page Chat composer sits on the canvas floor beside the rail', async () => {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1100 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-form').waitFor({ state: 'visible' });

  const boxes = await page.evaluate(() => {
    const rail = document.querySelector('.desktop-rail');
    const form = document.querySelector('#chat-form');
    const frame = document.querySelector('.page-frame');
    return {
      rail: rail.getBoundingClientRect(),
      form: form.getBoundingClientRect(),
      frame: frame.getBoundingClientRect(),
      viewHeight: window.innerHeight
    };
  });

  assert.ok(boxes.rail.width > 0, 'desktop rail is visible');
  assert.ok(boxes.form.left + 1 >= boxes.rail.right, 'composer must not overlap the rail');
  assert.ok(Math.abs(boxes.form.left - boxes.frame.left) < 80, 'composer stays on the canvas');
  assert.ok(boxes.form.bottom <= boxes.viewHeight, 'composer stays inside the viewport');
  assert.ok(boxes.viewHeight - boxes.form.bottom < 80, 'composer sits on the canvas floor');

  await context.close();
});

test('mobile Chat tab and overlay keep send beside the field', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  const view = page.locator('#chat-view');
  await view.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#chat-empty').isVisible(), true);
  assert.equal(await page.locator('.agent-picker__name').first().isVisible(), true);

  let inputBox = await page.locator('#chat-input').boundingBox();
  let sendBox = await page.locator('#chat-send').boundingBox();
  const formBox = await page.locator('#chat-form').boundingBox();
  const navBox = await page.locator('.hub-mobile-nav').boundingBox();
  assert.ok(inputBox && sendBox && formBox && navBox);
  assert.ok(sendBox.x > inputBox.x, 'send stays beside the field on the Chat tab');
  assert.ok(Math.abs(sendBox.y - inputBox.y) < 48, 'send stays on the composer row');
  assert.ok(formBox.y + formBox.height <= navBox.y + 2, 'composer stays above the mobile nav');

  await page.locator('#more-nav-button').click();
  await page.locator('#more-sheet [data-section="nutrition"]').click();
  await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });
  await page.locator('#nutrition-chat-button').click();
  await view.waitFor({ state: 'visible' });
  assert.equal(await view.getAttribute('data-panel-mode'), 'overlay');
  assert.equal(await page.locator('#chat-close').isVisible(), true);
  assert.match(await page.locator('#chat-who').innerText(), /Brisket/i);
  const whoBox = await page.locator('#chat-who').boundingBox();
  const closeBox = await page.locator('#chat-close').boundingBox();
  assert.ok(whoBox && closeBox);
  assert.ok(Math.abs(closeBox.y - whoBox.y) < 36, 'Close stays on the overlay toolbar row');

  inputBox = await page.locator('#chat-input').boundingBox();
  sendBox = await page.locator('#chat-send').boundingBox();
  assert.ok(inputBox && sendBox);
  assert.ok(sendBox.x > inputBox.x, 'overlay send stays beside the field');

  await page.locator('#chat-close').click();
  await view.waitFor({ state: 'hidden' });
  await context.close();
});

test('short user bubbles hug their text instead of stretching for Copy/Retry', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#agent-picker [data-agent-slug="brisket"]').click();

  const metrics = await page.evaluate(() => {
    const list = document.querySelector('#chat-messages');
    const empty = document.querySelector('#chat-empty');
    if (empty) empty.hidden = true;
    list.replaceChildren();

    const user = document.createElement('li');
    user.className = 'chat-message chat-message--user chat-message--latest';
    const body = document.createElement('div');
    body.className = 'chat-message__body';
    body.textContent = 'Yep';
    user.append(body);
    const actions = document.createElement('div');
    actions.className = 'chat-message__actions';
    for (const label of ['Copy', 'Retry']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-message__action';
      button.textContent = label;
      actions.append(button);
    }
    user.append(actions);
    list.append(user);

    const probe = document.createElement('span');
    probe.textContent = 'Yep';
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(body).font}`;
    document.body.append(probe);
    const textWidth = probe.getBoundingClientRect().width;
    probe.remove();

    const bodyBox = body.getBoundingClientRect();
    const padL = parseFloat(getComputedStyle(body).paddingLeft) || 0;
    const padR = parseFloat(getComputedStyle(body).paddingRight) || 0;
    return {
      bodyWidth: bodyBox.width,
      blankAfter: bodyBox.width - textWidth - padL - padR,
      textWidth
    };
  });

  assert.ok(metrics.textWidth > 0, 'probe measured the word width');
  assert.ok(
    metrics.blankAfter < 12,
    `short bubble must not keep a wide empty tail (blankAfter=${metrics.blankAfter.toFixed(1)}px, body=${metrics.bodyWidth.toFixed(1)}px)`
  );

  await context.close();
});

test('mobile full-page Chat docks the composer to the keyboard viewport', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-form').waitFor({ state: 'visible' });

  // Chromium does not shrink visualViewport like iOS — apply the same CSS contract.
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--vv-offset-top', '0px');
    root.style.setProperty('--vv-height', '480px');
    root.style.setProperty('--vv-offset-bottom', '364px');
    root.classList.add('vv-keyboard-open');
  });

  const layout = await page.evaluate(() => {
    const form = document.querySelector('#chat-form');
    const frame = document.querySelector('.page-frame');
    const nav = document.querySelector('.hub-mobile-nav');
    const formBox = form.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    const navStyle = getComputedStyle(nav);
    return {
      formBottom: formBox.bottom,
      frameBottom: frameBox.bottom,
      frameHeight: frameBox.height,
      navDisplay: navStyle.display,
      gap: frameBox.bottom - formBox.bottom
    };
  });

  assert.equal(layout.navDisplay, 'none', 'tab bar hides while the keyboard is open');
  assert.ok(Math.abs(layout.frameHeight - 480) < 2, 'canvas height tracks the visual viewport');
  assert.ok(layout.gap < 8, 'composer sits on the keyboard floor, not floating mid-canvas');
  assert.ok(layout.formBottom <= layout.frameBottom + 1, 'composer stays inside the visible viewport');

  await context.close();
});

test('focusing the composer on phone hides the tab bar and frees reading room (iOS inset≈0)', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#agent-picker [data-agent-slug="brisket"]').click();
  await page.locator('#chat-input').waitFor({ state: 'visible' });

  // Reproduce Adam's iPhone: keyboard open, but innerHeight already matches vv.height
  // so inset math stays ~0 and the old class never flipped.
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--vv-offset-top', '0px');
    root.style.setProperty('--vv-height', '480px');
    root.style.setProperty('--vv-offset-bottom', '0px');
    root.classList.remove('vv-keyboard-open');
    const frame = document.querySelector('.page-frame');
    if (frame) {
      frame.style.height = '480px';
      frame.style.maxHeight = '480px';
    }
    const view = document.querySelector('#chat-view');
    view.dataset.chrome = 'engaged';
    const empty = document.querySelector('#chat-empty');
    if (empty) empty.hidden = true;
    const list = document.querySelector('#chat-messages');
    list.replaceChildren();
    const item = document.createElement('li');
    item.className = 'chat-message chat-message--assistant';
    item.dataset.agent = 'brisket';
    const body = document.createElement('div');
    body.className = 'chat-message__body';
    body.textContent = 'Go on and confirm it whenever you are ready — I am right here.';
    item.append(body);
    list.append(item);
  });

  await page.locator('#chat-input').focus();

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const form = document.querySelector('#chat-form');
    const frame = document.querySelector('.page-frame');
    const nav = document.querySelector('.hub-mobile-nav');
    const header = document.querySelector('.page-header');
    const picker = document.querySelector('#agent-picker');
    const messages = document.querySelector('#chat-messages');
    const formBox = form.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    const msgBox = messages.getBoundingClientRect();
    const padBottom = parseFloat(getComputedStyle(frame).paddingBottom) || 0;
    return {
      keyboardOpen: root.classList.contains('vv-keyboard-open'),
      navDisplay: getComputedStyle(nav).display,
      headerDisplay: getComputedStyle(header).display,
      pickerDisplay: getComputedStyle(picker).display,
      padBottom,
      formHeight: formBox.height,
      gapFormToFrame: frameBox.bottom - formBox.bottom,
      readingRoom: msgBox.height,
      frameHeight: frameBox.height
    };
  });

  assert.equal(layout.keyboardOpen, true, 'composer focus must set vv-keyboard-open');
  assert.equal(layout.navDisplay, 'none', 'tab bar must hide like Messenger while typing');
  assert.equal(layout.headerDisplay, 'none', 'page title must yield reading room while typing');
  assert.equal(layout.pickerDisplay, 'none', 'agent strip must yield reading room while typing');
  assert.ok(layout.padBottom < 8, `nav clearance padding must clear (padBottom=${layout.padBottom})`);
  assert.ok(layout.gapFormToFrame < 8, 'no blank strip between composer and keyboard floor');
  assert.ok(layout.formHeight < 72, `composer must stay slim (formHeight=${layout.formHeight})`);
  assert.ok(
    layout.readingRoom > layout.frameHeight * 0.55,
    `messages need Messenger-like reading room (reading=${layout.readingRoom}, frame=${layout.frameHeight})`
  );

  await context.close();
});

test('overflowing Chat thread does not bounce height after scroll-to-bottom', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });

  const motion = await page.evaluate(async () => {
    const list = document.querySelector('#chat-messages');
    const hide = document.querySelector('[data-hub-scroll-hide]');
    list.replaceChildren();
    for (let i = 0; i < 24; i += 1) {
      const item = document.createElement('li');
      item.className = 'chat-message chat-message--assistant';
      const body = document.createElement('div');
      body.className = 'chat-message__body';
      body.textContent = `Row ${i + 1} — overflow the thread so scroll-hide can fire.`;
      item.append(body);
      list.append(item);
    }
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 80));
    const heights = new Set();
    const hidden = new Set();
    const start = performance.now();
    while (performance.now() - start < 600) {
      heights.add(list.clientHeight);
      hidden.add(hide.classList.contains('is-hidden'));
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return {
      overlay: hide.classList.contains('hub-scroll-hide--overlay'),
      heights: [...heights],
      hidden: [...hidden]
    };
  });

  assert.equal(motion.overlay, true, 'Chat chrome must overlay, not collapse the thread');
  assert.ok(motion.heights.length <= 1, `thread height bounced: ${motion.heights.join(',')}`);
  assert.ok(motion.hidden.length <= 1, `scroll-hide oscillated: ${motion.hidden.join(',')}`);

  await context.close();
});

test('desktop Chat locks the document and only the thread scrolls', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });

  const layout = await page.evaluate(() => {
    const list = document.querySelector('#chat-messages');
    list.replaceChildren();
    for (let i = 0; i < 20; i += 1) {
      const item = document.createElement('li');
      item.className = 'chat-message chat-message--assistant';
      const body = document.createElement('div');
      body.className = 'chat-message__body';
      body.textContent = `Row ${i + 1} — enough copy to overflow the thread.`;
      item.append(body);
      list.append(item);
    }
    const html = document.documentElement;
    const frame = document.querySelector('.page-frame');
    const rail = document.querySelector('.desktop-rail');
    return {
      htmlOverflow: getComputedStyle(html).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlScrollable: html.scrollHeight > html.clientHeight + 1,
      frameHeight: frame.getBoundingClientRect().height,
      railPosition: getComputedStyle(rail).position,
      railTop: rail.getBoundingClientRect().top,
      threadScrollable: list.scrollHeight > list.clientHeight + 8,
      vvHeight: html.style.getPropertyValue('--vv-height')
    };
  });

  assert.equal(layout.htmlOverflow, 'hidden');
  assert.equal(layout.bodyOverflow, 'hidden');
  assert.equal(layout.htmlScrollable, false, 'document must not grow the gray page scrollbar');
  assert.equal(layout.railPosition, 'fixed');
  assert.ok(Math.abs(layout.railTop) < 1, 'rail must stay pinned');
  assert.ok(Math.abs(layout.frameHeight - 800) < 2, 'chat canvas must fill the viewport');
  assert.equal(layout.threadScrollable, true, 'only the thread should scroll');
  assert.equal(layout.vvHeight, '', 'closed keyboard must not pin live visualViewport height');

  await context.close();
});

test('phone Chat window stays put when visualViewport height jitters', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });

  await page.evaluate(() => {
    const list = document.querySelector('#chat-messages');
    list.replaceChildren();
    for (let i = 0; i < 24; i += 1) {
      const item = document.createElement('li');
      item.className = 'chat-message chat-message--assistant';
      const body = document.createElement('div');
      body.className = 'chat-message__body';
      body.textContent = `Line ${i + 1} — enough copy to make the thread overflow and show a scrollbar.`;
      item.append(body);
      list.append(item);
    }
  });

  const before = await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.remove('vv-keyboard-open');
    root.style.setProperty('--vv-height', '844px');
    root.style.setProperty('--vv-offset-top', '0px');
    const frame = document.querySelector('.page-frame');
    const list = document.querySelector('#chat-messages');
    const frameBox = frame.getBoundingClientRect();
    return {
      top: frameBox.top,
      bottom: frameBox.bottom,
      height: frameBox.height,
      listHeight: list.clientHeight,
      overflowX: getComputedStyle(root).overflow,
      overflowY: getComputedStyle(document.body).overflow
    };
  });

  const after = await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--vv-height', '790px');
    root.style.setProperty('--vv-offset-top', '12px');
    const frame = document.querySelector('.page-frame');
    const list = document.querySelector('#chat-messages');
    const frameBox = frame.getBoundingClientRect();
    return {
      top: frameBox.top,
      bottom: frameBox.bottom,
      height: frameBox.height,
      listHeight: list.clientHeight
    };
  });

  assert.equal(before.overflowX, 'hidden', 'document must not grow a moving page scrollbar');
  assert.equal(before.overflowY, 'hidden');
  assert.ok(Math.abs(after.top - before.top) < 1, `top edge moved ${after.top - before.top}`);
  assert.ok(Math.abs(after.bottom - before.bottom) < 1, `bottom edge moved ${after.bottom - before.bottom}`);
  assert.ok(Math.abs(after.height - before.height) < 1, `chat window height moved ${after.height - before.height}`);
  assert.ok(Math.abs(after.listHeight - before.listHeight) < 1, `thread height moved ${after.listHeight - before.listHeight}`);

  await context.close();
});

test('make the workout shows a Confirm card', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-input').fill('make the workout');
  await page.locator('#chat-send').click();

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor();
  assert.match(await proposal.innerText(), /Save to Fitness|Start workout|Confirm/i);
  await page.locator('#chat-messages').waitFor();
  assert.doesNotMatch(await page.locator('#chat-messages').innerText(), /got cut off/i);
  await context.close();
});

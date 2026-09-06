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

async function sampleChatWindow(page, ms) {
  return page.evaluate(async duration => {
    const samples = [];
    const end = performance.now() + duration;
    while (performance.now() < end) {
      const frame = document.querySelector('.page-frame');
      const view = document.querySelector('#chat-view');
      const nav = document.querySelector('.hub-mobile-nav');
      const header = document.querySelector('.page-header');
      const picker = document.querySelector('#agent-picker');
      const hide = document.querySelector('[data-hub-scroll-hide]');
      const list = document.querySelector('#chat-messages');
      const faded = [...(list?.querySelectorAll('.chat-message') ?? [])].filter(el => (
        Number(getComputedStyle(el).opacity) < 0.95
      )).length;
      samples.push({
        frameH: frame?.getBoundingClientRect().height ?? 0,
        viewH: view?.getBoundingClientRect().height ?? 0,
        nav: getComputedStyle(nav).display,
        header: getComputedStyle(header).display,
        picker: getComputedStyle(picker).display,
        hide: hide?.classList.contains('is-hidden') ?? false,
        kb: document.documentElement.classList.contains('vv-keyboard-open'),
        faded
      });
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return samples;
  }, ms);
}

function windowFlicker(samples) {
  const range = arr => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  let chromeFlips = 0;
  let hideFlips = 0;
  let kbFlips = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].nav !== samples[i - 1].nav) chromeFlips += 1;
    if (samples[i].header !== samples[i - 1].header) chromeFlips += 1;
    if (samples[i].picker !== samples[i - 1].picker) chromeFlips += 1;
    if (samples[i].hide !== samples[i - 1].hide) hideFlips += 1;
    if (samples[i].kb !== samples[i - 1].kb) kbFlips += 1;
  }
  return {
    frameHRange: range(samples.map(sample => sample.frameH)),
    viewHRange: range(samples.map(sample => sample.viewH)),
    chromeFlips,
    hideFlips,
    kbFlips,
    faded: samples.some(sample => sample.faded > 0)
  };
}

test('mobile Chat window does not strobe while a reply streams', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#agent-picker [data-agent-slug="brisket"]').click();
  await page.locator('#chat-input').fill(
    'Hi brisket, for dinner I had a big slice of home made lasagna, beef and pork'
  );
  await page.locator('#chat-input').focus();

  const sampling = sampleChatWindow(page, 1800);
  await page.locator('#chat-send').click();
  const flicker = windowFlicker(await sampling);

  assert.ok(
    flicker.hideFlips <= 1,
    `scroll-hide must not strobe the Chat window (hideFlips=${flicker.hideFlips})`
  );
  assert.ok(
    flicker.chromeFlips <= 1,
    `nav/header/picker must not slam in and out mid-reply (chromeFlips=${flicker.chromeFlips})`
  );
  assert.ok(
    flicker.viewHRange < 40,
    `Chat window height must stay put during the turn (viewHRange=${flicker.viewHRange})`
  );
  assert.equal(await page.locator('#chat-input').evaluate(el => el.disabled), false);
  const stillBusy = await page.locator('#chat-view').evaluate(el => el.classList.contains('is-busy'));
  if (stillBusy) {
    assert.equal(await page.locator('#chat-input').evaluate(el => el.readOnly), true);
  }

  await page.locator('.record-proposal').waitFor({ timeout: 10_000 });
  await context.close();
});

test('12px visualViewport jitter does not resize the Chat canvas', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('#chat-input').focus();
  await page.evaluate(() => {
    let high = true;
    const vv = window.visualViewport;
    Object.defineProperty(vv, 'height', {
      configurable: true,
      get() { return high ? 844 : 832; }
    });
    window.__vvJitter = setInterval(() => {
      high = !high;
      vv.dispatchEvent(new Event('resize'));
      vv.dispatchEvent(new Event('scroll'));
    }, 32);
  });

  const flicker = windowFlicker(await sampleChatWindow(page, 800));
  await page.evaluate(() => clearInterval(window.__vvJitter));

  assert.ok(
    flicker.frameHRange < 2,
    `page-frame must ignore 12px vv jitter (frameHRange=${flicker.frameHRange})`
  );
  assert.equal(flicker.kbFlips, 0, 'keyboard mode must not flap on vv jitter');
  await context.close();
});

test('refreshing the app state does not fade existing Chat messages', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.hub-mobile-nav [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const list = document.querySelector('#chat-messages');
    const empty = document.querySelector('#chat-empty');
    if (empty) empty.hidden = true;
    document.querySelector('#chat-view').dataset.chrome = 'engaged';
    for (let i = 0; i < 6; i += 1) {
      const li = document.createElement('li');
      li.className = 'chat-message chat-message--assistant';
      const body = document.createElement('div');
      body.className = 'chat-message__body';
      body.textContent = `Existing bubble ${i}`;
      li.append(body);
      list.append(li);
    }
  });
  await page.evaluate(() => {
    document.querySelector('#app').dataset.state = 'refreshing';
  });
  const flicker = windowFlicker(await sampleChatWindow(page, 700));
  await page.evaluate(() => {
    document.querySelector('#app').dataset.state = 'ready';
  });

  assert.equal(flicker.faded, false, 'existing bubbles must not replay hub-list-in on data-state');
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

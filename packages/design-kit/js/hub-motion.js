/** Shared hub motion. Same strength on Life, Knowledge, Teaching, and Tasks. */

const CARD_SELECTOR = [
  '.metric-card',
  '.week-card',
  '.hub-card',
  '.glass-panel',
  '.glass-tile',
  '.card',
  '.sign-in__card',
  '.mind-tile',
  '.alchemist-card',
  '.podcast-card',
  '.wiki-card',
  '.uni-tl__card',
  '.quiz-card',
  '.pcard'
].join(',');

const SPOTLIGHT_SKIP = '.confirm-card, [role="dialog"], .create-modal, .search-palette, .hub-morph-dialog';

const MAGNET_SELECTOR = [
  '.hub-pulse-card',
  '.home-class-tile',
  '.dashboard-overview__tile'
].join(',');

const LIST_SELECTOR = [
  '.logging-list',
  '.chat-messages',
  '.meal-log',
  '.cards',
  '.nutrition-challenge-list',
  '[data-hub-list]'
].join(',');

const COUNT_SELECTOR = [
  '[data-value]',
  '[data-hub-count]',
  '[data-percent]',
  '.hub-pulse-card__count'
].join(',');

const SKIP_VALUE_KEYS = new Set([
  'date',
  'workout',
  'workout-state',
  'sync',
  'hammond-line'
]);

const DATE_TEXT = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const NUMBER_HEAD = /^([+\-−]?\d{1,3}(?:,\d{3})*(?:\.\d+)?)(\s.*)?$/;
const OF_PATTERN = /^(\d+)\s+of\s+(\d+)(.*)$/i;
const WORD_COUNT = /^(\d{1,3}(?:,\d{3})*)(\s+[a-z][a-z\s]{0,18})$/i;

const listKeys = new WeakMap();
const ticking = new WeakSet();
let started = false;

export function prefersReducedMotion(root = document) {
  const view = root.defaultView ?? globalThis;
  return Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

export function parseCountable(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw === '—' || raw === '–' || DATE_TEXT.test(raw)) return null;
  const of = OF_PATTERN.exec(raw);
  if (of) {
    return { value: Number(of[1]), format: n => `${n} of ${of[2]}${of[3] ?? ''}` };
  }
  const word = WORD_COUNT.exec(raw);
  if (word && !/kcal|g\b|%/.test(word[2])) {
    return { value: Number(word[1].replace(/,/g, '')), format: n => `${formatLike(word[1], n)}${word[2]}` };
  }
  const head = NUMBER_HEAD.exec(raw);
  if (!head) return null;
  const suffix = head[2] ?? '';
  if (suffix.length > 24) return null;
  return { value: Number(head[1].replace(/,/g, '')), format: n => `${formatLike(head[1], n)}${suffix}` };
}

function formatLike(sample, value) {
  const decimals = (sample.split('.')[1] || '').length;
  const useComma = sample.includes(',');
  const abs = Math.abs(value);
  const body = decimals
    ? abs.toFixed(decimals)
    : String(Math.round(abs));
  const grouped = useComma
    ? body.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : body;
  if (sample.startsWith('−') || (sample.startsWith('-') && !sample.startsWith('+'))) {
    return value < 0 || sample.startsWith('-') || sample.startsWith('−')
      ? `${sample[0]}${grouped}`
      : grouped;
  }
  if (sample.startsWith('+')) return `${value < 0 ? '-' : '+'}${grouped}`;
  return grouped;
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function shouldCount(el) {
  const key = el.getAttribute('data-value');
  if (key && (SKIP_VALUE_KEYS.has(key) || key.endsWith('-trend'))) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return false;
  return true;
}

function wrapCount(el) {
  if (el.parentElement?.classList.contains('hub-count')) return el.parentElement;
  const wrap = el.ownerDocument.createElement('span');
  wrap.className = 'hub-count';
  el.replaceWith(wrap);
  wrap.append(el);
  return wrap;
}

function runCount(el, nextText, reduced) {
  if (!shouldCount(el) || ticking.has(el)) return;
  const parsed = parseCountable(nextText);
  if (!parsed || !Number.isFinite(parsed.value)) return;
  if (reduced) return;

  const wrap = wrapCount(el);
  const from = Number(wrap.dataset.hubCountValue ?? 0);
  wrap.dataset.hubCountValue = String(parsed.value);
  if (from === parsed.value) return;

  ticking.add(el);
  wrap.classList.add('is-ticking');
  let fx = wrap.querySelector('.hub-count__fx');
  if (!fx) {
    fx = el.ownerDocument.createElement('span');
    fx.className = 'hub-count__fx';
    fx.setAttribute('aria-hidden', 'true');
    wrap.append(fx);
  }

  const startedAt = performance.now();
  const duration = 560;

  const frame = now => {
    const t = Math.min(1, (now - startedAt) / duration);
    const current = from + (parsed.value - from) * easeOut(t);
    fx.textContent = parsed.format(current);
    if (t < 1) {
      requestAnimationFrame(frame);
      return;
    }
    fx.textContent = parsed.format(parsed.value);
    wrap.classList.remove('is-ticking');
    ticking.delete(el);
  };
  requestAnimationFrame(frame);
}

function revealDelay(el) {
  const parent = el.parentElement;
  if (!parent) return 0;
  const siblings = [...parent.children].filter(node => node.matches?.(CARD_SELECTOR));
  const index = Math.max(0, siblings.indexOf(el));
  return Math.min(index, 6) * 45;
}

function enhanceCard(el, reduced) {
  if (el.dataset.hubMotionCard === '1') return;
  if (el.closest('[data-state="loading"]')) return;
  if (el.closest(SPOTLIGHT_SKIP) && !el.matches('.sign-in__card')) return;
  el.dataset.hubMotionCard = '1';

  const isGate = el.classList.contains('sign-in__card');
  if (!isGate && !el.closest(SPOTLIGHT_SKIP)) {
    el.classList.add('hub-spotlight');
    if (!reduced) {
      el.addEventListener('pointermove', event => {
        const box = el.getBoundingClientRect();
        const x = ((event.clientX - box.left) / box.width) * 100;
        const y = ((event.clientY - box.top) / box.height) * 100;
        el.style.setProperty('--hub-spot-x', `${x}%`);
        el.style.setProperty('--hub-spot-y', `${y}%`);
      });
    }
  }

  el.classList.add('hub-reveal');
  if (isGate) el.classList.add('hub-reveal--gate');
  if (!reduced) el.style.setProperty('--hub-reveal-delay', `${revealDelay(el)}ms`);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('is-in'));
  });
}

function enhanceMagnet(el, reduced) {
  if (el.dataset.hubMotionMagnet === '1') return;
  if (reduced) return;
  el.dataset.hubMotionMagnet = '1';
  el.classList.add('hub-magnet');
  const strength = 5;

  el.addEventListener('pointermove', event => {
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.translate = `${x * strength * 2}px ${y * strength * 2}px`;
  });
  el.addEventListener('pointerleave', () => {
    el.style.translate = '';
  });
}

function itemKey(el) {
  return el.getAttribute('data-id')
    || el.getAttribute('data-message-id')
    || el.textContent.trim().slice(0, 96);
}

function enhanceList(list, reduced) {
  const kids = [...list.children];
  if (!kids.length) return;
  let seen = listKeys.get(list);
  if (!seen) {
    seen = new Set();
    listKeys.set(list, seen);
  }
  let delay = 0;
  for (const child of kids) {
    const key = itemKey(child);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (reduced || child.dataset.hubListItem === '1') continue;
    child.dataset.hubListItem = '1';
    child.classList.add('hub-list-item');
    child.style.setProperty('--hub-list-delay', `${Math.min(delay, 8) * 45}ms`);
    delay += 1;
  }
}

function enhanceCount(el, reduced) {
  if (!shouldCount(el)) return;
  runCount(el, el.textContent, reduced);
}

function scan(root, reduced) {
  const scope = root.nodeType === 1 || root.nodeType === 9 || root.nodeType === 11 ? root : root.parentElement;
  if (!scope?.querySelectorAll) return;

  for (const el of scope.querySelectorAll(CARD_SELECTOR)) enhanceCard(el, reduced);
  for (const el of scope.querySelectorAll(MAGNET_SELECTOR)) enhanceMagnet(el, reduced);
  for (const el of scope.querySelectorAll(LIST_SELECTOR)) enhanceList(el, reduced);
  for (const el of scope.querySelectorAll(COUNT_SELECTOR)) enhanceCount(el, reduced);

  if (scope.matches?.(CARD_SELECTOR)) enhanceCard(scope, reduced);
  if (scope.matches?.(MAGNET_SELECTOR)) enhanceMagnet(scope, reduced);
  if (scope.matches?.(LIST_SELECTOR)) enhanceList(scope, reduced);
}

function watchCounts(mutations, reduced) {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      const el = mutation.target.parentElement?.closest?.(COUNT_SELECTOR);
      if (el) runCount(el, el.textContent, reduced);
      continue;
    }
    if (mutation.type === 'childList') {
      const el = mutation.target.closest?.(COUNT_SELECTOR) ?? (
        mutation.target.matches?.(COUNT_SELECTOR) ? mutation.target : null
      );
      if (el && mutation.target === el) runCount(el, el.textContent, reduced);
    }
  }
}

/**
 * Start motion once on a document or subtree. Safe to call more than once.
 * @param {Document | ParentNode} [root]
 */
export function startHubMotion(root = document) {
  if (started) {
    scan(root, prefersReducedMotion(root));
    return;
  }
  started = true;
  const reduced = prefersReducedMotion(root);
  const doc = root.ownerDocument ?? root;
  scan(root, reduced);

  const observer = new MutationObserver(mutations => {
    const nextReduced = prefersReducedMotion(root);
    watchCounts(mutations, nextReduced);
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-state') {
        scan(mutation.target, nextReduced);
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) scan(node, nextReduced);
      }
    }
  });

  observer.observe(doc.documentElement ?? root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-state']
  });
}

/** Test helper — reset the singleton so suites can start clean. */
export function resetHubMotionForTests() {
  started = false;
}

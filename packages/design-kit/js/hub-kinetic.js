/**
 * Opt-in kinetic text reveal for hub canvas copy.
 *
 * Vanilla port of KineticTextReveal (words / characters / lines, stagger
 * origins, play / reset). Tuned to kit motion tokens — 8px lift, 420ms,
 * 45ms stagger, no blur. startHubMotion() enhances `.hub-kinetic`.
 *
 * Do not put this on the rail. Page titles, empty states, and one-shot
 * welcome lines only.
 */

export const KINETIC_SELECTOR = '.hub-kinetic, [data-hub-kinetic]';
export const DEFAULT_STAGGER_MS = 45;

/**
 * @param {string} value
 * @returns {string[]}
 */
export function splitIntoGraphemes(value) {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  return Array.from(value);
}

/**
 * @param {string} text
 * @param {'words' | 'characters' | 'lines'} [splitBy]
 * @returns {{ value: string, animated: boolean, index: number }[]}
 */
export function getSegments(text, splitBy = 'words') {
  let animatedIndex = 0;

  if (splitBy === 'lines') {
    return text.split('\n').map(line => {
      const animated = line.length > 0;
      return {
        value: line,
        animated,
        index: animated ? animatedIndex++ : -1
      };
    });
  }

  if (splitBy === 'characters') {
    return splitIntoGraphemes(text).map(character => {
      const animated = !/\s/.test(character);
      return {
        value: character,
        animated,
        index: animated ? animatedIndex++ : -1
      };
    });
  }

  return text.split(/(\s+)/).map(part => {
    const animated = !/^\s+$/.test(part) && part.length > 0;
    return {
      value: part,
      animated,
      index: animated ? animatedIndex++ : -1
    };
  });
}

/**
 * @param {number} index
 * @param {number} total
 * @param {number} stagger
 * @param {'start' | 'end' | 'center' | 'edges' | 'random' | number} [staggerFrom]
 */
export function getDelay(index, total, stagger, staggerFrom = 'start') {
  if (typeof staggerFrom === 'number') {
    return Math.abs(staggerFrom - index) * stagger;
  }
  if (staggerFrom === 'end') {
    return (total - 1 - index) * stagger;
  }
  if (staggerFrom === 'center') {
    return Math.abs((total - 1) / 2 - index) * stagger;
  }
  if (staggerFrom === 'edges') {
    return Math.min(index, total - 1 - index) * stagger;
  }
  if (staggerFrom === 'random') {
    const seeded = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
    return Math.floor(seeded * total) * stagger;
  }
  return index * stagger;
}

function readPlainText(el) {
  if (el.querySelector('.hub-kinetic__seg')) {
    return el.querySelector('.hub-kinetic__sr')?.textContent
      ?? el.getAttribute('aria-label')
      ?? el.dataset.hubKineticText
      ?? '';
  }
  return el.textContent ?? '';
}

function readSplit(el) {
  const value = el.dataset.hubKineticSplit;
  if (value === 'characters' || value === 'lines' || value === 'words') return value;
  return 'words';
}

function readStaggerFrom(el) {
  const raw = el.dataset.hubKineticFrom;
  if (raw == null || raw === '') return 'start';
  if (raw === 'end' || raw === 'center' || raw === 'edges' || raw === 'random' || raw === 'start') {
    return raw;
  }
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) ? asNumber : 'start';
}

function readStagger(el) {
  const raw = el.dataset.hubKineticStagger;
  if (raw == null || raw === '') return DEFAULT_STAGGER_MS;
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) ? asNumber : DEFAULT_STAGGER_MS;
}

function readDirection(el) {
  const value = el.dataset.hubKineticDir;
  if (value === 'down' || value === 'left' || value === 'right' || value === 'up') return value;
  return 'up';
}

function paintSegments(el, text, reduced) {
  const splitBy = readSplit(el);
  const staggerFrom = readStaggerFrom(el);
  const stagger = readStagger(el);
  const segments = getSegments(text, splitBy);
  const animatedTotal = segments.filter(segment => segment.animated).length;
  const doc = el.ownerDocument;

  el.classList.toggle('hub-kinetic--lines', splitBy === 'lines');
  el.classList.toggle('hub-kinetic--down', readDirection(el) === 'down');
  el.classList.toggle('hub-kinetic--left', readDirection(el) === 'left');
  el.classList.toggle('hub-kinetic--right', readDirection(el) === 'right');
  el.dataset.hubKineticText = text;
  el.setAttribute('aria-label', text);

  const sr = doc.createElement('span');
  sr.className = 'hub-kinetic__sr';
  sr.textContent = text;

  const nodes = [sr];
  for (const segment of segments) {
    if (!segment.animated) {
      const space = doc.createElement('span');
      space.setAttribute('aria-hidden', 'true');
      space.textContent = segment.value;
      nodes.push(space);
      continue;
    }

    const mask = doc.createElement('span');
    mask.className = 'hub-kinetic__mask';
    mask.setAttribute('aria-hidden', 'true');

    const item = doc.createElement('span');
    item.className = 'hub-kinetic__seg';
    item.textContent = segment.value;
    if (!reduced) {
      item.style.setProperty(
        '--hub-kinetic-delay',
        `${getDelay(segment.index, animatedTotal, stagger, staggerFrom)}ms`
      );
    }
    mask.append(item);
    nodes.push(mask);
  }

  el.replaceChildren(...nodes);
}

/**
 * Wrap `.hub-kinetic` text and play the reveal when the copy changes.
 * Same-text rebuilds (SPA title writes) snap visible so chrome does not
 * restage on every click of the current section.
 *
 * @param {Element} el
 * @param {boolean} [reduced]
 */
export function enhanceKinetic(el, reduced = false) {
  if (!el?.matches?.(KINETIC_SELECTOR)) return;

  const text = readPlainText(el);
  if (!text) return;

  const already = Boolean(el.querySelector('.hub-kinetic__seg'));
  if (already && el.dataset.hubKineticText === text) return;

  const replay = !already && el.dataset.hubKineticText === text;
  paintSegments(el, text, reduced);

  if (reduced || replay) {
    el.classList.add('is-in');
    return;
  }

  el.classList.remove('is-in');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('is-in'));
  });
}

/** Replay the reveal on an already-enhanced element. */
export function playKinetic(el) {
  if (!el.querySelector('.hub-kinetic__seg')) {
    enhanceKinetic(el, false);
    return;
  }
  el.classList.remove('is-in');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('is-in'));
  });
}

/** Move segments back to the hidden state. */
export function resetKinetic(el) {
  el.classList.remove('is-in');
}

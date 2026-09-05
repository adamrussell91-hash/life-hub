/** Shared Media Chrome audio player.
 * Life Hub owns chrome via CSS variables; Media Chrome owns transport controls.
 * Lazy-loads media-chrome custom elements.
 */

/**
 * @param {HTMLAudioElement} audio
 * @param {{ rates?: number[] }} [opts]
 * @returns {Promise<{ root: HTMLElement, audio: HTMLAudioElement } | null>}
 */
export async function mountHubAudioPlayer(audio, opts = {}) {
  if (!(audio instanceof HTMLAudioElement) || typeof document === 'undefined') return null;

  await import('media-chrome');

  const rates = opts.rates || [0.75, 1, 1.25, 1.5, 2];
  const controller = document.createElement('media-controller');
  controller.setAttribute('audio', '');
  controller.className = 'hub-audio-player';

  audio.setAttribute('slot', 'media');
  audio.removeAttribute('controls');
  audio.classList.add('hub-audio-player__media');

  const bar = document.createElement('media-control-bar');
  bar.innerHTML = `
    <media-play-button></media-play-button>
    <media-time-range></media-time-range>
    <media-time-display showduration></media-time-display>
    <media-playback-rate-button rates="${rates.join(' ')}"></media-playback-rate-button>
    <media-mute-button></media-mute-button>
  `;

  const parent = audio.parentNode;
  if (!parent) return null;
  parent.insertBefore(controller, audio);
  controller.append(audio, bar);
  return { root: controller, audio };
}

/**
 * Create a Media Chrome audio player for a URL (Teaching blocks).
 * @param {string} src
 * @param {{ title?: string, className?: string }} [opts]
 * @returns {Promise<HTMLElement | null>}
 */
export async function createHubAudioPlayer(src, opts = {}) {
  if (!src || typeof document === 'undefined') return null;
  const wrap = document.createElement('div');
  wrap.className = opts.className || 'hub-audio-player-wrap';
  if (opts.title) {
    const title = document.createElement('p');
    title.className = 'hub-audio-player__title';
    title.textContent = opts.title;
    wrap.append(title);
  }
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = src;
  wrap.append(audio);
  await mountHubAudioPlayer(audio);
  return wrap;
}

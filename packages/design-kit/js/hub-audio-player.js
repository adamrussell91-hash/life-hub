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
  measureUnknownDuration(audio);
  return { root: controller, audio };
}

/**
 * Browser recordings (MediaRecorder WebM) carry no length, so the player would
 * show no duration and a dead time bar. Seeking far past the end once makes the
 * browser read to the end and report the real length; then return to the start.
 * @param {HTMLAudioElement} audio
 */
export function measureUnknownDuration(audio) {
  const check = () => {
    if (audio.duration !== Infinity) return;
    const settle = () => {
      if (!Number.isFinite(audio.duration)) return;
      audio.removeEventListener('durationchange', settle);
      audio.currentTime = 0;
    };
    audio.addEventListener('durationchange', settle);
    audio.currentTime = 1e101;
  };
  if (audio.readyState >= 1) check();
  else audio.addEventListener('loadedmetadata', check, { once: true });
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

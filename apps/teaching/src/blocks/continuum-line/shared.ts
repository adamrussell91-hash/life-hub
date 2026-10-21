import type { Block } from '@/schemas/block';
import { el } from '@/blocks/peer-feedback-ui';
import { parseVideoInput, videoEmbedSrc } from '@/blocks/video-url';
import { isHttpUrl } from '@/blocks/url-safety';

export type ContinuumBlock = Extract<Block, { block_type: 'continuum_line' }>;
export type Scale = ContinuumBlock['content']['scale'];
export type Phase = 'collect' | 'revealed' | 'replace';

/** Where a snapped statement can land: the two ends and any named stops, evenly spaced. Matches the server. */
export function snapPoints(stops: readonly string[]): number[] {
  const n = stops.length;
  return [0, ...Array.from({ length: n }, (_, i) => (i + 1) / (n + 1)), 1];
}

export function nearestStop(pos: number, stops: readonly string[]): number {
  return snapPoints(stops).reduce((best, p) => (Math.abs(p - pos) < Math.abs(best - pos) ? p : best), 0);
}

/** Tick marks and stop labels under a line. Snapped lines get solid stops. */
export function lineMarks(scale: Scale, snap: boolean): HTMLElement {
  const marks = el('div', 'cl-marks');
  const points = snap || scale.stops.length ? snapPoints(scale.stops) : [0, 0.25, 0.5, 0.75, 1];
  for (const p of points) {
    const tick = el('span', `cl-tick${snap ? ' cl-tick--stop' : ''}${p === 0 || p === 1 ? ' cl-tick--end' : ''}`);
    tick.style.left = `${p * 100}%`;
    marks.append(tick);
  }
  scale.stops.forEach((name, i) => {
    const label = el('span', 'cl-stop-label', name);
    label.style.left = `${((i + 1) / (scale.stops.length + 1)) * 100}%`;
    marks.append(label);
  });
  const left = el('span', 'cl-end cl-end--left', scale.left);
  const right = el('span', 'cl-end cl-end--right', scale.right);
  marks.append(left, right);
  return marks;
}

/** The stimulus: text, an image, or a video. */
export function renderStimulus(stimulus: ContinuumBlock['content']['stimulus']): HTMLElement {
  const box = el('figure', `cl-stimulus cl-stimulus--${stimulus.kind}`);
  box.append(el('figcaption', 'cl-stimulus__label', 'Stimulus'));
  if (stimulus.kind === 'image') {
    if (isHttpUrl(stimulus.url)) {
      const img = el('img', 'cl-stimulus__image');
      img.src = stimulus.url;
      img.alt = stimulus.alt_text;
      img.loading = 'lazy';
      box.append(img);
    } else box.append(el('p', 'block-empty', stimulus.alt_text || 'Image unavailable.'));
  } else if (stimulus.kind === 'video') {
    const video = parseVideoInput(stimulus.url);
    if (!video) box.append(el('p', 'block-empty', 'Video unavailable.'));
    else if (video.provider === 'file') {
      const player = el('video', 'cl-stimulus__video');
      player.src = video.external_id;
      player.controls = true;
      player.preload = 'metadata';
      player.playsInline = true;
      box.append(player);
    } else {
      const frame = el('iframe', 'cl-stimulus__video');
      frame.src = videoEmbedSrc(video.provider, video.external_id, video.start_seconds);
      frame.loading = 'lazy';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.title = 'Stimulus video';
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      box.append(frame);
    }
  }
  if (stimulus.text.trim()) box.append(el('p', `cl-stimulus__text${stimulus.kind === 'text' ? '' : ' block-secondary'}`, stimulus.text));
  return box;
}

/** The statements worth showing: written ones only. */
export function liveStatements(block: ContinuumBlock): ContinuumBlock['content']['statements'] {
  return block.content.statements.filter((s) => s.text.trim()).slice(0, 10);
}

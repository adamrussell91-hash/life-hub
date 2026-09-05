/** View on Map — compact pill that morphs into an embedded Google Map.
 * Product control (not chrome). Uses MorphingDialog + closed tokens.
 */

import { openMorphingDialog } from './morphing-dialog.js';

export const DEFAULT_MAP_IMAGE =
  'https://images.unsplash.com/photo-1526778548025-fa2f459cd5ce?q=80&w=2000&auto=format&fit=crop';

const REMOTE_PLACE = /^(zoom|teams|meet|phone|telehealth|online|video(?:\s+call)?)$/i;

export function isMappablePlace(address, locationKind) {
  if (locationKind === 'telehealth' || locationKind === 'unknown') return false;
  const text = String(address ?? '').trim();
  if (!text) return false;
  return !REMOTE_PLACE.test(text);
}

export function mapsSearchUrl(address) {
  const text = String(address ?? '').trim();
  if (!text) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

export function mapsEmbedUrl(address) {
  const text = String(address ?? '').trim();
  if (!text) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(text)}&z=16&output=embed`;
}

function make(create, tag, className) {
  const node = create(tag);
  if (className) node.className = className;
  return node;
}

function mapGlyph(doc, create) {
  const ns = 'http://www.w3.org/2000/svg';
  if (doc?.createElementNS) {
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList?.add?.('view-on-map__icon');
    const fold = doc.createElementNS(ns, 'path');
    fold.setAttribute('d', 'M9 3.2 3.6 5.4A1 1 0 0 0 3 6.3v13.1a.8.8 0 0 0 1.1.7L9 18.2l6 2.6 5.4-2.2a1 1 0 0 0 .6-.9V5a.8.8 0 0 0-1.1-.7L15 6.2 9 3.2z');
    const seamA = doc.createElementNS(ns, 'path');
    seamA.setAttribute('d', 'M9 3.2v15');
    const seamB = doc.createElementNS(ns, 'path');
    seamB.setAttribute('d', 'M15 6.2v14.6');
    svg.append(fold, seamA, seamB);
    return svg;
  }
  const fallback = make(create, 'span', 'view-on-map__icon');
  fallback.setAttribute?.('aria-hidden', 'true');
  return fallback;
}

function openMapFrame({
  trigger,
  address,
  locationName,
  mapImageUrl,
  create,
  doc
}) {
  if (!doc?.body) return null;
  const embedUrl = mapsEmbedUrl(address);
  if (!embedUrl) return null;

  const frame = make(create, 'div', 'view-on-map__frame');
  const media = make(create, 'div', 'view-on-map__media');
  const iframe = make(create, 'iframe', 'view-on-map__iframe');
  iframe.title = 'Google Map';
  iframe.setAttribute('title', locationName ? `Map of ${locationName}` : 'Google Map');
  iframe.setAttribute('src', embedUrl);
  iframe.src = embedUrl;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  iframe.setAttribute('allowfullscreen', '');

  const loading = make(create, 'div', 'view-on-map__loading');
  const spinner = make(create, 'span', 'view-on-map__spinner');
  spinner.setAttribute?.('aria-hidden', 'true');
  const status = make(create, 'span', 'visually-hidden');
  status.textContent = 'Loading map';
  loading.append(spinner, status);

  iframe.addEventListener?.('load', () => {
    loading.hidden = true;
    loading.setAttribute?.('hidden', '');
    iframe.classList?.add?.('is-ready');
  });

  media.append(iframe, loading);
  frame.append(media);

  if (locationName || address) {
    const caption = make(create, 'p', 'view-on-map__caption');
    caption.textContent = locationName || address;
    frame.append(caption);
  }

  if (mapImageUrl) {
    frame.style.backgroundImage = `url(${mapImageUrl})`;
  }

  return openMorphingDialog({
    trigger,
    frame,
    backdropClass: 'view-on-map__dialog',
    label: locationName ? `Map of ${locationName}` : 'Map',
    spring: { stiffness: 400, damping: 30, mass: 0.8 }
  });
}

export function createViewOnMap({
  locationName,
  address,
  mapsUrl,
  mapImageUrl = DEFAULT_MAP_IMAGE,
  locationKind,
  className = '',
  createElement,
  document: doc
} = {}) {
  if (!isMappablePlace(address, locationKind)) return null;

  const documentRef = doc ?? globalThis.document;
  const create = createElement ?? (tag => documentRef.createElement(tag));
  const searchUrl = mapsUrl || mapsSearchUrl(address);
  const wrap = make(create, 'div', ['view-on-map', className].filter(Boolean).join(' '));

  const trigger = make(create, 'button', 'view-on-map__trigger');
  trigger.type = 'button';
  trigger.setAttribute('type', 'button');
  trigger.setAttribute(
    'aria-label',
    `View ${locationName || address} on map`
  );

  const bg = make(create, 'span', 'view-on-map__trigger-bg');
  bg.setAttribute?.('aria-hidden', 'true');
  if (mapImageUrl) {
    bg.style.backgroundImage = `url(${mapImageUrl})`;
  }

  const copy = make(create, 'span', 'view-on-map__copy');
  const label = make(create, 'span', 'view-on-map__label');
  label.textContent = 'View on Map';
  copy.append(mapGlyph(documentRef, create), label);
  trigger.append(bg, copy);

  const place = make(create, 'a', 'view-on-map__place');
  if (searchUrl) {
    place.href = searchUrl;
    place.setAttribute('href', searchUrl);
    place.target = '_blank';
    place.setAttribute('target', '_blank');
    place.rel = 'noreferrer';
    place.setAttribute('rel', 'noreferrer');
  }
  place.textContent = locationName || address;

  wrap.append(trigger, place);

  trigger.addEventListener?.('click', event => {
    event.preventDefault?.();
    event.stopPropagation?.();
    openMapFrame({
      trigger,
      address,
      locationName,
      mapImageUrl,
      create,
      doc: documentRef
    });
  });

  return { el: wrap, trigger, place };
}

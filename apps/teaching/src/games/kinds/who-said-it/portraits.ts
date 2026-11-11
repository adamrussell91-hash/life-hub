/**
 * Drawn cameo portraits for the Who said it? cast (approved mockup,
 * docs/mockups/games/who-said-it.html): a silhouette with one headpiece and one
 * prop, on a pastel oval. Never a photo. Each cast member's look comes from
 * their name, so the same character always looks the same, and no two members
 * of one cast share a headpiece or a prop (the cast holds at most eight).
 */

export type Look = { hat: number; prop: number; tone: number };

type Member = { id: string; name: string };

const HATS = 8;
const PROPS = 8;
const TONES = 6;

/** FNV-1a: a small stable hash of a name. */
export function nameHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Looks for a whole cast: headpiece and prop picked from each name, never repeated within the cast; tones follow cast order. */
export function castLooks(cast: readonly Member[]): Map<string, Look> {
  const out = new Map<string, Look>();
  const hats = new Set<number>();
  const props = new Set<number>();
  const free = (used: Set<number>, start: number, size: number) => {
    for (let k = 0; k < size; k += 1) {
      const v = (start + k) % size;
      if (!used.has(v)) return v;
    }
    return start % size;
  };
  cast.forEach((m, i) => {
    const h = nameHash((m.name || m.id).trim().toLowerCase());
    const hat = free(hats, h % HATS, HATS);
    const prop = free(props, (h >>> 5) % PROPS, PROPS);
    hats.add(hat);
    props.add(prop);
    out.set(m.id, { hat, prop, tone: (i % TONES) + 1 });
  });
  return out;
}

const BODY = '<path d="M10 124 C12 96 30 84 50 84 C70 84 88 96 90 124 Z"/><path d="M43 64 h14 v24 h-14 z"/>';
const HEAD = '<ellipse cx="50" cy="50" rx="16" ry="19"/>';
const GOLD = 'style="fill:var(--game-gold,#f2c14e)"';
const PALE = 'fill="#fff"';

/** Headpieces: [shapes drawn in the ink, extra drawn over the face]. Veil and hood cover the head and show a pale face. */
const HAT_PARTS: Array<{ ink: string; face?: string; covers?: boolean }> = [
  { ink: '<circle cx="50" cy="28" r="8.5"/><path d="M34 46 C32 34 40 29 50 29 C60 29 68 34 66 46 C62 40 56 37 50 37 C44 37 38 40 34 46Z"/>' },
  { ink: '<rect x="34" y="12" width="32" height="22" rx="2"/><rect x="26" y="32" width="48" height="5" rx="2.5"/>' },
  { ink: '<path d="M31 42 C32 28 68 28 69 42 L79 44 C71 48 40 47 31 42Z"/>', face: `<path d="M35 56 C37 76 63 76 65 56 C60 66 40 66 35 56Z" ${PALE} opacity=".55"/>` },
  {
    ink: '<path d="M28 54 C26 30 38 24 50 24 C62 24 74 30 72 54 L80 104 C66 96 34 96 20 104 Z"/>',
    face: `<ellipse cx="50" cy="52" rx="13" ry="16" ${PALE} opacity=".8"/><path d="M36 40 Q50 31 64 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
    covers: true
  },
  { ink: '<path d="M33 46 C31 30 41 26 50 28 C55 23 67 27 67 40 C64 35 61 37 58 33 C55 37 48 34 45 37 C41 34 36 39 33 46Z"/>' },
  { ink: '<path d="M32 50 C30 32 40 27 50 27 C60 27 70 32 68 50 L71 80 C66 84 62 82 62 76 L62 48 C58 42 42 42 38 48 L38 76 C38 82 34 84 29 80 Z"/>' },
  { ink: '<path d="M33 42 C33 30 67 30 67 40 C72 41 76 43 78 45 C66 47 44 46 33 42Z"/>' },
  {
    ink: '<path d="M29 68 C25 38 37 25 50 25 C63 25 75 38 71 68 C66 60 64 44 50 44 C36 44 34 60 29 68Z"/><ellipse cx="50" cy="52" rx="16" ry="19"/>',
    face: `<ellipse cx="50" cy="55" rx="11" ry="13" ${PALE} opacity=".5"/>`,
    covers: true
  }
];

/** Props: held or worn, drawn after the figure. */
const PROP_PARTS: string[] = [
  // lantern
  `<circle cx="80" cy="96" r="20" ${GOLD} opacity=".35"/><circle cx="80" cy="96" r="11" ${GOLD} opacity=".5"/><g fill="none" stroke="currentColor" stroke-width="2"><path d="M80 78 v6"/><path d="M74 84 h12 l-1 18 h-10 z" ${GOLD}/></g>`,
  // spectacles and collar
  '<g fill="none" stroke="#fff" stroke-width="2" opacity=".9"><circle cx="43" cy="50" r="5.5"/><circle cx="57" cy="50" r="5.5"/><path d="M48.5 50 h3"/></g><path d="M42 86 L50 100 L58 86" fill="none" stroke="#fff" stroke-width="2.5" opacity=".75"/>',
  // spade
  '<path d="M84 124 L90 70" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M85 64 l11 2 l-3 -17 l-8 -1 z" fill="currentColor"/>',
  // candle
  `<g transform="translate(78 92)"><path d="M-3 0 h6 v18 h-6z" ${PALE}/><path d="M0 -9 C3 -5 3 -2 0 0 C-3 -2 -3 -5 0 -9Z" ${GOLD}/></g>`,
  // scarf
  '<path d="M36 86 C44 94 56 94 64 86 L66 92 C56 100 44 100 34 92Z" style="fill:var(--pastel-peach-ink,#e0894a)" opacity=".85"/><path d="M58 92 l5 22 l-8 -2z" style="fill:var(--pastel-peach-ink,#e0894a)" opacity=".85"/>',
  // book
  '<g transform="translate(62 96) rotate(-10)"><rect width="24" height="17" rx="2" fill="#fff" opacity=".92"/><path d="M12 1 v15" stroke="currentColor" stroke-width="1.5"/></g>',
  // key
  `<g transform="translate(80 92) rotate(20)"><circle r="6" fill="none" style="stroke:var(--game-gold,#f2c14e)" stroke-width="3"/><path d="M0 6 v20 M0 20 h5 M0 25 h5" fill="none" style="stroke:var(--game-gold,#f2c14e)" stroke-width="3" stroke-linecap="round"/></g>`,
  // quill
  '<path d="M90 70 C78 80 74 96 74 116 C80 100 86 88 92 74Z" fill="#fff" opacity=".9"/><path d="M90 72 L74 118" stroke="currentColor" stroke-width="1.5"/>'
];

const FAKE_ART =
  '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".85"><path d="M28 46 C28 34 72 34 72 46 C72 66 60 82 50 82 C40 82 28 66 28 46Z" stroke-dasharray="6 6"/><path d="M36 52 q6 -5 12 0 M52 52 q6 -5 12 0"/><path d="M42 68 q8 -4 16 0"/></g><text x="50" y="114" text-anchor="middle" font-size="26" font-weight="700" fill="currentColor" font-family="Georgia, serif" font-style="italic">?</text>';

/** The SVG for one look. */
export function portraitSvg(look: Look | 'fake'): string {
  if (look === 'fake') return `<svg viewBox="0 0 100 124" aria-hidden="true" focusable="false">${FAKE_ART}</svg>`;
  const hat = HAT_PARTS[look.hat % HATS];
  const prop = PROP_PARTS[look.prop % PROPS];
  // The spade stands behind the figure; everything else sits in front.
  const behind = look.prop % PROPS === 2 ? prop : '';
  const front = behind ? '' : prop;
  const figure = `<g fill="currentColor">${BODY}${hat.covers ? '' : HEAD}${hat.ink}</g>`;
  return `<svg viewBox="0 0 100 124" aria-hidden="true" focusable="false">${behind}${figure}${hat.face ?? ''}${front}</svg>`;
}

/** A cameo element: the oval, the drawing, and the member's emblem (a letter or emoji) as a small badge when set. */
export function cameo(look: Look | 'fake', emblem?: string): HTMLElement {
  const node = document.createElement('span');
  node.className = look === 'fake' ? 'ws-cameo ws-cameo--fake' : `ws-cameo ws-tone-${look.tone}`;
  node.innerHTML = portraitSvg(look);
  if (emblem && look !== 'fake') {
    const badge = document.createElement('span');
    badge.className = 'ws-emblem';
    badge.textContent = emblem;
    badge.setAttribute('aria-hidden', 'true');
    node.append(badge);
  }
  return node;
}

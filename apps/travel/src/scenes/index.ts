import type { SceneId } from '@/types';
import { scene as kul } from '@/scenes/kul';
import { scene as ist } from '@/scenes/ist';
import { scene as sco } from '@/scenes/sco';
import { scene as lon } from '@/scenes/lon';
import { scene as rom } from '@/scenes/rom';
import { scene as sel } from '@/scenes/sel';
import { scene as sok } from '@/scenes/sok';
import { scene as gng } from '@/scenes/gng';
import { scene as gyj } from '@/scenes/gyj';
import { scene as bus } from '@/scenes/bus';
import { scene as jej } from '@/scenes/jej';
import { scene as icn } from '@/scenes/icn';
import { scene as genericScene } from '@/scenes/generic';
import { safeColor } from '@/lib/html';

const PORTED: Record<Exclude<SceneId, 'generic'>, () => string> = { kul, ist, sco, lon, rom, sel, sok, gng, gyj, bus, jej, icn };

/** City names that have a hand-drawn scene, for cities saved as 'generic'
 * (every city added through the form starts that way). */
const BY_NAME: [RegExp, Exclude<SceneId, 'generic'>][] = [
  [/kuala lumpur/, 'kul'],
  [/istanbul/, 'ist'],
  [/scotland|edinburgh|glasgow|highlands|inverness/, 'sco'],
  [/london/, 'lon'],
  [/rome|roma/, 'rom'],
  [/seoul/, 'sel'],
  [/sokcho|seorak/, 'sok'],
  [/gangneung/, 'gng'],
  [/gyeongju/, 'gyj'],
  [/busan/, 'bus'],
  [/jeju|seogwipo/, 'jej'],
  [/incheon|songdo/, 'icn']
];

/** The hand-drawn scene for a city name, or 'generic'. */
export function sceneForName(name: string | undefined): SceneId {
  const n = (name ?? '').toLowerCase();
  for (const [re, id] of BY_NAME) if (re.test(n)) return id;
  return 'generic';
}

/** Renders the city's scene SVG. A city saved as 'generic' still gets its
 * hand-drawn scene when its name matches one; otherwise the generic scene (§5.2). */
export function renderScene(sceneId: SceneId, accent: { color: string; soft: string; ink: string }, cityName?: string): string {
  // Accent colours are stored trip data and land in SVG attributes.
  const safe = {
    color: safeColor(accent?.color, '#9fc5e8'),
    soft: safeColor(accent?.soft, '#e8f1f8'),
    ink: safeColor(accent?.ink, '#2b4a63')
  };
  const id = sceneId === 'generic' || !sceneId ? sceneForName(cityName) : sceneId;
  if (id === 'generic') return genericScene(safe);
  const fn = Object.prototype.hasOwnProperty.call(PORTED, id) ? PORTED[id as keyof typeof PORTED] : undefined;
  return fn ? fn() : genericScene(safe);
}

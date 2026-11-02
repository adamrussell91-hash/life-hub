import type { SceneId } from '@/types';
import { scene as kul } from '@/scenes/kul';
import { scene as ist } from '@/scenes/ist';
import { scene as sco } from '@/scenes/sco';
import { scene as lon } from '@/scenes/lon';
import { scene as rom } from '@/scenes/rom';
import { scene as sel } from '@/scenes/sel';
import { scene as genericScene } from '@/scenes/generic';
import { safeColor } from '@/lib/html';

const PORTED: Record<Exclude<SceneId, 'generic'>, () => string> = { kul, ist, sco, lon, rom, sel };

/** Renders the city's scene SVG. Falls back to the generic scene (§5.2) for
 * any city not in the six ported ones. */
export function renderScene(sceneId: SceneId, accent: { color: string; soft: string; ink: string }): string {
  // Accent colours are stored trip data and land in SVG attributes.
  const safe = {
    color: safeColor(accent?.color, '#9fc5e8'),
    soft: safeColor(accent?.soft, '#e8f1f8'),
    ink: safeColor(accent?.ink, '#2b4a63')
  };
  if (sceneId === 'generic') return genericScene(safe);
  const fn = Object.prototype.hasOwnProperty.call(PORTED, sceneId) ? PORTED[sceneId as keyof typeof PORTED] : undefined;
  return fn ? fn() : genericScene(safe);
}

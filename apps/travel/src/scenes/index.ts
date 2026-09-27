import type { SceneId } from '@/types';
import { scene as kul } from '@/scenes/kul';
import { scene as ist } from '@/scenes/ist';
import { scene as sco } from '@/scenes/sco';
import { scene as lon } from '@/scenes/lon';
import { scene as rom } from '@/scenes/rom';
import { scene as sel } from '@/scenes/sel';
import { scene as genericScene } from '@/scenes/generic';

const PORTED: Record<Exclude<SceneId, 'generic'>, () => string> = { kul, ist, sco, lon, rom, sel };

/** Renders the city's scene SVG. Falls back to the generic scene (§5.2) for
 * any city not in the six ported ones. */
export function renderScene(sceneId: SceneId, accent: { color: string; soft: string; ink: string }): string {
  if (sceneId === 'generic') return genericScene(accent);
  const fn = PORTED[sceneId];
  return fn ? fn() : genericScene(accent);
}

/** Which Kenney pack a model’s colormap belongs to. */
export const MODEL_TEXTURE_PACK: Record<string, string> = {
  'ambulance.glb': 'car',
  'delivery.glb': 'car',
  'van.glb': 'car',
  'train-tram-modern.glb': 'train',
  'commercial-a.glb': 'commercial',
  'commercial-b.glb': 'commercial',
  'commercial-skyscraper-a.glb': 'commercial',
  'suburban-a.glb': 'suburban',
  'suburban-b.glb': 'suburban',
  'industrial-a.glb': 'industrial',
  'industrial-b.glb': 'industrial',
  'road-straight.glb': 'roads',
  'road-bend.glb': 'roads',
  'road-end.glb': 'roads',
  'road-intersection.glb': 'roads',
  'road-crossroad.glb': 'roads',
  'construction-fence.glb': 'roads'
};

function cityPrefix(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Model URL for the umbrella (`/tasks/`) and for the Tasks dev server (`/`). */
export function cityModelUrl(file: string): string {
  return `${cityPrefix()}city/models/${file}`;
}

/** Directory that contains `Textures/colormap.png` for one Kenney pack. */
export function cityTextureRoot(pack: string): string {
  return `${cityPrefix()}city/textures/${pack}/`;
}

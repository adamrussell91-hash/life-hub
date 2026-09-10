export const PASTEL_TINTS = ['blue', 'sage', 'peach', 'gold', 'lilac'] as const;
export type PastelTint = (typeof PASTEL_TINTS)[number];

export function pastelFromId(id: string): PastelTint {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PASTEL_TINTS.length;
  return PASTEL_TINTS[index]!;
}

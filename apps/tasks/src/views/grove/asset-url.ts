/**
 * Grove models live once, in apps/life/assets/grove. The umbrella publishes that folder at
 * /assets/grove/; the Tasks dev server serves the same folder there (vite.config.ts).
 */
export const GROVE_ASSET_ROOT = '/assets/grove/';

export function groveAssetUrl(file: string): string {
  return `${GROVE_ASSET_ROOT}${file}`;
}

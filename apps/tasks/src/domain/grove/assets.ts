/**
 * Grove's model catalogue. File names match apps/life/assets/grove/manifest.json;
 * tests/unit/grove-assets.test.ts fails if a referenced model is missing.
 */

/** One tree species per Tasks domain, plus gnarled trees for tasks finished after their due date. */
export const GROVE_SPECIES = ['life', 'teaching', 'health', 'wedding', 'other', 'late'] as const;
export type GroveSpecies = (typeof GROVE_SPECIES)[number];

/** Domains that grow their own species. Anything else (custom classifiers) grows `other`. */
export const HUB_SPECIES: ReadonlySet<string> = new Set(['life', 'teaching', 'health', 'wedding', 'other']);

/** Distinct authored meshes per species. Growth stages scale the mature mesh. */
export const TREE_VARIANTS: Record<GroveSpecies, number> = {
  life: 3,
  teaching: 3,
  health: 3,
  wedding: 2,
  other: 2,
  late: 2
};

export const GROVE_PROPS = ['grass', 'flower', 'bush', 'rock', 'mushroom'] as const;
export type GrovePropKind = (typeof GROVE_PROPS)[number];

export const PROP_VARIANTS: Record<GrovePropKind, number> = {
  grass: 4,
  flower: 6,
  bush: 4,
  rock: 5,
  mushroom: 3
};

export function treeModelFile(species: GroveSpecies, variant: number): string {
  return `models/trees/tree-${species}-${variant}-mature.glb`;
}

export function propModelFile(kind: GrovePropKind, variant: number): string {
  return `models/ground/${kind}-${variant}.glb`;
}

/** Plain-language species names for the key and the tree card. */
export const SPECIES_LABEL: Record<GroveSpecies, string> = {
  life: 'Pine · Life',
  teaching: 'Oak · Teaching',
  health: 'Birch · Health',
  wedding: 'Blossom · Wedding',
  other: 'Leafy · Other',
  late: 'Gnarled · finished late'
};

/** Phone key: the hub alone. */
export const SPECIES_SHORT: Record<GroveSpecies, string> = {
  life: 'Life',
  teaching: 'Teaching',
  health: 'Health',
  wedding: 'Wedding',
  other: 'Other',
  late: 'Late'
};

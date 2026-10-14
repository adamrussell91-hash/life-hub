/**
 * The forest's key: what each tree, animal and piece of land stands for, and how animals are earned.
 * Built from the same rules that grow the forest (wildlife.ts, companions.ts, planting.ts), so the key
 * cannot drift from what is drawn.
 */
import { COMPANION_MODELS } from '@/domain/grove/companions';
import { WILDLIFE_REASON, type WildlifeSpecies } from '@/domain/grove/wildlife';
import { ANIMAL_NAME, modelName } from './data';

export type KeyEntry = { name: string; meaning: string; glyph?: string; preview?: string };
export type KeySection = { title: string; lede?: string; entries: KeyEntry[] };

/** One small picture per animal model, for the key and the animal tray. */
const GLYPH: Record<string, string> = {
  'animal-rabbit-hare': '🐇', 'animal-forest-rabbit': '🐇', 'animal-deer-doe': '🦌', 'animal-forest-deer': '🦌',
  'animal-deer-stag': '🦌', 'animal-forest-stag': '🦌', 'animal-forest-moose': '🫎', 'animal-fox': '🦊', 'animal-forest-fox': '🦊',
  'animal-squirrel': '🐿️', 'animal-chipmunk': '🐿️', 'animal-bird-robin': '🐦', 'animal-duck-mallard': '🦆', 'animal-owl': '🦉',
  'animal-forest-bear': '🐻', 'animal-forest-boar': '🐗', 'animal-forest-wolf': '🐺', 'animal-skunk': '🦨',
  'animal-raccoon': '🦝', 'animal-river-otter': '🦦'
};
const SPECIES_GLYPH: Record<WildlifeSpecies, string> = { hare: '🐇', deer: '🦌', fox: '🦊', squirrel: '🐿️', robin: '🐦', mallard: '🦆', owl: '🦉' };

export function animalGlyph(model: string, species?: WildlifeSpecies): string {
  return GLYPH[model] ?? (species ? SPECIES_GLYPH[species] : '🐾');
}

const ORDER: WildlifeSpecies[] = ['hare', 'robin', 'squirrel', 'deer', 'mallard', 'fox', 'owl'];
const BABIES = new Set<WildlifeSpecies>(['hare', 'deer']);
const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
const preview = (name: string) => `previews/${name}.png`;

export function groveKey(): KeySection[] {
  const animals: KeyEntry[] = ORDER.map((species) => ({
    name: ANIMAL_NAME[species],
    glyph: SPECIES_GLYPH[species],
    meaning: `${WILDLIFE_REASON[species]}.${BABIES.has(species) ? ' Earn it again and a young one follows.' : ''}`
  }));
  const visitors: KeyEntry[] = ORDER.filter((s) => COMPANION_MODELS[s]?.length).map((species) => {
    const models = COMPANION_MODELS[species]!;
    return { name: list(models.map(modelName)), glyph: animalGlyph(models[0]!), meaning: `Can visit once you have a ${ANIMAL_NAME[species]}.` };
  });
  return [
    {
      title: 'Trees',
      lede: 'Every finished task grows one tree, in the week you finished it. Nothing dies.',
      entries: [
        { name: 'Pine', meaning: 'A Life task.', preview: preview('tree-life-1-mature') },
        { name: 'Oak', meaning: 'A Teaching task.', preview: preview('tree-teaching-1-mature') },
        { name: 'Birch', meaning: 'A Health task.', preview: preview('tree-health-1-mature') },
        { name: 'Blossom', meaning: 'A Wedding task.', preview: preview('tree-wedding-1-mature') },
        { name: 'Leafy tree', meaning: 'A task from any other area.', preview: preview('tree-other-1-mature') },
        { name: 'Red gnarled tree', meaning: 'A task finished after its deadline.', preview: preview('tree-late-3-mature') },
        { name: 'Sapling, young, grown', meaning: 'A tree is a sapling for its first 4 days, young until day 12, then fully grown.', preview: preview('tree-life-1-sapling') }
      ]
    },
    { title: 'Animals', lede: 'Real milestones bring animals. Each lives in the week it was earned.', entries: animals },
    { title: 'Visitors', lede: 'Each day two visitors come, chosen from the animals you have earned.', entries: visitors },
    {
      title: 'The island',
      entries: [
        { name: 'Week pieces', meaning: 'Each of the 52 pieces is one week. The island grows in a spiral from week 1 in the middle.' },
        { name: 'Pale meadow', meaning: 'Weeks still to come.' },
        { name: 'Path', meaning: 'Joins every week so far, in order.' },
        { name: 'Dark forest floor', meaning: 'Ground where trees stand thick.' },
        { name: 'Bushes and mushrooms', meaning: 'Undergrowth that comes up round the trees.', preview: preview('bush-2') },
        { name: 'Flowers and long grass', meaning: 'Grown weeks are lusher; flowers fill their clearings.', preview: preview('flower-3') },
        { name: 'River, lake and bridges', meaning: 'Scenery. Animals cross the river on the bridges; the mallard and otter swim the lake.', preview: preview('lily-1') },
        { name: 'Rocks and reeds', meaning: 'Scenery along the banks.', preview: preview('rock-1') }
      ]
    }
  ];
}

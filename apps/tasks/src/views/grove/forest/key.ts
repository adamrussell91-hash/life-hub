/**
 * The forest's key: what each tree, animal and piece of land stands for, and how animals are earned.
 * Built from the same rules that grow the forest (forest-wildlife.ts, planting.ts), so the key
 * cannot drift from what is drawn.
 */
import { FOREST_WILDLIFE, hasYoung, type ForestWildlifeRule } from '@/domain/grove/forest-wildlife';
import type { WildlifeSpecies } from '@/domain/grove/wildlife';

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

const preview = (name: string) => `previews/${name}.png`;
const meaning = (rule: ForestWildlifeRule) =>
  `${rule.reason}${rule.every === 1 ? ' brings one' : `: one for every ${rule.every}`}.${hasYoung(rule.model) ? ' Earn two and a young one follows the first.' : ''}`;
const animalsOf = (size: ForestWildlifeRule['size']): KeyEntry[] =>
  FOREST_WILDLIFE.filter((r) => r.size === size).map((rule) => ({ name: rule.name, glyph: animalGlyph(rule.model, rule.habit), meaning: meaning(rule) }));

export function groveKey(): KeySection[] {
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
    { title: 'Small animals', lede: 'Every animal has its own milestone and comes again each time you repeat it. Each lives in the week it was earned.', entries: animalsOf('small') },
    { title: 'Medium animals', entries: animalsOf('medium') },
    { title: 'Large animals', entries: animalsOf('large') },
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

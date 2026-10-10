import {
  HOMEPAGE_BLOCK_GROUPS,
  LESSON_BLOCK_GROUPS,
  INSERT_MENU_LABEL,
  expandGroupTypesForMenu,
  type InsertMenuValue
} from '@/blocks/create-block';
import { INSERT_MENU_DESCRIPTION, blockIconSrc } from '@/blocks/block-meta';

export { INSERT_MENU_DESCRIPTION, blockIconSrc } from '@/blocks/block-meta';

export type PaletteBlockCard = {
  kind: 'block';
  type: InsertMenuValue;
  title: string;
  description: string;
  iconSrc: string;
};

export type PaletteCompositionCard = {
  kind: 'composition';
  id: string;
  title: string;
};

export type PaletteCard = PaletteBlockCard | PaletteCompositionCard;

export type PaletteFamily = {
  id: string;
  disabled?: boolean;
  cards: PaletteCard[];
};

function familiesFromGroups(
  groups: typeof LESSON_BLOCK_GROUPS
): PaletteFamily[] {
  return groups.map((group) => ({
    id: group.label,
    cards: expandGroupTypesForMenu(group.types).map((type) => ({
      kind: 'block' as const,
      type,
      title: INSERT_MENU_LABEL[type],
      description: INSERT_MENU_DESCRIPTION[type],
      iconSrc: blockIconSrc(type)
    }))
  }));
}

export function homepagePaletteFamilies(): PaletteFamily[] {
  return familiesFromGroups(HOMEPAGE_BLOCK_GROUPS);
}

/** Lesson families without the Teaching Hub compositions library. */
export function taskPaletteFamilies(): PaletteFamily[] {
  return familiesFromGroups(LESSON_BLOCK_GROUPS);
}

export function lessonPaletteFamilies(
  compositions: Array<{ id: string; title: string }>
): PaletteFamily[] {
  const families: PaletteFamily[] = familiesFromGroups(LESSON_BLOCK_GROUPS);

  families.push({
    id: 'Compositions',
    disabled: compositions.length === 0,
    cards: compositions.map((composition) => ({
      kind: 'composition' as const,
      id: composition.id,
      title: composition.title
    }))
  });

  return families;
}
